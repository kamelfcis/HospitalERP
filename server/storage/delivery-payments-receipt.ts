import { sql } from "drizzle-orm";
import { db } from "../db";
import { deliveryReceipts, deliveryReceiptLines } from "@shared/schema/invoicing";
import { journalEntries, journalLines, accountMappings } from "@shared/schema/finance";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import type { CreateDeliveryReceiptInput } from "./delivery-payments-queries";
import { resolveShiftFromGlAccount, resolveShiftFromUserId } from "./delivery-payments-queries";

export async function createDeliveryReceipt(
  input: CreateDeliveryReceiptInput
): Promise<{ receiptId: string; receiptNumber: number; journalEntryId: string | null }> {
  if (!input.lines.length) throw new Error("لا توجد فواتير مُحددة للتحصيل");
  if (input.totalAmount <= 0) throw new Error("مبلغ التحصيل يجب أن يكون أكبر من الصفر");

  const sumLines = input.lines.reduce((s, l) => s + l.amountPaid, 0);
  if (Math.abs(sumLines - input.totalAmount) > 0.02) {
    throw new Error(
      `مجموع التوزيع (${sumLines.toFixed(2)}) لا يطابق إجمالي التحصيل (${input.totalAmount.toFixed(2)})`
    );
  }

  let resolvedShiftId: string | null = input.shiftId ?? null;
  let effectiveGlAccountId: string | null = input.glAccountId ?? null;

  if (!resolvedShiftId && effectiveGlAccountId) {
    resolvedShiftId = await resolveShiftFromGlAccount(effectiveGlAccountId);
  }

  if (!resolvedShiftId && input.userId) {
    const userShift = await resolveShiftFromUserId(input.userId);
    if (userShift) {
      resolvedShiftId   = userShift.shiftId;
      effectiveGlAccountId = effectiveGlAccountId ?? userShift.glAccountId;
    }
  }

  let shiftUnitKey: string | null = null;
  if (resolvedShiftId) {
    const shiftRes = await db.execute(sql`
      SELECT unit_type, pharmacy_id, department_id FROM cashier_shifts
      WHERE id = ${resolvedShiftId}
    `);
    const shiftRow = (shiftRes as any).rows[0];
    if (shiftRow) {
      shiftUnitKey = shiftRow.unit_type === "pharmacy"
        ? (shiftRow.pharmacy_id ?? null)
        : (shiftRow.department_id ?? null);
    }
  }

  let arAccountId: string | null = null;
  let glDebitId:   string | null = null;
  let glCreditId:  string | null = null;
  if (effectiveGlAccountId) {
    const mappings = await db.select().from(accountMappings)
      .where(sql`transaction_type = 'sales_invoice'`);
    const arMapping = mappings.find((m) => m.lineType === "receivables");
    if (arMapping) {
      arAccountId = arMapping.debitAccountId || null;
      glDebitId   = effectiveGlAccountId;
      glCreditId  = arAccountId;
    }
  }

  const { receiptId, receiptNumber } = await db.transaction(async (tx) => {
    const numRes = await tx.execute(
      sql`SELECT nextval('delivery_receipt_number_seq') AS next_num`
    );
    const receiptNumber = Number((numRes as any).rows[0]?.next_num ?? 1);

    const [receipt] = await tx
      .insert(deliveryReceipts)
      .values({
        receiptNumber,
        receiptDate:   input.receiptDate,
        totalAmount:   String(input.totalAmount),
        paymentMethod: input.paymentMethod,
        reference:     input.reference ?? null,
        notes:         input.notes ?? null,
        createdBy:     input.createdBy ?? null,
        glAccountId:   effectiveGlAccountId ?? null,
        shiftId:       resolvedShiftId,
      })
      .returning({ id: deliveryReceipts.id, receiptNumber: deliveryReceipts.receiptNumber });

    await tx.insert(deliveryReceiptLines).values(
      input.lines.map((l) => ({
        receiptId:  receipt.id,
        invoiceId:  l.invoiceId,
        amountPaid: String(l.amountPaid),
      }))
    );

    for (const line of input.lines) {
      await tx.execute(sql`
        UPDATE sales_invoice_headers
        SET status = 'collected'
        WHERE id = ${line.invoiceId}
          AND customer_type = 'delivery'
          AND GREATEST(
            net_total::numeric - (
              SELECT COALESCE(SUM(amount_paid::numeric), 0)
              FROM delivery_receipt_lines
              WHERE invoice_id = ${line.invoiceId}
            ),
            0
          ) = 0
      `);
    }

    return { receiptId: receipt.id, receiptNumber };
  });

  let journalEntryId: string | null = null;
  if (glDebitId && glCreditId) {
    try {
      const periodRes = await db.execute(sql`
        SELECT id FROM fiscal_periods
        WHERE is_closed = false
          AND start_date <= ${input.receiptDate}::date
          AND end_date   >= ${input.receiptDate}::date
        LIMIT 1
      `);
      const periodId = (periodRes as any).rows[0]?.id ?? null;

      const entryNumRes = await db.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
      const entryNumber = Number((entryNumRes as any).rows[0]?.n ?? 1);
      const amount      = input.totalAmount.toFixed(2);

      const [entry] = await db.insert(journalEntries).values({
        entryNumber,
        entryDate:   input.receiptDate,
        description: `تحصيل توصيل منزلي - إيصال ${receiptNumber}`,
        reference:   `DLVMT-${receiptNumber}`,
        status:      "posted" as const,
        periodId:    periodId,
        createdBy:   input.createdBy ?? null,
      }).returning({ id: journalEntries.id });

      const deliveryJournalLines = await resolveCostCenters([
        {
          journalEntryId: entry.id,
          lineNumber:     1,
          accountId:      glDebitId,
          debit:          amount,
          credit:         "0",
          description:    `تحصيل توصيل منزلي - إيصال ${receiptNumber}`,
        },
        {
          journalEntryId: entry.id,
          lineNumber:     2,
          accountId:      glCreditId,
          debit:          "0",
          credit:         amount,
          description:    `ذمم توصيل منزلي - إيصال ${receiptNumber}`,
        },
      ]);
      await db.insert(journalLines).values(deliveryJournalLines);

      await db.execute(sql`
        UPDATE delivery_receipts SET journal_entry_id = ${entry.id}
        WHERE id = ${receiptId}
      `);

      journalEntryId = entry.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, receiptId }, "[DLVMT] GL journal failed");
      void logAcctEvent({
        sourceType:   "delivery_receipt",
        sourceId:     receiptId,
        eventType:    "dlvmt_journal_failed",
        status:       "needs_retry",
        errorMessage: `فشل قيد تحصيل التوصيل: ${msg}`,
      }).catch(() => {});
    }
  }

  return { receiptId, receiptNumber, journalEntryId, shiftUnitKey };
}
