import { pool } from "../db";
import type { DashboardParams, DashboardRow, DisplayUnit, WarehouseStockRow } from "./shortage-types";
import {
  safeSortCol,
  buildQtyDisplayExpr,
  buildAvgDailyDisplayExpr,
  buildDisplayUnitNameExpr,
  buildStatusFilter,
} from "./shortage-helpers";

export async function getDashboard(params: DashboardParams): Promise<{
  rows: DashboardRow[];
  total: number;
}> {
  const {
    mode, displayUnit, fromDate, toDate,
    categories, status, search, warehouseId,
    showResolved = false,
    excludeOrdered  = true,
    showOrderedOnly = false,
    orderedFromDate = null,
    orderedToDate   = null,
    page, limit,
    sortBy, sortDir,
  } = params;

  const offset = (page - 1) * limit;
  const safeSort = safeSortCol(sortBy);
  const safeDir  = sortDir === "asc" ? "ASC" : "DESC";

  const fromTs   = new Date(fromDate);
  const toTs     = new Date(toDate);
  const dayCount = Math.max(
    1,
    Math.round((toTs.getTime() - fromTs.getTime()) / 86_400_000) + 1
  );

  const qtyDisplayExpr = buildQtyDisplayExpr("inv.total_qty_minor", displayUnit);
  const avgDailyDisplayExpr = buildAvgDailyDisplayExpr(dayCount, displayUnit);
  const displayUnitNameExpr = buildDisplayUnitNameExpr(displayUnit);

  const values: unknown[] = [];
  function push(v: unknown) { values.push(v); return `$${values.length}`; }

  const whereClauses: string[] = [];

  if (categories && categories.length > 0) {
    whereClauses.push(`i.category::text = ANY(${push(categories)}::text[])`);
  }
  if (search) {
    const s = `%${search.trim()}%`;
    whereClauses.push(`(i.name_ar ILIKE ${push(s)} OR i.item_code ILIKE ${push(s)})`);
  }

  if (showOrderedOnly) {
    whereClauses.push(`
      EXISTS (
        SELECT 1 FROM shortage_followups sf_chk
        WHERE sf_chk.item_id     = i.id
          AND sf_chk.action_type = 'ordered_from_supplier'
          AND sf_chk.follow_up_due_date > NOW()
      )
    `);
  } else if (excludeOrdered) {
    whereClauses.push(`
      NOT EXISTS (
        SELECT 1 FROM shortage_followups sf_chk
        WHERE sf_chk.item_id     = i.id
          AND sf_chk.action_type = 'ordered_from_supplier'
          AND sf_chk.follow_up_due_date > NOW()
      )
    `);
  }

  if (orderedFromDate || orderedToDate) {
    let datePart = "";
    if (orderedFromDate) datePart += ` AND sf_chk2.action_at >= ${push(orderedFromDate)}::date`;
    if (orderedToDate)   datePart += ` AND sf_chk2.action_at <  (${push(orderedToDate)}::date + INTERVAL '1 day')`;
    whereClauses.push(`
      EXISTS (
        SELECT 1 FROM shortage_followups sf_chk2
        WHERE sf_chk2.item_id     = i.id
          AND sf_chk2.action_type = 'ordered_from_supplier'
          ${datePart}
      )
    `);
  }

  let modeJoin   = "";
  let modeFrom   = "";
  let modeSelect = "";

  if (mode === "shortage_driven") {
    modeFrom   = "shortage_agg sa";
    modeJoin   = "JOIN items i ON i.id = sa.item_id";
    modeSelect = `
      sa.request_count,
      sa.recent_request_count  AS recent_7d_requests,
      sa.first_requested_at,
      sa.last_requested_at,
      sa.requesting_warehouse_ids,
      sa.is_resolved,
    `;
    whereClauses.push(`sa.is_resolved = ${push(showResolved)}`);
    if (warehouseId) {
      whereClauses.push(`sa.requesting_warehouse_ids::jsonb ? ${push(warehouseId)}`);
    }
  } else {
    modeFrom   = "items i";
    modeJoin   = "LEFT JOIN shortage_agg sa ON sa.item_id = i.id";
    modeSelect = `
      COALESCE(sa.request_count, 0)        AS request_count,
      COALESCE(sa.recent_request_count, 0) AS recent_7d_requests,
      sa.first_requested_at,
      sa.last_requested_at,
      COALESCE(sa.requesting_warehouse_ids, '[]') AS requesting_warehouse_ids,
      COALESCE(sa.is_resolved, false)      AS is_resolved,
    `;
    whereClauses.push(`i.is_active = true`);
    if (warehouseId) {
      whereClauses.push(`
        EXISTS (
          SELECT 1 FROM rpt_inventory_snapshot rpt_wh
          WHERE rpt_wh.item_id       = i.id
            AND rpt_wh.warehouse_id  = ${push(warehouseId)}
            AND rpt_wh.snapshot_date = (SELECT MAX(snapshot_date) FROM rpt_inventory_snapshot)
        )
      `);
    }
  }

  const whereSQL = whereClauses.length > 0
    ? `WHERE ${whereClauses.join("\n  AND ")}`
    : "";

  let statusWhereSQL = "";
  if (status) {
    statusWhereSQL = buildStatusFilter(status);
  }

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
        WHERE rms.movement_date BETWEEN ${push(fromDate)} AND ${push(toDate)}
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
          ${modeSelect}

          COALESCE(inv.total_qty_minor, 0)::numeric          AS total_qty_minor,
          COALESCE(inv.warehouses_with_stock, 0)             AS warehouses_with_stock,

          ${qtyDisplayExpr}                                   AS qty_display,

          ${displayUnitNameExpr}                              AS display_unit_name,

          COALESCE(s.total_issued_minor, 0)::numeric         AS total_issued_minor,
          COALESCE(s.active_sales_days, 0)                   AS active_sales_days,

          CASE WHEN ${push(dayCount)} > 0
               THEN ROUND(COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}, 3)
               ELSE 0
          END                                                 AS avg_daily_minor,

          ${avgDailyDisplayExpr}                              AS avg_daily_display,

          CASE
            WHEN COALESCE(s.total_issued_minor, 0) > 0 AND ${push(dayCount)} > 0
            THEN ROUND(
                   COALESCE(inv.total_qty_minor, 0)::numeric
                   / (COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}),
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
                AND ${push(dayCount)} > 0
                AND COALESCE(inv.total_qty_minor, 0)::numeric
                    / (COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}) < 7
              )
              OR (
                COALESCE(sa.recent_request_count, 0) >= 3
                AND COALESCE(s.total_issued_minor, 0) > 0
                AND ${push(dayCount)} > 0
                AND COALESCE(inv.total_qty_minor, 0)::numeric
                    / (COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}) < 14
              )
            )
              THEN 'high_demand'

            WHEN COALESCE(s.total_issued_minor, 0) > 0
              AND ${push(dayCount)} > 0
              AND COALESCE(inv.total_qty_minor, 0)::numeric
                  / (COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}) < 14
              THEN 'low_stock'

            ELSE 'normal'
          END                                                 AS status_flag,

          lf.id                   AS followup_id,
          lf.action_type          AS followup_action_type,
          lf.follow_up_due_date   AS followup_due_date,
          lf.action_at            AS followup_action_at

        FROM ${modeFrom}
        ${modeJoin}
        LEFT JOIN inv          ON inv.item_id  = i.id
        LEFT JOIN sales s      ON s.item_id    = i.id
        LEFT JOIN latest_followup lf ON lf.item_id = i.id
        ${whereSQL}
      )
    SELECT
      base.*,
      COUNT(*) OVER() AS total_count
    FROM base
    ${statusWhereSQL}
    ORDER BY ${safeSort} ${safeDir} NULLS LAST
    LIMIT  ${push(limit)}
    OFFSET ${push(offset)}
  `;

  const result = await pool.query(baseSQL, values);

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

export async function getWarehouseStock(
  itemId: string,
  displayUnit: DisplayUnit
): Promise<WarehouseStockRow[]> {
  const qtyExpr = buildQtyDisplayExpr("rpt.qty_in_minor", displayUnit);
  const unitExpr = buildDisplayUnitNameExpr(displayUnit);

  const result = await pool.query(
    `SELECT
       rpt.warehouse_id,
       rpt.warehouse_name,
       rpt.qty_in_minor::float8       AS qty_in_minor,
       ${qtyExpr}::float8             AS qty_display,
       ${unitExpr}                    AS display_unit
     FROM rpt_inventory_snapshot rpt
     JOIN items i ON i.id = rpt.item_id
     WHERE rpt.item_id      = $1
       AND rpt.snapshot_date = (
             SELECT MAX(snapshot_date) FROM rpt_inventory_snapshot
           )
       AND rpt.qty_in_minor > 0
     ORDER BY rpt.qty_in_minor DESC`,
    [itemId]
  );

  return result.rows.map((r) => ({
    warehouseId:   r.warehouse_id,
    warehouseName: r.warehouse_name,
    qtyInMinor:    parseFloat(r.qty_in_minor) || 0,
    qtyDisplay:    parseFloat(r.qty_display) || 0,
    displayUnit:   r.display_unit,
  }));
}
