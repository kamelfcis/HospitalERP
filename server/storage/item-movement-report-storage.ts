import { pool } from "../db";

export interface ItemMovementRow {
  id: string;
  txDate: string;
  txType: "in" | "out";
  referenceType: string;
  referenceId: string;
  qtyChangeMinor: number;
  unitCost: number | null;
  balanceAfterMinor: number;
  lotPurchasePrice: number;
  lotSalePrice: number;
  isBonus: boolean;
  itemCode: string;
  itemName: string;
  majorUnitName: string | null;
  mediumUnitName: string | null;
  minorUnitName: string | null;
  majorToMinor: number;
  mediumToMinor: number;
  warehouseName: string;
  documentNumber: string | null;
  supplierInvoiceNo: string | null;
  userName: string | null;
}

export interface ItemMovementParams {
  itemId: string;
  warehouseId?: string;
  fromDate?: string;
  toDate?: string;
  txTypes?: string[];
}

export async function getItemMovementReport(
  params: ItemMovementParams
): Promise<ItemMovementRow[]> {
  const { itemId, warehouseId, fromDate, toDate, txTypes } = params;

  const result = await pool.query<ItemMovementRow>(
    `
    SELECT
      ilm.id,
      ilm.tx_date                                           AS "txDate",
      ilm.tx_type                                           AS "txType",
      ilm.reference_type                                    AS "referenceType",
      ilm.reference_id                                      AS "referenceId",
      ilm.qty_change_in_minor::float8                       AS "qtyChangeMinor",
      ilm.unit_cost::float8                                 AS "unitCost",
      COALESCE(il.purchase_price, 0)::float8               AS "lotPurchasePrice",
      COALESCE(il.sale_price, 0)::float8                   AS "lotSalePrice",
      (ilm.unit_cost IS NULL OR ilm.unit_cost = 0)          AS "isBonus",
      i.item_code                                           AS "itemCode",
      i.name_ar                                             AS "itemName",
      i.major_unit_name                                     AS "majorUnitName",
      i.medium_unit_name                                    AS "mediumUnitName",
      i.minor_unit_name                                     AS "minorUnitName",
      COALESCE(i.major_to_minor, 1)::float8                AS "majorToMinor",
      COALESCE(i.medium_to_minor, 1)::float8               AS "mediumToMinor",
      COALESCE(w.name_ar, '—')                             AS "warehouseName",
      CASE ilm.reference_type
        WHEN 'receiving'       THEN rh.receiving_number::text
        WHEN 'sales_invoice'   THEN sih.invoice_number::text
        WHEN 'patient_invoice' THEN pih.invoice_number::text
        WHEN 'transfer'        THEN st.transfer_number::text
        WHEN 'stock_count'     THEN scs.session_number::text
        WHEN 'purchase_return' THEN prh.return_number::text
        ELSE NULL
      END                                                   AS "documentNumber",
      CASE WHEN ilm.reference_type = 'receiving'
        THEN rh.supplier_invoice_no ELSE NULL
      END                                                   AS "supplierInvoiceNo",
      CASE ilm.reference_type
        WHEN 'sales_invoice'   THEN usi.full_name
        WHEN 'stock_count'     THEN usc.full_name
        WHEN 'purchase_return' THEN upr.full_name
        ELSE NULL
      END                                                   AS "userName",
      SUM(ilm.qty_change_in_minor) OVER (
        PARTITION BY il.item_id, COALESCE(ilm.warehouse_id, il.warehouse_id)
        ORDER BY ilm.tx_date, ilm.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::float8                                             AS "balanceAfterMinor"

    FROM  inventory_lot_movements ilm
    JOIN  inventory_lots          il  ON il.id  = ilm.lot_id
    JOIN  items                   i   ON i.id   = il.item_id
    LEFT JOIN warehouses          w   ON w.id   = COALESCE(ilm.warehouse_id, il.warehouse_id)
    LEFT JOIN receiving_headers   rh  ON rh.id  = ilm.reference_id AND ilm.reference_type = 'receiving'
    LEFT JOIN sales_invoice_headers sih ON sih.id = ilm.reference_id AND ilm.reference_type = 'sales_invoice'
    LEFT JOIN patient_invoice_headers pih ON pih.id = ilm.reference_id AND ilm.reference_type = 'patient_invoice'
    LEFT JOIN store_transfers     st  ON st.id  = ilm.reference_id AND ilm.reference_type = 'transfer'
    LEFT JOIN stock_count_sessions scs ON scs.id = ilm.reference_id AND ilm.reference_type = 'stock_count'
    LEFT JOIN purchase_return_headers prh ON prh.id = ilm.reference_id AND ilm.reference_type = 'purchase_return'
    LEFT JOIN users               usi ON usi.id = sih.created_by
    LEFT JOIN users               usc ON usc.id = scs.posted_by
    LEFT JOIN users               upr ON upr.id = prh.created_by

    WHERE il.item_id = $1
      AND ($2::text IS NULL OR COALESCE(ilm.warehouse_id, il.warehouse_id) = $2)
      AND ($3::date IS NULL OR ilm.tx_date::date >= $3::date)
      AND ($4::date IS NULL OR ilm.tx_date::date <= $4::date)
      AND ($5::text[] IS NULL OR ilm.reference_type = ANY($5))

    ORDER BY ilm.tx_date, ilm.created_at
    `,
    [
      itemId,
      warehouseId || null,
      fromDate || null,
      toDate || null,
      txTypes && txTypes.length > 0 ? txTypes : null,
    ]
  );

  return result.rows;
}
