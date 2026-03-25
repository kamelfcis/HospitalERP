import { db } from "../db";
import { sql } from "drizzle-orm";

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
  suggestedMinor: number;
}

export interface TransferSuggestionResult {
  data: TransferSuggestionRow[];
  total: number;
}

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

  const coveredFilter = excludeCovered
    ? sql`AND GREATEST(0, COALESCE(ds.sold, 0) - COALESCE(da.qty, 0)) > 0`
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
        i.id                       AS item_id,
        i.item_code,
        i.name_ar,
        i.major_unit_name,
        i.minor_unit_name,
        COALESCE(i.major_to_minor::numeric, 1) AS major_to_minor,
        sa.qty                     AS source_qty_minor,
        COALESCE(da.qty, 0)        AS dest_qty_minor,
        COALESCE(ds.sold, 0)       AS dest_sales_minor,
        GREATEST(0, COALESCE(ds.sold, 0) - COALESCE(da.qty, 0)) AS suggested_minor
      FROM source_agg sa
      JOIN items i ON i.id = sa.item_id
      LEFT JOIN dest_agg da ON da.item_id = sa.item_id
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
      ORDER BY suggested_minor DESC, name_ar
      LIMIT ${pageSize} OFFSET ${offset}
    `),
  ]);

  const total = Number((countResult.rows[0] as any)?.total ?? 0);

  const data: TransferSuggestionRow[] = (dataResult.rows as any[]).map((r) => ({
    itemId:          r.item_id,
    itemCode:        r.item_code,
    nameAr:          r.name_ar,
    majorUnitName:   r.major_unit_name,
    minorUnitName:   r.minor_unit_name,
    majorToMinor:    Number(r.major_to_minor) || 1,
    sourceQtyMinor:  Number(r.source_qty_minor) || 0,
    destQtyMinor:    Number(r.dest_qty_minor) || 0,
    destSalesMinor:  Number(r.dest_sales_minor) || 0,
    suggestedMinor:  Number(r.suggested_minor) || 0,
  }));

  return { data, total };
}
