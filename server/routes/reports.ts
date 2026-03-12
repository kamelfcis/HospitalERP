/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Reports Routes — تقارير المخزون والحركات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  GET /api/reports/item-movements
 *  ─────────────────────────────────
 *  تقرير حركات الأصناف بين تاريخين.
 *  مصدر البيانات: rpt_item_movements_summary (daily grain)
 *  الحسابات:
 *    current_qty   = rpt_inventory_snapshot.qty_in_minor  (اللحظي)
 *    closing_qty   = current_qty − SUM(net_qty_change WHERE date > toDate)
 *    opening_qty   = closing_qty − SUM(net_qty_change WHERE fromDate ≤ date ≤ toDate)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./_auth";

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
  // Opening/closing walk-back logic (locked design):
  //   current_qty     = rpt_inventory_snapshot.qty_in_minor
  //   net_after_end   = SUM(rpt.net_qty_change WHERE movement_date > toDate)
  //   closing_qty     = current_qty − net_after_end
  //   in_period_net   = SUM(rpt.net_qty_change WHERE fromDate ≤ date ≤ toDate)
  //   opening_qty     = closing_qty − in_period_net
  //
  app.get("/api/reports/item-movements", requireAuth, async (req, res) => {
    try {
      const { fromDate, toDate, itemId, warehouseId } = req.query as Record<string, string | undefined>;

      if (!fromDate || !toDate) {
        return res.status(400).json({ error: "fromDate و toDate مطلوبان" });
      }

      // Basic date format validation
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

          -- حركات الفترة
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

          -- الرصيد اللحظي من snapshot
          COALESCE(snap.qty_in_minor, 0)::numeric                       AS "currentQty",

          -- الرصيد الختامي = اللحظي - حركات ما بعد الفترة
          (COALESCE(snap.qty_in_minor, 0) - COALESCE(ap.net_after_end, 0))::numeric
                                                                         AS "closingQty",

          -- الرصيد الافتتاحي = الختامي - صافي حركات الفترة
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

}
