import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

async function getLatestSnapshotDate(): Promise<string | null> {
  const r = await db.execute(
    sql`SELECT MAX(snapshot_date)::text AS d FROM rpt_inventory_snapshot`
  );
  return (r.rows[0] as any)?.d ?? null;
}

export const transfersSearchAdvancedMethods = {

  async searchItemsAdvanced(this: DatabaseStorage, params: {
    mode: 'AR' | 'EN' | 'CODE' | 'BARCODE';
    query: string;
    warehouseId: string;
    page: number;
    pageSize: number;
    includeZeroStock: boolean;
    drugsOnly: boolean;
    excludeServices?: boolean;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<{items: Array<any>; total: number}> {
    const {
      mode, query, warehouseId, page, pageSize,
      includeZeroStock, drugsOnly, excludeServices, minPrice, maxPrice,
    } = params;
    const offset = (page - 1) * pageSize;

    const buildPattern = (q: string) => {
      if (!q.includes('%')) return `%${q}%`;
      let p = q;
      if (!p.startsWith('%')) p = `%${p}`;
      if (!p.endsWith('%')) p = `${p}%`;
      return p;
    };

    const pattern = buildPattern(query);

    const latestSnapDate = await getLatestSnapshotDate();

    let searchFrag: ReturnType<typeof sql>;
    let barcodeMode = false;

    switch (mode) {
      case 'AR':
        searchFrag = sql`i.name_ar ILIKE ${pattern}`;
        break;
      case 'EN':
        searchFrag = sql`COALESCE(i.name_en, '') ILIKE ${pattern}`;
        break;
      case 'CODE':
        searchFrag = sql`i.item_code ILIKE ${pattern}`;
        break;
      case 'BARCODE':
        barcodeMode = true;
        searchFrag = sql`EXISTS (
          SELECT 1 FROM item_barcodes ib
          WHERE ib.item_id = i.id
            AND ib.is_active = true
            AND ib.barcode_value ILIKE ${pattern}
        )`;
        break;
      default:
        searchFrag = sql`i.name_ar ILIKE ${pattern}`;
    }

    const extraParts: ReturnType<typeof sql>[] = [];
    if (drugsOnly)       extraParts.push(sql`i.category = 'drug'`);
    if (excludeServices) extraParts.push(sql`i.category != 'service'`);
    if (minPrice !== undefined) extraParts.push(sql`i.sale_price_current::numeric >= ${minPrice}`);
    if (maxPrice !== undefined) extraParts.push(sql`i.sale_price_current::numeric <= ${maxPrice}`);

    const extraWhere = extraParts.length > 0
      ? sql` AND ${sql.join(extraParts, sql` AND `)}`
      : sql``;

    const snapshotJoin = latestSnapDate
      ? sql`
          LEFT JOIN rpt_inventory_snapshot snap
            ON snap.item_id      = i.id
           AND snap.warehouse_id = ${warehouseId}
           AND snap.snapshot_date = ${latestSnapDate}::date
          LEFT JOIN inventory_lots nl
            ON nl.id = snap.nearest_expiry_lot_id
        `
      : sql``;

    const availableQtyExpr = latestSnapDate
      ? sql`COALESCE(snap.qty_in_minor, 0)::text`
      : sql`COALESCE((
          SELECT SUM(il.qty_in_minor::numeric)::text
          FROM inventory_lots il
          WHERE il.item_id = i.id
            AND il.warehouse_id = ${warehouseId}
            AND il.is_active = true
            AND il.qty_in_minor::numeric > 0
        ), '0')`;

    const nearestExpiryDateExpr = latestSnapDate
      ? sql`snap.earliest_expiry_date::text`
      : sql`(
          SELECT MIN(il.expiry_date)::text
          FROM inventory_lots il
          WHERE il.item_id = i.id
            AND il.warehouse_id = ${warehouseId}
            AND il.is_active = true
            AND il.qty_in_minor::numeric > 0
            AND il.expiry_date IS NOT NULL
            AND il.expiry_date >= CURRENT_DATE
        )`;

    const nearestExpiryMonthExpr = latestSnapDate
      ? sql`nl.expiry_month`
      : sql`(
          SELECT il.expiry_month
          FROM inventory_lots il
          WHERE il.item_id = i.id
            AND il.warehouse_id = ${warehouseId}
            AND il.is_active = true
            AND il.qty_in_minor::numeric > 0
            AND il.expiry_month IS NOT NULL
            AND il.expiry_year IS NOT NULL
            AND (il.expiry_year > EXTRACT(YEAR FROM CURRENT_DATE)::int
              OR (il.expiry_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
                  AND il.expiry_month >= EXTRACT(MONTH FROM CURRENT_DATE)::int))
          ORDER BY il.expiry_year ASC, il.expiry_month ASC
          LIMIT 1
        )`;

    const nearestExpiryYearExpr = latestSnapDate
      ? sql`nl.expiry_year`
      : sql`(
          SELECT il.expiry_year
          FROM inventory_lots il
          WHERE il.item_id = i.id
            AND il.warehouse_id = ${warehouseId}
            AND il.is_active = true
            AND il.qty_in_minor::numeric > 0
            AND il.expiry_month IS NOT NULL
            AND il.expiry_year IS NOT NULL
            AND (il.expiry_year > EXTRACT(YEAR FROM CURRENT_DATE)::int
              OR (il.expiry_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
                  AND il.expiry_month >= EXTRACT(MONTH FROM CURRENT_DATE)::int))
          ORDER BY il.expiry_year ASC, il.expiry_month ASC
          LIMIT 1
        )`;

    const nearestExpiryQtyExpr = latestSnapDate
      ? sql`COALESCE((
          SELECT SUM(il2.qty_in_minor::numeric)::text
          FROM inventory_lots il2
          WHERE il2.item_id      = i.id
            AND il2.warehouse_id = ${warehouseId}
            AND il2.is_active    = true
            AND il2.qty_in_minor::numeric > 0
            AND il2.expiry_date  = snap.earliest_expiry_date
        ), '0')`
      : sql`(
          SELECT SUM(il.qty_in_minor::numeric)::text
          FROM inventory_lots il
          WHERE il.item_id = i.id
            AND il.warehouse_id = ${warehouseId}
            AND il.is_active = true
            AND il.qty_in_minor::numeric > 0
            AND il.expiry_date = (
              SELECT MIN(il2.expiry_date)
              FROM inventory_lots il2
              WHERE il2.item_id      = i.id
                AND il2.warehouse_id = ${warehouseId}
                AND il2.is_active    = true
                AND il2.qty_in_minor::numeric > 0
                AND il2.expiry_date IS NOT NULL
                AND il2.expiry_date >= CURRENT_DATE
            )
        )`;

    const baseQuery = sql`
      SELECT
        i.id,
        i.item_code              AS "itemCode",
        i.name_ar                AS "nameAr",
        i.name_en                AS "nameEn",
        i.has_expiry             AS "hasExpiry",
        i.allow_oversell         AS "allowOversell",
        i.category,
        i.major_unit_name        AS "majorUnitName",
        i.minor_unit_name        AS "minorUnitName",
        i.major_to_minor         AS "majorToMinor",
        i.major_to_medium        AS "majorToMedium",
        i.medium_unit_name       AS "mediumUnitName",
        i.medium_to_minor        AS "mediumToMinor",
        i.sale_price_current     AS "salePriceCurrent",
        ${availableQtyExpr}      AS "availableQtyMinor",
        ${nearestExpiryDateExpr} AS "nearestExpiryDate",
        ${nearestExpiryMonthExpr} AS "nearestExpiryMonth",
        ${nearestExpiryYearExpr} AS "nearestExpiryYear",
        ${nearestExpiryQtyExpr}  AS "nearestExpiryQtyMinor"
      FROM items i
      ${snapshotJoin}
      WHERE i.is_active = true
        AND ${searchFrag}
        ${extraWhere}
    `;

    if (!includeZeroStock) {
      const allRows = await db.execute(
        sql`${baseQuery} ORDER BY i.item_code ASC`
      );
      const filtered = (allRows.rows as any[]).filter(
        r => parseFloat(r.availableQtyMinor) > 0
      );
      const total = filtered.length;
      const paged = filtered.slice(offset, offset + pageSize);
      return { items: paged, total };
    }

    const countQuery = sql`
      SELECT COUNT(*) AS count
      FROM items i
      WHERE i.is_active = true
        AND ${searchFrag}
        ${extraWhere}
    `;
    const countResult = await db.execute(countQuery);
    const total = parseInt(String((countResult.rows[0] as any)?.count ?? 0), 10);

    const pagedRows = await db.execute(
      sql`${baseQuery} ORDER BY i.item_code ASC LIMIT ${pageSize} OFFSET ${offset}`
    );
    return { items: pagedRows.rows as any[], total };
  },
};
