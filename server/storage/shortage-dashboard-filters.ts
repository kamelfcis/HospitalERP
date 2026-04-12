import type { DashboardParams } from "./shortage-types";
import {
  buildQtyDisplayExpr,
  buildAvgDailyDisplayExpr,
  buildDisplayUnitNameExpr,
  safeSortCol,
  buildStatusFilter,
} from "./shortage-helpers";

export interface DashboardFilterResult {
  values: unknown[];
  whereClauses: string[];
  modeJoin: string;
  modeFrom: string;
  modeSelect: string;
  qtyDisplayExpr: string;
  avgDailyDisplayExpr: string;
  displayUnitNameExpr: string;
  dayCount: number;
  safeSort: string;
  safeDir: string;
  offset: number;
  limit: number;
  statusWhereSQL: string;
  push: (v: unknown) => string;
}

export function buildDashboardFilters(params: DashboardParams): DashboardFilterResult {
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

  let statusWhereSQL = "";
  if (status) {
    statusWhereSQL = buildStatusFilter(status);
  }

  return {
    values,
    whereClauses,
    modeJoin,
    modeFrom,
    modeSelect,
    qtyDisplayExpr,
    avgDailyDisplayExpr,
    displayUnitNameExpr,
    dayCount,
    safeSort,
    safeDir,
    offset,
    limit,
    statusWhereSQL,
    push,
  };
}
