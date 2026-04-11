import { db } from "../db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  cashierShifts,
  cashierReceipts,
  cashierRefundReceipts,
  cashierAuditLog,
  salesInvoiceHeaders,
  salesInvoiceLines,
  warehouses,
  items,
  users,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { getCollectibleAmountStr } from "../lib/cashier-collection-amount";

const MAX_SHIFT_HOURS = 24;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const methods = {

  async getPendingSalesInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, false),
      sql`NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = ${salesInvoiceHeaders.id})`,
      sql`NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = ${salesInvoiceHeaders.id})`,
      sql`${salesInvoiceHeaders.customerType} NOT IN ('credit', 'delivery')`,
      sql`(${salesInvoiceHeaders.customerType} != 'contract' OR COALESCE(CAST(${salesInvoiceHeaders.patientShareTotal} AS numeric), 0) > 0)`,
    ];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const filtered = await db.select({
      id:                  salesInvoiceHeaders.id,
      invoiceNumber:       salesInvoiceHeaders.invoiceNumber,
      invoiceDate:         salesInvoiceHeaders.invoiceDate,
      customerType:        salesInvoiceHeaders.customerType,
      customerName:        salesInvoiceHeaders.customerName,
      contractCompany:     salesInvoiceHeaders.contractCompany,
      patientShareTotal:   salesInvoiceHeaders.patientShareTotal,
      companyShareTotal:   salesInvoiceHeaders.companyShareTotal,
      subtotal:            salesInvoiceHeaders.subtotal,
      discountValue:       salesInvoiceHeaders.discountValue,
      netTotal:            salesInvoiceHeaders.netTotal,
      createdBy:           salesInvoiceHeaders.createdBy,
      status:              salesInvoiceHeaders.status,
      createdAt:           salesInvoiceHeaders.createdAt,
      claimedByShiftId:    salesInvoiceHeaders.claimedByShiftId,
      claimedAt:           salesInvoiceHeaders.claimedAt,
      warehouseName:       warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    const creatorIdSet = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds = Array.from(creatorIdSet);
    const nameMap = new Map<string, string>();
    if (creatorIds.length > 0) {
      const userRows = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
        .from(users)
        .where(inArray(users.id, creatorIds));
      for (const row of userRows) {
        nameMap.set(row.id, row.fullName || row.username || "");
      }
    }
    const enriched = filtered.map(r => ({
      ...r,
      pharmacistName: (r.createdBy ? nameMap.get(r.createdBy) || null : null),
    }));

    if (search) {
      const s = search.toLowerCase();
      return enriched.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s)) ||
        (r.createdBy && r.createdBy.toLowerCase().includes(s))
      );
    }
    return enriched;
  },

  async getPendingReturnInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, true),
      sql`NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = ${salesInvoiceHeaders.id})`,
      sql`NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = ${salesInvoiceHeaders.id})`,
    ];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const filtered = await db.select({
      id:                  salesInvoiceHeaders.id,
      invoiceNumber:       salesInvoiceHeaders.invoiceNumber,
      invoiceDate:         salesInvoiceHeaders.invoiceDate,
      customerType:        salesInvoiceHeaders.customerType,
      customerName:        salesInvoiceHeaders.customerName,
      subtotal:            salesInvoiceHeaders.subtotal,
      discountValue:       salesInvoiceHeaders.discountValue,
      netTotal:            salesInvoiceHeaders.netTotal,
      createdBy:           salesInvoiceHeaders.createdBy,
      originalInvoiceId:   salesInvoiceHeaders.originalInvoiceId,
      status:              salesInvoiceHeaders.status,
      createdAt:           salesInvoiceHeaders.createdAt,
      claimedByShiftId:    salesInvoiceHeaders.claimedByShiftId,
      claimedAt:           salesInvoiceHeaders.claimedAt,
      warehouseName:       warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    const creatorIdSet2 = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds2 = Array.from(creatorIdSet2);
    const nameMap2 = new Map<string, string>();
    if (creatorIds2.length > 0) {
      const userRows2 = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
        .from(users)
        .where(inArray(users.id, creatorIds2));
      for (const row of userRows2) {
        nameMap2.set(row.id, row.fullName || row.username || "");
      }
    }
    const enriched = filtered.map(r => ({
      ...r,
      pharmacistName: (r.createdBy ? nameMap2.get(r.createdBy) || null : null),
    }));

    if (search) {
      const s = search.toLowerCase();
      return enriched.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s))
      );
    }
    return enriched;
  },

  async getSalesInvoiceDetails(this: DatabaseStorage, invoiceId: string): Promise<any> {
    const [header] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!header) return null;

    const lines = await db.select({
      id:        salesInvoiceLines.id,
      lineNo:    salesInvoiceLines.lineNo,
      itemId:    salesInvoiceLines.itemId,
      unitLevel: salesInvoiceLines.unitLevel,
      qty:       salesInvoiceLines.qty,
      salePrice: salesInvoiceLines.salePrice,
      lineTotal: salesInvoiceLines.lineTotal,
      itemName:  items.nameAr,
      itemCode:  items.itemCode,
    })
    .from(salesInvoiceLines)
    .leftJoin(items, eq(salesInvoiceLines.itemId, items.id))
    .where(eq(salesInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.lineNo));

    let pharmacistName: string | null = null;
    if (header.createdBy) {
      const [userRow] = await db.select({ fullName: users.fullName, username: users.username })
        .from(users)
        .where(eq(users.id, header.createdBy));
      if (userRow) pharmacistName = userRow.fullName || userRow.username || null;
    }
    const invoiceDateTime = header.createdAt ? header.createdAt.toISOString() : null;

    return { ...header, lines, pharmacistName, invoiceDateTime };
  },

  async collectInvoices(
    this: DatabaseStorage,
    shiftId: string,
    invoiceIds: string[],
    collectedBy: string,
    paymentDate?: string,
  ): Promise<{ receipts: Record<string, unknown>[]; totalCollected: string; count: number }> {
    const self = this;
    return await db.transaction(async (tx) => {

      const shiftCheck = await tx.execute(sql`
        SELECT *,
               EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
        FROM cashier_shifts
        WHERE id = ${shiftId}
        FOR UPDATE
      `);
      const shiftRow = (shiftCheck as any).rows[0];
      if (!shiftRow)                    throw new Error("الوردية غير موجودة");
      if (shiftRow.status !== "open")   throw new Error("الوردية ليست مفتوحة");

      const hoursOpen = parseFloat(shiftRow.hours_open || "0");
      if (hoursOpen > MAX_SHIFT_HOURS) {
        await tx.execute(sql`
          UPDATE cashier_shifts
          SET status='stale', stale_at=NOW(),
              stale_reason='تجاوز الحد الزمني عند محاولة التحصيل'
          WHERE id=${shiftId} AND status='open'
        `);
        throw new Error(`الوردية منتهية الصلاحية — مضى عليها ${hoursOpen.toFixed(1)} ساعة — لا يمكن التحصيل`);
      }
      if (!shiftRow.gl_account_id) throw new Error("الوردية لا تحتوي على حساب خزنة — يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierReceipts);
      let nextReceiptNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalCollected = 0;

      for (const invoiceId of invoiceIds) {
        const [invoice] = await tx.select()
          .from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} هي مرتجع`);

        if (invoice.claimedByShiftId && invoice.claimedByShiftId !== shiftId) {
          throw new Error(`الفاتورة ${invoice.invoiceNumber} محجوزة لوردية أخرى`);
        }

        const [existingReceipt] = await tx.select()
          .from(cashierReceipts)
          .where(eq(cashierReceipts.invoiceId, invoiceId));
        if (existingReceipt) throw new Error(`الفاتورة ${invoice.invoiceNumber} محصّلة بالفعل`);

        const amount = getCollectibleAmountStr(invoice);
        totalCollected += parseFloat(amount);

        await tx.execute(sql`
          UPDATE sales_invoice_headers
          SET claimed_by_shift_id = ${shiftId}, claimed_at = NOW()
          WHERE id = ${invoiceId}
        `);

        const [receipt] = await tx.insert(cashierReceipts).values({
          receiptNumber: nextReceiptNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          collectedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status:    "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action:      "collect",
          entityType:  "sales_invoice",
          entityId:    invoiceId,
          details:     `تحصيل فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: collectedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalCollected: totalCollected.toFixed(2), count: receipts.length };

      self.createCashierCollectionJournals(
        invoiceIds,
        shiftRow.gl_account_id || null,
        shiftRow.pharmacy_id || "",
      ).catch((err: unknown) => {
        const msg = errMsg(err);
        logger.error({ err: msg, invoiceIds }, "[CASHIER] createCashierCollectionJournals: top-level failure");
        logAcctEvent({
          sourceType:   "cashier_collection",
          sourceId:     shiftId,
          eventType:    "cashier_collection_journals_top_level_failure",
          status:       "failed",
          errorMessage: `فشل على مستوى الوردية عند إنشاء قيود التحصيل: ${msg}. الفواتير المتأثرة: ${invoiceIds.join(', ')}`,
        }).catch(() => {});
      });

      return result;
    });
  },

  async refundInvoices(
    this: DatabaseStorage,
    shiftId: string,
    invoiceIds: string[],
    refundedBy: string,
    paymentDate?: string,
  ): Promise<{ receipts: Record<string, unknown>[]; totalRefunded: string; count: number }> {
    const self = this;
    return await db.transaction(async (tx) => {

      const shiftCheck = await tx.execute(sql`
        SELECT *,
               EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
        FROM cashier_shifts
        WHERE id = ${shiftId}
        FOR UPDATE
      `);
      const shiftRow = (shiftCheck as any).rows[0];
      if (!shiftRow)                    throw new Error("الوردية غير موجودة");
      if (shiftRow.status !== "open")   throw new Error("الوردية ليست مفتوحة");

      const hoursOpen = parseFloat(shiftRow.hours_open || "0");
      if (hoursOpen > MAX_SHIFT_HOURS) {
        await tx.execute(sql`
          UPDATE cashier_shifts
          SET status='stale', stale_at=NOW(),
              stale_reason='تجاوز الحد الزمني عند محاولة الاسترداد'
          WHERE id=${shiftId} AND status='open'
        `);
        throw new Error(`الوردية منتهية الصلاحية — مضى عليها ${hoursOpen.toFixed(1)} ساعة — لا يمكن الاسترداد`);
      }

      const openingF        = parseFloat(shiftRow.opening_cash || "0");
      const [collectRes]    = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));
      const [refundRes]     = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));
      const collectedF      = parseFloat(collectRes?.total || "0");
      const refundedF       = parseFloat(refundRes?.total  || "0");

      const creditRes2 = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0)::text AS total
        FROM customer_receipts WHERE shift_id = ${shiftId}
      `);
      const creditCollected = parseFloat((creditRes2 as any).rows[0]?.total || "0");

      const deliveryRes2 = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0)::text AS total
        FROM delivery_receipts WHERE shift_id = ${shiftId}
      `);
      const deliveryCollected = parseFloat((deliveryRes2 as any).rows[0]?.total || "0");

      const supplierRes2 = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0)::text AS total
        FROM supplier_payments WHERE shift_id = ${shiftId}
      `);
      const supplierPaid = parseFloat((supplierRes2 as any).rows[0]?.total || "0");

      let requestedTotal = 0;
      for (const invoiceId of invoiceIds) {
        const [inv] = await tx.select({ netTotal: salesInvoiceHeaders.netTotal }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
        if (inv) requestedTotal += parseFloat(inv.netTotal || "0");
      }

      const availableCash = openingF + collectedF + creditCollected + deliveryCollected - refundedF - supplierPaid;
      if (requestedTotal > availableCash + 0.01) {
        throw new Error(
          `رصيد الدرج غير كافٍ لصرف المرتجعات\n` +
          `• الرصيد المتاح: ${availableCash.toFixed(2)} ج.م\n` +
          `  (افتتاح ${openingF.toFixed(2)} + تحصيل ${collectedF.toFixed(2)} + آجل ${creditCollected.toFixed(2)} + توصيل ${deliveryCollected.toFixed(2)} − مرتجعات سابقة ${refundedF.toFixed(2)} − موردين ${supplierPaid.toFixed(2)})\n` +
          `• المطلوب صرفه: ${requestedTotal.toFixed(2)} ج.م\n` +
          `• النقص: ${(requestedTotal - availableCash).toFixed(2)} ج.م`
        );
      }

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierRefundReceipts);
      let nextRefundNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalRefunded = 0;

      for (const invoiceId of invoiceIds) {
        const [invoice] = await tx.select()
          .from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (!invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست مرتجع`);

        if (invoice.claimedByShiftId && invoice.claimedByShiftId !== shiftId) {
          throw new Error(`مرتجع الفاتورة ${invoice.invoiceNumber} محجوز لوردية أخرى`);
        }

        const [existingRefund] = await tx.select()
          .from(cashierRefundReceipts)
          .where(eq(cashierRefundReceipts.invoiceId, invoiceId));
        if (existingRefund) throw new Error(`مرتجع الفاتورة ${invoice.invoiceNumber} مصروف بالفعل`);

        const amount = invoice.netTotal;
        totalRefunded += parseFloat(amount);

        await tx.execute(sql`
          UPDATE sales_invoice_headers
          SET claimed_by_shift_id = ${shiftId}, claimed_at = NOW()
          WHERE id = ${invoiceId}
        `);

        const [receipt] = await tx.insert(cashierRefundReceipts).values({
          receiptNumber: nextRefundNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          refundedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status:    "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action:      "refund",
          entityType:  "return_invoice",
          entityId:    invoiceId,
          details:     `صرف مرتجع فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: refundedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalRefunded: totalRefunded.toFixed(2), count: receipts.length };

      self.completeSalesReturnWithCash(
        invoiceIds,
        shiftRow.gl_account_id || null,
      ).catch((err: unknown) => {
        const msg = errMsg(err);
        logger.error({ err: msg, invoiceIds }, "[CASHIER_REFUND] completeSalesReturnWithCash: top-level failure");
        logAcctEvent({
          sourceType:   "sales_return",
          sourceId:     shiftId,
          eventType:    "cashier_refund_journals_top_level_failure",
          status:       "failed",
          errorMessage: `فشل في قيود صرف المرتجعات: ${msg}. المتأثرة: ${invoiceIds.join(', ')}`,
        }).catch(() => {});
      });

      return result;
    });
  },

  async getShiftTotals(this: DatabaseStorage, shiftId: string): Promise<{
    totalCollected: string;
    totalRefunded: string;
    totalDeferred: string;
    collectCount: number;
    refundCount: number;
    deferredCount: number;
    openingCash: string;
    netCash: string;
    netCollected: string;
    hoursOpen: number;
    isStale: boolean;
    creditCollected: string;
    creditCount: number;
    supplierPaid: string;
    supplierPaidCount: number;
    deliveryCollected: string;
    deliveryCollectedCount: number;
  }> {
    const [collectResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

    const [refundResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

    const deferredRes = await db.execute(sql`
      SELECT COALESCE(SUM(sih.net_total), 0)::text AS total, COUNT(*)::int AS count
      FROM sales_invoice_headers sih
      LEFT JOIN warehouses w ON w.id = sih.warehouse_id
      JOIN cashier_shifts cs ON cs.id = ${shiftId}
      WHERE sih.is_return = false
        AND sih.customer_type = 'credit'
        AND sih.status IN ('finalized', 'collected')
        AND sih.created_at >= cs.opened_at
        AND (cs.closed_at IS NULL OR sih.created_at <= cs.closed_at)
        AND (
              (cs.unit_type = 'pharmacy'   AND sih.pharmacy_id = cs.pharmacy_id)
           OR (cs.unit_type = 'department' AND w.department_id = cs.department_id)
        )
    `);
    const deferredRow = (deferredRes as any).rows[0];

    const creditRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM customer_receipts
      WHERE shift_id = ${shiftId}
    `);
    const creditRow = (creditRes as any).rows[0];

    const supplierPaidRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM supplier_payments
      WHERE shift_id = ${shiftId}
    `);
    const supplierPaidRow = (supplierPaidRes as any).rows[0];

    const deliveryCollectedRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM delivery_receipts
      WHERE shift_id = ${shiftId}
    `);
    const deliveryCollectedRow = (deliveryCollectedRes as any).rows[0];

    const durationRes = await db.execute(sql`
      SELECT opening_cash, status,
             EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
      FROM cashier_shifts WHERE id = ${shiftId}
    `);
    const shiftRow = (durationRes as any).rows[0];

    const totalCollected   = collectResult?.total || "0";
    const totalRefunded    = refundResult?.total  || "0";
    const totalDeferred    = deferredRow?.total   || "0";
    const deferredCount    = parseInt(deferredRow?.count || "0", 10);
    const creditCollected  = creditRow?.total     || "0";
    const creditCount      = parseInt(creditRow?.count || "0", 10);
    const supplierPaid          = supplierPaidRow?.total         || "0";
    const supplierPaidCount     = parseInt(supplierPaidRow?.count     || "0", 10);
    const deliveryCollected     = deliveryCollectedRow?.total    || "0";
    const deliveryCollectedCount = parseInt(deliveryCollectedRow?.count || "0", 10);
    const openingCash           = shiftRow?.opening_cash         || "0";
    const hoursOpen             = parseFloat(shiftRow?.hours_open || "0");
    const isStale               = hoursOpen > MAX_SHIFT_HOURS || shiftRow?.status === "stale";
    const netCash               = (
      parseFloat(openingCash) +
      parseFloat(totalCollected) +
      parseFloat(creditCollected) +
      parseFloat(deliveryCollected) -
      parseFloat(totalRefunded) -
      parseFloat(supplierPaid)
    ).toFixed(2);
    const netCollected          = (
      parseFloat(totalCollected) +
      parseFloat(creditCollected) +
      parseFloat(deliveryCollected) -
      parseFloat(totalRefunded)
    ).toFixed(2);

    return {
      openingCash,
      totalCollected,
      totalDeferred,
      collectCount:  collectResult?.count || 0,
      totalRefunded,
      refundCount:   refundResult?.count  || 0,
      deferredCount,
      creditCollected,
      creditCount,
      supplierPaid,
      supplierPaidCount,
      deliveryCollected,
      deliveryCollectedCount,
      netCash,
      netCollected,
      hoursOpen,
      isStale,
    };
  },

  async getCashierReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    return receipt || null;
  },

  async getCashierRefundReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    return receipt || null;
  },

  async markReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    if (!receipt) throw new Error("الإيصال غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("الإيصال مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierReceipts).set({
      printedAt:     new Date(),
      printCount:    (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierReceipts.id, receiptId)).returning();
    return updated;
  },

  async markRefundReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    if (!receipt) throw new Error("إيصال المرتجع غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("إيصال المرتجع مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierRefundReceipts).set({
      printedAt:     new Date(),
      printCount:    (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierRefundReceipts.id, receiptId)).returning();
    return updated;
  },
};

export default methods;
