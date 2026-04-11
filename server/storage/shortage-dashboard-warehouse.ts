import { pool } from "../db";
import type { DisplayUnit, WarehouseStockRow } from "./shortage-types";
import {
  buildQtyDisplayExpr,
  buildDisplayUnitNameExpr,
} from "./shortage-helpers";

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
