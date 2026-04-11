import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  cashierReceipts,
  cashierAuditLog,
  salesInvoiceHeaders,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { getCollectibleAmountStr } from "../lib/cashier-collection-amount";

const MAX_SHIFT_HOURS = 24;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const methods = {

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
};

export default methods;
