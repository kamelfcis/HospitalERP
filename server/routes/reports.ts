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
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./_auth";
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
      console.error("[reports] item-movements error:", msg);
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

}
