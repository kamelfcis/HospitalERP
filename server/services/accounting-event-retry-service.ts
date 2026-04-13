/**
 * Service: accounting-event-retry-service
 *
 * مسؤول عن: إعادة محاولة حدث محاسبي واحد حسب source_type
 * مستخدَم من: accounting-events-actions route
 *
 * الـ route يقتصر على: parse → call retryOneAccountingEvent → return HTTP response
 */

import { db }                        from "../db";
import { sql }                       from "drizzle-orm";
import { storage }                   from "../storage";
import { logger }                    from "../lib/logger";
import { MAX_RETRY_ATTEMPTS }        from "../lib/accounting-event-logger";
import { generatePatientInvoiceGL }  from "../lib/patient-invoice-gl-generator";

// ─── Return type ────────────────────────────────────────────────────────────

export type RetryOneResult =
  | { ok: true;  journalEntryId?: string; message?: string }
  | { ok: false; status: 400 | 404 | 422; message: string };

// ─── Private DB helpers ───────────────────────────────────────────────────────

async function markCompleted(id: string, journalEntryId?: string | null): Promise<void> {
  await db.execute(sql`
    UPDATE accounting_event_log
    SET status            = 'completed',
        error_message     = NULL,
        next_retry_at     = NULL,
        journal_entry_id  = COALESCE(${journalEntryId ?? null}, journal_entry_id),
        attempt_count     = attempt_count + 1,
        last_attempted_at = NOW(),
        updated_at        = NOW()
    WHERE id = ${id}
      AND status != 'completed'
  `);
}

async function markFailed(id: string, errorMsg: string): Promise<void> {
  await db.execute(sql`
    UPDATE accounting_event_log
    SET error_message     = ${errorMsg},
        next_retry_at     = NOW() + (POWER(2, LEAST(attempt_count + 1, 20))::int * INTERVAL '1 minute'),
        attempt_count     = attempt_count + 1,
        last_attempted_at = NOW(),
        updated_at        = NOW()
    WHERE id = ${id}
      AND status != 'completed'
  `);
}

// ─── Main service function ───────────────────────────────────────────────────

export async function retryOneAccountingEvent(
  id:          string,
  actorUserId: string,
): Promise<RetryOneResult> {

  const raw   = await db.execute(sql`SELECT * FROM accounting_event_log WHERE id = ${id}`);
  const event = (raw as any).rows[0];

  if (!event) return { ok: false, status: 404, message: "الحدث غير موجود" };
  if (event.status === "completed") {
    return { ok: false, status: 400, message: "الحدث مكتمل بالفعل — لا داعي لإعادة المحاولة" };
  }
  if (event.attempt_count >= MAX_RETRY_ATTEMPTS) {
    return {
      ok: false, status: 400,
      message: `تجاوز الحد الأقصى للمحاولات (${MAX_RETRY_ATTEMPTS}) — أصلح الإعداد أولاً ثم أعد المحاولة يدوياً`,
    };
  }

  const sourceType = event.source_type as string;
  const sourceId   = event.source_id   as string;

  logger.info({ id, sourceType, sourceId, actorUserId }, "[ACCT_RETRY] manual retry initiated");

  // ── sales_invoice ──────────────────────────────────────────────────────────
  if (sourceType === "sales_invoice") {
    const entry = await storage.regenerateJournalForInvoice(sourceId);
    if (entry) {
      await markCompleted(id, entry.id);
      return { ok: true, journalEntryId: entry.id };
    }
    const existing = await db.execute(sql`
      SELECT id FROM journal_entries
      WHERE source_type = 'sales_invoice' AND source_document_id = ${sourceId}
      LIMIT 1
    `);
    const existingId = (existing as any).rows[0]?.id as string | undefined;
    if (existingId) {
      await markCompleted(id, existingId);
      return { ok: true, journalEntryId: existingId, message: "القيد موجود مسبقاً" };
    }
    await markFailed(id, "إعادة المحاولة: لم يُنشأ قيد — راجع ربط الحسابات أو البيانات");
    return { ok: false, status: 422, message: "لم يُنشأ قيد — راجع خريطة الحسابات أو البيانات" };
  }

  // ── cashier_collection ─────────────────────────────────────────────────────
  if (sourceType === "cashier_collection") {
    try {
      await storage.createCashierCollectionJournals([sourceId], null, "");
      await markCompleted(id);
      return {
        ok: true,
        message: "تمت إعادة محاولة إنشاء قيد التحصيل — راجع accounting_event_log للنتيجة التفصيلية",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFailed(id, msg);
      return { ok: false, status: 422, message: msg };
    }
  }

  // ── cashier_refund ─────────────────────────────────────────────────────────
  if (sourceType === "cashier_refund") {
    return {
      ok: false, status: 422,
      message: "مرتجع الكاشير لا يدعم إعادة المحاولة التلقائية — راجع القيود الفرعية في accounting_event_log أو أعد معالجة المرتجع من الشاشة المختصة",
    };
  }

  // ── patient_invoice ────────────────────────────────────────────────────────
  if (sourceType === "patient_invoice") {
    const result = await generatePatientInvoiceGL(sourceId);
    if (result.ok) {
      await markCompleted(id, result.entry.id);
      return { ok: true, journalEntryId: result.entry.id };
    }
    const existingJE = await db.execute(sql`
      SELECT id FROM journal_entries
      WHERE source_type = 'patient_invoice' AND source_document_id = ${sourceId}
      LIMIT 1
    `);
    const existingId = (existingJE as any).rows[0]?.id as string | undefined;
    if (existingId) {
      await markCompleted(id, existingId);
      return { ok: true, journalEntryId: existingId, message: "القيد موجود مسبقاً" };
    }
    await markFailed(id, result.reason);
    return { ok: false, status: 422, message: result.reason };
  }

  // ── purchase_receiving / receiving ─────────────────────────────────────────
  if (sourceType === "purchase_receiving" || sourceType === "receiving") {
    const hdrRaw = await db.execute(sql`
      SELECT id, receiving_number, receive_date
      FROM receiving_headers
      WHERE id = ${sourceId}
    `);
    const hdr = (hdrRaw as any).rows[0];
    if (!hdr) return { ok: false, status: 404, message: "أذن الاستلام غير موجود" };

    const linesRaw = await db.execute(sql`
      SELECT line_total FROM receiving_lines
      WHERE receiving_id = ${sourceId} AND is_rejected IS NOT TRUE
    `);
    const totalCost = (linesRaw as any).rows.reduce(
      (s: number, l: any) => s + parseFloat(l.line_total || "0"), 0
    );
    if (totalCost <= 0) {
      return { ok: false, status: 422, message: "إجمالي تكلفة الاستلام صفر — لا قيد مطلوب" };
    }

    try {
      const entry = await storage.generateJournalEntry({
        sourceType:       "receiving",
        sourceDocumentId: sourceId,
        reference:        `RCV-${hdr.receiving_number}`,
        description:      `قيد استلام مورد رقم ${hdr.receiving_number}`,
        entryDate:        hdr.receive_date,
        lines: [
          { lineType: "inventory", amount: String(totalCost) },
          { lineType: "payables",  amount: String(totalCost) },
        ],
      });
      if (entry) {
        await db.execute(sql`
          UPDATE receiving_headers
          SET journal_status = 'posted', journal_error = NULL, updated_at = NOW()
          WHERE id = ${sourceId}
        `);
        await markCompleted(id, entry.id);
        return { ok: true, journalEntryId: entry.id };
      }
      await markFailed(id, "لم يُنشأ قيد — راجع ربط الحسابات للمخزون والموردين");
      return { ok: false, status: 422, message: "لم يُنشأ قيد — راجع ربط الحسابات" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFailed(id, msg);
      return { ok: false, status: 422, message: msg };
    }
  }

  // ── warehouse_transfer ─────────────────────────────────────────────────────
  if (sourceType === "warehouse_transfer") {
    const transferRaw = await db.execute(sql`
      SELECT
        st.id, st.transfer_number, st.transfer_date, st.status,
        sw.gl_account_id AS src_gl, sw.name_ar AS src_name,
        dw.gl_account_id AS dst_gl, dw.name_ar AS dst_name
      FROM store_transfers st
      LEFT JOIN warehouses sw ON sw.id = st.source_warehouse_id
      LEFT JOIN warehouses dw ON dw.id = st.destination_warehouse_id
      WHERE st.id = ${sourceId}
    `);
    const t = (transferRaw as any).rows[0];
    if (!t) return { ok: false, status: 404, message: "التحويل المخزني غير موجود" };
    if (t.status !== "posted") {
      return { ok: false, status: 422, message: `التحويل في حالة "${t.status}" — يجب أن يكون مُرحّلاً` };
    }
    if (!t.src_gl || !t.dst_gl) {
      const missing = !t.src_gl ? t.src_name : t.dst_name;
      const msg = `المستودع "${missing}" لا يزال بدون حساب GL — أضف الحساب من إعدادات المستودعات ثم أعد المحاولة`;
      await markFailed(id, msg);
      return { ok: false, status: 422, message: msg };
    }

    const existingJE = await db.execute(sql`
      SELECT id FROM journal_entries
      WHERE source_type = 'warehouse_transfer' AND source_document_id = ${sourceId}
      LIMIT 1
    `);
    const existingRow = (existingJE as any).rows[0];
    if (existingRow) {
      await markCompleted(id, existingRow.id);
      return { ok: true, journalEntryId: existingRow.id, message: "القيد موجود مسبقاً" };
    }

    const movRaw = await db.execute(sql`
      SELECT COALESCE(SUM(ABS(quantity_change_in_minor) * unit_cost::numeric), 0) AS total_cost
      FROM inventory_lot_movements
      WHERE reference_type = 'store_transfer' AND reference_id = ${sourceId}
        AND quantity_change_in_minor < 0
    `);
    const totalCost = parseFloat((movRaw as any).rows[0]?.total_cost || "0");
    if (totalCost <= 0) {
      return { ok: false, status: 422, message: "تكلفة التحويل صفر — لا قيد مطلوب" };
    }

    const periodRaw = await db.execute(sql`
      SELECT id FROM fiscal_periods
      WHERE start_date <= ${t.transfer_date} AND end_date >= ${t.transfer_date}
        AND is_closed = FALSE
      LIMIT 1
    `);
    const period = (periodRaw as any).rows[0];
    if (!period) {
      const msg = `لا توجد فترة مالية مفتوحة لتاريخ التحويل (${t.transfer_date})`;
      await markFailed(id, msg);
      return { ok: false, status: 422, message: msg };
    }

    try {
      const entryNumber = await storage.getNextEntryNumber();
      const amount      = totalCost.toFixed(2);
      const desc        = `قيد تحويل مخزني ${t.transfer_number} — ${t.src_name} → ${t.dst_name}`;

      const [entry] = await db.execute(sql`
        INSERT INTO journal_entries
          (entry_number, entry_date, period_id, description, reference,
           source_type, source_document_id, status, total_debit, total_credit)
        VALUES
          (${entryNumber}, ${t.transfer_date}, ${period.id}, ${desc},
           ${"TRF-" + t.transfer_number}, 'warehouse_transfer', ${sourceId},
           'posted', ${amount}, ${amount})
        RETURNING id
      `).then(r => (r as any).rows);

      await db.execute(sql`
        INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
        VALUES
          (${entry.id}, 1, ${t.dst_gl}, ${amount}, '0.00', ${"تحويل وارد — " + t.dst_name}),
          (${entry.id}, 2, ${t.src_gl}, '0.00', ${amount}, ${"تحويل صادر — " + t.src_name})
      `);

      await markCompleted(id, entry.id);
      return { ok: true, journalEntryId: entry.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFailed(id, msg);
      return { ok: false, status: 422, message: msg };
    }
  }

  // ── doctor_payable_settlement ──────────────────────────────────────────────
  if (sourceType === "doctor_payable_settlement") {
    return {
      ok: false, status: 422,
      message: "أعد تسوية مستحقات الطبيب من الشاشة المختصة — لا يمكن إعادة المحاولة الجزئية",
    };
  }

  return {
    ok: false, status: 422,
    message: `نوع المصدر "${sourceType}" لا يدعم إعادة المحاولة التلقائية`,
  };
}
