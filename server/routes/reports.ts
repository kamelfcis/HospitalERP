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
import * as XLSX from "xlsx";
import { getItemMovementReport } from "../storage/item-movement-report-storage";

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

  // ── GET /api/reports/item-movement-detail ────────────────────────────────────
  //
  // تقرير حركة صنف التفصيلي — paginated, with server-side summary.
  //
  // Query params:
  //   itemId      (required) — UUID
  //   warehouseId (optional) — UUID
  //   fromDate    (optional) — YYYY-MM-DD
  //   toDate      (optional) — YYYY-MM-DD
  //   txTypes     (optional) — comma-separated: receiving,sales_invoice,...
  //   page        (optional) — integer ≥ 1 (default: 1)
  //   pageSize    (optional) — integer 10-200 (default: 50)
  //
  // Response: { rows, total, page, pageSize, summary: { totalIn, totalOut, byType } }
  //
  app.get("/api/reports/item-movement-detail", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const {
        itemId,
        warehouseId,
        fromDate,
        toDate,
        txTypes: txTypesRaw,
        page:     pageRaw,
        pageSize: pageSizeRaw,
      } = req.query as Record<string, string | undefined>;

      if (!itemId) {
        return res.status(400).json({ error: "itemId مطلوب" });
      }

      const txTypes = txTypesRaw
        ? txTypesRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      const result = await getItemMovementReport({
        itemId,
        warehouseId: warehouseId || undefined,
        fromDate:    fromDate    || undefined,
        toDate:      toDate      || undefined,
        txTypes,
        page:        pageRaw     ? parseInt(pageRaw,     10) : 1,
        pageSize:    pageSizeRaw ? parseInt(pageSizeRaw, 10) : 50,
      });

      logger.info(
        { itemId, page: result.page, pageSize: result.pageSize, total: result.total, durationMs: Date.now() - t0 },
        "[PERF] item-movement-detail"
      );

      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[reports] item-movement-detail error");
      return res.status(500).json({ error: "خطأ في استرجاع تقرير حركة الصنف" });
    }
  });

  // ── GET /api/reports/item-movement-detail/export ─────────────────────────────
  //
  // تصدير تقرير حركة الصنف إلى Excel
  //
  app.get("/api/reports/item-movement-detail/export", requireAuth, async (req, res) => {
    try {
      const {
        itemId,
        warehouseId,
        fromDate,
        toDate,
        txTypes: txTypesRaw,
        unitLevel = "minor",
      } = req.query as Record<string, string | undefined>;

      if (!itemId) {
        return res.status(400).json({ error: "itemId مطلوب" });
      }

      const txTypes = txTypesRaw
        ? txTypesRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      // Export fetches ALL rows (no pagination) — pageSize capped at 50k for safety
      const exportResult = await getItemMovementReport({
        itemId,
        warehouseId: warehouseId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        txTypes,
        page:     1,
        pageSize: 50_000,
      });
      const rows = exportResult.rows;

      if (rows.length === 0) {
        return res.status(404).json({ error: "لا توجد بيانات للتصدير" });
      }

      const first = rows[0];
      const majorToMinor = first.majorToMinor || 1;
      const mediumToMinor = first.mediumToMinor || 1;

      function convertQty(minor: number): number {
        if (unitLevel === "major" && majorToMinor > 1) return minor / majorToMinor;
        if (unitLevel === "medium" && mediumToMinor > 1) return minor / mediumToMinor;
        return minor;
      }

      function unitName(): string {
        if (unitLevel === "major") return first.majorUnitName || "كبيرة";
        if (unitLevel === "medium") return first.mediumUnitName || "وسط";
        return first.minorUnitName || "صغيرة";
      }

      const TX_LABELS: Record<string, string> = {
        receiving:       "استلام شراء",
        sales_invoice:   "فاتورة مبيعات",
        patient_invoice: "فاتورة مريض",
        transfer:        "تحويل مخزن",
        stock_count:     "جرد دوري",
        purchase_return: "مرتجع مشتريات",
      };

      const u = unitName();
      const excelData = rows.map((r, idx) => ({
        "#": idx + 1,
        "التاريخ":          new Date(r.txDate).toLocaleDateString("ar-EG"),
        "الوقت":            new Date(r.txDate).toLocaleTimeString("ar-EG"),
        "نوع الحركة":       TX_LABELS[r.referenceType] ?? r.referenceType,
        "الاتجاه":          r.txType === "in" ? "وارد" : "صادر",
        [`الكمية (${u})`]:  parseFloat(convertQty(r.qtyChangeMinor).toFixed(4)),
        [`الرصيد (${u})`]:  parseFloat(convertQty(r.balanceAfterMinor).toFixed(4)),
        "سعر الشراء":       r.unitCost ?? r.lotPurchasePrice,
        "سعر البيع":        r.lotSalePrice,
        "المستودع":         r.warehouseName,
        "رقم المستند":      r.documentNumber ?? "",
        "فاتورة المورد":    r.supplierInvoiceNo ?? "",
        "المستخدم":         r.userName ?? "—",
        "هدية":             r.isBonus ? "نعم" : "",
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "حركة الصنف");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const itemName = rows[0].itemName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "_");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="item-movement-${itemName}.xlsx"`);
      return res.send(buf);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[reports] item-movement-detail/export error");
      return res.status(500).json({ error: "خطأ في تصدير التقرير" });
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
    const reason: string | undefined = req.body?.reason || undefined;

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
          reason:         reason ?? null,
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
        reason:        reason ?? null,
      };
      logger.info(payload, "[CASHIER_CONSISTENCY] ghost invoices repaired");
      return res.json(payload);
    } catch (err: any) {
      logger.error({ err: err.message, triggeredBy, reason }, "[CASHIER_CONSISTENCY] repair failed");
      return res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/admin/cashier-shifts-without-journal ─────────────────────────
  //
  // J) Diagnostic check (post-deploy safety):
  //    Returns all closed shifts that have no corresponding GL journal entry.
  //    Under normal operation (after the GL feature was activated) this should
  //    return ZERO rows.  Legacy shifts closed before the feature was added
  //    will appear here — this is expected for historical data.
  //
  // For admin / owner only.
  //
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

  // ══════════════════════════════════════════════════════════════════════════════
  //  GET /api/reports/warehouse-balance
  //  تقرير رصيد مخزن في تاريخ معين
  //
  //  Algorithm:
  //    balance_at_date = lot_movements SUM(qty_change_in_minor) WHERE tx_date <= asOfDate
  //    يستخدم inventory_lot_movements مباشرةً (مصدر الحقيقة الوحيد)
  //    مع JOIN للأصناف للحصول على الأسعار ومعلومات الوحدات
  //
  //  Query params:
  //    warehouseId  (required)  — UUID
  //    asOfDate     (required)  — YYYY-MM-DD
  //    category     (optional)  — drug | supply | all
  //    unitLevel    (optional)  — major | medium | minor (default: major)
  //    search       (optional)  — text search on name/code
  //    excludeZero  (optional)  — true (default) | false
  //    page         (optional)  — 1-based (default: 1)
  //    pageSize     (optional)  — max 200 (default: 50)
  // ══════════════════════════════════════════════════════════════════════════════
  app.get("/api/reports/warehouse-balance", requireAuth, async (req, res) => {
    try {
      const {
        warehouseId,
        asOfDate,
        category   = "all",
        unitLevel  = "major",
        search     = "",
        excludeZero = "true",
        page       = "1",
        pageSize   = "50",
      } = req.query as Record<string, string>;

      if (!warehouseId) return res.status(400).json({ message: "warehouseId مطلوب" });
      if (!asOfDate)    return res.status(400).json({ message: "asOfDate مطلوب" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) return res.status(400).json({ message: "صيغة asOfDate يجب أن تكون YYYY-MM-DD" });

      const pageNum  = Math.max(1, parseInt(page, 10)     || 1);
      const pageSz   = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset   = (pageNum - 1) * pageSz;
      const catFilter = category === "all" ? null : category;
      const searchFilter = search.trim() || null;
      const skipZero = excludeZero !== "false";

      // ── Single batch query — no N+1 ────────────────────────────────────────────
      // Sums all lot movements up to asOfDate for the given warehouse,
      // then joins items for name/price/unit data.
      // Unit conversion is done in SQL to keep it a single pass.
      const result = await pool.query(`
        WITH lot_balance AS (
          SELECT
            il.item_id,
            COALESCE(ilm.warehouse_id, il.warehouse_id)  AS warehouse_id,
            SUM(ilm.qty_change_in_minor)                 AS qty_minor,
            -- weighted avg cost from purchase lots
            SUM(CASE WHEN ilm.qty_change_in_minor > 0
                     THEN ilm.qty_change_in_minor * COALESCE(ilm.unit_cost, il.purchase_price)
                     ELSE 0 END)
              / NULLIF(SUM(CASE WHEN ilm.qty_change_in_minor > 0
                               THEN ilm.qty_change_in_minor ELSE 0 END), 0) AS avg_cost
          FROM inventory_lot_movements ilm
          JOIN inventory_lots il ON il.id = ilm.lot_id
          WHERE ilm.tx_date::date <= $1::date
            AND COALESCE(ilm.warehouse_id, il.warehouse_id) = $2
          GROUP BY il.item_id, COALESCE(ilm.warehouse_id, il.warehouse_id)
        ),
        enriched AS (
          SELECT
            lb.item_id,
            lb.warehouse_id,
            lb.qty_minor,
            lb.avg_cost,
            i.item_code,
            i.name_ar,
            i.name_en,
            i.category,
            w.name_ar                              AS warehouse_name,
            COALESCE(i.major_unit_name, 'وحدة')   AS major_unit_name,
            i.medium_unit_name,
            i.minor_unit_name,
            COALESCE(i.major_to_minor::numeric, 1) AS major_to_minor,
            COALESCE(i.medium_to_minor::numeric, 1) AS medium_to_minor,
            COALESCE(i.major_to_medium::numeric, 1) AS major_to_medium,
            COALESCE(i.purchase_price_last::numeric, 0)  AS purchase_price_major,
            COALESCE(i.sale_price_current::numeric, 0)   AS sale_price_major
          FROM lot_balance lb
          JOIN items i   ON i.id = lb.item_id
          JOIN warehouses w ON w.id = lb.warehouse_id
          WHERE ($3::text IS NULL OR i.category::text = $3)
            AND ($4::text IS NULL OR i.name_ar ILIKE '%' || $4 || '%' OR i.item_code ILIKE '%' || $4 || '%')
            AND ($5::boolean = false OR lb.qty_minor > 0.0005)
        ),
        converted AS (
          SELECT
            *,
            -- qty in chosen unit
            CASE $6
              WHEN 'minor'  THEN qty_minor
              WHEN 'medium' THEN ROUND(qty_minor / NULLIF(medium_to_minor, 0), 4)
              ELSE               ROUND(qty_minor / NULLIF(major_to_minor,  0), 4)
            END                                          AS qty_display,
            -- purchase price per chosen unit
            CASE $6
              WHEN 'minor'  THEN ROUND(purchase_price_major / NULLIF(major_to_minor,  0), 4)
              WHEN 'medium' THEN ROUND(purchase_price_major / NULLIF(major_to_medium, 0), 4)
              ELSE               purchase_price_major
            END                                          AS purchase_price_unit,
            -- sale price per chosen unit
            CASE $6
              WHEN 'minor'  THEN ROUND(sale_price_major / NULLIF(major_to_minor,  0), 4)
              WHEN 'medium' THEN ROUND(sale_price_major / NULLIF(major_to_medium, 0), 4)
              ELSE               sale_price_major
            END                                          AS sale_price_unit,
            -- unit label
            CASE $6
              WHEN 'minor'  THEN COALESCE(minor_unit_name,  major_unit_name)
              WHEN 'medium' THEN COALESCE(medium_unit_name, major_unit_name)
              ELSE               major_unit_name
            END                                          AS unit_label
          FROM enriched
        )
        SELECT
          item_id          AS "itemId",
          warehouse_id     AS "warehouseId",
          item_code        AS "itemCode",
          name_ar          AS "nameAr",
          name_en          AS "nameEn",
          category,
          warehouse_name   AS "warehouseName",
          unit_label       AS "unitLabel",
          qty_display      AS "qty",
          purchase_price_unit AS "purchasePriceUnit",
          sale_price_unit     AS "salePriceUnit",
          ROUND(qty_display * purchase_price_unit, 2)   AS "totalCost",
          ROUND(qty_display * sale_price_unit,     2)   AS "totalSaleValue",
          COUNT(*) OVER()                               AS "_total"
        FROM converted
        ORDER BY name_ar
        LIMIT $7 OFFSET $8
      `, [
        asOfDate,
        warehouseId,
        catFilter,
        searchFilter,
        skipZero,
        unitLevel,
        pageSz,
        offset,
      ]);

      const total = result.rows.length > 0 ? parseInt(result.rows[0]._total, 10) : 0;

      // Summary aggregates (no extra query — computed from this page + totals already fetched)
      // For accurate summary we need a second pass; use aggregate query on same filters
      const summaryResult = await pool.query(`
        WITH lot_balance AS (
          SELECT
            il.item_id,
            COALESCE(ilm.warehouse_id, il.warehouse_id) AS warehouse_id,
            SUM(ilm.qty_change_in_minor)                AS qty_minor,
            SUM(CASE WHEN ilm.qty_change_in_minor > 0
                     THEN ilm.qty_change_in_minor * COALESCE(ilm.unit_cost, il.purchase_price)
                     ELSE 0 END)
              / NULLIF(SUM(CASE WHEN ilm.qty_change_in_minor > 0
                               THEN ilm.qty_change_in_minor ELSE 0 END), 0) AS avg_cost
          FROM inventory_lot_movements ilm
          JOIN inventory_lots il ON il.id = ilm.lot_id
          WHERE ilm.tx_date::date <= $1::date
            AND COALESCE(ilm.warehouse_id, il.warehouse_id) = $2
          GROUP BY il.item_id, COALESCE(ilm.warehouse_id, il.warehouse_id)
        ),
        enriched AS (
          SELECT
            lb.qty_minor,
            COALESCE(i.major_to_minor::numeric, 1)  AS major_to_minor,
            COALESCE(i.medium_to_minor::numeric, 1) AS medium_to_minor,
            COALESCE(i.major_to_medium::numeric, 1) AS major_to_medium,
            COALESCE(i.purchase_price_last::numeric, 0)  AS purchase_price_major,
            COALESCE(i.sale_price_current::numeric, 0)   AS sale_price_major
          FROM lot_balance lb
          JOIN items i ON i.id = lb.item_id
          WHERE ($3::text IS NULL OR i.category::text = $3)
            AND ($4::text IS NULL OR i.name_ar ILIKE '%' || $4 || '%' OR i.item_code ILIKE '%' || $4 || '%')
            AND ($5::boolean = false OR lb.qty_minor > 0.0005)
        )
        SELECT
          COUNT(*)                                                           AS "itemCount",
          SUM(CASE $6::text
            WHEN 'minor'  THEN qty_minor
            WHEN 'medium' THEN ROUND(qty_minor / NULLIF(medium_to_minor, 0), 4)
            ELSE               ROUND(qty_minor / NULLIF(major_to_minor,  0), 4)
          END)                                                               AS "totalQty",
          SUM(ROUND(
            CASE $6::text WHEN 'minor' THEN ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * ROUND(purchase_price_major / NULLIF(major_to_minor, 0), 4)
              WHEN 'medium' THEN ROUND(qty_minor / NULLIF(medium_to_minor, 0), 4) * ROUND(purchase_price_major / NULLIF(major_to_medium, 0), 4)
              ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * purchase_price_major END, 2)) AS "totalCost",
          SUM(ROUND(
            CASE $6::text WHEN 'minor' THEN ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * ROUND(sale_price_major / NULLIF(major_to_minor, 0), 4)
              WHEN 'medium' THEN ROUND(qty_minor / NULLIF(medium_to_minor, 0), 4) * ROUND(sale_price_major / NULLIF(major_to_medium, 0), 4)
              ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * sale_price_major END, 2))     AS "totalSaleValue"
        FROM enriched
      `, [asOfDate, warehouseId, catFilter, searchFilter, skipZero, unitLevel]);

      const summary = summaryResult.rows[0] || {};

      return res.json({
        rows:     result.rows.map(r => ({ ...r, _total: undefined })),
        total,
        page:     pageNum,
        pageSize: pageSz,
        summary: {
          itemCount:      parseInt(summary.itemCount    || "0", 10),
          totalQty:       parseFloat(summary.totalQty   || "0"),
          totalCost:      parseFloat(summary.totalCost  || "0"),
          totalSaleValue: parseFloat(summary.totalSaleValue || "0"),
        },
      });
    } catch (err: any) {
      logger.error({ err: err.message }, "[WAREHOUSE_BALANCE_REPORT] failed");
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Excel export for warehouse balance ──────────────────────────────────────
  app.get("/api/reports/warehouse-balance/export", requireAuth, async (req, res) => {
    try {
      const {
        warehouseId, asOfDate,
        category = "all", unitLevel = "major",
        search = "", excludeZero = "true",
      } = req.query as Record<string, string>;

      if (!warehouseId || !asOfDate) return res.status(400).json({ message: "warehouseId و asOfDate مطلوبان" });

      const catFilter    = category === "all" ? null : category;
      const searchFilter = search.trim() || null;
      const skipZero     = excludeZero !== "false";

      const result = await pool.query(`
        WITH lot_balance AS (
          SELECT
            il.item_id,
            COALESCE(ilm.warehouse_id, il.warehouse_id) AS warehouse_id,
            SUM(ilm.qty_change_in_minor)                AS qty_minor,
            SUM(CASE WHEN ilm.qty_change_in_minor > 0
                     THEN ilm.qty_change_in_minor * COALESCE(ilm.unit_cost, il.purchase_price)
                     ELSE 0 END)
              / NULLIF(SUM(CASE WHEN ilm.qty_change_in_minor > 0
                               THEN ilm.qty_change_in_minor ELSE 0 END), 0) AS avg_cost
          FROM inventory_lot_movements ilm
          JOIN inventory_lots il ON il.id = ilm.lot_id
          WHERE ilm.tx_date::date <= $1::date
            AND COALESCE(ilm.warehouse_id, il.warehouse_id) = $2
          GROUP BY il.item_id, COALESCE(ilm.warehouse_id, il.warehouse_id)
        ),
        converted AS (
          SELECT
            i.item_code,
            i.name_ar,
            COALESCE(i.name_en, '')                                AS name_en,
            i.category,
            w.name_ar                                              AS warehouse_name,
            CASE $3::text WHEN 'minor' THEN COALESCE(i.minor_unit_name, i.major_unit_name)
                          WHEN 'medium' THEN COALESCE(i.medium_unit_name, i.major_unit_name)
                          ELSE COALESCE(i.major_unit_name, 'وحدة') END AS unit_label,
            CASE $3::text
              WHEN 'minor'  THEN lb.qty_minor
              WHEN 'medium' THEN ROUND(lb.qty_minor / NULLIF(COALESCE(i.medium_to_minor::numeric,1), 0), 4)
              ELSE               ROUND(lb.qty_minor / NULLIF(COALESCE(i.major_to_minor::numeric, 1), 0), 4)
            END AS qty_display,
            CASE $3::text
              WHEN 'minor'  THEN ROUND(i.purchase_price_last::numeric / NULLIF(COALESCE(i.major_to_minor::numeric,1), 0), 4)
              WHEN 'medium' THEN ROUND(i.purchase_price_last::numeric / NULLIF(COALESCE(i.major_to_medium::numeric,1), 0), 4)
              ELSE i.purchase_price_last::numeric END AS purchase_price_unit,
            CASE $3::text
              WHEN 'minor'  THEN ROUND(i.sale_price_current::numeric / NULLIF(COALESCE(i.major_to_minor::numeric,1), 0), 4)
              WHEN 'medium' THEN ROUND(i.sale_price_current::numeric / NULLIF(COALESCE(i.major_to_medium::numeric,1), 0), 4)
              ELSE i.sale_price_current::numeric END AS sale_price_unit
          FROM lot_balance lb
          JOIN items i   ON i.id = lb.item_id
          JOIN warehouses w ON w.id = lb.warehouse_id
          WHERE ($4::text IS NULL OR i.category::text = $4)
            AND ($5::text IS NULL OR i.name_ar ILIKE '%' || $5 || '%' OR i.item_code ILIKE '%' || $5 || '%')
            AND ($6::boolean = false OR lb.qty_minor > 0.0005)
        )
        SELECT *, ROUND(qty_display * purchase_price_unit, 2) AS total_cost,
                  ROUND(qty_display * sale_price_unit, 2) AS total_sale_value
        FROM converted
        ORDER BY name_ar
      `, [asOfDate, warehouseId, unitLevel, catFilter, searchFilter, skipZero]);

      const unitLabel = unitLevel === "minor" ? "صغرى" : unitLevel === "medium" ? "متوسطة" : "كبرى";
      const catLabel  = category  === "drug"  ? "أدوية" : category  === "supply"  ? "مستهلكات" : "الكل";

      const wsData = [
        [`تقرير رصيد مخزن في تاريخ: ${asOfDate}`],
        [`المخزن: ${result.rows[0]?.warehouse_name || warehouseId}`, `نوع الصنف: ${catLabel}`, `الوحدة: ${unitLabel}`],
        [],
        ["كود الصنف", "اسم الصنف (عربي)", "اسم الصنف (إنجليزي)", "النوع", "المخزن", "الوحدة", "الكمية", "سعر الشراء", "سعر البيع", "إجمالي التكلفة", "إجمالي قيمة البيع"],
        ...result.rows.map(r => [
          r.item_code, r.name_ar, r.name_en,
          r.category === "drug" ? "دواء" : "مستهلك",
          r.warehouse_name, r.unit_label,
          parseFloat(r.qty_display), parseFloat(r.purchase_price_unit),
          parseFloat(r.sale_price_unit), parseFloat(r.total_cost), parseFloat(r.total_sale_value),
        ]),
        [],
        ["", "", "", "", "", "الإجماليات",
          result.rows.reduce((s, r) => s + parseFloat(r.qty_display), 0),
          "", "",
          result.rows.reduce((s, r) => s + parseFloat(r.total_cost), 0),
          result.rows.reduce((s, r) => s + parseFloat(r.total_sale_value), 0),
        ],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [10, 30, 20, 10, 15, 10, 10, 12, 12, 14, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, "رصيد المخزن");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="warehouse-balance-${asOfDate}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      logger.error({ err: err.message }, "[WAREHOUSE_BALANCE_EXPORT] failed");
      return res.status(500).json({ message: err.message });
    }
  });

}
