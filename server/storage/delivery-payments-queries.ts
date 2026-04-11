import { sql } from "drizzle-orm";
import { db, pool } from "../db";

export interface DeliveryInvoiceRow {
  invoiceId:     string;
  invoiceNumber: number;
  invoiceDate:   string;
  netTotal:      string;
  totalPaid:     string;
  remaining:     string;
  status:        string;
  customerName:  string | null;
  pharmacyId:    string | null;
}

export interface CreateDeliveryReceiptInput {
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

export async function resolveShiftFromGlAccount(glAccountId: string): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT id FROM cashier_shifts
    WHERE gl_account_id = ${glAccountId} AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `);
  return (res as any).rows[0]?.id ?? null;
}

export async function resolveShiftFromUserId(userId: string): Promise<{ shiftId: string; glAccountId: string | null } | null> {
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

export async function getDeliveryInvoices(
  filter: "unpaid" | "paid" | "all" = "unpaid",
  pharmacyId?: string | null,
): Promise<{
  rows: DeliveryInvoiceRow[];
  totalNetInvoiced: string;
  totalPaid: string;
  totalRemaining: string;
}> {
  const conditions: string[] = [
    `h.customer_type = 'delivery'`,
    `h.is_return = false`,
    `h.status IN ('finalized', 'collected')`,
  ];
  if (pharmacyId) conditions.push(`h.pharmacy_id = '${pharmacyId}'`);

  const whereStr = conditions.join(" AND ");

  const result = await pool.query(`
    SELECT
      h.id                                               AS "invoiceId",
      h.invoice_number                                   AS "invoiceNumber",
      h.invoice_date::text                               AS "invoiceDate",
      h.net_total::text                                  AS "netTotal",
      h.customer_name                                    AS "customerName",
      h.pharmacy_id                                      AS "pharmacyId",
      h.status,
      COALESCE(p.paid, 0)::text                          AS "totalPaid",
      GREATEST(h.net_total::numeric - COALESCE(p.paid, 0), 0)::text AS "remaining"
    FROM sales_invoice_headers h
    LEFT JOIN (
      SELECT drl.invoice_id, SUM(drl.amount_paid::numeric) AS paid
      FROM delivery_receipt_lines drl
      JOIN delivery_receipts dr ON dr.id = drl.receipt_id
      GROUP BY drl.invoice_id
    ) p ON p.invoice_id = h.id
    WHERE ${whereStr}
      ${filter === "unpaid"   ? `AND GREATEST(h.net_total::numeric - COALESCE(p.paid, 0), 0) > 0` : ""}
      ${filter === "paid"     ? `AND GREATEST(h.net_total::numeric - COALESCE(p.paid, 0), 0) = 0` : ""}
    ORDER BY h.invoice_date, h.invoice_number
  `);

  const rows = result.rows as DeliveryInvoiceRow[];
  const totalNetInvoiced = rows.reduce((s, r) => s + parseFloat(r.netTotal || "0"), 0).toFixed(2);
  const totalPaid        = rows.reduce((s, r) => s + parseFloat(r.totalPaid || "0"), 0).toFixed(2);
  const totalRemaining   = rows.reduce((s, r) => s + parseFloat(r.remaining || "0"), 0).toFixed(2);

  return { rows, totalNetInvoiced, totalPaid, totalRemaining };
}

export async function getNextDeliveryReceiptNumber(): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next_num FROM delivery_receipts`
  );
  return Number((res as any).rows[0]?.next_num ?? 1);
}

export async function getDeliveryReceiptReport(filters: {
  from?: string;
  to?: string;
  pharmacyId?: string;
}): Promise<any[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (filters.from)       { conditions.push(`dr.receipt_date >= $${p++}`); params.push(filters.from); }
  if (filters.to)         { conditions.push(`dr.receipt_date <= $${p++}`); params.push(filters.to); }
  if (filters.pharmacyId) { conditions.push(`h.pharmacy_id = $${p++}`);    params.push(filters.pharmacyId); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(`
    SELECT
      dr.id              AS "receiptId",
      dr.receipt_number  AS "receiptNumber",
      dr.receipt_date    AS "receiptDate",
      dr.total_amount    AS "totalAmount",
      dr.payment_method  AS "paymentMethod",
      dr.reference,
      dr.created_by      AS "createdBy",
      cs.cashier_name    AS "cashierName",
      COUNT(drl.id)::int AS "invoiceCount"
    FROM delivery_receipts dr
    LEFT JOIN delivery_receipt_lines drl ON drl.receipt_id = dr.id
    LEFT JOIN sales_invoice_headers h   ON h.id = drl.invoice_id
    LEFT JOIN cashier_shifts cs         ON cs.id = dr.shift_id
    ${where}
    GROUP BY dr.id, cs.cashier_name
    ORDER BY dr.receipt_date DESC, dr.receipt_number DESC
  `, params);

  return result.rows;
}
