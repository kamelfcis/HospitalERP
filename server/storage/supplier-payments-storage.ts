/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Supplier Payments Storage — سداد الموردين
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  getSupplierBalance       — رصيد المورد لحظياً
 *  getSupplierInvoices      — فواتير مورد مع حالة السداد (سريع بـ CTE)
 *  createSupplierPayment    — إنشاء سداد وتوزيعه على الفواتير (atomic)
 *  getSupplierPaymentReport — تقرير المدفوعات بفلتر
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { supplierPayments, supplierPaymentLines } from "@shared/schema/purchasing";
import type { SupplierInvoicePaymentRow } from "@shared/schema/purchasing";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SupplierBalanceResult {
  supplierId:      string;
  code:            string;
  nameAr:          string;
  openingBalance:  string;
  totalInvoiced:   string;
  totalPaid:       string;
  currentBalance:  string;
}

export interface CreatePaymentInput {
  supplierId:    string;
  paymentDate:   string;
  totalAmount:   number;
  reference?:    string | null;
  notes?:        string | null;
  paymentMethod: string;
  createdBy?:    string | null;
  lines: { invoiceId: string; amountPaid: number }[];
}

export interface PaymentReportRow extends SupplierInvoicePaymentRow {
  paymentId:    string | null;
  paymentDate:  string | null;
  paymentRef:   string | null;
}

// ─── getSupplierBalance ───────────────────────────────────────────────────────
// سريع: CTE واحد يحسب الرصيد من (opening + invoices - payments)
export async function getSupplierBalance(
  supplierId: string
): Promise<SupplierBalanceResult | null> {
  const res = await db.execute(sql`
    SELECT
      s.id                                                               AS supplier_id,
      s.code,
      s.name_ar,
      COALESCE(s.opening_balance, 0)::numeric                           AS opening_balance,
      COALESCE(inv.total_invoiced, 0)::numeric                          AS total_invoiced,
      COALESCE(pay.total_paid,    0)::numeric                           AS total_paid,
      (
        COALESCE(s.opening_balance, 0)::numeric
        + COALESCE(inv.total_invoiced, 0)::numeric
        - COALESCE(pay.total_paid,    0)::numeric
      )                                                                  AS current_balance
    FROM suppliers s
    LEFT JOIN (
      SELECT supplier_id, SUM(net_payable::numeric) AS total_invoiced
      FROM   purchase_invoice_headers
      WHERE  status = 'approved_costed'
      GROUP  BY supplier_id
    ) inv ON inv.supplier_id = s.id
    LEFT JOIN (
      SELECT sp.supplier_id, SUM(spl.amount_paid::numeric) AS total_paid
      FROM   supplier_payment_lines spl
      JOIN   supplier_payments sp ON sp.id = spl.payment_id
      GROUP  BY sp.supplier_id
    ) pay ON pay.supplier_id = s.id
    WHERE s.id = ${supplierId}
  `);

  const rows = (res as any).rows as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    supplierId:     r.supplier_id,
    code:           r.code,
    nameAr:         r.name_ar,
    openingBalance: Number(r.opening_balance).toFixed(2),
    totalInvoiced:  Number(r.total_invoiced).toFixed(2),
    totalPaid:      Number(r.total_paid).toFixed(2),
    currentBalance: Number(r.current_balance).toFixed(2),
  };
}

// ─── getSupplierInvoices ──────────────────────────────────────────────────────
// يجلب فواتير المورد مع (مسدد / متبقى) — مفهرس بـ supplier_id + status
// status: 'unpaid' | 'paid' | 'all'
export async function getSupplierInvoices(
  supplierId: string,
  status: "unpaid" | "paid" | "all" = "unpaid"
): Promise<SupplierInvoicePaymentRow[]> {
  const havingClause =
    status === "unpaid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(SUM(spl.amount_paid::numeric), 0)) > 0.005`
      : status === "paid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(SUM(spl.amount_paid::numeric), 0)) <= 0.005`
      : sql``;

  const res = await db.execute(sql`
    SELECT
      pih.id                                                              AS invoice_id,
      pih.invoice_number,
      pih.supplier_invoice_no,
      rh.receiving_number,
      pih.invoice_date,
      pih.net_payable::numeric                                            AS net_payable,
      COALESCE(SUM(spl.amount_paid::numeric), 0)                         AS total_paid,
      (pih.net_payable::numeric - COALESCE(SUM(spl.amount_paid::numeric), 0)) AS remaining
    FROM   purchase_invoice_headers pih
    LEFT JOIN receiving_headers       rh  ON rh.id  = pih.receiving_id
    LEFT JOIN supplier_payment_lines  spl ON spl.invoice_id = pih.id
    WHERE  pih.supplier_id = ${supplierId}
      AND  pih.status       = 'approved_costed'
    GROUP  BY pih.id, pih.invoice_number, pih.supplier_invoice_no,
              rh.receiving_number, pih.invoice_date, pih.net_payable
    ${havingClause}
    ORDER  BY pih.invoice_date ASC, pih.invoice_number ASC
  `);

  return ((res as any).rows as any[]).map((r) => ({
    invoiceId:         r.invoice_id,
    invoiceNumber:     Number(r.invoice_number),
    supplierInvoiceNo: r.supplier_invoice_no,
    receivingNumber:   r.receiving_number != null ? Number(r.receiving_number) : null,
    invoiceDate:       r.invoice_date,
    netPayable:        Number(r.net_payable).toFixed(2),
    totalPaid:         Number(r.total_paid).toFixed(2),
    remaining:         Number(r.remaining).toFixed(2),
  }));
}

// ─── getNextPaymentNumber ─────────────────────────────────────────────────────
// يُحدد الرقم التسلسلي التالي لعملية السداد
export async function getNextPaymentNumber(): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(payment_number), 0) + 1 AS next_num FROM supplier_payments`
  );
  return Number((res as any).rows[0]?.next_num ?? 1);
}

// ─── createSupplierPayment ────────────────────────────────────────────────────
// atomic: يُدرج رأس السداد + سطور التوزيع في transaction واحدة
export async function createSupplierPayment(
  input: CreatePaymentInput
): Promise<{ paymentId: string; paymentNumber: number }> {
  if (!input.lines.length) throw new Error("لا توجد فواتير مُحددة للسداد");
  if (input.totalAmount <= 0) throw new Error("مبلغ السداد يجب أن يكون أكبر من الصفر");

  const sumLines = input.lines.reduce((s, l) => s + l.amountPaid, 0);
  if (Math.abs(sumLines - input.totalAmount) > 0.02) {
    throw new Error(
      `مجموع التوزيع (${sumLines.toFixed(2)}) لا يطابق إجمالي السداد (${input.totalAmount.toFixed(2)})`
    );
  }

  const result = await db.transaction(async (tx) => {
    // احجز الرقم التسلسلي داخل الـ transaction لتجنب التعارض
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
      })
      .returning({ id: supplierPayments.id, paymentNumber: supplierPayments.paymentNumber });

    await tx.insert(supplierPaymentLines).values(
      input.lines.map((l) => ({
        paymentId:  payment.id,
        invoiceId:  l.invoiceId,
        amountPaid: String(l.amountPaid),
      }))
    );

    return payment;
  });

  return { paymentId: result.id, paymentNumber: result.paymentNumber };
}

// ─── getSupplierPaymentReport ─────────────────────────────────────────────────
// تقرير تفصيلي: كل فاتورة مع سجل مدفوعاتها
export async function getSupplierPaymentReport(
  supplierId: string,
  status: "unpaid" | "paid" | "all" = "all"
): Promise<{
  rows: PaymentReportRow[];
  totalNetPayable:  string;
  totalPaid:        string;
  totalRemaining:   string;
}> {
  const havingClause =
    status === "unpaid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(SUM(spl.amount_paid::numeric), 0)) > 0.005`
      : status === "paid"
      ? sql`HAVING (pih.net_payable::numeric - COALESCE(SUM(spl.amount_paid::numeric), 0)) <= 0.005`
      : sql``;

  const res = await db.execute(sql`
    SELECT
      pih.id                                                              AS invoice_id,
      pih.invoice_number,
      pih.supplier_invoice_no,
      rh.receiving_number,
      pih.invoice_date,
      pih.net_payable::numeric                                            AS net_payable,
      COALESCE(SUM(spl.amount_paid::numeric), 0)                         AS total_paid,
      (pih.net_payable::numeric - COALESCE(SUM(spl.amount_paid::numeric), 0)) AS remaining,
      MIN(sp.id::text)                                                   AS payment_id,
      MIN(sp.payment_date::text)                                         AS payment_date,
      MIN(sp.reference)                                                  AS payment_ref
    FROM   purchase_invoice_headers pih
    LEFT JOIN receiving_headers       rh  ON rh.id  = pih.receiving_id
    LEFT JOIN supplier_payment_lines  spl ON spl.invoice_id = pih.id
    LEFT JOIN supplier_payments       sp  ON sp.id  = spl.payment_id
    WHERE  pih.supplier_id = ${supplierId}
      AND  pih.status       = 'approved_costed'
    GROUP  BY pih.id, pih.invoice_number, pih.supplier_invoice_no,
              rh.receiving_number, pih.invoice_date, pih.net_payable
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
    totalPaid:         Number(r.total_paid).toFixed(2),
    remaining:         Number(r.remaining).toFixed(2),
    paymentId:         r.payment_id ?? null,
    paymentDate:       r.payment_date ?? null,
    paymentRef:        r.payment_ref ?? null,
  }));

  const totNetPayable = rows.reduce((s, r) => s + parseFloat(r.netPayable), 0);
  const totPaid       = rows.reduce((s, r) => s + parseFloat(r.totalPaid), 0);
  const totRemaining  = rows.reduce((s, r) => s + parseFloat(r.remaining), 0);

  return {
    rows,
    totalNetPayable:  totNetPayable.toFixed(2),
    totalPaid:        totPaid.toFixed(2),
    totalRemaining:   totRemaining.toFixed(2),
  };
}
