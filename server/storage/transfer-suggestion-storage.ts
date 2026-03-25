import { db } from "../db";
import { sql } from "drizzle-orm";

export type SuggestionReason = "sales_gap" | "destination_zero" | "covered";

export interface TransferSuggestionRow {
  itemId: string;
  itemCode: string;
  nameAr: string;
  majorUnitName: string | null;
  minorUnitName: string | null;
  majorToMinor: number;
  sourceQtyMinor: number;
  destQtyMinor: number;
  destSalesMinor: number;
  /** الاحتياج = max(0, مبيعات_الوجهة − رصيد_الوجهة) */
  needMinor: number;
  /** المقترح للتحويل = min(needMinor, رصيد_المصدر) */
  suggestedMinor: number;
  /** true عندما رصيد المصدر < الاحتياج */
  sourceInsufficient: boolean;
  /** سبب ظهور الصنف في القائمة */
  suggestionReason: SuggestionReason;
}

export interface TransferSuggestionResult {
  data: TransferSuggestionRow[];
  total: number;
}

/**
 * حسابات الاقتراح الذكي — مصدر الحقيقة الوحيد للمعادلات:
 *
 *   need      = max(0, dest_sales − dest_stock)
 *   suggested = min(need, source_stock)
 *   source_insufficient = source_stock < need
 *
 *   suggestionReason:
 *     'sales_gap'        → need > 0  (عجز مبيعات)
 *     'destination_zero' → dest_stock = 0 AND need = 0  (الوجهة فارغة بدون مبيعات)
 *     'covered'          → dest_stock >= dest_sales  (مكتفٍ)
 */
export async function getTransferSuggestions(params: {
  sourceWarehouseId: string;
  destWarehouseId: string;
  dateFrom: string;
  dateTo: string;
  excludeCovered: boolean;
  search: string;
  page: number;
  pageSize: number;
}): Promise<TransferSuggestionResult> {
  const { sourceWarehouseId, destWarehouseId, dateFrom, dateTo, excludeCovered, search, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  const searchFilter = search.trim()
    ? sql`AND (i.name_ar ILIKE ${"%" + search.trim() + "%"} OR i.item_code ILIKE ${"%" + search.trim() + "%"})`
    : sql``;

  /*
   * فلتر "استبعاد الأصناف التي يغطي رصيدها مبيعات الفترة":
   * يُظهر فقط الأصناف التي:
   *   (أ) لديها عجز مبيعات  (need > 0)
   *   (ب) الوجهة فارغة تماماً حتى لو لا توجد مبيعات (destination_zero)
   * لا يُظهر الأصناف التي رصيد الوجهة يكفي مبيعات الفترة.
   */
  const coveredFilter = excludeCovered
    ? sql`AND (
        GREATEST(0, COALESCE(ds.sold, 0) - COALESCE(da.qty, 0)) > 0
        OR COALESCE(da.qty, 0) = 0
      )`
    : sql``;

  const baseQuery = sql`
    WITH
    source_agg AS (
      SELECT item_id, SUM(qty_in_minor::numeric) AS qty
      FROM inventory_lots
      WHERE warehouse_id = ${sourceWarehouseId}
        AND is_active = true
        AND qty_in_minor::numeric > 0
      GROUP BY item_id
    ),
    dest_agg AS (
      SELECT item_id, COALESCE(SUM(qty_in_minor::numeric), 0) AS qty
      FROM inventory_lots
      WHERE warehouse_id = ${destWarehouseId}
        AND is_active = true
      GROUP BY item_id
    ),
    dest_sales AS (
      SELECT l.item_id, COALESCE(SUM(ABS(m.qty_change_in_minor::numeric)), 0) AS sold
      FROM inventory_lot_movements m
      JOIN inventory_lots l ON l.id = m.lot_id
      WHERE m.warehouse_id = ${destWarehouseId}
        AND m.tx_type = 'out'
        AND m.reference_type IN ('sales_invoice', 'patient_invoice')
        AND m.tx_date::date BETWEEN ${dateFrom} AND ${dateTo}
      GROUP BY l.item_id
    ),
    filtered AS (
      SELECT
        i.id                                                    AS item_id,
        i.item_code,
        i.name_ar,
        i.major_unit_name,
        i.minor_unit_name,
        COALESCE(i.major_to_minor::numeric, 1)                 AS major_to_minor,
        sa.qty                                                  AS source_qty_minor,
        COALESCE(da.qty, 0)                                     AS dest_qty_minor,
        COALESCE(ds.sold, 0)                                    AS dest_sales_minor,

        -- الاحتياج: القدر الذي يحتاجه مخزن الوجهة لتغطية مبيعات الفترة
        GREATEST(0, COALESCE(ds.sold, 0) - COALESCE(da.qty, 0))
                                                                AS need_minor,

        -- الكمية المقترحة: الاحتياج مقصوص برصيد مخزن المصدر
        LEAST(
          GREATEST(0, COALESCE(ds.sold, 0) - COALESCE(da.qty, 0)),
          sa.qty
        )                                                       AS suggested_minor,

        -- هل رصيد المصدر أقل من الاحتياج؟
        (sa.qty < GREATEST(0, COALESCE(ds.sold, 0) - COALESCE(da.qty, 0)))
                                                                AS source_insufficient,

        -- سبب ظهور الصنف
        CASE
          WHEN GREATEST(0, COALESCE(ds.sold, 0) - COALESCE(da.qty, 0)) > 0
               THEN 'sales_gap'
          WHEN COALESCE(da.qty, 0) = 0
               THEN 'destination_zero'
          ELSE 'covered'
        END                                                     AS suggestion_reason

      FROM source_agg sa
      JOIN items i ON i.id = sa.item_id
      LEFT JOIN dest_agg da  ON da.item_id  = sa.item_id
      LEFT JOIN dest_sales ds ON ds.item_id = sa.item_id
      WHERE i.is_active = true
        ${coveredFilter}
        ${searchFilter}
    )
  `;

  const [countResult, dataResult] = await Promise.all([
    db.execute(sql`
      ${baseQuery}
      SELECT COUNT(*)::int AS total FROM filtered
    `),
    db.execute(sql`
      ${baseQuery}
      SELECT * FROM filtered
      ORDER BY
        CASE suggestion_reason
          WHEN 'sales_gap'        THEN 0
          WHEN 'destination_zero' THEN 1
          ELSE 2
        END,
        need_minor DESC,
        name_ar
      LIMIT ${pageSize} OFFSET ${offset}
    `),
  ]);

  const total = Number((countResult.rows[0] as any)?.total ?? 0);

  const data: TransferSuggestionRow[] = (dataResult.rows as any[]).map((r) => ({
    itemId:             r.item_id,
    itemCode:           r.item_code,
    nameAr:             r.name_ar,
    majorUnitName:      r.major_unit_name,
    minorUnitName:      r.minor_unit_name,
    majorToMinor:       Number(r.major_to_minor) || 1,
    sourceQtyMinor:     Number(r.source_qty_minor) || 0,
    destQtyMinor:       Number(r.dest_qty_minor) || 0,
    destSalesMinor:     Number(r.dest_sales_minor) || 0,
    needMinor:          Number(r.need_minor) || 0,
    suggestedMinor:     Number(r.suggested_minor) || 0,
    sourceInsufficient: r.source_insufficient === true || r.source_insufficient === "true",
    suggestionReason:   (r.suggestion_reason as SuggestionReason) || "covered",
  }));

  return { data, total };
}
