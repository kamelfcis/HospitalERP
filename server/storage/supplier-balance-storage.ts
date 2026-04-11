import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import type { SupplierInvoicePaymentRow } from "@shared/schema/purchasing";
import { normalizeClaimNumber } from "./purchasing-invoices-core-storage";

export interface SupplierBalanceResult {
  supplierId:      string;
  code:            string;
  nameAr:          string;
  openingBalance:  string;
  totalInvoiced:   string;
  totalReturns:    string;
  totalPaid:       string;
  currentBalance:  string;
}

export async function getSupplierBalance(
  supplierId: string
): Promise<SupplierBalanceResult | null> {
  const res = await pool.query<{
    supplier_id: string; code: string; name_ar: string;
    opening_balance: string; total_invoiced: string;
    total_returns: string; total_paid: string; current_balance: string;
  }>(
    `SELECT
       s.id                                                                AS supplier_id,
       s.code,
       s.name_ar,
       COALESCE(s.opening_balance, 0)::numeric                            AS opening_balance,
       COALESCE(inv.total_invoiced, 0)::numeric                           AS total_invoiced,
       COALESCE(ret.total_returns,  0)::numeric                           AS total_returns,
       COALESCE(pay.total_paid,     0)::numeric                           AS total_paid,
       (
         COALESCE(s.opening_balance,   0)::numeric
         + COALESCE(inv.total_invoiced, 0)::numeric
         - COALESCE(ret.total_returns,  0)::numeric
         - COALESCE(pay.total_paid,     0)::numeric
       )                                                                   AS current_balance
     FROM suppliers s
     LEFT JOIN (
       SELECT supplier_id, SUM(net_payable::numeric) AS total_invoiced
       FROM   purchase_invoice_headers
       WHERE  status = 'approved_costed'
       GROUP  BY supplier_id
     ) inv ON inv.supplier_id = s.id
     LEFT JOIN (
       SELECT supplier_id, SUM(grand_total::numeric) AS total_returns
       FROM   purchase_return_headers
       WHERE  finalized_at IS NOT NULL
       GROUP  BY supplier_id
     ) ret ON ret.supplier_id = s.id
     LEFT JOIN (
       SELECT sp.supplier_id, SUM(spl.amount_paid::numeric) AS total_paid
       FROM   supplier_payment_lines spl
       JOIN   supplier_payments sp ON sp.id = spl.payment_id
       GROUP  BY sp.supplier_id
     ) pay ON pay.supplier_id = s.id
     WHERE s.id = $1`,
    [supplierId]
  );

  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    supplierId:     r.supplier_id,
    code:           r.code,
    nameAr:         r.name_ar,
    openingBalance: Number(r.opening_balance).toFixed(2),
    totalInvoiced:  Number(r.total_invoiced).toFixed(2),
    totalReturns:   Number(r.total_returns).toFixed(2),
    totalPaid:      Number(r.total_paid).toFixed(2),
    currentBalance: Number(r.current_balance).toFixed(2),
  };
}

export async function getSupplierInvoices(
  supplierId: string,
  status: "unpaid" | "paid" | "all" = "unpaid",
  claimNumber?: string | null,
): Promise<SupplierInvoicePaymentRow[]> {
  const havingClause =
    status === "unpaid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(iret.inv_returns, 0) - COALESCE(SUM(spl.amount_paid::numeric), 0)) > 0.005`
      : status === "paid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(iret.inv_returns, 0) - COALESCE(SUM(spl.amount_paid::numeric), 0)) <= 0.005`
      : sql``;

  const normalizedClaim = normalizeClaimNumber(claimNumber);
  const claimFilter = normalizedClaim
    ? sql`AND pih.claim_number = ${normalizedClaim}`
    : sql``;

  const res = await db.execute(sql`
    SELECT
      pih.id                                                                                      AS invoice_id,
      pih.invoice_number,
      pih.supplier_invoice_no,
      rh.receiving_number,
      pih.invoice_date,
      pih.claim_number,
      pih.net_payable::numeric                                                                    AS net_payable,
      COALESCE(iret.inv_returns, 0)                                                              AS invoice_returns,
      COALESCE(SUM(spl.amount_paid::numeric), 0)                                                AS total_paid,
      (pih.net_payable::numeric - COALESCE(iret.inv_returns, 0) - COALESCE(SUM(spl.amount_paid::numeric), 0)) AS remaining
    FROM   purchase_invoice_headers pih
    LEFT JOIN receiving_headers       rh   ON rh.id  = pih.receiving_id
    LEFT JOIN supplier_payment_lines  spl  ON spl.invoice_id = pih.id
    LEFT JOIN (
      SELECT purchase_invoice_id, SUM(grand_total::numeric) AS inv_returns
      FROM   purchase_return_headers
      WHERE  finalized_at IS NOT NULL
      GROUP  BY purchase_invoice_id
    ) iret ON iret.purchase_invoice_id = pih.id
    WHERE  pih.supplier_id = ${supplierId}
      AND  pih.status       = 'approved_costed'
      ${claimFilter}
    GROUP  BY pih.id, pih.invoice_number, pih.supplier_invoice_no,
              rh.receiving_number, pih.invoice_date, pih.net_payable,
              pih.claim_number, iret.inv_returns
    ${havingClause}
    ORDER  BY pih.invoice_date ASC, pih.invoice_number ASC
  `);

  return ((res as any).rows as any[]).map((r) => ({
    invoiceId:         r.invoice_id,
    invoiceNumber:     Number(r.invoice_number),
    supplierInvoiceNo: r.supplier_invoice_no,
    receivingNumber:   r.receiving_number != null ? Number(r.receiving_number) : null,
    invoiceDate:       r.invoice_date,
    claimNumber:       r.claim_number ?? null,
    netPayable:        Number(r.net_payable).toFixed(2),
    invoiceReturns:    Number(r.invoice_returns).toFixed(2),
    totalPaid:         Number(r.total_paid).toFixed(2),
    remaining:         Number(r.remaining).toFixed(2),
  }));
}
