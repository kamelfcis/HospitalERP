/**
 * accounting-events.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin routes لعرض وإعادة محاولة أحداث المحاسبة الفاشلة أو المعلّقة.
 *
 *  GET  /api/accounting/events        — قائمة الأحداث مع فلترة
 *  GET  /api/accounting/events/summary — ملخص إحصائي لكل الحالات
 *  POST /api/accounting/events/:id/retry — إعادة محاولة حدث فاشل
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Express } from "express";
import { requireAuth, checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";

export function registerAccountingEventRoutes(app: Express) {

  // ── GET /api/accounting/events ──────────────────────────────────────────
  app.get(
    "/api/accounting/events",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const { status, sourceType, limit = "50", offset = "0" } = req.query as Record<string, string>;

        const conditions: string[] = [];
        if (status)     conditions.push(`status = '${status.replace(/'/g, "''")}'`);
        if (sourceType) conditions.push(`source_type = '${sourceType.replace(/'/g, "''")}'`);

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const lim   = Math.min(parseInt(limit)  || 50, 200);
        const off   = parseInt(offset) || 0;

        const [rowsRaw, countRaw] = await Promise.all([
          db.execute(sql.raw(`
            SELECT id, event_type, source_type, source_id, status,
                   error_message, attempt_count, last_attempted_at,
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
        if (event.status === "completed") return res.status(400).json({ message: "الحدث مكتمل بالفعل — لا داعي لإعادة المحاولة" });

        const sourceType = event.source_type as string;
        const sourceId   = event.source_id  as string;

        logger.info({ id, sourceType, sourceId, actorUserId }, "[ACCT_RETRY] manual retry initiated");

        // ─── إعادة المحاولة حسب نوع المصدر ────────────────────────────────

        if (sourceType === "sales_invoice") {
          // استخدام آلية retryFailedJournals الموجودة لفاتورة واحدة
          const entry = await storage.regenerateJournalForInvoice(sourceId);
          if (entry) {
            await db.execute(sql`
              UPDATE accounting_event_log
              SET status = 'completed', error_message = NULL,
                  journal_entry_id = ${entry.id},
                  attempt_count = attempt_count + 1,
                  last_attempted_at = NOW(), updated_at = NOW()
              WHERE id = ${id}
            `);
            return res.json({ success: true, journalEntryId: entry.id });
          } else {
            await db.execute(sql`
              UPDATE accounting_event_log
              SET error_message = 'إعادة المحاولة: لم يُنشأ قيد (لا فوارق أو لا ربط حسابات)',
                  attempt_count = attempt_count + 1,
                  last_attempted_at = NOW(), updated_at = NOW()
              WHERE id = ${id}
            `);
            return res.status(422).json({ message: "لم يُنشأ قيد — راجع خريطة الحسابات أو البيانات" });
          }
        }

        if (sourceType === "cashier_collection") {
          // إعادة إكمال قيد الكاشير
          const cashMappings = await storage.getMappingsForTransaction("cashier_collection", null);
          const cashMapping  = cashMappings.find(m => m.lineType === "cash");
          if (!cashMapping?.debitAccountId) {
            return res.status(422).json({ message: "لا يوجد حساب خزنة نقدية في خريطة الحسابات" });
          }
          await storage.completeSalesJournalsWithCash([sourceId], cashMapping.debitAccountId, "");
          await db.execute(sql`
            UPDATE accounting_event_log
            SET attempt_count = attempt_count + 1,
                last_attempted_at = NOW(), updated_at = NOW()
            WHERE id = ${id}
          `);
          return res.json({ success: true, message: "تمت إعادة إكمال القيد — راجع accounting_event_log للنتيجة التفصيلية" });
        }

        if (sourceType === "patient_invoice") {
          const invoiceData = await storage.getPatientInvoice(sourceId);
          if (!invoiceData) return res.status(404).json({ message: "بيانات الفاتورة غير موجودة" });

          const glLines = storage.buildPatientInvoiceGLLines(invoiceData, invoiceData.lines || []);
          try {
            const entry = await storage.generateJournalEntry({
              sourceType: "patient_invoice",
              sourceDocumentId: sourceId,
              reference:   `PI-${header.invoiceNumber}`,
              description: `قيد فاتورة مريض رقم ${header.invoiceNumber}`,
              entryDate:   header.invoiceDate,
              lines:       glLines,
            });
            await db.execute(sql`
              UPDATE accounting_event_log
              SET status = 'completed', error_message = NULL,
                  journal_entry_id = ${entry?.id ?? null},
                  attempt_count = attempt_count + 1,
                  last_attempted_at = NOW(), updated_at = NOW()
              WHERE id = ${id}
            `);
            return res.json({ success: true, journalEntryId: entry?.id });
          } catch (err: any) {
            await db.execute(sql`
              UPDATE accounting_event_log
              SET error_message = ${err.message},
                  attempt_count = attempt_count + 1,
                  last_attempted_at = NOW(), updated_at = NOW()
              WHERE id = ${id}
            `);
            return res.status(422).json({ message: err.message });
          }
        }

        if (sourceType === "purchase_receiving") {
          await logAcctEvent({ sourceType, sourceId, eventType: event.event_type, status: "needs_retry",
            errorMessage: "إعادة المحاولة اليدوية لاستلام المورد تتطلب إعادة ترحيل الاستلام" });
          return res.status(422).json({ message: "أعد ترحيل أذن الاستلام من الشاشة المختصة لإعادة توليد القيد" });
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
