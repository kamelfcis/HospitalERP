import type { Express } from "express";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  getCashierConsistencyReport,
} from "../storage/cashier-pending";
import { requireAdmin } from "./reports-admin-rpt";

export function registerReportsAdminConsistency(app: Express) {
  app.get("/api/admin/journal-consistency", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await db.execute(sql`
        SELECT
          h.invoice_number  AS "invoiceNumber",
          h.status          AS "invoiceStatus",
          h.journal_status  AS "headerJournalStatus",
          je.status         AS "actualJournalStatus",
          je.reference      AS "journalReference",
          CASE
            WHEN h.journal_status = 'posted' AND je.status = 'draft'    THEN 'header_posted_entry_draft'
            WHEN h.journal_status = 'posted' AND je.status = 'failed'   THEN 'header_posted_entry_failed'
            WHEN h.journal_status = 'posted' AND je.id IS NULL          THEN 'header_posted_entry_missing'
            WHEN h.journal_status = 'failed' AND je.status = 'posted'   THEN 'header_failed_entry_posted'
          END AS "mismatchType"
        FROM sales_invoice_headers h
        LEFT JOIN journal_entries je
          ON je.source_type = 'sales_invoice'
         AND je.source_document_id = h.id
        WHERE
          (h.journal_status = 'posted' AND (je.id IS NULL OR je.status != 'posted'))
          OR
          (h.journal_status = 'failed' AND je.status = 'posted')
        ORDER BY h.invoice_number DESC
        LIMIT 200
      `);

      const rows = (result as any).rows as Array<Record<string, unknown>>;
      const summary = {
        headerPostedEntryDraft:   rows.filter(r => r.mismatchType === "header_posted_entry_draft").length,
        headerPostedEntryFailed:  rows.filter(r => r.mismatchType === "header_posted_entry_failed").length,
        headerPostedEntryMissing: rows.filter(r => r.mismatchType === "header_posted_entry_missing").length,
        headerFailedEntryPosted:  rows.filter(r => r.mismatchType === "header_failed_entry_posted").length,
        total: rows.length,
      };

      return res.json({ summary, mismatches: rows, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/journal-consistency/repair", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const missing = await db.execute(sql`
        UPDATE sales_invoice_headers h
        SET journal_status = 'failed',
            journal_error = 'قيد مالي مفقود — أعد توليد القيد من شاشة أحداث المحاسبة',
            updated_at = NOW()
        WHERE h.journal_status = 'posted'
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.source_type = 'sales_invoice'
              AND je.source_document_id = h.id
          )
        RETURNING h.invoice_number
      `);

      const wrongFailed = await db.execute(sql`
        UPDATE sales_invoice_headers h
        SET journal_status = 'posted', journal_error = NULL, updated_at = NOW()
        WHERE h.journal_status = 'failed'
          AND EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.source_type = 'sales_invoice'
              AND je.source_document_id = h.id
              AND je.status = 'posted'
          )
        RETURNING h.invoice_number
      `);

      return res.json({
        repairedMissing:     (missing as any).rows.length,
        repairedWrongFailed: (wrongFailed as any).rows.length,
        repairedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/cashier-consistency", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const report = await getCashierConsistencyReport();
      return res.json({ ...report, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      logger.error({ err: err.message }, "[CASHIER_CONSISTENCY] report failed");
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/cashier-consistency/repair", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const dryRun: boolean = req.body?.dryRun === true;
    const triggeredBy: string = (req.session as any).username || (req.session as any).userId || "unknown";
    const reason: string | undefined = req.body?.reason || undefined;

    try {
      const candidates = await pool.query<{ id: string; invoice_number: number }>(`
        SELECT id, invoice_number
        FROM sales_invoice_headers
        WHERE status = 'finalized'
          AND (
            EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = id)
            OR
            EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = id)
          )
      `);

      if (dryRun) {
        const payload = {
          dryRun:         true,
          wouldRepair:    candidates.rowCount ?? 0,
          candidateIds:   candidates.rows.map(r => r.id),
          checkedAt:      new Date().toISOString(),
          triggeredBy,
          reason:         reason ?? null,
        };
        logger.info(payload, "[CASHIER_CONSISTENCY] dry-run scan complete");
        return res.json(payload);
      }

      const result = await pool.query<{ id: string; invoice_number: number }>(`
        UPDATE sales_invoice_headers
        SET status = 'collected', updated_at = NOW()
        WHERE status = 'finalized'
          AND (
            EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = id)
            OR
            EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = id)
          )
        RETURNING id, invoice_number
      `);
      const payload = {
        dryRun:        false,
        repairedCount: result.rowCount ?? 0,
        repairedIds:   result.rows.map(r => r.id),
        repairedAt:    new Date().toISOString(),
        triggeredBy,
        reason:        reason ?? null,
      };
      logger.info(payload, "[CASHIER_CONSISTENCY] ghost invoices repaired");
      return res.json(payload);
    } catch (err: any) {
      logger.error({ err: err.message, triggeredBy, reason }, "[CASHIER_CONSISTENCY] repair failed");
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/cashier-shifts-without-journal", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await pool.query(`
        SELECT
          cs.id            AS shift_id,
          cs.cashier_name,
          cs.cashier_id,
          cs.business_date,
          cs.closing_cash,
          cs.expected_cash,
          cs.variance,
          cs.closed_at,
          cs.closed_by
        FROM cashier_shifts cs
        LEFT JOIN journal_entries je
               ON je.source_document_id = cs.id
              AND je.source_type = 'cashier_shift_close'
        WHERE cs.status = 'closed'
          AND je.id IS NULL
        ORDER BY cs.closed_at DESC
      `);
      return res.json({
        ok:         result.rows.length === 0,
        count:      result.rows.length,
        rows:       result.rows,
        note:       result.rows.length > 0
                      ? "الوردات التي أُغلقت قبل تفعيل ميزة القيد المحاسبي لن يكون لها قيد — هذا متوقع للبيانات التاريخية"
                      : "جميع الوردات المغلقة لها قيود محاسبية — النظام سليم",
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ err: err.message }, "[CASHIER_JOURNAL_CHECK] failed");
      return res.status(500).json({ message: err.message });
    }
  });
}
