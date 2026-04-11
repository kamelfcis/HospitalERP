import { db } from "../db";
import { sql } from "drizzle-orm";
import type { RptRefreshResult } from "./rpt-refresh-storage";

const methods = {

  async refreshInventorySnapshot(): Promise<RptRefreshResult> {
    const start = Date.now();

    const result = await db.execute(sql`
      INSERT INTO rpt_inventory_snapshot (
        snapshot_date,
        item_id, item_code, item_name, item_category, has_expiry,
        warehouse_id, warehouse_code, warehouse_name,
        qty_in_minor, active_lot_count,
        expired_qty, expiring_30d_qty, expiring_90d_qty,
        earliest_expiry_date, nearest_expiry_lot_id,
        avg_unit_cost, total_cost_value, total_sale_value,
        refreshed_at
      )
      SELECT
        CURRENT_DATE,
        i.id,
        i.item_code,
        i.name_ar,
        i.category::text,
        i.has_expiry,
        w.id,
        w.warehouse_code,
        w.name_ar,

        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0), 0),

        COUNT(il.id)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0),

        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date < CURRENT_DATE), 0),

        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date >= CURRENT_DATE
                    AND il.expiry_date <= CURRENT_DATE + 30), 0),

        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date >= CURRENT_DATE
                    AND il.expiry_date <= CURRENT_DATE + 90), 0),

        MIN(il.expiry_date)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date >= CURRENT_DATE),

        (SELECT il2.id
         FROM   inventory_lots il2
         WHERE  il2.item_id    = i.id
           AND  il2.warehouse_id = w.id
           AND  il2.is_active  = true
           AND  il2.qty_in_minor::numeric > 0
           AND  il2.expiry_date IS NOT NULL
           AND  il2.expiry_date >= CURRENT_DATE
         ORDER BY il2.expiry_date ASC
         LIMIT 1),

        CASE
          WHEN SUM(il.qty_in_minor::numeric)
               FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0) > 0
          THEN SUM((il.qty_in_minor * il.purchase_price)::numeric)
               FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0)
             / SUM(il.qty_in_minor::numeric)
               FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0)
          ELSE NULL
        END,

        COALESCE(SUM((il.qty_in_minor * il.purchase_price)::numeric)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0), 0),

        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0), 0)
          * i.sale_price_current::numeric,

        NOW()

      FROM  inventory_lots il
      JOIN  items      i ON i.id  = il.item_id      AND i.is_active = true
      JOIN  warehouses w ON w.id  = il.warehouse_id

      GROUP BY
        i.id, i.item_code, i.name_ar, i.category, i.has_expiry, i.sale_price_current,
        w.id, w.warehouse_code, w.name_ar

      ON CONFLICT (snapshot_date, item_id, warehouse_id) DO UPDATE SET
        qty_in_minor          = EXCLUDED.qty_in_minor,
        active_lot_count      = EXCLUDED.active_lot_count,
        expired_qty           = EXCLUDED.expired_qty,
        expiring_30d_qty      = EXCLUDED.expiring_30d_qty,
        expiring_90d_qty      = EXCLUDED.expiring_90d_qty,
        earliest_expiry_date  = EXCLUDED.earliest_expiry_date,
        nearest_expiry_lot_id = EXCLUDED.nearest_expiry_lot_id,
        avg_unit_cost         = EXCLUDED.avg_unit_cost,
        total_cost_value      = EXCLUDED.total_cost_value,
        total_sale_value      = EXCLUDED.total_sale_value,
        item_name             = EXCLUDED.item_name,
        item_category         = EXCLUDED.item_category,
        item_code             = EXCLUDED.item_code,
        warehouse_name        = EXCLUDED.warehouse_name,
        warehouse_code        = EXCLUDED.warehouse_code,
        refreshed_at          = EXCLUDED.refreshed_at
    `);

    await db.execute(sql`
      DELETE FROM rpt_inventory_snapshot
      WHERE snapshot_date < CURRENT_DATE
    `);

    const durationMs = Date.now() - start;
    const upserted   = Number((result as any).rowCount ?? 0);

    return { upserted, durationMs, ranAt: new Date().toISOString() };
  },

  async refreshItemMovementsSummary(): Promise<RptRefreshResult> {
    const start = Date.now();

    const result = await db.execute(sql`
      WITH src AS (
        SELECT
          ilm.tx_date::date   AS tx_day,
          il.item_id,
          i.name_ar           AS item_name,
          i.category::text    AS item_category,
          ilm.warehouse_id,
          w.name_ar           AS warehouse_name,
          ilm.tx_type,
          ilm.reference_type,
          ilm.qty_change_in_minor,
          COALESCE(ilm.unit_cost, 0) AS unit_cost
        FROM inventory_lot_movements ilm
        JOIN inventory_lots  il ON il.id = ilm.lot_id
        JOIN items           i  ON i.id  = il.item_id
        JOIN warehouses      w  ON w.id  = ilm.warehouse_id
      )
      INSERT INTO rpt_item_movements_summary (
        movement_date, period_year, period_month,
        item_id, item_name, item_category,
        warehouse_id, warehouse_name,
        received_qty, received_value, receipt_tx_count,
        issued_qty, issued_value, issue_tx_count,
        transfer_in_qty, transfer_out_qty,
        return_in_qty, return_out_qty,
        adjustment_qty,
        net_qty_change,
        refreshed_at
      )
      SELECT
        tx_day                                                           AS movement_date,
        EXTRACT(YEAR  FROM tx_day)::smallint                            AS period_year,
        EXTRACT(MONTH FROM tx_day)::smallint                            AS period_month,
        item_id,
        item_name,
        item_category,
        warehouse_id,
        warehouse_name,

        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'receiving'
                 THEN qty_change_in_minor ELSE 0 END)                   AS received_qty,
        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'receiving'
                 THEN qty_change_in_minor * unit_cost
                 ELSE 0 END)                                             AS received_value,
        COUNT(CASE WHEN tx_type = 'in'  AND reference_type = 'receiving'
                   THEN 1 END)::integer                                  AS receipt_tx_count,

        SUM(CASE WHEN tx_type = 'out'
                  AND reference_type IN ('sales_invoice', 'patient_invoice')
                 THEN -qty_change_in_minor ELSE 0 END)                  AS issued_qty,
        SUM(CASE WHEN tx_type = 'out'
                  AND reference_type IN ('sales_invoice', 'patient_invoice')
                 THEN -qty_change_in_minor * unit_cost
                 ELSE 0 END)                                             AS issued_value,
        COUNT(CASE WHEN tx_type = 'out'
                    AND reference_type IN ('sales_invoice', 'patient_invoice')
                   THEN 1 END)::integer                                  AS issue_tx_count,

        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'transfer'
                 THEN qty_change_in_minor ELSE 0 END)                   AS transfer_in_qty,

        SUM(CASE WHEN tx_type = 'out' AND reference_type = 'transfer'
                 THEN -qty_change_in_minor ELSE 0 END)                  AS transfer_out_qty,

        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'sales_return'
                 THEN qty_change_in_minor ELSE 0 END)                   AS return_in_qty,

        SUM(CASE WHEN tx_type = 'out' AND reference_type = 'sales_return'
                 THEN -qty_change_in_minor ELSE 0 END)                  AS return_out_qty,

        SUM(CASE WHEN tx_type = 'adj'
                 THEN qty_change_in_minor ELSE 0 END)                   AS adjustment_qty,

        SUM(qty_change_in_minor)                                         AS net_qty_change,

        NOW()                                                            AS refreshed_at

      FROM src
      GROUP BY
        tx_day,
        item_id, item_name, item_category,
        warehouse_id, warehouse_name

      ON CONFLICT (movement_date, item_id, warehouse_id) DO UPDATE SET
        item_name        = EXCLUDED.item_name,
        item_category    = EXCLUDED.item_category,
        warehouse_name   = EXCLUDED.warehouse_name,
        received_qty     = EXCLUDED.received_qty,
        received_value   = EXCLUDED.received_value,
        receipt_tx_count = EXCLUDED.receipt_tx_count,
        issued_qty       = EXCLUDED.issued_qty,
        issued_value     = EXCLUDED.issued_value,
        issue_tx_count   = EXCLUDED.issue_tx_count,
        transfer_in_qty  = EXCLUDED.transfer_in_qty,
        transfer_out_qty = EXCLUDED.transfer_out_qty,
        return_in_qty    = EXCLUDED.return_in_qty,
        return_out_qty   = EXCLUDED.return_out_qty,
        adjustment_qty   = EXCLUDED.adjustment_qty,
        net_qty_change   = EXCLUDED.net_qty_change,
        refreshed_at     = EXCLUDED.refreshed_at
    `);

    const durationMs = Date.now() - start;
    const upserted   = Number((result as any).rowCount ?? 0);

    return {
      upserted,
      durationMs,
      ranAt: new Date().toISOString(),
    };
  },
};

export default methods;
