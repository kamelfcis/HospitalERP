/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  purchasing-receiving-post-service.ts
 *  أعمال ما بعد الاستلام: ترحيل، تعديل المُرحَّل، اعتماد فاتورة الشراء
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  المسؤوليات:
 *    - validateInvoiceLineDiscounts()   — التحقق من اتساق بيانات الخصم
 *    - executeEditPostedReceiving()     — تعديل إذن الاستلام المُرحَّل (qty_only)
 *    - executePostReceiving()           — ترحيل إذن الاستلام أو التصحيح
 *    - executeApprovePurchaseInvoice()  — اعتماد فاتورة الشراء + audit + snapshot
 *
 *  المسار يبقى مسؤولاً عن:
 *    - تحليل الـ request
 *    - استدعاء الـ service
 *    - إرجاع الـ response
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { storage }                          from "../storage";
import { validateReceivingLines }           from "../routes/_validation";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";

// ─── Typed error ─────────────────────────────────────────────────────────────

export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly extras?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// ─── Line-discount validation ─────────────────────────────────────────────────

type LineError = { lineIndex: number; field: string; messageAr: string };

export function validateInvoiceLineDiscounts(lines: unknown[]): LineError[] {
  const errors: LineError[] = [];
  if (!Array.isArray(lines)) return errors;

  const TOLERANCE = 0.02;

  lines.forEach((ln: any, i: number) => {
    const sp  = parseFloat(ln.sellingPrice)       || 0;
    const pp  = parseFloat(ln.purchasePrice)      || 0;
    const pct = parseFloat(ln.lineDiscountPct)    || 0;
    const dv  = parseFloat(ln.lineDiscountValue)  || 0;

    if (pp < 0) {
      errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء لا يمكن أن يكون سالب" });
    }
    if (pct >= 100) {
      errors.push({ lineIndex: i, field: "lineDiscountPct", messageAr: "نسبة الخصم لا يمكن أن تكون 100% أو أكثر" });
    }
    if (sp > 0 && dv > sp + TOLERANCE) {
      errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم أكبر من سعر البيع" });
    }

    if (sp > 0 && (pct > 0 || dv > 0)) {
      const expectedDv = +(sp * (pct / 100)).toFixed(2);
      const expectedPp = +(sp - dv).toFixed(4);
      if (Math.abs(dv - expectedDv) > TOLERANCE) {
        errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم غير متوافقة مع نسبة الخصم" });
      }
      if (Math.abs(pp - expectedPp) > TOLERANCE) {
        errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء غير متوافق مع قيمة الخصم" });
      }
    }
  });

  return errors;
}

// ─── Operations ───────────────────────────────────────────────────────────────

export async function executeEditPostedReceiving(id: string, lines: any[]) {
  const existing = await storage.getReceiving(id);
  if (!existing)
    throw new ServiceError(404, "المستند غير موجود");
  if (existing.status !== "posted_qty_only")
    throw new ServiceError(409, "يمكن تعديل أذونات الاستلام المُرحَّلة (غير المحوَّلة لفاتورة) فقط", "WRONG_STATUS");

  const lineErrors = await validateReceivingLines(lines);
  if (lineErrors.length > 0)
    throw new ServiceError(400, "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة", undefined, { lineErrors });

  try {
    await storage.assertPeriodOpen(existing.receiveDate);
  } catch (e) {
    throw new ServiceError(403, e instanceof Error ? e.message : String(e));
  }

  const result = await storage.editPostedReceiving(id, lines);

  await storage.createAuditLog({
    tableName: "receiving_headers",
    recordId:  id,
    action:    "edit_posted",
    oldValues: JSON.stringify({ status: existing.status }),
    newValues: JSON.stringify({ linesCount: lines.filter((l: any) => !l.isRejected).length }),
  });

  return result;
}

export async function executePostReceiving(id: string) {
  const receiving = await storage.getReceiving(id);
  if (!receiving)
    throw new ServiceError(404, "المستند غير موجود");
  if (receiving.status === "posted" || receiving.status === "posted_qty_only" || receiving.status === "posted_costed") {
    return receiving;
  }

  try {
    await storage.assertPeriodOpen(receiving.receiveDate);
  } catch (e) {
    throw new ServiceError(403, e instanceof Error ? e.message : String(e));
  }

  if (receiving.lines && receiving.lines.length > 0) {
    const lineErrors = await validateReceivingLines(receiving.lines);
    if (lineErrors.length > 0)
      throw new ServiceError(400, "لا يمكن ترحيل الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة", undefined, { lineErrors });
  }

  const result = receiving.correctionStatus === "correction"
    ? await storage.postReceivingCorrection(id)
    : await storage.postReceiving(id);

  await storage.createAuditLog({
    tableName: "receiving_headers",
    recordId:  id,
    action:    "post",
    oldValues: JSON.stringify({ status: "draft" }),
    newValues: JSON.stringify({ status: "posted" }),
  });

  return result;
}

export async function executeApprovePurchaseInvoice(id: string) {
  const invoice = await storage.getPurchaseInvoice(id);
  if (!invoice)
    throw new ServiceError(404, "الفاتورة غير موجودة");
  if (invoice.status !== "draft")
    throw new ServiceError(409, "الفاتورة معتمدة بالفعل", "ALREADY_APPROVED");

  try {
    await storage.assertPeriodOpen(invoice.invoiceDate as string);
  } catch (e) {
    throw new ServiceError(403, e instanceof Error ? e.message : String(e));
  }

  if (!invoice.claimNumber?.trim())
    throw new ServiceError(400, "رقم المطالبة مطلوب قبل الاعتماد", "CLAIM_NUMBER_REQUIRED");

  if (invoice.lines && Array.isArray(invoice.lines)) {
    const discountErrors = validateInvoiceLineDiscounts(invoice.lines as unknown[]);
    if (discountErrors.length > 0)
      throw new ServiceError(400, "أخطاء في بيانات الخصم - لا يمكن الاعتماد", undefined, { lineErrors: discountErrors });
  }

  const result = await storage.approvePurchaseInvoice(id);

  await storage.createAuditLog({
    tableName: "purchase_invoice_headers",
    recordId:  id,
    action:    "approve",
    oldValues: JSON.stringify({ status: "draft" }),
    newValues: JSON.stringify({ status: "approved" }),
  });

  scheduleInventorySnapshotRefresh("purchase_approved");

  return result;
}
