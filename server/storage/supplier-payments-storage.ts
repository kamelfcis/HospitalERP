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
import { db, pool } from "../db";
import { supplierPayments, supplierPaymentLines } from "@shared/schema/purchasing";
import { journalEntries, journalLines } from "@shared/schema/finance";
import type { SupplierInvoicePaymentRow } from "@shared/schema/purchasing";
import { normalizeClaimNumber } from "./purchasing-invoices-core-storage";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── getSupplierBalance ───────────────────────────────────────────────────────
// سريع: CTE واحد يحسب الرصيد من (opening + invoices - payments)
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

// ─── getSupplierInvoices ──────────────────────────────────────────────────────
// يجلب فواتير المورد مع (مسدد / متبقى) — مفهرس بـ supplier_id + status
// status: 'unpaid' | 'paid' | 'all'
// claimNumber: فلتر اختياري برقم المطالبة
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

// ─── getNextPaymentNumber ─────────────────────────────────────────────────────
// يُحدد الرقم التسلسلي التالي لعملية السداد
export async function getNextPaymentNumber(): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(payment_number), 0) + 1 AS next_num FROM supplier_payments`
  );
  return Number((res as any).rows[0]?.next_num ?? 1);
}

// ─── resolveShiftFromGlAccount ────────────────────────────────────────────────
// يبحث عن الوردية المفتوحة المرتبطة بحساب الخزنة المُختار، ويعيد shiftId أو null
async function resolveShiftFromGlAccount(glAccountId: string): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT id FROM cashier_shifts
    WHERE gl_account_id = ${glAccountId} AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `);
  return (res as any).rows[0]?.id ?? null;
}

// ─── createSupplierPayment ────────────────────────────────────────────────────
// atomic: رأس السداد + سطور التوزيع + قيد GL في transaction واحدة
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

  // ── حل وردية الكاشير تلقائياً إذا لم تُرسَل من الـ frontend ───────────────
  const resolvedShiftId: string | null =
    input.shiftId ?? (input.glAccountId ? await resolveShiftFromGlAccount(input.glAccountId) : null);

  // ── تحديد حساب ذمم المورد (AP) ───────────────────────────────────────────
  // 1) حساب المورد الخاص (glAccountId) إن وُجد
  // 2) حساب ربط المشتريات (payables_drugs / payables_consumables)
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

    // ── قيد GL: مدين ذمم المورد / دائن الخزنة ─────────────────────────────
    // Dr: AP account (حساب المورد / ذمم الموردين)
    // Cr: Treasury  (حساب الخزنة المختارة)
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

        await tx.insert(journalLines).values([
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

// ─── getSupplierPaymentReport ─────────────────────────────────────────────────
// تقرير تفصيلي: كل فاتورة مع سجل مدفوعاتها
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
