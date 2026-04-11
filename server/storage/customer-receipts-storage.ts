import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { customerReceipts, customerReceiptLines } from "@shared/schema/invoicing";
import { journalEntries, journalLines, accountMappings } from "@shared/schema/finance";
import type { CustomerCreditInvoiceRow } from "@shared/schema/invoicing";
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

export interface ReceiptReportRow extends CustomerCreditInvoiceRow {
  receiptId:     string | null;
  receiptDate:   string | null;
  receiptRef:    string | null;
}

export interface CustomerStatementLine {
  txnDate:      string;
  sourceType:   string;
  sourceLabel:  string;
  sourceNumber: string;
  sourceRef:    string | null;
  description:  string;
  debit:        number;
  credit:       number;
  balance:      number;
}

export interface CustomerStatementResult {
  customerId:     string;
  name:           string;
  phone:          string | null;
  fromDate:       string;
  toDate:         string;
  openingBalance: number;
  lines:          CustomerStatementLine[];
  totalDebit:     number;
  totalCredit:    number;
  closingBalance: number;
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

export async function getCustomerReceiptReport(
  customerId: string,
  status: "unpaid" | "paid" | "all" = "all"
): Promise<{
  rows:             ReceiptReportRow[];
  totalNetInvoiced: string;
  totalPaid:        string;
  totalRemaining:   string;
}> {
  const havingClause =
    status === "unpaid"
      ? sql`HAVING (sih.net_total::numeric - COALESCE(SUM(crl.amount_paid::numeric), 0)) > 0.005`
      : status === "paid"
      ? sql`HAVING (sih.net_total::numeric - COALESCE(SUM(crl.amount_paid::numeric), 0)) <= 0.005`
      : sql``;

  const res = await db.execute(sql`
    SELECT
      sih.id                                                                  AS invoice_id,
      sih.invoice_number,
      sih.invoice_date,
      sih.net_total::numeric                                                  AS net_total,
      COALESCE(SUM(crl.amount_paid::numeric), 0)                             AS total_paid,
      (sih.net_total::numeric - COALESCE(SUM(crl.amount_paid::numeric), 0)) AS remaining,
      MIN(cr.id::text)                                                        AS receipt_id,
      MIN(cr.receipt_date::text)                                              AS receipt_date,
      MIN(cr.reference)                                                       AS receipt_ref
    FROM   sales_invoice_headers sih
    LEFT JOIN customer_receipt_lines crl ON crl.invoice_id = sih.id
    LEFT JOIN customer_receipts      cr  ON cr.id = crl.receipt_id
    WHERE  sih.customer_id   = ${customerId}
      AND  sih.customer_type = 'credit'
      AND  sih.status        = 'finalized'
    GROUP  BY sih.id, sih.invoice_number, sih.invoice_date, sih.net_total
    ${havingClause}
    ORDER  BY sih.invoice_date ASC, sih.invoice_number ASC
  `);

  const rows = ((res as any).rows as any[]).map((r) => ({
    invoiceId:     r.invoice_id,
    invoiceNumber: Number(r.invoice_number),
    invoiceDate:   r.invoice_date,
    netTotal:      Number(r.net_total).toFixed(2),
    totalPaid:     Number(r.total_paid).toFixed(2),
    remaining:     Number(r.remaining).toFixed(2),
    receiptId:     r.receipt_id ?? null,
    receiptDate:   r.receipt_date ?? null,
    receiptRef:    r.receipt_ref ?? null,
  }));

  const totNetInvoiced = rows.reduce((s, r) => s + parseFloat(r.netTotal), 0);
  const totPaid        = rows.reduce((s, r) => s + parseFloat(r.totalPaid), 0);
  const totRemaining   = rows.reduce((s, r) => s + parseFloat(r.remaining), 0);

  return {
    rows,
    totalNetInvoiced: totNetInvoiced.toFixed(2),
    totalPaid:        totPaid.toFixed(2),
    totalRemaining:   totRemaining.toFixed(2),
  };
}

export async function getCustomerAccountStatement(
  customerId: string,
  fromDate:   string,
  toDate:     string
): Promise<CustomerStatementResult> {
  const custRes = await pool.query<{ name: string; phone: string | null }>(
    `SELECT name, phone FROM pharmacy_credit_customers WHERE id = $1 LIMIT 1`,
    [customerId]
  );
  if (!custRes.rows.length) throw new Error("العميل غير موجود");
  const cust = custRes.rows[0];

  const openingRes = await pool.query<{ opening: string }>(
    `SELECT (
       COALESCE(inv_b.total, 0)
       - COALESCE(rec_b.total, 0)
     ) AS opening
     FROM pharmacy_credit_customers c
     LEFT JOIN (
       SELECT customer_id, SUM(net_total::numeric) AS total
       FROM sales_invoice_headers
       WHERE customer_id = $1
         AND is_return = false
         AND status IN ('finalized', 'collected')
         AND invoice_date < $2::date
       GROUP BY customer_id
     ) inv_b ON inv_b.customer_id = c.id
     LEFT JOIN (
       SELECT customer_id, SUM(total_amount::numeric) AS total
       FROM customer_receipts
       WHERE customer_id = $1
         AND receipt_date < $2::date
       GROUP BY customer_id
     ) rec_b ON rec_b.customer_id = c.id
     WHERE c.id = $1`,
    [customerId, fromDate]
  );
  const openingBalance = Number(openingRes.rows[0]?.opening ?? 0);

  const txnRes = await pool.query<{
    txn_date:      string;
    source_type:   string;
    source_number: string;
    source_ref:    string | null;
    description:   string;
    debit:         string;
    credit:        string;
    sort_ts:       string;
  }>(
    `(
       SELECT
         sih.invoice_date::text          AS txn_date,
         'sales_invoice'                 AS source_type,
         sih.invoice_number::text        AS source_number,
         NULL                            AS source_ref,
         'فاتورة بيع رقم ' || sih.invoice_number AS description,
         sih.net_total::text             AS debit,
         '0'                             AS credit,
         sih.created_at::text            AS sort_ts
       FROM sales_invoice_headers sih
       WHERE sih.customer_id = $1
         AND sih.is_return = false
         AND sih.status IN ('finalized', 'collected')
         AND sih.invoice_date BETWEEN $2::date AND $3::date
     )
     UNION ALL
     (
       SELECT
         cr.receipt_date::text           AS txn_date,
         'customer_receipt'              AS source_type,
         LPAD(cr.receipt_number::text, 4, '0') AS source_number,
         COALESCE(cr.reference, cr.notes) AS source_ref,
         'تحصيل رقم #' || LPAD(cr.receipt_number::text, 4, '0')
           || CASE WHEN cr.reference IS NOT NULL THEN ' / ' || cr.reference ELSE '' END AS description,
         '0'                             AS debit,
         cr.total_amount::text           AS credit,
         cr.created_at::text             AS sort_ts
       FROM customer_receipts cr
       WHERE cr.customer_id = $1
         AND cr.receipt_date BETWEEN $2::date AND $3::date
     )
     ORDER BY txn_date, sort_ts`,
    [customerId, fromDate, toDate]
  );

  let runningBalance = openingBalance;
  const lines: CustomerStatementLine[] = txnRes.rows.map((r) => {
    const dr = Number(r.debit  ?? 0);
    const cr = Number(r.credit ?? 0);
    runningBalance = runningBalance + dr - cr;

    const typeMap: Record<string, string> = {
      sales_invoice:    "فاتورة بيع",
      customer_receipt: "تحصيل",
    };

    return {
      txnDate:      r.txn_date,
      sourceType:   r.source_type,
      sourceLabel:  typeMap[r.source_type] ?? r.source_type,
      sourceNumber: r.source_number,
      sourceRef:    r.source_ref ?? null,
      description:  r.description,
      debit:        dr,
      credit:       cr,
      balance:      runningBalance,
    };
  });

  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  return {
    customerId,
    name:           cust.name,
    phone:          cust.phone ?? null,
    fromDate,
    toDate,
    openingBalance,
    lines,
    totalDebit,
    totalCredit,
    closingBalance: openingBalance + totalDebit - totalCredit,
  };
}
