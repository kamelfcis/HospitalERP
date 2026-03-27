/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Shortage Storage — طبقة البيانات لكشكول النواقص
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  الدوال الرئيسية:
 *
 *  recordShortage(params)
 *    يسجّل حدث نقص ويُحدَّث shortage_agg بـ UPSERT اتومي.
 *    مدمج مع duplicate guard: يرفض الطلب إذا كان نفس المستخدم طلب نفس الصنف
 *    خلال آخر 30 ثانية.
 *
 *  getDashboard(params)
 *    الـ query الرئيسي للوحة التحليل — وضعان:
 *      Mode 1 (shortage_driven): يبدأ من shortage_agg → مقيَّد بالأصناف الناقصة
 *      Mode 2 (full_analysis):   يبدأ من items → تحليل شامل
 *    كلاهما Server-side: فلترة + ترتيب + pagination.
 *    يعيد qty و avg_daily بالوحدة المختارة (major/medium/minor) من الـ backend.
 *
 *  getWarehouseStock(itemId)
 *    رصيد الصنف لكل مخزن — يُحمَّل بالـ lazy عند الضغط على الخلية.
 *
 *  resolveShortage(itemId, userId)
 *    يضع is_resolved = true في shortage_agg.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { pool } from "../db";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DisplayUnit = "major" | "medium" | "minor";
export type DashboardMode = "shortage_driven" | "full_analysis";
export type StatusFilter =
  | "not_available"
  | "available_elsewhere"
  | "low_stock"
  | "high_demand"
  | "normal"
  | null;

export interface RecordShortageParams {
  itemId:       string;
  warehouseId?: string | null;
  requestedBy:  string;
  sourceScreen: string;
  notes?:       string | null;
}

export interface DashboardParams {
  mode:          DashboardMode;
  displayUnit:   DisplayUnit;
  fromDate:      string;       // YYYY-MM-DD
  toDate:        string;       // YYYY-MM-DD
  category?:     string | null;
  status?:       StatusFilter;
  search?:       string | null;
  warehouseId?:  string | null;
  showResolved?: boolean;
  page:          number;
  limit:         number;
  sortBy:        string;
  sortDir:       "asc" | "desc";
}

export interface DashboardRow {
  itemId:                  string;
  itemCode:                string;
  itemName:                string;
  category:                string;
  majorUnitName:           string | null;
  mediumUnitName:          string | null;
  minorUnitName:           string | null;
  majorToMinor:            number | null;
  mediumToMinor:           number | null;
  displayUnitName:         string | null;
  salePriceCurrent:        number;
  requestCount:            number;
  recent7dRequests:        number;
  firstRequestedAt:        string | null;
  lastRequestedAt:         string | null;
  isResolved:              boolean;
  totalQtyMinor:           number;
  warehousesWithStock:     number;
  qtyDisplay:              number;
  totalIssuedMinor:        number;
  activeSalesDays:         number;
  avgDailyMinor:           number;
  avgDailyDisplay:         number;
  daysOfCoverage:          number | null;
  statusFlag:              string;
  totalCount:              number;
}

export interface WarehouseStockRow {
  warehouseId:   string;
  warehouseName: string;
  qtyInMinor:    number;
  qtyDisplay:    number;
  displayUnit:   string | null;
}

// ─── Allowed sort columns ────────────────────────────────────────────────────

const ALLOWED_SORT = new Set([
  "request_count", "recent_7d_requests", "last_requested_at",
  "first_requested_at", "total_qty_minor", "qty_display",
  "days_of_coverage", "avg_daily_display", "item_code", "item_name",
  "status_flag",
]);

function safeSortCol(col: string): string {
  return ALLOWED_SORT.has(col) ? col : "request_count";
}

// ─── recordShortage ───────────────────────────────────────────────────────────

export async function recordShortage(params: RecordShortageParams): Promise<{
  recorded: boolean;
  reason?: string;
}> {
  const { itemId, warehouseId, requestedBy, sourceScreen, notes } = params;

  // ── Duplicate guard — نفس المستخدم + نفس الصنف خلال 30 ثانية ────────────
  const dupCheck = await pool.query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM shortage_events
       WHERE item_id      = $1
         AND requested_by = $2
         AND requested_at > NOW() - INTERVAL '30 seconds'
     ) AS found`,
    [itemId, requestedBy]
  );
  if (dupCheck.rows[0]?.found) {
    return { recorded: false, reason: "duplicate" };
  }

  // ── Insert event ─────────────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO shortage_events (item_id, warehouse_id, requested_by, source_screen, notes, requested_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [itemId, warehouseId ?? null, requestedBy, sourceScreen, notes ?? null]
  );

  // ── UPSERT shortage_agg اتومي ───────────────────────────────────────────
  //
  // requesting_warehouse_ids: نبني JSON array من distinct warehouses.
  // نستخدم subquery من shortage_events للحصول على المصفوفة المحدَّثة.
  //
  await pool.query(
    `INSERT INTO shortage_agg (
       item_id,
       request_count,
       recent_request_count,
       first_requested_at,
       last_requested_at,
       requesting_warehouse_ids,
       is_resolved,
       refreshed_at
     )
     VALUES (
       $1,
       1,
       1,
       NOW(),
       NOW(),
       CASE WHEN $2::text IS NOT NULL THEN jsonb_build_array($2)::text ELSE '[]' END,
       false,
       NOW()
     )
     ON CONFLICT (item_id) DO UPDATE SET
       request_count        = shortage_agg.request_count + 1,
       recent_request_count = (
         SELECT COUNT(*)::int
         FROM   shortage_events
         WHERE  item_id      = $1
           AND  requested_at > NOW() - INTERVAL '7 days'
       ),
       last_requested_at    = NOW(),
       requesting_warehouse_ids = (
         SELECT COALESCE(
           (SELECT json_agg(DISTINCT warehouse_id)::text
            FROM   shortage_events
            WHERE  item_id      = $1
              AND  warehouse_id IS NOT NULL),
           '[]'
         )
       ),
       is_resolved          = false,
       refreshed_at         = NOW()`,
    [itemId, warehouseId ?? null]
  );

  return { recorded: true };
}

// ─── getDashboard ─────────────────────────────────────────────────────────────

export async function getDashboard(params: DashboardParams): Promise<{
  rows: DashboardRow[];
  total: number;
}> {
  const {
    mode, displayUnit, fromDate, toDate,
    category, status, search, warehouseId,
    showResolved = false,
    page, limit,
    sortBy, sortDir,
  } = params;

  const offset = (page - 1) * limit;
  const safeSort = safeSortCol(sortBy);
  const safeDir  = sortDir === "asc" ? "ASC" : "DESC";

  // أيام الفترة — يُستخدم في avg_daily وdays_of_coverage
  const fromTs   = new Date(fromDate);
  const toTs     = new Date(toDate);
  const dayCount = Math.max(
    1,
    Math.round((toTs.getTime() - fromTs.getTime()) / 86_400_000) + 1
  );

  // ── SQL للوحدة المعروضة ───────────────────────────────────────────────────
  //
  // الكميات تُخزَّن في الـ _rpt بوحدة minor دائماً.
  // نحوّل للوحدة المطلوبة في الـ backend لضمان صحة الـ sorting.
  //
  const qtyDisplayExpr = buildQtyDisplayExpr("inv.total_qty_minor", displayUnit);
  const avgDailyDisplayExpr = buildAvgDailyDisplayExpr(dayCount, displayUnit);
  const displayUnitNameExpr = buildDisplayUnitNameExpr(displayUnit);

  // ── بناء WHERE الإضافية ───────────────────────────────────────────────────
  const values: unknown[] = [];
  function push(v: unknown) { values.push(v); return `$${values.length}`; }

  const whereClauses: string[] = [];

  if (category)   whereClauses.push(`i.category::text = ${push(category)}`);
  if (search) {
    const s = `%${search.trim()}%`;
    whereClauses.push(`(i.name_ar ILIKE ${push(s)} OR i.item_code ILIKE ${push(s)})`);
  }

  // الفلاتر الخاصة بالـ Mode 1 (shortage_driven)
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
    // فلتر الحل
    whereClauses.push(`sa.is_resolved = ${push(showResolved)}`);
    // فلتر المخزن — نصنع وهناك رصيد في هذا المخزن تحديداً
    if (warehouseId) {
      whereClauses.push(`sa.requesting_warehouse_ids::jsonb ? ${push(warehouseId)}`);
    }
  } else {
    // Mode 2: Full Analysis — يبدأ من items
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
      // في الـ full analysis، فلتر المخزن يعني: فقط الأصناف التي لها بيانات في هذا المخزن
      whereClauses.push(`inv.warehouse_id_filter = ${push(warehouseId)}`);
    }
  }

  const whereSQL = whereClauses.length > 0
    ? `WHERE ${whereClauses.join("\n  AND ")}`
    : "";

  // ── Status filter — يُترجَم لـ WHERE مباشر بدل HAVING ──────────────────────
  // يُضاف بعد FROM/JOIN في subquery خارجي (wrapper CTE)
  let statusWhereSQL = "";
  if (status) {
    statusWhereSQL = buildStatusFilter(status);
  }

  // ── القاعدة الرئيسية ─────────────────────────────────────────────────────
  const baseSQL = `
    WITH
      -- آخر تاريخ snapshot متاح
      latest_snap AS (
        SELECT MAX(snapshot_date) AS d FROM rpt_inventory_snapshot
      ),
      -- رصيد كل صنف مُجمَّع من كل المخازن
      inv AS (
        SELECT
          rpt.item_id,
          SUM(rpt.qty_in_minor)                                                 AS total_qty_minor,
          COUNT(CASE WHEN rpt.qty_in_minor > 0 THEN 1 END)::int                AS warehouses_with_stock
        FROM rpt_inventory_snapshot rpt
        WHERE rpt.snapshot_date = (SELECT d FROM latest_snap)
        GROUP BY rpt.item_id
      ),
      -- مبيعات الصنف في الفترة (issued = مبيعات + فواتير مرضى)
      sales AS (
        SELECT
          rms.item_id,
          SUM(rms.issued_qty)                                                   AS total_issued_minor,
          COUNT(DISTINCT rms.movement_date) FILTER (WHERE rms.issued_qty > 0)  AS active_sales_days
        FROM rpt_item_movements_summary rms
        WHERE rms.movement_date BETWEEN ${push(fromDate)} AND ${push(toDate)}
        GROUP BY rms.item_id
      ),
      -- الطلبات الأخيرة (7 أيام) — نعيد حسابها للـ full_analysis mode
      -- في shortage_driven mode، القيمة موجودة في shortage_agg.recent_request_count
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

          -- Stock (from rpt_inventory_snapshot)
          COALESCE(inv.total_qty_minor, 0)::numeric          AS total_qty_minor,
          COALESCE(inv.warehouses_with_stock, 0)             AS warehouses_with_stock,

          -- qty في الوحدة المختارة (server-side conversion)
          ${qtyDisplayExpr}                                   AS qty_display,

          -- اسم الوحدة المعروضة
          ${displayUnitNameExpr}                              AS display_unit_name,

          -- Sales (from rpt_item_movements_summary)
          COALESCE(s.total_issued_minor, 0)::numeric         AS total_issued_minor,
          COALESCE(s.active_sales_days, 0)                   AS active_sales_days,

          -- متوسط البيع اليومي (minor)
          CASE WHEN ${push(dayCount)} > 0
               THEN ROUND(COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}, 3)
               ELSE 0
          END                                                 AS avg_daily_minor,

          -- متوسط البيع اليومي (وحدة العرض)
          ${avgDailyDisplayExpr}                              AS avg_daily_display,

          -- Days of Coverage = total_qty / avg_daily  (في minor)
          CASE
            WHEN COALESCE(s.total_issued_minor, 0) > 0 AND ${push(dayCount)} > 0
            THEN ROUND(
                   COALESCE(inv.total_qty_minor, 0)::numeric
                   / (COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}),
                   1)
            ELSE NULL
          END                                                 AS days_of_coverage,

          -- ─── منطق Status المحسَّن ────────────────────────────────────────
          --
          -- not_available    : لا يوجد رصيد في أي مخزن
          -- available_elsewhere: يوجد رصيد لكن ليس في مخازن الطلب
          -- high_demand      : مزيج: request_count حديث >= 3 + coverage < 7
          --                    أو coverage < 3 (ضغط شديد)
          -- low_stock        : coverage < 14
          -- normal           : متوفر ومستقر
          --
          CASE
            WHEN COALESCE(inv.total_qty_minor, 0) = 0
              THEN 'not_available'

            WHEN COALESCE(inv.total_qty_minor, 0) > 0
              AND (
                    -- يوجد رصيد في مخزن آخر غير مخازن الطلب
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
              -- coverage أقل من 7 أيام مع طلب حديث مرتفع = ضغط عالٍ
              (
                COALESCE(s.total_issued_minor, 0) > 0
                AND ${push(dayCount)} > 0
                AND COALESCE(inv.total_qty_minor, 0)::numeric
                    / (COALESCE(s.total_issued_minor, 0)::numeric / ${push(dayCount)}) < 7
              )
              OR (
                -- 3+ طلبات في آخر 7 أيام مع coverage < 14
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
          END                                                 AS status_flag

        FROM ${modeFrom}
        ${modeJoin}
        LEFT JOIN inv   ON inv.item_id   = i.id
        LEFT JOIN sales s ON s.item_id  = i.id
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
  }));

  const total = rows[0]?.totalCount ?? 0;
  return { rows, total };
}

// ─── getWarehouseStock ────────────────────────────────────────────────────────
//
// Lazy load — يُطلب فقط عند الضغط على خلية الرصيد لصنف محدد.

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

// ─── resolveShortage ─────────────────────────────────────────────────────────

export async function resolveShortage(
  itemId: string,
  resolvedBy: string
): Promise<void> {
  await pool.query(
    `UPDATE shortage_agg
     SET is_resolved = true, resolved_at = NOW(), resolved_by = $2, refreshed_at = NOW()
     WHERE item_id = $1`,
    [itemId, resolvedBy]
  );
}

// ─── Helpers — بناء SQL لتحويل الوحدات ───────────────────────────────────────

function buildQtyDisplayExpr(colMinor: string, unit: DisplayUnit): string {
  if (unit === "major") {
    return `ROUND(${colMinor}::numeric / NULLIF(i.major_to_minor::numeric, 0), 2)`;
  }
  if (unit === "medium") {
    return `ROUND(${colMinor}::numeric / NULLIF(i.medium_to_minor::numeric, 0), 2)`;
  }
  return `ROUND(${colMinor}::numeric, 2)`;
}

function buildAvgDailyDisplayExpr(dayCount: number, unit: DisplayUnit): string {
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

function buildDisplayUnitNameExpr(unit: DisplayUnit): string {
  if (unit === "major")  return `i.major_unit_name`;
  if (unit === "medium") return `COALESCE(i.medium_unit_name, i.minor_unit_name)`;
  return `i.minor_unit_name`;
}

function buildStatusFilter(status: string): string {
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
