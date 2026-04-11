import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { pharmacyCreditCustomers } from "@shared/schema/invoicing";
import type { CustomerCreditInvoiceRow } from "@shared/schema/invoicing";

export interface CustomerBalanceResult {
  customerId:     string;
  name:           string;
  phone:          string | null;
  totalInvoiced:  string;
  totalReturns:   string;
  totalPaid:      string;
  currentBalance: string;
}

export async function getCustomerBalance(
  customerId: string
): Promise<CustomerBalanceResult | null> {
  const res = await pool.query(`
    WITH cust AS (
      SELECT id, name, phone FROM pharmacy_credit_customers WHERE id = $1
    ),
    inv AS (
      SELECT SUM(net_total::numeric) AS total_invoiced
      FROM   sales_invoice_headers, cust
      WHERE  customer_type = 'credit'
        AND  is_return     = false
        AND  status        IN ('finalized', 'collected')
        AND  (customer_id = $1 OR (customer_id IS NULL AND customer_name = cust.name))
    ),
    ret AS (
      SELECT SUM(net_total::numeric) AS total_returns
      FROM   sales_invoice_headers, cust
      WHERE  customer_type = 'credit'
        AND  is_return     = true
        AND  status        IN ('finalized', 'collected')
        AND  (customer_id = $1 OR (customer_id IS NULL AND customer_name = cust.name))
    ),
    pay AS (
      SELECT COALESCE(SUM(crl.amount_paid::numeric), 0) AS total_paid
      FROM   customer_receipt_lines crl
      JOIN   customer_receipts cr ON cr.id = crl.receipt_id
      WHERE  cr.customer_id = $1
    )
    SELECT
      cust.id                                                AS customer_id,
      cust.name,
      cust.phone,
      COALESCE(inv.total_invoiced, 0)                        AS total_invoiced,
      COALESCE(ret.total_returns,  0)                        AS total_returns,
      COALESCE(pay.total_paid,     0)                        AS total_paid,
      (
        COALESCE(inv.total_invoiced, 0)
        - COALESCE(ret.total_returns, 0)
        - COALESCE(pay.total_paid,   0)
      )                                                      AS current_balance
    FROM cust, inv, ret, pay
  `, [customerId]);

  const rows = res.rows;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    customerId:     r.customer_id,
    name:           r.name,
    phone:          r.phone ?? null,
    totalInvoiced:  Number(r.total_invoiced).toFixed(2),
    totalReturns:   Number(r.total_returns).toFixed(2),
    totalPaid:      Number(r.total_paid).toFixed(2),
    currentBalance: Number(r.current_balance).toFixed(2),
  };
}

export async function getCustomerCreditInvoices(
  customerId: string,
  status: "unpaid" | "paid" | "all" = "unpaid"
): Promise<CustomerCreditInvoiceRow[]> {
  const havingClause =
    status === "unpaid"
      ? sql`HAVING (sih.net_total::numeric - COALESCE(SUM(crl.amount_paid::numeric), 0)) > 0.005`
      : status === "paid"
      ? sql`HAVING (sih.net_total::numeric - COALESCE(SUM(crl.amount_paid::numeric), 0)) <= 0.005`
      : sql``;

  const res = await db.execute(sql`
    SELECT
      sih.id                                                              AS invoice_id,
      sih.invoice_number,
      sih.invoice_date,
      sih.customer_name,
      sih.net_total::numeric                                              AS net_total,
      COALESCE(SUM(crl.amount_paid::numeric), 0)                         AS total_paid,
      (sih.net_total::numeric - COALESCE(SUM(crl.amount_paid::numeric), 0)) AS remaining
    FROM   sales_invoice_headers sih
    LEFT JOIN customer_receipt_lines crl ON crl.invoice_id = sih.id
    WHERE  sih.customer_type = 'credit'
      AND  sih.is_return     = false
      AND  sih.status        IN ('finalized', 'collected')
      AND  (
        sih.customer_id = ${customerId}
        OR (
          sih.customer_id IS NULL
          AND sih.customer_name = (
            SELECT name FROM pharmacy_credit_customers WHERE id = ${customerId} LIMIT 1
          )
        )
      )
    GROUP  BY sih.id, sih.invoice_number, sih.invoice_date,
              sih.customer_name, sih.net_total
    ${havingClause}
    ORDER  BY sih.invoice_date ASC, sih.invoice_number ASC
  `);

  return ((res as any).rows as any[]).map((r) => ({
    invoiceId:     r.invoice_id,
    invoiceNumber: Number(r.invoice_number),
    invoiceDate:   r.invoice_date,
    customerName:  r.customer_name,
    netTotal:      Number(r.net_total).toFixed(2),
    totalPaid:     Number(r.total_paid).toFixed(2),
    remaining:     Number(r.remaining).toFixed(2),
  }));
}

export async function searchCreditCustomers(
  search: string,
  pharmacyId?: string | null,
  limit = 30
): Promise<{ id: string; name: string; phone: string | null }[]> {
  const params: unknown[] = [];
  let idx = 1;
  const conditions: string[] = [];

  if (search && search.trim()) {
    const pattern = `%${search.trim()}%`;
    conditions.push(`(name ILIKE $${idx} OR phone ILIKE $${idx})`);
    params.push(pattern);
    idx++;
  }

  if (pharmacyId) {
    conditions.push(`pharmacy_id = $${idx}`);
    params.push(pharmacyId);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit);
  const res = await pool.query(
    `SELECT id, name, phone, gl_account_id FROM pharmacy_credit_customers ${whereClause} ORDER BY name LIMIT $${idx}`,
    params
  );
  return res.rows.map((r: any) => ({
    id:          r.id,
    name:        r.name,
    phone:       r.phone ?? null,
    glAccountId: r.gl_account_id ?? null,
  }));
}

export async function createCreditCustomer(
  name: string,
  phone?: string | null,
  notes?: string | null,
  pharmacyId?: string | null,
  glAccountId?: string | null
): Promise<{ id: string; name: string; phone: string | null; glAccountId: string | null }> {
  const [row] = await db
    .insert(pharmacyCreditCustomers)
    .values({ name, phone: phone ?? null, notes: notes ?? null, pharmacyId: pharmacyId ?? null, glAccountId: glAccountId ?? null })
    .returning({ id: pharmacyCreditCustomers.id, name: pharmacyCreditCustomers.name, phone: pharmacyCreditCustomers.phone, glAccountId: pharmacyCreditCustomers.glAccountId });
  return { id: row.id, name: row.name, phone: row.phone ?? null, glAccountId: row.glAccountId ?? null };
}

export async function updateCreditCustomerGlAccount(
  customerId: string,
  glAccountId: string | null
): Promise<void> {
  await pool.query(
    `UPDATE pharmacy_credit_customers SET gl_account_id = $1 WHERE id = $2`,
    [glAccountId, customerId]
  );
}
