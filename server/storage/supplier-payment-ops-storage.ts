import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { supplierPayments, supplierPaymentLines } from "@shared/schema/purchasing";
import { journalEntries, journalLines } from "@shared/schema/finance";
import type { SupplierInvoicePaymentRow } from "@shared/schema/purchasing";
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

export interface PaymentReportRow extends SupplierInvoicePaymentRow {
  paymentId:    string | null;
  paymentDate:  string | null;
  paymentRef:   string | null;
}

export interface StatementLine {
  txnDate:     string;
  sourceType:  string;
  sourceLabel: string;
  sourceNumber: string;
  sourceRef:    string | null;
  description:  string;
  debit:        number;
  credit:       number;
  balance:      number;
}

export interface SupplierStatementResult {
  supplierId:      string;
  nameAr:          string;
  code:            string;
  fromDate:        string;
  toDate:          string;
  openingBalance:  number;
  lines:           StatementLine[];
  totalDebit:      number;
  totalCredit:     number;
  closingBalance:  number;
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

export async function getSupplierAccountStatement(
  supplierId: string,
  fromDate:   string,
  toDate:     string
): Promise<SupplierStatementResult> {
  const supRes = await pool.query<{ name_ar: string; code: string; opening_balance: string | null }>(
    `SELECT name_ar, code, opening_balance FROM suppliers WHERE id = $1 LIMIT 1`,
    [supplierId]
  );
  if (!supRes.rows.length) throw new Error("المورد غير موجود");
  const sup = supRes.rows[0];

  const openingRes = await pool.query<{ opening: string }>(
    `SELECT (
       COALESCE(s.opening_balance, 0)::numeric
       + COALESCE(inv_b.total, 0)
       - COALESCE(ret_b.total, 0)
       - COALESCE(pay_b.total, 0)
     ) AS opening
     FROM suppliers s
     LEFT JOIN (
       SELECT supplier_id, SUM(net_payable::numeric) AS total
       FROM purchase_invoice_headers
       WHERE supplier_id = $1 AND status = 'approved_costed'
         AND invoice_date < $2
       GROUP BY supplier_id
     ) inv_b ON inv_b.supplier_id = s.id
     LEFT JOIN (
       SELECT supplier_id, SUM(grand_total::numeric) AS total
       FROM purchase_return_headers
       WHERE supplier_id = $1 AND finalized_at IS NOT NULL
         AND COALESCE(return_date, finalized_at::date)::date < $2::date
       GROUP BY supplier_id
     ) ret_b ON ret_b.supplier_id = s.id
     LEFT JOIN (
       SELECT sp.supplier_id, SUM(sp.total_amount::numeric) AS total
       FROM supplier_payments sp
       WHERE sp.supplier_id = $1
         AND sp.payment_date < $2
       GROUP BY sp.supplier_id
     ) pay_b ON pay_b.supplier_id = s.id
     WHERE s.id = $1`,
    [supplierId, fromDate]
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
         pih.invoice_date::text          AS txn_date,
         'purchase_invoice'              AS source_type,
         pih.invoice_number::text        AS source_number,
         pih.supplier_invoice_no         AS source_ref,
         'فاتورة شراء رقم ' || pih.invoice_number || COALESCE(' / ' || pih.supplier_invoice_no, '') AS description,
         '0'                             AS debit,
         pih.net_payable::text           AS credit,
         pih.created_at::text            AS sort_ts
       FROM purchase_invoice_headers pih
       WHERE pih.supplier_id = $1
         AND pih.status = 'approved_costed'
         AND pih.invoice_date BETWEEN $2::date AND $3::date
     )
     UNION ALL
     (
       SELECT
         COALESCE(prh.return_date, prh.finalized_at::date)::text AS txn_date,
         'purchase_return'               AS source_type,
         COALESCE(prh.return_number::text, '—') AS source_number,
         NULL                            AS source_ref,
         'مرتجع مشتريات رقم ' || COALESCE(prh.return_number::text, '—') AS description,
         prh.grand_total::text           AS debit,
         '0'                             AS credit,
         prh.finalized_at::text          AS sort_ts
       FROM purchase_return_headers prh
       WHERE prh.supplier_id = $1
         AND prh.finalized_at IS NOT NULL
         AND COALESCE(prh.return_date, prh.finalized_at::date)::date BETWEEN $2::date AND $3::date
     )
     UNION ALL
     (
       SELECT
         sp.payment_date::text           AS txn_date,
         'supplier_payment'              AS source_type,
         LPAD(sp.payment_number::text, 4, '0') AS source_number,
         COALESCE(sp.reference, sp.notes) AS source_ref,
         'سداد رقم #' || LPAD(sp.payment_number::text, 4, '0')
           || CASE WHEN sp.reference IS NOT NULL THEN ' / ' || sp.reference ELSE '' END AS description,
         sp.total_amount::text           AS debit,
         '0'                             AS credit,
         sp.created_at::text             AS sort_ts
       FROM supplier_payments sp
       WHERE sp.supplier_id = $1
         AND sp.payment_date BETWEEN $2::date AND $3::date
     )
     ORDER BY txn_date, sort_ts`,
    [supplierId, fromDate, toDate]
  );

  let runningBalance = openingBalance;
  const lines: StatementLine[] = txnRes.rows.map((r) => {
    const dr = Number(r.debit  ?? 0);
    const cr = Number(r.credit ?? 0);
    runningBalance = runningBalance + cr - dr;

    const typeMap: Record<string, string> = {
      purchase_invoice: "فاتورة شراء",
      purchase_return:  "مرتجع مشتريات",
      supplier_payment: "سداد",
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
    supplierId,
    nameAr:         sup.name_ar,
    code:           sup.code,
    fromDate,
    toDate,
    openingBalance,
    lines,
    totalDebit,
    totalCredit,
    closingBalance: openingBalance + totalCredit - totalDebit,
  };
}

export async function getSupplierPaymentReport(
  supplierId: string,
  status: "unpaid" | "paid" | "all" = "all"
): Promise<{
  rows: PaymentReportRow[];
  totalNetPayable:  string;
  totalReturns:     string;
  totalPaid:        string;
  totalRemaining:   string;
}> {
  const havingClause =
    status === "unpaid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(iret.inv_returns, 0) - COALESCE(SUM(spl.amount_paid::numeric), 0)) > 0.005`
      : status === "paid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(iret.inv_returns, 0) - COALESCE(SUM(spl.amount_paid::numeric), 0)) <= 0.005`
      : sql``;

  const res = await db.execute(sql`
    SELECT
      pih.id                                                                                      AS invoice_id,
      pih.invoice_number,
      pih.supplier_invoice_no,
      rh.receiving_number,
      pih.invoice_date,
      pih.net_payable::numeric                                                                    AS net_payable,
      COALESCE(iret.inv_returns, 0)                                                              AS invoice_returns,
      COALESCE(SUM(spl.amount_paid::numeric), 0)                                                AS total_paid,
      (pih.net_payable::numeric - COALESCE(iret.inv_returns, 0) - COALESCE(SUM(spl.amount_paid::numeric), 0)) AS remaining,
      MIN(sp.id::text)                                                                           AS payment_id,
      MIN(sp.payment_date::text)                                                                 AS payment_date,
      MIN(sp.reference)                                                                          AS payment_ref
    FROM   purchase_invoice_headers pih
    LEFT JOIN receiving_headers       rh   ON rh.id  = pih.receiving_id
    LEFT JOIN supplier_payment_lines  spl  ON spl.invoice_id = pih.id
    LEFT JOIN supplier_payments       sp   ON sp.id  = spl.payment_id
    LEFT JOIN (
      SELECT purchase_invoice_id, SUM(grand_total::numeric) AS inv_returns
      FROM   purchase_return_headers
      WHERE  finalized_at IS NOT NULL
      GROUP  BY purchase_invoice_id
    ) iret ON iret.purchase_invoice_id = pih.id
    WHERE  pih.supplier_id = ${supplierId}
      AND  pih.status       = 'approved_costed'
    GROUP  BY pih.id, pih.invoice_number, pih.supplier_invoice_no,
              rh.receiving_number, pih.invoice_date, pih.net_payable,
              iret.inv_returns
    ${havingClause}
    ORDER  BY pih.invoice_date ASC, pih.invoice_number ASC
  `);

  const rows = ((res as any).rows as any[]).map((r) => ({
    invoiceId:         r.invoice_id,
    invoiceNumber:     Number(r.invoice_number),
    supplierInvoiceNo: r.supplier_invoice_no,
    receivingNumber:   r.receiving_number != null ? Number(r.receiving_number) : null,
    invoiceDate:       r.invoice_date,
    netPayable:        Number(r.net_payable).toFixed(2),
    invoiceReturns:    Number(r.invoice_returns).toFixed(2),
    totalPaid:         Number(r.total_paid).toFixed(2),
    remaining:         Number(r.remaining).toFixed(2),
    paymentId:         r.payment_id ?? null,
    paymentDate:       r.payment_date ?? null,
    paymentRef:        r.payment_ref ?? null,
  }));

  const totNetPayable = rows.reduce((s, r) => s + parseFloat(r.netPayable), 0);
  const totReturns    = rows.reduce((s, r) => s + parseFloat(r.invoiceReturns), 0);
  const totPaid       = rows.reduce((s, r) => s + parseFloat(r.totalPaid), 0);
  const totRemaining  = rows.reduce((s, r) => s + parseFloat(r.remaining), 0);

  return {
    rows,
    totalNetPayable:  totNetPayable.toFixed(2),
    totalReturns:     totReturns.toFixed(2),
    totalPaid:        totPaid.toFixed(2),
    totalRemaining:   totRemaining.toFixed(2),
  };
}
