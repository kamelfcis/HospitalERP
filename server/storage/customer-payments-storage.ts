/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Customer Payments Storage — تحصيل الآجل
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  getCustomerBalance       — رصيد العميل (مُفوتَر - مُحصَّل)
 *  getCustomerCreditInvoices — فواتير آجلة مع حالة التحصيل
 *  getNextReceiptNumber     — الرقم التسلسلي التالي
 *  createCustomerReceipt    — إنشاء إيصال تحصيل atomic
 *  getCustomerReceiptReport — تقرير تفصيلي بفلتر
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { customerReceipts, customerReceiptLines, pharmacyCreditCustomers } from "@shared/schema/invoicing";
import type { CustomerCreditInvoiceRow } from "@shared/schema/invoicing";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomerBalanceResult {
  customerId:     string;
  name:           string;
  phone:          string | null;
  totalInvoiced:  string;
  totalPaid:      string;
  currentBalance: string;
}

export interface CreateReceiptInput {
  customerId:    string;
  receiptDate:   string;
  totalAmount:   number;
  paymentMethod: string;
  reference?:    string | null;
  notes?:        string | null;
  createdBy?:    string | null;
  lines: { invoiceId: string; amountPaid: number }[];
}

export interface ReceiptReportRow extends CustomerCreditInvoiceRow {
  receiptId:     string | null;
  receiptDate:   string | null;
  receiptRef:    string | null;
}

// ─── getCustomerBalance ───────────────────────────────────────────────────────
export async function getCustomerBalance(
  customerId: string
): Promise<CustomerBalanceResult | null> {
  const res = await db.execute(sql`
    SELECT
      c.id                                                   AS customer_id,
      c.name,
      c.phone,
      COALESCE(inv.total_invoiced, 0)::numeric               AS total_invoiced,
      COALESCE(pay.total_paid,    0)::numeric                AS total_paid,
      (
        COALESCE(inv.total_invoiced, 0)::numeric
        - COALESCE(pay.total_paid,   0)::numeric
      )                                                      AS current_balance
    FROM pharmacy_credit_customers c
    LEFT JOIN (
      SELECT customer_id, SUM(net_total::numeric) AS total_invoiced
      FROM   sales_invoice_headers
      WHERE  customer_type = 'credit'
        AND  status        = 'finalized'
      GROUP  BY customer_id
    ) inv ON inv.customer_id = c.id
    LEFT JOIN (
      SELECT cr.customer_id, SUM(crl.amount_paid::numeric) AS total_paid
      FROM   customer_receipt_lines crl
      JOIN   customer_receipts cr ON cr.id = crl.receipt_id
      GROUP  BY cr.customer_id
    ) pay ON pay.customer_id = c.id
    WHERE c.id = ${customerId}
  `);

  const rows = (res as any).rows as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    customerId:     r.customer_id,
    name:           r.name,
    phone:          r.phone ?? null,
    totalInvoiced:  Number(r.total_invoiced).toFixed(2),
    totalPaid:      Number(r.total_paid).toFixed(2),
    currentBalance: Number(r.current_balance).toFixed(2),
  };
}

// ─── getCustomerCreditInvoices ────────────────────────────────────────────────
// يجلب فواتير العميل الآجلة مع (محصّل / متبقى)
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
    WHERE  sih.customer_id   = ${customerId}
      AND  sih.customer_type = 'credit'
      AND  sih.status        = 'finalized'
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

// ─── getNextReceiptNumber ──────────────────────────────────────────────────────
export async function getNextReceiptNumber(): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next_num FROM customer_receipts`
  );
  return Number((res as any).rows[0]?.next_num ?? 1);
}

// ─── createCustomerReceipt ────────────────────────────────────────────────────
// atomic: رأس + سطور التوزيع في transaction واحدة
export async function createCustomerReceipt(
  input: CreateReceiptInput
): Promise<{ receiptId: string; receiptNumber: number }> {
  if (!input.lines.length) throw new Error("لا توجد فواتير مُحددة للتحصيل");
  if (input.totalAmount <= 0)  throw new Error("مبلغ التحصيل يجب أن يكون أكبر من الصفر");

  const sumLines = input.lines.reduce((s, l) => s + l.amountPaid, 0);
  if (Math.abs(sumLines - input.totalAmount) > 0.02) {
    throw new Error(
      `مجموع التوزيع (${sumLines.toFixed(2)}) لا يطابق إجمالي التحصيل (${input.totalAmount.toFixed(2)})`
    );
  }

  const result = await db.transaction(async (tx) => {
    const numRes = await tx.execute(
      sql`SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next_num FROM customer_receipts`
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
      })
      .returning({ id: customerReceipts.id, receiptNumber: customerReceipts.receiptNumber });

    await tx.insert(customerReceiptLines).values(
      input.lines.map((l) => ({
        receiptId:  receipt.id,
        invoiceId:  l.invoiceId,
        amountPaid: String(l.amountPaid),
      }))
    );

    return receipt;
  });

  return { receiptId: result.id, receiptNumber: result.receiptNumber };
}

// ─── getCustomerReceiptReport ──────────────────────────────────────────────────
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

// ─── searchCreditCustomers ─────────────────────────────────────────────────────
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
    `SELECT id, name, phone FROM pharmacy_credit_customers ${whereClause} ORDER BY name LIMIT $${idx}`,
    params
  );
  return res.rows.map((r: any) => ({
    id:    r.id,
    name:  r.name,
    phone: r.phone ?? null,
  }));
}

// ─── createCreditCustomer (quick-add) ─────────────────────────────────────────
export async function createCreditCustomer(
  name: string,
  phone?: string | null,
  notes?: string | null,
  pharmacyId?: string | null
): Promise<{ id: string; name: string; phone: string | null }> {
  const [row] = await db
    .insert(pharmacyCreditCustomers)
    .values({ name, phone: phone ?? null, notes: notes ?? null, pharmacyId: pharmacyId ?? null })
    .returning({ id: pharmacyCreditCustomers.id, name: pharmacyCreditCustomers.name, phone: pharmacyCreditCustomers.phone });
  return { id: row.id, name: row.name, phone: row.phone ?? null };
}
