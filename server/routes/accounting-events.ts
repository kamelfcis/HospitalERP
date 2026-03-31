/**
 * accounting-events.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin routes لعرض وإعادة محاولة أحداث المحاسبة الفاشلة أو المعلّقة.
 *
 *  GET  /api/accounting/events              — قائمة الأحداث مع فلترة
 *  GET  /api/accounting/events/summary      — ملخص إحصائي لكل الحالات
 *  POST /api/accounting/events/:id/retry    — إعادة محاولة حدث فاشل
 *  POST /api/accounting/events/retry-batch  — إعادة محاولة جماعية لأحداث مستحقة
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Express } from "express";
import { requireAuth, checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { MAX_RETRY_ATTEMPTS } from "../lib/accounting-event-logger";
import { runAccountingRetryTick } from "../lib/accounting-retry-worker";

export function registerAccountingEventRoutes(app: Express) {

  // ── GET /api/accounting/events ──────────────────────────────────────────
  app.get(
    "/api/accounting/events",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const { status, sourceType, eventType, limit = "50", offset = "0" } = req.query as Record<string, string>;

        const conditions: string[] = [];
        if (status)     conditions.push(`status = '${status.replace(/'/g, "''")}'`);
        if (sourceType) conditions.push(`source_type = '${sourceType.replace(/'/g, "''")}'`);
        if (eventType === "contract_warnings") {
          conditions.push(`event_type IN ('contract_ar_split_fallback','contract_ar_no_split')`);
        } else if (eventType && eventType !== "all") {
          conditions.push(`event_type = '${eventType.replace(/'/g, "''")}'`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const lim   = Math.min(parseInt(limit)  || 50, 200);
        const off   = parseInt(offset) || 0;

        const [rowsRaw, countRaw] = await Promise.all([
          db.execute(sql.raw(`
            SELECT id, event_type, source_type, source_id, status,
                   error_message, attempt_count, last_attempted_at, next_retry_at,
                   journal_entry_id, created_at, updated_at, posted_by_user
            FROM accounting_event_log
            ${where}
            ORDER BY created_at DESC
            LIMIT ${lim} OFFSET ${off}
          `)),
          db.execute(sql.raw(`SELECT COUNT(*) AS total FROM accounting_event_log ${where}`)),
        ]);

        const events = (rowsRaw as any).rows;
        const total  = parseInt((countRaw as any).rows[0]?.total || "0");

        return res.json({ events, total, limit: lim, offset: off });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ message: msg });
      }
    }
  );

  // ── GET /api/accounting/events/summary ─────────────────────────────────
  app.get(
    "/api/accounting/events/summary",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (_req, res) => {
      try {
        const raw = await db.execute(sql`
          SELECT
            status,
            source_type,
            COUNT(*)::int AS count
          FROM accounting_event_log
          GROUP BY status, source_type
          ORDER BY status, source_type
        `);
        return res.json({ rows: (raw as any).rows });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ message: msg });
      }
    }
  );

  // ── POST /api/accounting/events/retry-batch ─────────────────────────────
  // Must be registered BEFORE /api/accounting/events/:id/retry (more specific path first)
  app.post(
    "/api/accounting/events/retry-batch",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const actorUserId = req.session.userId as string;
        logger.info({ actorUserId }, "[ACCT_RETRY_BATCH] manual batch retry initiated");

        const result = await runAccountingRetryTick();

        logger.info({ actorUserId, ...result }, "[ACCT_RETRY_BATCH] batch retry complete");
        return res.json({
          success: true,
          attempted: result.attempted,
          succeeded: result.succeeded,
          failed:    result.failed,
          skipped:   result.skipped,
          message:   `تمت إعادة المحاولة لـ ${result.attempted} حدث — نجح ${result.succeeded}، فشل ${result.failed}، تجاوزنا ${result.skipped}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, "[ACCT_RETRY_BATCH] batch retry error");
        return res.status(500).json({ message: msg });
      }
    }
  );

  // ── POST /api/accounting/events/:id/retry ──────────────────────────────
  app.post(
    "/api/accounting/events/:id/retry",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const { id } = req.params;
        const actorUserId = req.session.userId as string;

        const raw = await db.execute(sql`
          SELECT * FROM accounting_event_log WHERE id = ${id}
        `);
        const event = (raw as any).rows[0];
        if (!event) return res.status(404).json({ message: "الحدث غير موجود" });
        if (event.status === "completed") {
          return res.status(400).json({ message: "الحدث مكتمل بالفعل — لا داعي لإعادة المحاولة" });
        }
        if (event.attempt_count >= MAX_RETRY_ATTEMPTS) {
          return res.status(400).json({
            message: `تجاوز الحد الأقصى للمحاولات (${MAX_RETRY_ATTEMPTS}) — أصلح الإعداد أولاً ثم أعد المحاولة يدوياً`
          });
        }

        const sourceType = event.source_type as string;
        const sourceId   = event.source_id  as string;

        logger.info({ id, sourceType, sourceId, actorUserId }, "[ACCT_RETRY] manual retry initiated");

        // Helper — mark completed.
        // Guard: AND status != 'completed' prevents a concurrent retry path from overwriting
        // a completed event or double-incrementing attempt_count.
        const markCompleted = async (journalEntryId?: string | null) => {
          await db.execute(sql`
            UPDATE accounting_event_log
            SET status = 'completed', error_message = NULL, next_retry_at = NULL,
                journal_entry_id = COALESCE(${journalEntryId ?? null}, journal_entry_id),
                attempt_count = attempt_count + 1,
                last_attempted_at = NOW(), updated_at = NOW()
            WHERE id = ${id}
              AND status != 'completed'
          `);
        };

        // Helper — mark failed with next_retry_at.
        // Does NOT set status (keeps current status) — safe: if worker already marked it completed,
        // this only updates error_message/next_retry_at but never reverts the completed status.
        const markFailed = async (errorMsg: string) => {
          await db.execute(sql`
            UPDATE accounting_event_log
            SET error_message = ${errorMsg},
                next_retry_at = NOW() + (POWER(2, attempt_count + 1)::int * INTERVAL '1 minute'),
                attempt_count = attempt_count + 1,
                last_attempted_at = NOW(), updated_at = NOW()
            WHERE id = ${id}
              AND status != 'completed'
          `);
        };

        // ─── إعادة المحاولة حسب نوع المصدر ────────────────────────────────

        if (sourceType === "sales_invoice") {
          const entry = await storage.regenerateJournalForInvoice(sourceId);
          if (entry) {
            await markCompleted(entry.id);
            return res.json({ success: true, journalEntryId: entry.id });
          }
          // Check if journal already exists (idempotent)
          const existing = await db.execute(sql`
            SELECT id FROM journal_entries
            WHERE source_type = 'sales_invoice' AND source_document_id = ${sourceId} LIMIT 1
          `);
          const existingId = (existing as any).rows[0]?.id as string | undefined;
          if (existingId) {
            await markCompleted(existingId);
            return res.json({ success: true, journalEntryId: existingId, message: "القيد موجود مسبقاً" });
          }
          await markFailed("إعادة المحاولة: لم يُنشأ قيد — راجع ربط الحسابات أو البيانات");
          return res.status(422).json({ message: "لم يُنشأ قيد — راجع خريطة الحسابات أو البيانات" });
        }

        if (sourceType === "cashier_collection") {
          // createCashierCollectionJournals creates its own sub-events in accounting_event_log.
          // The top-level event is marked completed to signal "retry was triggered".
          // Any journal-level failures appear as separate events with their own status.
          try {
            await storage.createCashierCollectionJournals([sourceId], null, "");
            await markCompleted();
            return res.json({ success: true, message: "تمت إعادة محاولة إنشاء قيد التحصيل — راجع accounting_event_log للنتيجة التفصيلية" });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await markFailed(msg);
            return res.status(422).json({ message: msg });
          }
        }

        if (sourceType === "cashier_refund") {
          // Cashier refund journals are generated inside the refund transaction itself.
          // Re-running the refund would double-process the refund — not safe to auto-retry.
          // If the refund's journal failed, inspect the individual sub-events or re-issue from the UI.
          return res.status(422).json({
            message: "مرتجع الكاشير لا يدعم إعادة المحاولة التلقائية — راجع القيود الفرعية في accounting_event_log أو أعد معالجة المرتجع من الشاشة المختصة"
          });
        }

        if (sourceType === "patient_invoice") {
          const invoiceData = await storage.getPatientInvoice(sourceId);
          if (!invoiceData) return res.status(404).json({ message: "بيانات الفاتورة غير موجودة" });

          const glLines = storage.buildPatientInvoiceGLLines(invoiceData, invoiceData.lines || []);
          try {
            const entry = await storage.generateJournalEntry({
              sourceType:       "patient_invoice",
              sourceDocumentId: sourceId,
              reference:        `PI-${invoiceData.invoiceNumber}`,
              description:      `قيد فاتورة مريض رقم ${invoiceData.invoiceNumber}`,
              entryDate:        invoiceData.invoiceDate,
              lines:            glLines,
            });
            await markCompleted(entry?.id);
            return res.json({ success: true, journalEntryId: entry?.id });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await markFailed(msg);
            return res.status(422).json({ message: msg });
          }
        }

        if (sourceType === "purchase_receiving" || sourceType === "receiving") {
          // Fetch receiving header
          const hdrRaw = await db.execute(sql`
            SELECT id, receiving_number, receive_date FROM receiving_headers WHERE id = ${sourceId}
          `);
          const hdr = (hdrRaw as any).rows[0];
          if (!hdr) return res.status(404).json({ message: "أذن الاستلام غير موجود" });

          const linesRaw = await db.execute(sql`
            SELECT line_total FROM receiving_lines
            WHERE receiving_id = ${sourceId} AND is_rejected IS NOT TRUE
          `);
          const totalCost = (linesRaw as any).rows.reduce(
            (s: number, l: any) => s + parseFloat(l.line_total || "0"), 0
          );
          if (totalCost <= 0) {
            return res.status(422).json({ message: "إجمالي تكلفة الاستلام صفر — لا قيد مطلوب" });
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
              await markCompleted(entry.id);
              return res.json({ success: true, journalEntryId: entry.id });
            }
            await markFailed("لم يُنشأ قيد — راجع ربط الحسابات للمخزون والموردين");
            return res.status(422).json({ message: "لم يُنشأ قيد — راجع ربط الحسابات" });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await markFailed(msg);
            return res.status(422).json({ message: msg });
          }
        }

        if (sourceType === "warehouse_transfer") {
          // Verify transfer and GL account configuration
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
          if (!t) return res.status(404).json({ message: "التحويل المخزني غير موجود" });
          if (t.status !== "posted") {
            return res.status(422).json({ message: `التحويل في حالة "${t.status}" — يجب أن يكون مُرحّلاً` });
          }
          if (!t.src_gl || !t.dst_gl) {
            const missing = !t.src_gl ? t.src_name : t.dst_name;
            const msg = `المستودع "${missing}" لا يزال بدون حساب GL — أضف الحساب من إعدادات المستودعات ثم أعد المحاولة`;
            await markFailed(msg);
            return res.status(422).json({ message: msg });
          }

          // Idempotency: check if journal already exists
          const existingJE = await db.execute(sql`
            SELECT id FROM journal_entries
            WHERE source_type = 'warehouse_transfer' AND source_document_id = ${sourceId} LIMIT 1
          `);
          if ((existingJE as any).rows[0]) {
            await markCompleted((existingJE as any).rows[0].id);
            return res.json({ success: true, message: "القيد موجود مسبقاً", journalEntryId: (existingJE as any).rows[0].id });
          }

          // Compute total cost from lot movements
          const movRaw = await db.execute(sql`
            SELECT COALESCE(SUM(ABS(quantity_change_in_minor) * unit_cost::numeric), 0) AS total_cost
            FROM inventory_lot_movements
            WHERE reference_type = 'store_transfer' AND reference_id = ${sourceId}
              AND quantity_change_in_minor < 0
          `);
          const totalCost = parseFloat((movRaw as any).rows[0]?.total_cost || "0");
          if (totalCost <= 0) {
            return res.status(422).json({ message: "تكلفة التحويل صفر — لا قيد مطلوب" });
          }

          // Find open fiscal period
          const periodRaw = await db.execute(sql`
            SELECT id FROM fiscal_periods
            WHERE start_date <= ${t.transfer_date} AND end_date >= ${t.transfer_date}
              AND is_closed = FALSE
            LIMIT 1
          `);
          const period = (periodRaw as any).rows[0];
          if (!period) {
            const msg = `لا توجد فترة مالية مفتوحة لتاريخ التحويل (${t.transfer_date})`;
            await markFailed(msg);
            return res.status(422).json({ message: msg });
          }

          try {
            const entryNumber = await storage.getNextEntryNumber();
            const amount = totalCost.toFixed(2);
            const desc = `قيد تحويل مخزني ${t.transfer_number} — ${t.src_name} → ${t.dst_name}`;

            const [entry] = await db.execute(sql`
              INSERT INTO journal_entries
                (entry_number, entry_date, period_id, description, reference,
                 source_type, source_document_id, status, total_debit, total_credit)
              VALUES
                (${entryNumber}, ${t.transfer_date}, ${period.id}, ${desc},
                 ${'TRF-' + t.transfer_number}, 'warehouse_transfer', ${sourceId},
                 'posted', ${amount}, ${amount})
              RETURNING id
            `).then(r => (r as any).rows);

            await db.execute(sql`
              INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
              VALUES
                (${entry.id}, 1, ${t.dst_gl}, ${amount}, '0.00', ${'تحويل وارد — ' + t.dst_name}),
                (${entry.id}, 2, ${t.src_gl}, '0.00', ${amount}, ${'تحويل صادر — ' + t.src_name})
            `);

            await markCompleted(entry.id);
            return res.json({ success: true, journalEntryId: entry.id });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await markFailed(msg);
            return res.status(422).json({ message: msg });
          }
        }

        if (sourceType === "doctor_payable_settlement") {
          return res.status(422).json({ message: "أعد تسوية مستحقات الطبيب من الشاشة المختصة — لا يمكن إعادة المحاولة الجزئية" });
        }

        return res.status(422).json({ message: `نوع المصدر "${sourceType}" لا يدعم إعادة المحاولة التلقائية` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg, id: req.params.id }, "[ACCT_RETRY] failed");
        return res.status(500).json({ message: msg });
      }
    }
  );
}
