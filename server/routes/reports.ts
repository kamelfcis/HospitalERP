/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Reports Routes — تقارير المخزون والحركات + إدارة جداول التقارير
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Business endpoints (requireAuth — any logged-in user):
 *  ────────────────────────────────────────────────────────
 *  GET /api/reports/item-movements
 *    تقرير حركات الأصناف بين تاريخين.
 *    مصدر البيانات: rpt_item_movements_summary (daily grain)
 *    الحسابات:
 *      current_qty = rpt_inventory_snapshot.qty_in_minor (اللحظي)
 *      closing_qty = current_qty − SUM(net_qty_change WHERE date > toDate)
 *      opening_qty = closing_qty − SUM(net_qty_change WHERE fromDate ≤ date ≤ toDate)
 *
 *  Admin-only endpoints (role must be admin | owner):
 *  ──────────────────────────────────────────────────
 *  GET  /api/admin/rpt/status
 *    حالة كل refresh job: آخر تشغيل، المدة، الصفوف، الأخطاء.
 *
 *  POST /api/admin/rpt/refresh/:key
 *    تشغيل يدوي لـ job محدد. آمن للإعادة. يرفض التشغيل المتزامن.
 *    keys: patient_visit_summary | inventory_snapshot | item_movements_summary
 *
 *  POST /api/admin/rpt/refresh-all
 *    تشغيل يدوي لجميع jobs دفعةً واحدة.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express, Request, Response } from "express";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./_auth";
import { logger } from "../lib/logger";
import {
  getCashierConsistencyReport,
} from "../storage/cashier-pending";
import {
  getStatusAll,
  runRefresh,
  REFRESH_KEYS,
  type RefreshKey,
} from "../lib/rpt-refresh-orchestrator";
import { storage } from "../storage";

// ── Admin guard helper ────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response): boolean {
  if (!req.session.userId) {
    res.status(401).json({ message: "يجب تسجيل الدخول" });
    return false;
  }
  if (!["admin", "owner"].includes(req.session.role as string)) {
    res.status(403).json({ message: "غير مصرح — هذا الإجراء للمشرف فقط" });
    return false;
  }
  return true;
}

// ── Refresh function map (keyed by REFRESH_KEYS values) ──────────────────────
type RefreshFn = () => Promise<{ upserted: number; durationMs: number; ranAt: string }>;

function getRefreshFn(key: string): RefreshFn | null {
  switch (key) {
    case REFRESH_KEYS.PATIENT_VISIT:  return () => storage.refreshPatientVisitSummary();
    case REFRESH_KEYS.INVENTORY_SNAP: return () => storage.refreshInventorySnapshot();
    case REFRESH_KEYS.ITEM_MOVEMENTS: return () => storage.refreshItemMovementsSummary();
    default: return null;
  }
}

export function registerReportsRoutes(app: Express) {

  // ── GET /api/reports/item-movements ─────────────────────────────────────────
  //
  // تقرير حركات الأصناف: واحد per item × warehouse في النطاق الزمني.
  //
  // Query params:
  //   fromDate    (required) — ISO date string (YYYY-MM-DD)
  //   toDate      (required) — ISO date string (YYYY-MM-DD)
  //   itemId      (optional) — UUID
  //   warehouseId (optional) — UUID
  //
  app.get("/api/reports/item-movements", requireAuth, async (req, res) => {
    try {
      const { fromDate, toDate, itemId, warehouseId } = req.query as Record<string, string | undefined>;

      if (!fromDate || !toDate) {
        return res.status(400).json({ error: "fromDate و toDate مطلوبان" });
      }

      const dateRx = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRx.test(fromDate) || !dateRx.test(toDate)) {
        return res.status(400).json({ error: "صيغة التاريخ يجب أن تكون YYYY-MM-DD" });
      }

      if (fromDate > toDate) {
        return res.status(400).json({ error: "fromDate يجب أن يكون قبل أو يساوي toDate" });
      }

      const rows = await db.execute(sql`
        WITH

        -- 1. إجماليات حركات الفترة المطلوبة per (item × warehouse)
        period_moves AS (
          SELECT
            item_id,
            warehouse_id,
            MAX(item_name)                      AS item_name,
            MAX(item_category)                  AS item_category,
            MAX(warehouse_name)                 AS warehouse_name,
            SUM(received_qty)                   AS received_qty,
            SUM(received_value)                 AS received_value,
            SUM(receipt_tx_count)               AS receipt_tx_count,
            SUM(issued_qty)                     AS issued_qty,
            SUM(issued_value)                   AS issued_value,
            SUM(issue_tx_count)                 AS issue_tx_count,
            SUM(transfer_in_qty)                AS transfer_in_qty,
            SUM(transfer_out_qty)               AS transfer_out_qty,
            SUM(return_in_qty)                  AS return_in_qty,
            SUM(return_out_qty)                 AS return_out_qty,
            SUM(adjustment_qty)                 AS adjustment_qty,
            SUM(net_qty_change)                 AS net_qty_change
          FROM rpt_item_movements_summary
          WHERE movement_date BETWEEN ${fromDate}::date AND ${toDate}::date
            AND (${itemId ?? null}::text IS NULL OR item_id = ${itemId ?? null})
            AND (${warehouseId ?? null}::text IS NULL OR warehouse_id = ${warehouseId ?? null})
          GROUP BY item_id, warehouse_id
        ),

        -- 2. حركات ما بعد نهاية الفترة — لإيجاد الرصيد الختامي بطريقة walk-back
        after_period AS (
          SELECT
            item_id,
            warehouse_id,
            SUM(net_qty_change) AS net_after_end
          FROM rpt_item_movements_summary
          WHERE movement_date > ${toDate}::date
            AND (${itemId ?? null}::text IS NULL OR item_id = ${itemId ?? null})
            AND (${warehouseId ?? null}::text IS NULL OR warehouse_id = ${warehouseId ?? null})
          GROUP BY item_id, warehouse_id
        )

        SELECT
          pm.item_id                                                     AS "itemId",
          pm.item_name                                                   AS "itemName",
          pm.item_category                                               AS "itemCategory",
          pm.warehouse_id                                                AS "warehouseId",
          pm.warehouse_name                                              AS "warehouseName",
          pm.received_qty::numeric                                       AS "receivedQty",
          pm.received_value::numeric                                     AS "receivedValue",
          pm.issued_qty::numeric                                         AS "issuedQty",
          pm.issued_value::numeric                                       AS "issuedValue",
          pm.transfer_in_qty::numeric                                    AS "transferInQty",
          pm.transfer_out_qty::numeric                                   AS "transferOutQty",
          pm.return_in_qty::numeric                                      AS "returnInQty",
          pm.return_out_qty::numeric                                     AS "returnOutQty",
          pm.adjustment_qty::numeric                                     AS "adjustmentQty",
          pm.net_qty_change::numeric                                     AS "netQtyChange",
          COALESCE(snap.qty_in_minor, 0)::numeric                       AS "currentQty",
          (COALESCE(snap.qty_in_minor, 0) - COALESCE(ap.net_after_end, 0))::numeric
                                                                         AS "closingQty",
          (COALESCE(snap.qty_in_minor, 0) - COALESCE(ap.net_after_end, 0)
            - pm.net_qty_change)::numeric                               AS "openingQty"

        FROM period_moves pm
        LEFT JOIN after_period ap
          ON ap.item_id = pm.item_id AND ap.warehouse_id = pm.warehouse_id
        LEFT JOIN rpt_inventory_snapshot snap
          ON snap.item_id = pm.item_id AND snap.warehouse_id = pm.warehouse_id
        ORDER BY pm.item_name, pm.warehouse_name
      `);

      return res.json({
        fromDate,
        toDate,
        itemId:      itemId ?? null,
        warehouseId: warehouseId ?? null,
        rows:        (rows as any).rows ?? rows,
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[reports] item-movements error");
      return res.status(500).json({ error: "خطأ في استرجاع تقرير الحركات" });
    }
  });

  // ── GET /api/admin/rpt/status ────────────────────────────────────────────────
  //
  // حالة جميع refresh jobs للمراقبة. للمشرف فقط.
  //
  // Response: { jobs: RefreshJobStatus[], generatedAt: ISO string }
  //
  app.get("/api/admin/rpt/status", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const jobs = getStatusAll();
    return res.json({
      jobs,
      generatedAt: new Date().toISOString(),
    });
  });

  // ── POST /api/admin/rpt/refresh/:key ────────────────────────────────────────
  //
  // تشغيل يدوي لـ refresh job محدد. للمشرف فقط.
  //
  // :key — أحد القيم: patient_visit_summary | inventory_snapshot | item_movements_summary
  //
  // Responses:
  //   200  { status: 'success', upserted, durationMs, ranAt }
  //   202  { status: 'already_running', message }
  //   400  { error: 'unknown_key' }
  //   403  غير مصرح
  //   500  { error, message }
  //
  app.post("/api/admin/rpt/refresh/:key", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const key = req.params.key as RefreshKey;
    const fn  = getRefreshFn(key);

    if (!fn) {
      return res.status(400).json({
        error:    "unknown_key",
        message:  `مفتاح غير معروف: ${key}. القيم المقبولة: ${Object.values(REFRESH_KEYS).join(", ")}`,
        validKeys: Object.values(REFRESH_KEYS),
      });
    }

    try {
      const result = await runRefresh(key, fn, "manual");

      if (result === null) {
        // already running
        return res.status(202).json({
          status:  "already_running",
          message: `الـ refresh لـ [${key}] يعمل حالياً، سيتم تحديث الحالة عند الانتهاء.`,
          key,
        });
      }

      return res.json({
        status:     "success",
        key,
        upserted:   result.upserted,
        durationMs: result.durationMs,
        ranAt:      result.ranAt,
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        status:  "error",
        key,
        error:   msg,
      });
    }
  });

  // ── POST /api/admin/rpt/refresh-all ─────────────────────────────────────────
  //
  // تشغيل يدوي لجميع refresh jobs دفعةً واحدة. للمشرف فقط.
  // يُشغَّل بالتوازي (Promise.allSettled) لعزل الفشل.
  //
  // Response: { results: [{ key, status, upserted?, durationMs?, error? }] }
  //
  app.post("/api/admin/rpt/refresh-all", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const jobs = [
      { key: REFRESH_KEYS.PATIENT_VISIT,  fn: () => storage.refreshPatientVisitSummary() },
      { key: REFRESH_KEYS.INVENTORY_SNAP, fn: () => storage.refreshInventorySnapshot() },
      { key: REFRESH_KEYS.ITEM_MOVEMENTS, fn: () => storage.refreshItemMovementsSummary() },
    ];

    const settled = await Promise.allSettled(
      jobs.map(j => runRefresh(j.key, j.fn, "manual"))
    );

    const results = jobs.map((j, i) => {
      const s = settled[i];
      if (s.status === "fulfilled") {
        if (s.value === null) {
          return { key: j.key, status: "already_running" };
        }
        return {
          key:        j.key,
          status:     "success",
          upserted:   s.value.upserted,
          durationMs: s.value.durationMs,
          ranAt:      s.value.ranAt,
        };
      } else {
        const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
        return { key: j.key, status: "error", error: msg };
      }
    });

    return res.json({
      results,
      completedAt: new Date().toISOString(),
    });
  });

  // ── GET /api/admin/journal-consistency ──────────────────────────────────────
  //
  // Diagnostic report: finds all mismatches between header.journal_status and
  // the actual journal_entries.status.
  //
  // Returns:
  //   headerPostedEntryDraft  — header says 'posted', journal_entries is 'draft'
  //   headerPostedEntryFailed — header says 'posted', journal_entries is 'failed'
  //   headerPostedEntryMissing— header says 'posted', no journal_entries row at all
  //   headerFailedEntryPosted — header says 'failed', journal_entries is 'posted'
  //
  // For admin / owner only.
  //
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

  // ── POST /api/admin/journal-consistency/repair ────────────────────────────
  //
  // Repairs all mismatches in one atomic batch:
  //   header_posted_entry_draft   → leave as-is (cashier will post it)
  //   header_posted_entry_missing → correct header to 'failed'
  //   header_failed_entry_posted  → correct header to 'posted'
  //
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

  // ── GET /api/admin/cashier-consistency ────────────────────────────────────
  //
  // Diagnostic report for cashier collection integrity.
  // Detects "ghost invoices": invoice has a real receipt but status is still
  // 'finalized' instead of 'collected'.
  //
  // Returns:
  //   ok              — true if no ghost invoices found
  //   ghostSalesCount — invoices with cashier_receipt but status=finalized
  //   ghostReturnsCount — returns with cashier_refund_receipt but status=finalized
  //   rows            — detail list for manual inspection
  //
  // For admin / owner only.
  //
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

  // ── POST /api/admin/cashier-consistency/repair ────────────────────────────
  //
  // Atomically repairs all ghost invoices:
  //   UPDATE sales_invoice_headers SET status='collected'
  //   WHERE status='finalized' AND EXISTS receipt
  //
  // This is a safe repair: collected is the correct final state for an
  // invoice that already has a real cashier receipt.
  //
  // For admin / owner only.
  //
  app.post("/api/admin/cashier-consistency/repair", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    // Optional dry-run: if dryRun=true in body, return what WOULD be repaired
    // without writing anything. Default = false (real repair).
    const dryRun: boolean = req.body?.dryRun === true;
    const triggeredBy: string = (req.session as any).username || (req.session as any).userId || "unknown";

    try {
      // Ghost-detection SELECT — always run (used for both dry-run and real repair)
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
        };
        logger.info(payload, "[CASHIER_CONSISTENCY] dry-run scan complete");
        return res.json(payload);
      }

      // Real repair — only runs if dryRun=false (default)
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
      };
      logger.info(payload, "[CASHIER_CONSISTENCY] ghost invoices repaired");
      return res.json(payload);
    } catch (err: any) {
      logger.error({ err: err.message, triggeredBy }, "[CASHIER_CONSISTENCY] repair failed");
      return res.status(500).json({ message: err.message });
    }
  });

}
