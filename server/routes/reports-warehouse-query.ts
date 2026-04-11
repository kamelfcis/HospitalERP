import type { Express } from "express";
import { pool } from "../db";
import { requireAuth } from "./_auth";
import { logger } from "../lib/logger";

export function registerReportsWarehouseQueryRoutes(app: Express) {

  app.get("/api/reports/warehouse-balance", requireAuth, async (req, res) => {
    try {
      const {
        warehouseId,
        asOfDate,
        category   = "all",
        unitLevel  = "major",
        search     = "",
        excludeZero = "true",
        page       = "1",
        pageSize   = "50",
      } = req.query as Record<string, string>;

      if (!warehouseId) return res.status(400).json({ message: "warehouseId مطلوب" });
      if (!asOfDate)    return res.status(400).json({ message: "asOfDate مطلوب" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) return res.status(400).json({ message: "صيغة asOfDate يجب أن تكون YYYY-MM-DD" });

      const pageNum  = Math.max(1, parseInt(page, 10)     || 1);
      const pageSz   = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset   = (pageNum - 1) * pageSz;
      const catFilter = category === "all" ? null : category;
      const searchFilter = search.trim() || null;
      const skipZero = excludeZero !== "false";

      const result = await pool.query(`
        WITH lot_balance AS (
          SELECT
            il.item_id,
            COALESCE(ilm.warehouse_id, il.warehouse_id)  AS warehouse_id,
            SUM(ilm.qty_change_in_minor)                 AS qty_minor,
            SUM(CASE WHEN ilm.qty_change_in_minor > 0
                     THEN ilm.qty_change_in_minor * COALESCE(ilm.unit_cost, il.purchase_price)
                     ELSE 0 END)
              / NULLIF(SUM(CASE WHEN ilm.qty_change_in_minor > 0
                               THEN ilm.qty_change_in_minor ELSE 0 END), 0) AS avg_cost
          FROM inventory_lot_movements ilm
          JOIN inventory_lots il ON il.id = ilm.lot_id
          WHERE ilm.tx_date::date <= $1::date
            AND COALESCE(ilm.warehouse_id, il.warehouse_id) = $2
          GROUP BY il.item_id, COALESCE(ilm.warehouse_id, il.warehouse_id)
        ),
        enriched AS (
          SELECT
            lb.item_id,
            lb.warehouse_id,
            lb.qty_minor,
            lb.avg_cost,
            i.item_code,
            i.name_ar,
            i.name_en,
            i.category,
            w.name_ar                              AS warehouse_name,
            COALESCE(i.major_unit_name, 'وحدة')   AS major_unit_name,
            i.medium_unit_name,
            i.minor_unit_name,
            COALESCE(i.major_to_minor::numeric, 1) AS major_to_minor,
            COALESCE(i.medium_to_minor::numeric, 1) AS medium_to_minor,
            COALESCE(i.major_to_medium::numeric, 1) AS major_to_medium,
            COALESCE(i.purchase_price_last::numeric, 0)  AS purchase_price_major,
            COALESCE(i.sale_price_current::numeric, 0)   AS sale_price_major
          FROM lot_balance lb
          JOIN items i   ON i.id = lb.item_id
          JOIN warehouses w ON w.id = lb.warehouse_id
          WHERE ($3::text IS NULL OR i.category::text = $3)
            AND ($4::text IS NULL OR i.name_ar ILIKE '%' || $4 || '%' OR i.item_code ILIKE '%' || $4 || '%')
            AND ($5::boolean = false OR lb.qty_minor > 0.0005)
        ),
        converted AS (
          SELECT
            *,
            CASE $6
              WHEN 'minor'  THEN
                CASE WHEN minor_unit_name IS NOT NULL
                     THEN qty_minor
                     ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4)
                END
              WHEN 'medium' THEN
                CASE WHEN medium_unit_name IS NOT NULL
                     THEN ROUND(qty_minor / NULLIF(major_to_minor, 0) * major_to_medium, 4)
                     ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4)
                END
              ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4)
            END                                          AS qty_display,
            CASE $6
              WHEN 'minor'  THEN
                CASE WHEN minor_unit_name IS NOT NULL
                     THEN ROUND(purchase_price_major / NULLIF(major_to_minor, 0), 4)
                     ELSE purchase_price_major
                END
              WHEN 'medium' THEN
                CASE WHEN medium_unit_name IS NOT NULL
                     THEN ROUND(purchase_price_major / NULLIF(major_to_medium, 0), 4)
                     ELSE purchase_price_major
                END
              ELSE purchase_price_major
            END                                          AS purchase_price_unit,
            CASE $6
              WHEN 'minor'  THEN
                CASE WHEN minor_unit_name IS NOT NULL
                     THEN ROUND(sale_price_major / NULLIF(major_to_minor, 0), 4)
                     ELSE sale_price_major
                END
              WHEN 'medium' THEN
                CASE WHEN medium_unit_name IS NOT NULL
                     THEN ROUND(sale_price_major / NULLIF(major_to_medium, 0), 4)
                     ELSE sale_price_major
                END
              ELSE sale_price_major
            END                                          AS sale_price_unit,
            CASE $6
              WHEN 'minor'  THEN COALESCE(minor_unit_name,  major_unit_name)
              WHEN 'medium' THEN COALESCE(medium_unit_name, major_unit_name)
              ELSE               major_unit_name
            END                                          AS unit_label
          FROM enriched
        )
        SELECT
          item_id          AS "itemId",
          warehouse_id     AS "warehouseId",
          item_code        AS "itemCode",
          name_ar          AS "nameAr",
          name_en          AS "nameEn",
          category,
          warehouse_name   AS "warehouseName",
          unit_label       AS "unitLabel",
          qty_display      AS "qty",
          purchase_price_unit AS "purchasePriceUnit",
          sale_price_unit     AS "salePriceUnit",
          ROUND(qty_display * purchase_price_unit, 2)   AS "totalCost",
          ROUND(qty_display * sale_price_unit,     2)   AS "totalSaleValue",
          COUNT(*) OVER()                               AS "_total"
        FROM converted
        ORDER BY name_ar
        LIMIT $7 OFFSET $8
      `, [
        asOfDate,
        warehouseId,
        catFilter,
        searchFilter,
        skipZero,
        unitLevel,
        pageSz,
        offset,
      ]);

      const total = result.rows.length > 0 ? parseInt(result.rows[0]._total, 10) : 0;

      const summaryResult = await pool.query(`
        WITH lot_balance AS (
          SELECT
            il.item_id,
            COALESCE(ilm.warehouse_id, il.warehouse_id) AS warehouse_id,
            SUM(ilm.qty_change_in_minor)                AS qty_minor,
            SUM(CASE WHEN ilm.qty_change_in_minor > 0
                     THEN ilm.qty_change_in_minor * COALESCE(ilm.unit_cost, il.purchase_price)
                     ELSE 0 END)
              / NULLIF(SUM(CASE WHEN ilm.qty_change_in_minor > 0
                               THEN ilm.qty_change_in_minor ELSE 0 END), 0) AS avg_cost
          FROM inventory_lot_movements ilm
          JOIN inventory_lots il ON il.id = ilm.lot_id
          WHERE ilm.tx_date::date <= $1::date
            AND COALESCE(ilm.warehouse_id, il.warehouse_id) = $2
          GROUP BY il.item_id, COALESCE(ilm.warehouse_id, il.warehouse_id)
        ),
        enriched AS (
          SELECT
            lb.qty_minor,
            i.minor_unit_name,
            i.medium_unit_name,
            COALESCE(i.major_to_minor::numeric, 1)  AS major_to_minor,
            COALESCE(i.medium_to_minor::numeric, 1) AS medium_to_minor,
            COALESCE(i.major_to_medium::numeric, 1) AS major_to_medium,
            COALESCE(i.purchase_price_last::numeric, 0)  AS purchase_price_major,
            COALESCE(i.sale_price_current::numeric, 0)   AS sale_price_major
          FROM lot_balance lb
          JOIN items i ON i.id = lb.item_id
          WHERE ($3::text IS NULL OR i.category::text = $3)
            AND ($4::text IS NULL OR i.name_ar ILIKE '%' || $4 || '%' OR i.item_code ILIKE '%' || $4 || '%')
            AND ($5::boolean = false OR lb.qty_minor > 0.0005)
        )
        SELECT
          COUNT(*) AS "itemCount",
          SUM(CASE $6::text
            WHEN 'minor'  THEN
              CASE WHEN minor_unit_name IS NOT NULL THEN qty_minor
                   ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) END
            WHEN 'medium' THEN
              CASE WHEN medium_unit_name IS NOT NULL
                   THEN ROUND(qty_minor / NULLIF(major_to_minor, 0) * major_to_medium, 4)
                   ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) END
            ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4)
          END) AS "totalQty",
          SUM(ROUND(
            CASE $6::text
              WHEN 'minor'  THEN
                CASE WHEN minor_unit_name IS NOT NULL
                     THEN qty_minor * ROUND(purchase_price_major / NULLIF(major_to_minor, 0), 4)
                     ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * purchase_price_major END
              WHEN 'medium' THEN
                CASE WHEN medium_unit_name IS NOT NULL
                     THEN ROUND(qty_minor / NULLIF(major_to_minor, 0) * major_to_medium, 4) * ROUND(purchase_price_major / NULLIF(major_to_medium, 0), 4)
                     ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * purchase_price_major END
              ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * purchase_price_major
            END, 2)) AS "totalCost",
          SUM(ROUND(
            CASE $6::text
              WHEN 'minor'  THEN
                CASE WHEN minor_unit_name IS NOT NULL
                     THEN qty_minor * ROUND(sale_price_major / NULLIF(major_to_minor, 0), 4)
                     ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * sale_price_major END
              WHEN 'medium' THEN
                CASE WHEN medium_unit_name IS NOT NULL
                     THEN ROUND(qty_minor / NULLIF(major_to_minor, 0) * major_to_medium, 4) * ROUND(sale_price_major / NULLIF(major_to_medium, 0), 4)
                     ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * sale_price_major END
              ELSE ROUND(qty_minor / NULLIF(major_to_minor, 0), 4) * sale_price_major
            END, 2)) AS "totalSaleValue"
        FROM enriched
      `, [asOfDate, warehouseId, catFilter, searchFilter, skipZero, unitLevel]);

      const summary = summaryResult.rows[0] || {};

      return res.json({
        rows:     result.rows.map(r => ({ ...r, _total: undefined })),
        total,
        page:     pageNum,
        pageSize: pageSz,
        summary: {
          itemCount:      parseInt(summary.itemCount    || "0", 10),
          totalQty:       parseFloat(summary.totalQty   || "0"),
          totalCost:      parseFloat(summary.totalCost  || "0"),
          totalSaleValue: parseFloat(summary.totalSaleValue || "0"),
        },
      });
    } catch (err: any) {
      logger.error({ err: err.message }, "[WAREHOUSE_BALANCE_REPORT] failed");
      return res.status(500).json({ message: err.message });
    }
  });
}
