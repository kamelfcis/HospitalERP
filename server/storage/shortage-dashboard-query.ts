import { pool } from "../db";
import type { DashboardParams, DashboardRow } from "./shortage-types";
import { buildDashboardFilters } from "./shortage-dashboard-filters";

export async function executeDashboardQuery(params: DashboardParams): Promise<{
  rows: DashboardRow[];
  total: number;
}> {
  const f = buildDashboardFilters(params);

  const whereSQL = f.whereClauses.length > 0
    ? `WHERE ${f.whereClauses.join("\n  AND ")}`
    : "";

  const baseSQL = `
    WITH
      latest_snap AS (
        SELECT MAX(snapshot_date) AS d FROM rpt_inventory_snapshot
      ),
      latest_followup AS (
        SELECT DISTINCT ON (item_id)
          id, item_id, action_type, action_at, follow_up_due_date
        FROM shortage_followups
        ORDER BY item_id, action_at DESC
      ),
      inv AS (
        SELECT
          rpt.item_id,
          SUM(rpt.qty_in_minor)                                                 AS total_qty_minor,
          COUNT(CASE WHEN rpt.qty_in_minor > 0 THEN 1 END)::int                AS warehouses_with_stock
        FROM rpt_inventory_snapshot rpt
        WHERE rpt.snapshot_date = (SELECT d FROM latest_snap)
        GROUP BY rpt.item_id
      ),
      sales AS (
        SELECT
          rms.item_id,
          SUM(rms.issued_qty)                                                   AS total_issued_minor,
          COUNT(DISTINCT rms.movement_date) FILTER (WHERE rms.issued_qty > 0)  AS active_sales_days
        FROM rpt_item_movements_summary rms
        WHERE rms.movement_date BETWEEN ${f.push(params.fromDate)} AND ${f.push(params.toDate)}
        GROUP BY rms.item_id
      ),
      base AS (
        SELECT
          i.id            AS item_id,
          i.item_code,
          i.name_ar       AS item_name,
          i.category::text AS category,
          i.major_unit_name,
          i.medium_unit_name,
          i.minor_unit_name,
          i.major_to_minor::numeric,
          i.medium_to_minor::numeric,
          i.sale_price_current::numeric AS sale_price_current,
          ${f.modeSelect}

          COALESCE(inv.total_qty_minor, 0)::numeric          AS total_qty_minor,
          COALESCE(inv.warehouses_with_stock, 0)             AS warehouses_with_stock,

          ${f.qtyDisplayExpr}                                   AS qty_display,

          ${f.displayUnitNameExpr}                              AS display_unit_name,

          COALESCE(s.total_issued_minor, 0)::numeric         AS total_issued_minor,
          COALESCE(s.active_sales_days, 0)                   AS active_sales_days,

          CASE WHEN ${f.push(f.dayCount)} > 0
               THEN ROUND(COALESCE(s.total_issued_minor, 0)::numeric / ${f.push(f.dayCount)}, 3)
               ELSE 0
          END                                                 AS avg_daily_minor,

          ${f.avgDailyDisplayExpr}                              AS avg_daily_display,

          CASE
            WHEN COALESCE(s.total_issued_minor, 0) > 0 AND ${f.push(f.dayCount)} > 0
            THEN ROUND(
                   COALESCE(inv.total_qty_minor, 0)::numeric
                   / (COALESCE(s.total_issued_minor, 0)::numeric / ${f.push(f.dayCount)}),
                   1)
            ELSE NULL
          END                                                 AS days_of_coverage,

          CASE
            WHEN COALESCE(inv.total_qty_minor, 0) = 0
              THEN 'not_available'

            WHEN COALESCE(inv.total_qty_minor, 0) > 0
              AND (
                    COALESCE(sa.requesting_warehouse_ids, '[]')::jsonb <> '[]'::jsonb
                    AND NOT EXISTS (
                      SELECT 1 FROM rpt_inventory_snapshot rpt2
                      WHERE rpt2.item_id        = i.id
                        AND rpt2.snapshot_date  = (SELECT d FROM latest_snap)
                        AND rpt2.qty_in_minor   > 0
                        AND rpt2.warehouse_id   = ANY (
                              SELECT jsonb_array_elements_text(
                                COALESCE(sa.requesting_warehouse_ids, '[]')::jsonb
                              )
                            )
                    )
                  )
              THEN 'available_elsewhere'

            WHEN (
              (
                COALESCE(s.total_issued_minor, 0) > 0
                AND ${f.push(f.dayCount)} > 0
                AND COALESCE(inv.total_qty_minor, 0)::numeric
                    / (COALESCE(s.total_issued_minor, 0)::numeric / ${f.push(f.dayCount)}) < 7
              )
              OR (
                COALESCE(sa.recent_request_count, 0) >= 3
                AND COALESCE(s.total_issued_minor, 0) > 0
                AND ${f.push(f.dayCount)} > 0
                AND COALESCE(inv.total_qty_minor, 0)::numeric
                    / (COALESCE(s.total_issued_minor, 0)::numeric / ${f.push(f.dayCount)}) < 14
              )
            )
              THEN 'high_demand'

            WHEN COALESCE(s.total_issued_minor, 0) > 0
              AND ${f.push(f.dayCount)} > 0
              AND COALESCE(inv.total_qty_minor, 0)::numeric
                  / (COALESCE(s.total_issued_minor, 0)::numeric / ${f.push(f.dayCount)}) < 14
              THEN 'low_stock'

            ELSE 'normal'
          END                                                 AS status_flag,

          lf.id                   AS followup_id,
          lf.action_type          AS followup_action_type,
          lf.follow_up_due_date   AS followup_due_date,
          lf.action_at            AS followup_action_at

        FROM ${f.modeFrom}
        ${f.modeJoin}
        LEFT JOIN inv          ON inv.item_id  = i.id
        LEFT JOIN sales s      ON s.item_id    = i.id
        LEFT JOIN latest_followup lf ON lf.item_id = i.id
        ${whereSQL}
      )
    SELECT
      base.*,
      COUNT(*) OVER() AS total_count
    FROM base
    ${f.statusWhereSQL}
    ORDER BY ${f.safeSort} ${f.safeDir} NULLS LAST
    LIMIT  ${f.push(f.limit)}
    OFFSET ${f.push(f.offset)}
  `;

  const result = await pool.query(baseSQL, f.values);

  const rows: DashboardRow[] = result.rows.map((r) => ({
    itemId:                r.item_id,
    itemCode:              r.item_code,
    itemName:              r.item_name,
    category:              r.category,
    majorUnitName:         r.major_unit_name,
    mediumUnitName:        r.medium_unit_name,
    minorUnitName:         r.minor_unit_name,
    majorToMinor:          r.major_to_minor != null ? parseFloat(r.major_to_minor) : null,
    mediumToMinor:         r.medium_to_minor != null ? parseFloat(r.medium_to_minor) : null,
    displayUnitName:       r.display_unit_name,
    salePriceCurrent:      parseFloat(r.sale_price_current) || 0,
    requestCount:          parseInt(r.request_count) || 0,
    recent7dRequests:      parseInt(r.recent_7d_requests) || 0,
    firstRequestedAt:      r.first_requested_at ?? null,
    lastRequestedAt:       r.last_requested_at ?? null,
    isResolved:            Boolean(r.is_resolved),
    totalQtyMinor:         parseFloat(r.total_qty_minor) || 0,
    warehousesWithStock:   parseInt(r.warehouses_with_stock) || 0,
    qtyDisplay:            parseFloat(r.qty_display) || 0,
    totalIssuedMinor:      parseFloat(r.total_issued_minor) || 0,
    activeSalesDays:       parseInt(r.active_sales_days) || 0,
    avgDailyMinor:         parseFloat(r.avg_daily_minor) || 0,
    avgDailyDisplay:       parseFloat(r.avg_daily_display) || 0,
    daysOfCoverage:        r.days_of_coverage != null ? parseFloat(r.days_of_coverage) : null,
    statusFlag:            r.status_flag,
    totalCount:            parseInt(r.total_count) || 0,
    followupId:            r.followup_id ?? null,
    followupActionType:    r.followup_action_type ?? null,
    followupDueDate:       r.followup_due_date ? new Date(r.followup_due_date).toISOString() : null,
    followupActionAt:      r.followup_action_at ? new Date(r.followup_action_at).toISOString() : null,
  }));

  const total = rows[0]?.totalCount ?? 0;
  return { rows, total };
}
