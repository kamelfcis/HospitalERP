import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import type { CustomerCreditInvoiceRow } from "@shared/schema/invoicing";

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
