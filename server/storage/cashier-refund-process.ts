import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  cashierReceipts,
  cashierRefundReceipts,
  cashierAuditLog,
  salesInvoiceHeaders,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";

const MAX_SHIFT_HOURS = 24;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const refundProcessMethods = {

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

};

export default refundProcessMethods;
