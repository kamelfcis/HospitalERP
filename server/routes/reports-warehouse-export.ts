import type { Express } from "express";
import { pool } from "../db";
import { requireAuth } from "./_auth";
import { logger } from "../lib/logger";
import * as XLSX from "xlsx";

export function registerReportsWarehouseExportRoutes(app: Express) {

  app.get("/api/reports/warehouse-balance/export", requireAuth, async (req, res) => {
    try {
      const {
        warehouseId, asOfDate,
        category = "all", unitLevel = "major",
        search = "", excludeZero = "true",
      } = req.query as Record<string, string>;

      if (!warehouseId || !asOfDate) return res.status(400).json({ message: "warehouseId و asOfDate مطلوبان" });

      const catFilter    = category === "all" ? null : category;
      const searchFilter = search.trim() || null;
      const skipZero     = excludeZero !== "false";

      const result = await pool.query(`
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
        converted AS (
          SELECT
            i.item_code,
            i.name_ar,
            COALESCE(i.name_en, '')                                AS name_en,
            i.category,
            w.name_ar                                              AS warehouse_name,
            CASE $3::text
              WHEN 'minor'  THEN COALESCE(i.minor_unit_name,  i.major_unit_name, 'وحدة')
              WHEN 'medium' THEN COALESCE(i.medium_unit_name, i.major_unit_name, 'وحدة')
              ELSE               COALESCE(i.major_unit_name, 'وحدة')
            END AS unit_label,
            CASE $3::text
              WHEN 'minor'  THEN
                CASE WHEN i.minor_unit_name IS NOT NULL THEN lb.qty_minor
                     ELSE ROUND(lb.qty_minor / NULLIF(COALESCE(i.major_to_minor::numeric, 1), 0), 4) END
              WHEN 'medium' THEN
                CASE WHEN i.medium_unit_name IS NOT NULL
                     THEN ROUND(lb.qty_minor / NULLIF(COALESCE(i.major_to_minor::numeric, 1), 0) * COALESCE(i.major_to_medium::numeric, 1), 4)
                     ELSE ROUND(lb.qty_minor / NULLIF(COALESCE(i.major_to_minor::numeric, 1), 0), 4) END
              ELSE ROUND(lb.qty_minor / NULLIF(COALESCE(i.major_to_minor::numeric, 1), 0), 4)
            END AS qty_display,
            CASE $3::text
              WHEN 'minor'  THEN
                CASE WHEN i.minor_unit_name IS NOT NULL
                     THEN ROUND(i.purchase_price_last::numeric / NULLIF(COALESCE(i.major_to_minor::numeric, 1), 0), 4)
                     ELSE i.purchase_price_last::numeric END
              WHEN 'medium' THEN
                CASE WHEN i.medium_unit_name IS NOT NULL
                     THEN ROUND(i.purchase_price_last::numeric / NULLIF(COALESCE(i.major_to_medium::numeric, 1), 0), 4)
                     ELSE i.purchase_price_last::numeric END
              ELSE i.purchase_price_last::numeric
            END AS purchase_price_unit,
            CASE $3::text
              WHEN 'minor'  THEN
                CASE WHEN i.minor_unit_name IS NOT NULL
                     THEN ROUND(i.sale_price_current::numeric / NULLIF(COALESCE(i.major_to_minor::numeric, 1), 0), 4)
                     ELSE i.sale_price_current::numeric END
              WHEN 'medium' THEN
                CASE WHEN i.medium_unit_name IS NOT NULL
                     THEN ROUND(i.sale_price_current::numeric / NULLIF(COALESCE(i.major_to_medium::numeric, 1), 0), 4)
                     ELSE i.sale_price_current::numeric END
              ELSE i.sale_price_current::numeric
            END AS sale_price_unit
          FROM lot_balance lb
          JOIN items i   ON i.id = lb.item_id
          JOIN warehouses w ON w.id = lb.warehouse_id
          WHERE ($4::text IS NULL OR i.category::text = $4)
            AND ($5::text IS NULL OR i.name_ar ILIKE '%' || $5 || '%' OR i.item_code ILIKE '%' || $5 || '%')
            AND ($6::boolean = false OR lb.qty_minor > 0.0005)
        )
        SELECT *, ROUND(qty_display * purchase_price_unit, 2) AS total_cost,
                  ROUND(qty_display * sale_price_unit, 2) AS total_sale_value
        FROM converted
        ORDER BY name_ar
      `, [asOfDate, warehouseId, unitLevel, catFilter, searchFilter, skipZero]);

      const unitLabel = unitLevel === "minor" ? "صغرى" : unitLevel === "medium" ? "متوسطة" : "كبرى";
      const catLabel  = category  === "drug"  ? "أدوية" : category  === "supply"  ? "مستهلكات" : "الكل";

      const wsData = [
        [`تقرير رصيد مخزن في تاريخ: ${asOfDate}`],
        [`المخزن: ${result.rows[0]?.warehouse_name || warehouseId}`, `نوع الصنف: ${catLabel}`, `الوحدة: ${unitLabel}`],
        [],
        ["كود الصنف", "اسم الصنف (عربي)", "اسم الصنف (إنجليزي)", "النوع", "المخزن", "الوحدة", "الكمية", "سعر الشراء", "سعر البيع", "إجمالي التكلفة", "إجمالي قيمة البيع"],
        ...result.rows.map(r => [
          r.item_code, r.name_ar, r.name_en,
          r.category === "drug" ? "دواء" : "مستهلك",
          r.warehouse_name, r.unit_label,
          parseFloat(r.qty_display), parseFloat(r.purchase_price_unit),
          parseFloat(r.sale_price_unit), parseFloat(r.total_cost), parseFloat(r.total_sale_value),
        ]),
        [],
        ["", "", "", "", "", "الإجماليات",
          result.rows.reduce((s, r) => s + parseFloat(r.qty_display), 0),
          "", "",
          result.rows.reduce((s, r) => s + parseFloat(r.total_cost), 0),
          result.rows.reduce((s, r) => s + parseFloat(r.total_sale_value), 0),
        ],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [10, 30, 20, 10, 15, 10, 10, 12, 12, 14, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, "رصيد المخزن");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="warehouse-balance-${asOfDate}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      logger.error({ err: err.message }, "[WAREHOUSE_BALANCE_EXPORT] failed");
      return res.status(500).json({ message: err.message });
    }
  });
}
