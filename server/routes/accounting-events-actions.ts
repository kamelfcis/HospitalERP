import type { Express } from "express";
import { requireAuth, checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { MAX_RETRY_ATTEMPTS } from "../lib/accounting-event-logger";
import { runAccountingRetryTick } from "../lib/accounting-retry-worker";
import { generatePatientInvoiceGL } from "../lib/patient-invoice-gl-generator";

export function registerAccountingEventsActionsRoutes(app: Express) {
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

        const markFailed = async (errorMsg: string) => {
          await db.execute(sql`
            UPDATE accounting_event_log
            SET error_message = ${errorMsg},
                next_retry_at = NOW() + (POWER(2, LEAST(attempt_count + 1, 20))::int * INTERVAL '1 minute'),
                attempt_count = attempt_count + 1,
                last_attempted_at = NOW(), updated_at = NOW()
            WHERE id = ${id}
              AND status != 'completed'
          `);
        };

        if (sourceType === "sales_invoice") {
          const entry = await storage.regenerateJournalForInvoice(sourceId);
          if (entry) {
            await markCompleted(entry.id);
            return res.json({ success: true, journalEntryId: entry.id });
          }
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
          return res.status(422).json({
            message: "مرتجع الكاشير لا يدعم إعادة المحاولة التلقائية — راجع القيود الفرعية في accounting_event_log أو أعد معالجة المرتجع من الشاشة المختصة"
          });
        }

        if (sourceType === "patient_invoice") {
          const result = await generatePatientInvoiceGL(sourceId);
          if (result.ok) {
            await markCompleted(result.entry.id);
            return res.json({ success: true, journalEntryId: result.entry.id });
          }
          const existingJE = await db.execute(sql`
            SELECT id FROM journal_entries
            WHERE source_type='patient_invoice' AND source_document_id=${sourceId} LIMIT 1
          `);
          const existingId = (existingJE as any).rows[0]?.id as string | undefined;
          if (existingId) {
            await markCompleted(existingId);
            return res.json({ success: true, journalEntryId: existingId, message: "القيد موجود مسبقاً" });
          }
          await markFailed(result.reason);
          return res.status(422).json({ message: result.reason });
        }

        if (sourceType === "purchase_receiving" || sourceType === "receiving") {
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

          const existingJE = await db.execute(sql`
            SELECT id FROM journal_entries
            WHERE source_type = 'warehouse_transfer' AND source_document_id = ${sourceId} LIMIT 1
          `);
          if ((existingJE as any).rows[0]) {
            await markCompleted((existingJE as any).rows[0].id);
            return res.json({ success: true, message: "القيد موجود مسبقاً", journalEntryId: (existingJE as any).rows[0].id });
          }

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
