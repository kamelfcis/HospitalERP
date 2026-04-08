/**
 * patient-invoice-helpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Business helpers للفاتورة الطبية. مفصولة عن ملف الـ routes لتسهيل
 * الاختبار والصيانة. كل دالة لها مسؤولية واحدة واضحة.
 *
 * الدوال:
 *  - enforceNonZeroPrice        : validation guard — يمنع أسعار صفرية بدون تصريح
 *  - auditContractPriceOverrides: تسجيل تجاوزات أسعار العقد (logging only)
 *  - auditItemPriceDeviations   : مقارنة أسعار الأصناف مع المصدر (logging only)
 *  - autoFillClassification     : server-side recompute لـ business_classification
 *  - fireApprovalRequestsForInvoice: إطلاق طلبات اعتماد (non-blocking side effect)
 */

import { db }       from "../db";
import { logger }   from "./logger";
import { storage }  from "../storage";
import { auditLog } from "../route-helpers";
import { PERMISSIONS } from "@shared/permissions";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  patientInvoiceLines,
  items,
  itemDepartmentPrices,
  inventoryLots,
  warehouses,
} from "@shared/schema";
import { resolveBusinessClassificationWithMeta } from "@shared/resolve-business-classification";
import { createApprovalRequest } from "./contract-approval-service";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  unitPrice?: string | number | null;
  description?: string | null;
  serviceId?: string | null;
  itemId?: string | null;
  lineType?: string | null;
  sourceType?: string | null;
  lotId?: string | null;
  listPrice?: string | number | null;
  businessClassification?: string | null;
  id?: string | null;
  coverageStatus?: string | null;
  approvalStatus?: string | null;
  contractMemberId?: string | null;
  companyShareAmount?: string | number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. enforceNonZeroPrice
// ─────────────────────────────────────────────────────────────────────────────
/**
 * يتحقق من وجود بنود بسعر صفري.
 * لو وُجدت بدون تصريح → يُرجع false ويُرسل رد HTTP مناسب.
 * لو وُجد تصريح → يتحقق من الصلاحية → يسجل audit → يُرجع true.
 * لو لا توجد أسعار صفرية → يُرجع true مباشرة.
 */
export async function enforceNonZeroPrice(
  req: { body: Record<string, unknown>; params?: Record<string, string>; session: { userId: string } },
  res: { status: (c: number) => { json: (body: unknown) => void } },
  linesParsed: InvoiceLine[],
): Promise<boolean> {
  const hasZeroPrice = linesParsed.some(l => parseFloat(String(l.unitPrice ?? 0)) <= 0);
  if (!hasZeroPrice) return true;

  const allowZeroPrice = req.body.allowZeroPrice === true;
  if (!allowZeroPrice) {
    res.status(422).json({ code: "ZERO_PRICE_LINES", message: "بعض بنود الفاتورة بها سعر صفري — تأكيد الحفظ؟" });
    return false;
  }

  const perms = await storage.getUserEffectivePermissions(req.session.userId);
  if (!perms.includes(PERMISSIONS.INVOICE_APPROVE_ZERO_PRICE)) {
    res.status(403).json({ message: "ليس لديك صلاحية اعتماد بنود بسعر صفري" });
    return false;
  }

  auditLog({
    tableName: "patient_invoice_headers",
    recordId: req.params?.id ?? "new",
    action: "zero_price_approved",
    newValues: JSON.stringify({
      reason: req.body.zeroPriceReason ?? "unspecified",
      zeroLines: linesParsed
        .filter(l => parseFloat(String(l.unitPrice ?? 0)) <= 0)
        .map(l => l.description),
    }),
    userId: req.session.userId,
  }).catch(() => {});

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. auditContractPriceOverrides
// ─────────────────────────────────────────────────────────────────────────────
/**
 * يسجل تحذيراً لكل بند خدمة يختلف فيه unitPrice عن listPrice في فاتورة عقد.
 * Logging only — لا يحجب العملية ولا يغيّر البيانات.
 */
export function auditContractPriceOverrides(
  lines: InvoiceLine[],
  contractId: string | null | undefined,
  userId: string | number | undefined,
): void {
  if (!contractId) return;
  for (const l of lines) {
    if (!l.listPrice || !l.serviceId) continue;
    const listPrice = parseFloat(String(l.listPrice));
    const unitPrice = parseFloat(String(l.unitPrice ?? 0));
    if (Math.abs(unitPrice - listPrice) > 0.001) {
      logger.warn(
        {
          contractId, serviceId: l.serviceId,
          listPrice, unitPrice,
          delta: +(unitPrice - listPrice).toFixed(4),
          userId,
        },
        "[PRICE_OVERRIDE] سعر الخدمة مختلف عن قائمة الأسعار في فاتورة العقد",
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. auditItemPriceDeviations
// ─────────────────────────────────────────────────────────────────────────────
/**
 * يقارن unitPrice للأصناف مع السعر المتوقع (دفعة / قسم / عالمي).
 * Batch: 3 queries فقط بغض النظر عن عدد البنود — لا N+1.
 * Non-blocking: تسجيل فقط — لا ترفض العملية.
 *
 * ترتيب الأولوية:
 *  1. سعر القسم (item_department_prices)
 *  2. سعر الدفعة (inventory_lots.sale_price)
 *  3. سعر الصنف العالمي (items.sale_price_current)
 */
export async function auditItemPriceDeviations(
  lines: InvoiceLine[],
  invoiceDepartmentId: string | null | undefined,
  invoiceWarehouseId: string | null | undefined,
  invoiceId: string | null | undefined,
  userId: string | number | undefined,
): Promise<void> {
  try {
    const itemLines = lines.filter(l => l.itemId);
    if (itemLines.length === 0) return;

    // ── Resolve departmentId from warehouseId if needed ────────────────────
    let effectiveDeptId: string | null = invoiceDepartmentId ?? null;
    if (!effectiveDeptId && invoiceWarehouseId) {
      const [wh] = await db
        .select({ departmentId: warehouses.departmentId })
        .from(warehouses)
        .where(eq(warehouses.id, invoiceWarehouseId))
        .limit(1);
      effectiveDeptId = (wh as { departmentId?: string | null })?.departmentId ?? null;
    }

    const itemIds = [...new Set(itemLines.map(l => l.itemId as string))];

    // ── Batch 1: dept prices ───────────────────────────────────────────────
    const deptPriceMap = new Map<string, string>();
    if (effectiveDeptId && itemIds.length > 0) {
      const deptRows = await db
        .select({ itemId: itemDepartmentPrices.itemId, salePrice: itemDepartmentPrices.salePrice })
        .from(itemDepartmentPrices)
        .where(and(
          inArray(itemDepartmentPrices.itemId, itemIds),
          eq(itemDepartmentPrices.departmentId, effectiveDeptId),
        ));
      for (const dp of deptRows) {
        if (parseFloat(dp.salePrice) > 0) deptPriceMap.set(dp.itemId, dp.salePrice);
      }
    }

    // ── Batch 2: lot prices ────────────────────────────────────────────────
    const lotIds = [...new Set(itemLines.map(l => l.lotId).filter(Boolean) as string[])];
    const lotPriceMap = new Map<string, string>();
    if (lotIds.length > 0) {
      const lotRows = await db
        .select({ id: inventoryLots.id, salePrice: inventoryLots.salePrice })
        .from(inventoryLots)
        .where(inArray(inventoryLots.id, lotIds));
      for (const lot of lotRows) {
        if (lot.salePrice && parseFloat(lot.salePrice) > 0) lotPriceMap.set(lot.id, lot.salePrice);
      }
    }

    // ── Batch 3: global item prices ────────────────────────────────────────
    const globalPriceMap = new Map<string, string>();
    const itemRows = await db
      .select({ id: items.id, salePriceCurrent: items.salePriceCurrent })
      .from(items)
      .where(inArray(items.id, itemIds));
    for (const itm of itemRows) {
      globalPriceMap.set(itm.id, itm.salePriceCurrent ?? "0");
    }

    // ── Compare and log deviations ─────────────────────────────────────────
    for (const line of itemLines) {
      const sentPrice = parseFloat(String(line.unitPrice ?? 0));
      let expectedPrice: number;
      let expectedSource: string;

      if (effectiveDeptId && deptPriceMap.has(line.itemId!)) {
        expectedPrice  = parseFloat(deptPriceMap.get(line.itemId!)!);
        expectedSource = "department";
      } else if (line.lotId && lotPriceMap.has(line.lotId)) {
        expectedPrice  = parseFloat(lotPriceMap.get(line.lotId)!);
        expectedSource = "lot";
      } else {
        expectedPrice  = parseFloat(globalPriceMap.get(line.itemId!) ?? "0");
        expectedSource = "item";
      }

      const delta = Math.abs(sentPrice - expectedPrice);
      if (delta > 0.001) {
        logger.warn(
          {
            event: "ITEM_PRICE_DEVIATION",
            invoiceId: invoiceId ?? null,
            lineId: line.id ?? null,
            itemId: line.itemId,
            departmentId: effectiveDeptId,
            expectedSource, sentPrice, expectedPrice,
            delta: +delta.toFixed(4),
            userId,
          },
          "[PRICE_AUDIT] item unit price differs from expected",
        );
      }
    }
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), invoiceId },
      "[PRICE_AUDIT] auditItemPriceDeviations failed — skipped",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. autoFillClassification
// ─────────────────────────────────────────────────────────────────────────────
/**
 * يُعيد حساب business_classification لكل بند من master data (server-side).
 * المبدأ: لا نثق في قيمة الـ client — الـ server هو المصدر الوحيد للحقيقة.
 * Batch: query واحدة لكل services + items — لا N+1.
 */
export async function autoFillClassification(lines: InvoiceLine[]): Promise<InvoiceLine[]> {
  if (lines.length === 0) return lines;

  const serviceIds = [...new Set(lines.map(l => l.serviceId).filter(Boolean))] as string[];
  const itemIds    = [...new Set(lines.map(l => l.itemId).filter(Boolean))] as string[];

  const [svcRows, itmRows] = await Promise.all([
    serviceIds.length > 0
      ? db.execute(sql`SELECT id, business_classification, service_type FROM services WHERE id IN (${sql.join(serviceIds.map(id => sql`${id}`), sql`, `)})`)
      : { rows: [] as unknown[] },
    itemIds.length > 0
      ? db.execute(sql`SELECT id, business_classification FROM items WHERE id IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`)
      : { rows: [] as unknown[] },
  ]);

  const svcMap = new Map((svcRows.rows as { id: string; business_classification?: string; service_type?: string }[]).map(r => [r.id, r]));
  const itmMap = new Map((itmRows.rows as { id: string; business_classification?: string }[]).map(r => [r.id, r]));

  return lines.map(l => {
    const svc = l.serviceId ? svcMap.get(l.serviceId) : undefined;
    const itm = l.itemId    ? itmMap.get(l.itemId)    : undefined;

    const { result, usedFallback, fallbackReason } = resolveBusinessClassificationWithMeta({
      lineType:                      (l.lineType ?? "drug") as "service" | "drug" | "consumable" | "equipment",
      sourceType:                    l.sourceType ?? null,
      serviceId:                     l.serviceId ?? null,
      serviceBusinessClassification: svc?.business_classification ?? null,
      serviceType:                   svc?.service_type ?? null,
      itemId:                        l.itemId ?? null,
      itemBusinessClassification:    itm?.business_classification ?? null,
    });

    if (l.businessClassification && l.businessClassification !== result) {
      logger.warn(
        { clientValue: l.businessClassification, serverValue: result, lineType: l.lineType, serviceId: l.serviceId, itemId: l.itemId },
        "[CLASSIFICATION] client value rejected — server recomputed from master",
      );
    }
    if (usedFallback) {
      logger.warn(
        { lineType: l.lineType, serviceId: l.serviceId, itemId: l.itemId, fallbackReason },
        "[CLASSIFICATION] server-side fallback used",
      );
    }

    return { ...l, businessClassification: result };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. fireApprovalRequestsForInvoice
// ─────────────────────────────────────────────────────────────────────────────
/**
 * يُطلق طلبات اعتماد للبنود التي تحتاج موافقة العقد.
 * Non-blocking — لا يوقف العملية إذا فشل.
 * يُستدعى بعد finalize مباشرةً.
 */
export async function fireApprovalRequestsForInvoice(
  invoiceId: string,
  contractId: string,
): Promise<void> {
  try {
    const lines = await db.select().from(patientInvoiceLines)
      .where(eq(patientInvoiceLines.headerId, invoiceId));

    const approvalLines = lines.filter(l => {
      const al = l as { coverageStatus?: string; approvalStatus?: string };
      return al.coverageStatus === "approval_required" &&
             !(al.approvalStatus === "pending" || al.approvalStatus === "approved");
    });

    for (const l of approvalLines) {
      const al = l as {
        id: string;
        coverageStatus?: string;
        approvalStatus?: string;
        contractMemberId?: string | null;
        serviceId?: string | null;
        companyShareAmount?: string | null;
        unitPrice?: string | null;
        description?: string | null;
      };
      await createApprovalRequest({
        patientInvoiceLineId: al.id,
        contractId,
        contractMemberId:   al.contractMemberId ?? null,
        serviceId:          al.serviceId ?? null,
        requestedAmount:    String(al.companyShareAmount ?? al.unitPrice ?? "0"),
        serviceDescription: al.description ?? "خدمة طبية",
      }).catch(() => {});
    }
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), invoiceId },
      "[Approvals] fireApprovalRequests failed (non-fatal)",
    );
  }
}
