import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { supplierPayments, supplierPaymentLines } from "@shared/schema/purchasing";
import { journalEntries, journalLines } from "@shared/schema/finance";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { resolveCostCenters } from "../lib/cost-center-resolver";

export interface CreatePaymentInput {
  supplierId:    string;
  paymentDate:   string;
  totalAmount:   number;
  reference?:    string | null;
  notes?:        string | null;
  paymentMethod: string;
  createdBy?:    string | null;
  glAccountId?:  string | null;
  shiftId?:      string | null;
  lines: { invoiceId: string; amountPaid: number }[];
}

export async function getNextPaymentNumber(): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(payment_number), 0) + 1 AS next_num FROM supplier_payments`
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

export async function createSupplierPayment(
  input: CreatePaymentInput
): Promise<{ paymentId: string; paymentNumber: number; journalEntryId: string | null }> {
  if (!input.lines.length) throw new Error("لا توجد فواتير مُحددة للسداد");
  if (input.totalAmount <= 0) throw new Error("مبلغ السداد يجب أن يكون أكبر من الصفر");

  const sumLines = input.lines.reduce((s, l) => s + l.amountPaid, 0);
  if (Math.abs(sumLines - input.totalAmount) > 0.02) {
    throw new Error(
      `مجموع التوزيع (${sumLines.toFixed(2)}) لا يطابق إجمالي السداد (${input.totalAmount.toFixed(2)})`
    );
  }

  const resolvedShiftId: string | null =
    input.shiftId ?? (input.glAccountId ? await resolveShiftFromGlAccount(input.glAccountId) : null);

  let apAccountId: string | null = null;
  if (input.glAccountId) {
    const supplierRes = await pool.query<{ gl_account_id: string | null; supplier_type: string }>(
      `SELECT gl_account_id, supplier_type FROM suppliers WHERE id = $1 LIMIT 1`,
      [input.supplierId]
    );
    const sup = supplierRes.rows[0];
    if (sup?.gl_account_id) {
      apAccountId = sup.gl_account_id;
    } else {
      const supplierType    = sup?.supplier_type || "drugs";
      const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";
      const mappingRes = await pool.query<{ debit_account_id: string | null; credit_account_id: string | null }>(
        `SELECT debit_account_id, credit_account_id FROM account_mappings
         WHERE transaction_type = 'purchase_invoice' AND line_type = $1 AND is_active = true
         LIMIT 1`,
        [payablesLineType]
      );
      const m = mappingRes.rows[0];
      apAccountId = m?.credit_account_id || m?.debit_account_id || null;
    }
  }

  const result = await db.transaction(async (tx) => {
    const numRes = await tx.execute(
      sql`SELECT COALESCE(MAX(payment_number), 0) + 1 AS next_num FROM supplier_payments`
    );
    const paymentNumber = Number((numRes as any).rows[0]?.next_num ?? 1);

    const [payment] = await tx
      .insert(supplierPayments)
      .values({
        paymentNumber,
        supplierId:    input.supplierId,
        paymentDate:   input.paymentDate,
        totalAmount:   String(input.totalAmount),
        reference:     input.reference ?? null,
        notes:         input.notes ?? null,
        paymentMethod: input.paymentMethod,
        createdBy:     input.createdBy ?? null,
        glAccountId:   input.glAccountId ?? null,
        shiftId:       resolvedShiftId,
      })
      .returning({ id: supplierPayments.id, paymentNumber: supplierPayments.paymentNumber });

    await tx.insert(supplierPaymentLines).values(
      input.lines.map((l) => ({
        paymentId:  payment.id,
        invoiceId:  l.invoiceId,
        amountPaid: String(l.amountPaid),
      }))
    );

    let journalEntryId: string | null = null;
    if (apAccountId && input.glAccountId) {
      try {
        const periodRes = await tx.execute(sql`
          SELECT id FROM fiscal_periods
          WHERE is_closed = false
            AND start_date <= ${input.paymentDate}::date
            AND end_date   >= ${input.paymentDate}::date
          LIMIT 1
        `);
        const periodId = (periodRes as any).rows[0]?.id ?? null;

        const entryNumRes = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
        const entryNumber = Number((entryNumRes as any).rows[0]?.n ?? 1);
        const amount      = input.totalAmount.toFixed(2);

        const [entry] = await tx.insert(journalEntries).values({
          entryNumber,
          entryDate:        input.paymentDate,
          reference:        `SUPPMT-${paymentNumber}`,
          description:      `سداد مورد — سند #${paymentNumber}`,
          status:           "draft",
          periodId:         periodId ?? null,
          sourceType:       "supplier_payment",
          sourceDocumentId: payment.id,
          totalDebit:       amount,
          totalCredit:      amount,
        }).returning({ id: journalEntries.id });

        const supplierPaymentLines2 = await resolveCostCenters([
          {
            journalEntryId: entry.id,
            lineNumber:     1,
            accountId:      apAccountId,
            debit:          amount,
            credit:         "0.00",
            description:    `سداد مورد #${paymentNumber} - ذمم موردين`,
          },
          {
            journalEntryId: entry.id,
            lineNumber:     2,
            accountId:      input.glAccountId,
            debit:          "0.00",
            credit:         amount,
            description:    `سداد مورد #${paymentNumber} - خزنة`,
          },
        ]);
        await tx.insert(journalLines).values(supplierPaymentLines2);

        journalEntryId = entry.id;

        await tx.execute(sql`
          UPDATE supplier_payments SET journal_entry_id = ${entry.id} WHERE id = ${payment.id}
        `);

        logger.info({ paymentId: payment.id, entryNumber }, "[SUPPMT] GL journal created");
      } catch (e: any) {
        logger.warn({ err: e.message }, "[SUPPMT] GL journal failed — logged for retry");
        logAcctEvent({
          sourceType:   "supplier_payment",
          sourceId:     payment.id,
          eventType:    "supplier_payment_journal_failed",
          status:       "needs_retry",
          errorMessage: `فشل إنشاء قيد سداد المورد: ${e.message}`,
        }).catch(() => {});
      }
    }

    return { ...payment, journalEntryId };
  });

  return { paymentId: result.id, paymentNumber: result.paymentNumber, journalEntryId: result.journalEntryId };
}
