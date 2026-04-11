import type { DisplayUnit } from "./shortage-types";

const ALLOWED_SORT = new Set([
  "request_count", "recent_7d_requests", "last_requested_at",
  "first_requested_at", "total_qty_minor", "qty_display",
  "days_of_coverage", "avg_daily_display", "item_code", "item_name",
  "status_flag",
]);

export function safeSortCol(col: string): string {
  return ALLOWED_SORT.has(col) ? col : "request_count";
}

export function buildQtyDisplayExpr(colMinor: string, unit: DisplayUnit): string {
  if (unit === "major") {
    return `ROUND(${colMinor}::numeric / NULLIF(i.major_to_minor::numeric, 0), 2)`;
  }
  if (unit === "medium") {
    return `ROUND(${colMinor}::numeric / NULLIF(i.medium_to_minor::numeric, 0), 2)`;
  }
  return `ROUND(${colMinor}::numeric, 2)`;
}

export function buildAvgDailyDisplayExpr(dayCount: number, unit: DisplayUnit): string {
  const days = `${dayCount}`;
  const base = `COALESCE(s.total_issued_minor, 0)::numeric`;
  if (unit === "major") {
    return `CASE WHEN ${days} > 0 AND i.major_to_minor::numeric > 0
                 THEN ROUND(${base} / (${days} * i.major_to_minor::numeric), 3)
                 ELSE 0 END`;
  }
  if (unit === "medium") {
    return `CASE WHEN ${days} > 0 AND i.medium_to_minor::numeric > 0
                 THEN ROUND(${base} / (${days} * i.medium_to_minor::numeric), 3)
                 ELSE 0 END`;
  }
  return `CASE WHEN ${days} > 0 THEN ROUND(${base} / ${days}, 3) ELSE 0 END`;
}

export function buildDisplayUnitNameExpr(unit: DisplayUnit): string {
  if (unit === "major")  return `i.major_unit_name`;
  if (unit === "medium") return `COALESCE(i.medium_unit_name, i.minor_unit_name)`;
  return `i.minor_unit_name`;
}

export function buildStatusFilter(status: string): string {
  switch (status) {
    case "not_available":
      return "WHERE base.status_flag = 'not_available'";
    case "available_elsewhere":
      return "WHERE base.status_flag = 'available_elsewhere'";
    case "low_stock":
      return "WHERE base.status_flag = 'low_stock'";
    case "high_demand":
      return "WHERE base.status_flag = 'high_demand'";
    case "normal":
      return "WHERE base.status_flag = 'normal'";
    default:
      return "";
  }
}
