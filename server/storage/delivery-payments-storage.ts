/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Delivery Payments Storage — تحصيل فواتير التوصيل المنزلي
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  getDeliveryInvoices      — فواتير التوصيل مع حالة التحصيل
 *  getNextReceiptNumber     — الرقم التسلسلي التالي
 *  createDeliveryReceipt   — إنشاء إيصال تحصيل atomic
 *  getDeliveryReceiptReport — تقرير مدفوعات التوصيل بفلتر
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { deliveryReceipts, deliveryReceiptLines } from "@shared/schema/invoicing";
import { journalEntries, journalLines, accountMappings } from "@shared/schema/finance";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { resolveCostCenters } from "../lib/cost-center-resolver";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── resolveShiftFromGlAccount ────────────────────────────────────────────────
async function resolveShiftFromGlAccount(glAccountId: string): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT id FROM cashier_shifts
    WHERE gl_account_id = ${glAccountId} AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `);
  return (res as any).rows[0]?.id ?? null;
}

// ─── resolveShiftFromUserId ───────────────────────────────────────────────────
// يبحث عن وردية مفتوحة للمستخدم مباشرةً (fallback عندما لا تُحدَّد خزنة)
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

// ─── getDeliveryInvoices ──────────────────────────────────────────────────────
// فواتير التوصيل المنزلي مع رصيد التحصيل (مجموع الإيصالات على كل فاتورة)
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

// ─── getNextDeliveryReceiptNumber ─────────────────────────────────────────────
export async function getNextDeliveryReceiptNumber(): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next_num FROM delivery_receipts`
  );
  return Number((res as any).rows[0]?.next_num ?? 1);
}

// ─── createDeliveryReceipt ────────────────────────────────────────────────────
// atomic: رأس + سطور التوزيع + قيد GL + تحديث حالة الفواتير
export async function createDeliveryReceipt(
  input: CreateDeliveryReceiptInput
): Promise<{ receiptId: string; receiptNumber: number; journalEntryId: string | null }> {
  if (!input.lines.length) throw new Error("لا توجد فواتير مُحددة للتحصيل");
  if (input.totalAmount <= 0) throw new Error("مبلغ التحصيل يجب أن يكون أكبر من الصفر");

  const sumLines = input.lines.reduce((s, l) => s + l.amountPaid, 0);
  if (Math.abs(sumLines - input.totalAmount) > 0.02) {
    throw new Error(
      `مجموع التوزيع (${sumLines.toFixed(2)}) لا يطابق إجمالي التحصيل (${input.totalAmount.toFixed(2)})`
    );
  }

  // ── حل وردية الكاشير: 3 مراحل ───────────────────────────────────────────
  // 1) shiftId صريح من الطلب
  // 2) resolve من glAccountId (الخزنة المختارة)
  // 3) fallback: وردية مفتوحة للمستخدم الحالي مباشرةً
  let resolvedShiftId: string | null = input.shiftId ?? null;
  let effectiveGlAccountId: string | null = input.glAccountId ?? null;

  if (!resolvedShiftId && effectiveGlAccountId) {
    resolvedShiftId = await resolveShiftFromGlAccount(effectiveGlAccountId);
  }

  if (!resolvedShiftId && input.userId) {
    const userShift = await resolveShiftFromUserId(input.userId);
    if (userShift) {
      resolvedShiftId   = userShift.shiftId;
      effectiveGlAccountId = effectiveGlAccountId ?? userShift.glAccountId;
    }
  }

  // ── جلب مفتاح وحدة الكاشير (للبث عبر SSE بعد التحصيل) ──────────────────
  let shiftUnitKey: string | null = null;
  if (resolvedShiftId) {
    const shiftRes = await db.execute(sql`
      SELECT unit_type, pharmacy_id, department_id FROM cashier_shifts
      WHERE id = ${resolvedShiftId}
    `);
    const shiftRow = (shiftRes as any).rows[0];
    if (shiftRow) {
      shiftUnitKey = shiftRow.unit_type === "pharmacy"
        ? (shiftRow.pharmacy_id ?? null)
        : (shiftRow.department_id ?? null);
    }
  }

  // ── جلب حساب الذمم: نستخدم ربط sales_invoice / receivables ──────────────
  // (فواتير التوصيل هي نوع من فواتير المبيعات، والحساب الدائن هو حساب المدينين)
  let arAccountId: string | null = null;
  let glDebitId:   string | null = null;
  let glCreditId:  string | null = null;
  if (effectiveGlAccountId) {
    const mappings = await db.select().from(accountMappings)
      .where(sql`transaction_type = 'sales_invoice'`);
    const arMapping = mappings.find((m) => m.lineType === "receivables");
    if (arMapping) {
      arAccountId = arMapping.debitAccountId || null;
      glDebitId   = effectiveGlAccountId;
      glCreditId  = arAccountId;
    }
  }

  // ── Transaction رئيسية: الإيصال + السطور + تحديث حالة الفواتير ──────────
  // القيد GL في transaction منفصلة لاحقاً لضمان عدم rollback الإيصال
  const { receiptId, receiptNumber } = await db.transaction(async (tx) => {
    const numRes = await tx.execute(
      sql`SELECT nextval('delivery_receipt_number_seq') AS next_num`
    );
    const receiptNumber = Number((numRes as any).rows[0]?.next_num ?? 1);

    const [receipt] = await tx
      .insert(deliveryReceipts)
      .values({
        receiptNumber,
        receiptDate:   input.receiptDate,
        totalAmount:   String(input.totalAmount),
        paymentMethod: input.paymentMethod,
        reference:     input.reference ?? null,
        notes:         input.notes ?? null,
        createdBy:     input.createdBy ?? null,
        glAccountId:   effectiveGlAccountId ?? null,
        shiftId:       resolvedShiftId,
      })
      .returning({ id: deliveryReceipts.id, receiptNumber: deliveryReceipts.receiptNumber });

    await tx.insert(deliveryReceiptLines).values(
      input.lines.map((l) => ({
        receiptId:  receipt.id,
        invoiceId:  l.invoiceId,
        amountPaid: String(l.amountPaid),
      }))
    );

    // ── تحديث حالة الفواتير المُكتملة التحصيل إلى 'collected' ────────────
    for (const line of input.lines) {
      await tx.execute(sql`
        UPDATE sales_invoice_headers
        SET status = 'collected'
        WHERE id = ${line.invoiceId}
          AND customer_type = 'delivery'
          AND GREATEST(
            net_total::numeric - (
              SELECT COALESCE(SUM(amount_paid::numeric), 0)
              FROM delivery_receipt_lines
              WHERE invoice_id = ${line.invoiceId}
            ),
            0
          ) = 0
      `);
    }

    return { receiptId: receipt.id, receiptNumber };
  });

  // ── قيد GL: transaction منفصلة بعد commit الإيصال ─────────────────────
  // فصلها يضمن أن فشل GL لا يُلغي الإيصال أو تحديث حالة الفواتير
  let journalEntryId: string | null = null;
  if (glDebitId && glCreditId) {
    try {
      const periodRes = await db.execute(sql`
        SELECT id FROM fiscal_periods
        WHERE is_closed = false
          AND start_date <= ${input.receiptDate}::date
          AND end_date   >= ${input.receiptDate}::date
        LIMIT 1
      `);
      const periodId = (periodRes as any).rows[0]?.id ?? null;

      const entryNumRes = await db.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
      const entryNumber = Number((entryNumRes as any).rows[0]?.n ?? 1);
      const amount      = input.totalAmount.toFixed(2);

      const [entry] = await db.insert(journalEntries).values({
        entryNumber,
        entryDate:   input.receiptDate,
        description: `تحصيل توصيل منزلي - إيصال ${receiptNumber}`,
        reference:   `DLVMT-${receiptNumber}`,
        status:      "posted" as const,
        periodId:    periodId,
        createdBy:   input.createdBy ?? null,
      }).returning({ id: journalEntries.id });

      const deliveryJournalLines = await resolveCostCenters([
        {
          journalEntryId: entry.id,
          lineNumber:     1,
          accountId:      glDebitId,
          debit:          amount,
          credit:         "0",
          description:    `تحصيل توصيل منزلي - إيصال ${receiptNumber}`,
        },
        {
          journalEntryId: entry.id,
          lineNumber:     2,
          accountId:      glCreditId,
          debit:          "0",
          credit:         amount,
          description:    `ذمم توصيل منزلي - إيصال ${receiptNumber}`,
        },
      ]);
      await db.insert(journalLines).values(deliveryJournalLines);

      await db.execute(sql`
        UPDATE delivery_receipts SET journal_entry_id = ${entry.id}
        WHERE id = ${receiptId}
      `);

      journalEntryId = entry.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, receiptId }, "[DLVMT] GL journal failed");
      void logAcctEvent({
        sourceType:   "delivery_receipt",
        sourceId:     receiptId,
        eventType:    "dlvmt_journal_failed",
        status:       "needs_retry",
        errorMessage: `فشل قيد تحصيل التوصيل: ${msg}`,
      }).catch(() => {});
    }
  }

  return { receiptId, receiptNumber, journalEntryId, shiftUnitKey };
}

// ─── getDeliveryReceiptReport ─────────────────────────────────────────────────
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
