import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { customerReceipts, customerReceiptLines } from "@shared/schema/invoicing";
import { journalEntries, journalLines, accountMappings } from "@shared/schema/finance";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { resolveCostCenters } from "../lib/cost-center-resolver";

export interface CreateReceiptInput {
  customerId:    string;
  receiptDate:   string;
  totalAmount:   number;
  paymentMethod: string;
  reference?:    string | null;
  notes?:        string | null;
  createdBy?:    string | null;
  glAccountId?:  string | null;
  shiftId?:      string | null;
  userId?:       string | null;
  lines: { invoiceId: string; amountPaid: number }[];
}

export async function getNextReceiptNumber(): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next_num FROM customer_receipts`
  );
  return Number((res as any).rows[0]?.next_num ?? 1);
}

async function resolveShiftFromGlAccount(glAccountId: string): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT id FROM cashier_shifts
    WHERE gl_account_id = ${glAccountId} AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `);
  return (res as any).rows[0]?.id ?? null;
}

async function resolveShiftFromUserId(userId: string): Promise<{ shiftId: string; glAccountId: string | null } | null> {
  const res = await db.execute(sql`
    SELECT id, gl_account_id FROM cashier_shifts
    WHERE cashier_id = ${userId} AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `);
  const row = (res as any).rows[0];
  if (!row) return null;
  return { shiftId: row.id, glAccountId: row.gl_account_id ?? null };
}

export async function createCustomerReceipt(
  input: CreateReceiptInput
): Promise<{ receiptId: string; receiptNumber: number; journalEntryId: string | null }> {
  if (!input.lines.length) throw new Error("لا توجد فواتير مُحددة للتحصيل");
  if (input.totalAmount <= 0)  throw new Error("مبلغ التحصيل يجب أن يكون أكبر من الصفر");

  const sumLines = input.lines.reduce((s, l) => s + l.amountPaid, 0);
  if (Math.abs(sumLines - input.totalAmount) > 0.02) {
    throw new Error(
      `مجموع التوزيع (${sumLines.toFixed(2)}) لا يطابق إجمالي التحصيل (${input.totalAmount.toFixed(2)})`
    );
  }

  let resolvedShiftId: string | null    = input.shiftId ?? null;
  let effectiveGlAccountId: string | null = input.glAccountId ?? null;

  if (!resolvedShiftId && effectiveGlAccountId) {
    resolvedShiftId = await resolveShiftFromGlAccount(effectiveGlAccountId);
  }

  if (!resolvedShiftId && (input.userId ?? input.createdBy)) {
    const uid = (input.userId ?? input.createdBy)!;
    const userShift = await resolveShiftFromUserId(uid);
    if (userShift) {
      resolvedShiftId      = userShift.shiftId;
      effectiveGlAccountId = effectiveGlAccountId ?? userShift.glAccountId;
    }
  }

  let arAccountId:  string | null = null;
  let glDebitId:    string | null = null;
  let glCreditId:   string | null = null;
  if (effectiveGlAccountId) {
    const custRes = await pool.query<{ gl_account_id: string | null }>(
      `SELECT gl_account_id FROM pharmacy_credit_customers WHERE id = $1 LIMIT 1`,
      [input.customerId]
    );
    const custGlAccountId = custRes.rows[0]?.gl_account_id ?? null;

    if (custGlAccountId) {
      arAccountId = custGlAccountId;
    } else {
      const mappings = await db.select().from(accountMappings)
        .where(sql`transaction_type = 'sales_invoice'`);
      const arMapping = mappings.find((m) => m.lineType === "receivables");
      arAccountId = arMapping?.debitAccountId || null;
    }

    if (arAccountId) {
      glDebitId  = effectiveGlAccountId;
      glCreditId = arAccountId;
    }
  }

  const result = await db.transaction(async (tx) => {
    const numRes = await tx.execute(
      sql`SELECT nextval('customer_receipt_number_seq') AS next_num`
    );
    const receiptNumber = Number((numRes as any).rows[0]?.next_num ?? 1);

    const [receipt] = await tx
      .insert(customerReceipts)
      .values({
        receiptNumber,
        customerId:    input.customerId,
        receiptDate:   input.receiptDate,
        totalAmount:   String(input.totalAmount),
        paymentMethod: input.paymentMethod,
        reference:     input.reference ?? null,
        notes:         input.notes ?? null,
        createdBy:     input.createdBy ?? null,
        glAccountId:   input.glAccountId ?? null,
        shiftId:       resolvedShiftId,
      })
      .returning({ id: customerReceipts.id, receiptNumber: customerReceipts.receiptNumber });

    await tx.insert(customerReceiptLines).values(
      input.lines.map((l) => ({
        receiptId:  receipt.id,
        invoiceId:  l.invoiceId,
        amountPaid: String(l.amountPaid),
      }))
    );

    let journalEntryId: string | null = null;
    if (glDebitId && glCreditId) {
      try {
        const periodRes = await tx.execute(sql`
          SELECT id FROM fiscal_periods
          WHERE is_closed = false
            AND start_date <= ${input.receiptDate}::date
            AND end_date   >= ${input.receiptDate}::date
          LIMIT 1
        `);
        const periodId = (periodRes as any).rows[0]?.id ?? null;

        const entryNumRes = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
        const entryNumber = Number((entryNumRes as any).rows[0]?.n ?? 1);
        const amount      = input.totalAmount.toFixed(2);

        const [entry] = await tx.insert(journalEntries).values({
          entryNumber,
          entryDate:        input.receiptDate,
          reference:        `CRPMT-${receiptNumber}`,
          description:      `تحصيل آجل — إيصال #${receiptNumber}`,
          status:           "posted",
          periodId:         periodId ?? null,
          sourceType:       "credit_customer_receipt",
          sourceDocumentId: receipt.id,
          totalDebit:       amount,
          totalCredit:      amount,
        }).returning({ id: journalEntries.id });

        const customerReceiptJournalLines = await resolveCostCenters([
          {
            journalEntryId: entry.id,
            lineNumber:     1,
            accountId:      glDebitId,
            debit:          amount,
            credit:         "0.00",
            description:    `تحصيل آجل #${receiptNumber} - خزنة`,
          },
          {
            journalEntryId: entry.id,
            lineNumber:     2,
            accountId:      glCreditId,
            debit:          "0.00",
            credit:         amount,
            description:    `تحصيل آجل #${receiptNumber} - ذمم`,
          },
        ]);
        await tx.insert(journalLines).values(customerReceiptJournalLines);

        journalEntryId = entry.id;

        await tx.execute(sql`
          UPDATE customer_receipts SET journal_entry_id = ${entry.id} WHERE id = ${receipt.id}
        `);

        logger.info({ receiptId: receipt.id, entryNumber }, "[CRPMT] GL journal created");
      } catch (e: any) {
        logger.error({ err: e.message, receiptId: receipt.id }, "[CRPMT] GL journal failed");
        void logAcctEvent({
          sourceType:    "credit_customer_receipt",
          sourceId:      receipt.id,
          eventType:     "crpmt_journal_failed",
          status:        "needs_retry",
          errorMessage:  `فشل قيد تحصيل الآجل: ${e.message}`,
        }).catch(() => {});
      }
    }

    return { ...receipt, journalEntryId };
  });

  return { receiptId: result.id, receiptNumber: result.receiptNumber, journalEntryId: result.journalEntryId };
}
