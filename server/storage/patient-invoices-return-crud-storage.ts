import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {
  async searchSaleInvoicesForReturn(this: DatabaseStorage, params: { invoiceNumber?: string; receiptBarcode?: string; itemBarcode?: string; itemCode?: string; itemId?: string; dateFrom?: string; dateTo?: string; warehouseId?: string; allowedWarehouseIds?: string[] }): Promise<any[]> {
    let resolvedItemId: string | null = null;

    if (params.itemBarcode) {
      const item = await db.execute(sql`SELECT item_id FROM item_barcodes WHERE barcode_value = ${params.itemBarcode} AND is_active = true LIMIT 1`);
      if (!item.rows.length) return [];
      resolvedItemId = (item.rows[0] as Record<string, unknown>).item_id as string;
    } else if (params.itemCode) {
      const item = await db.execute(sql`SELECT id FROM items WHERE item_code = ${params.itemCode} LIMIT 1`);
      if (!item.rows.length) return [];
      resolvedItemId = (item.rows[0] as Record<string, unknown>).id as string;
    } else if (params.itemId) {
      resolvedItemId = params.itemId;
    }

    let whereExtra = "";
    const vals: (string | number)[] = [];
    let idx = 1;

    if (params.invoiceNumber) {
      whereExtra += ` AND h.invoice_number = $${idx++}`;
      vals.push(parseInt(params.invoiceNumber));
    }
    if (params.receiptBarcode) {
      whereExtra += ` AND EXISTS (SELECT 1 FROM cashier_receipts cr WHERE cr.invoice_id = h.id AND cr.receipt_number = $${idx++})`;
      vals.push(parseInt(params.receiptBarcode));
    }
    if (resolvedItemId) {
      whereExtra += ` AND EXISTS (SELECT 1 FROM sales_invoice_lines sl WHERE sl.invoice_id = h.id AND sl.item_id = $${idx++})`;
      vals.push(resolvedItemId);
    }
    if (params.dateFrom) {
      whereExtra += ` AND h.invoice_date >= $${idx++}::date`;
      vals.push(params.dateFrom);
    }
    if (params.dateTo) {
      whereExtra += ` AND h.invoice_date <= $${idx++}::date`;
      vals.push(params.dateTo);
    }
    if (params.warehouseId) {
      whereExtra += ` AND h.warehouse_id = $${idx++}`;
      vals.push(params.warehouseId);
    } else if (params.allowedWarehouseIds && params.allowedWarehouseIds.length > 0) {
      const placeholders = params.allowedWarehouseIds.map(() => `$${idx++}`).join(", ");
      whereExtra += ` AND h.warehouse_id IN (${placeholders})`;
      params.allowedWarehouseIds.forEach((id) => vals.push(id));
    }

    const q = `
      SELECT h.id, h.invoice_number AS "invoiceNumber", h.invoice_date AS "invoiceDate",
             h.warehouse_id AS "warehouseId", w.name_ar AS "warehouseName",
             h.customer_type AS "customerType",
             h.customer_name AS "customerName", h.net_total AS "netTotal",
             (SELECT COUNT(*)::int FROM sales_invoice_lines sl WHERE sl.invoice_id = h.id) AS "itemCount"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.is_return = false
        AND (
          (
            h.status = 'collected'
            AND h.journal_status = 'posted'
            AND EXISTS (
              SELECT 1 FROM journal_entries je
              WHERE je.source_type = 'sales_invoice'
                AND je.source_document_id = h.id
                AND je.status = 'posted'
            )
          )
          OR (h.customer_type = 'credit' AND h.status = 'finalized')
        )${whereExtra}
      ORDER BY h.invoice_date DESC, h.invoice_number DESC
      LIMIT 50
    `;
    const result = await pool.query(q, vals);
    return result.rows;
  },

  async getSaleInvoiceForReturn(this: DatabaseStorage, invoiceId: string): Promise<any | null> {
    const hdr = await db.execute(sql`
      SELECT h.id, h.invoice_number AS "invoiceNumber", h.invoice_date AS "invoiceDate",
             h.warehouse_id AS "warehouseId", w.name_ar AS "warehouseName",
             h.customer_type AS "customerType", h.customer_name AS "customerName",
             h.subtotal, h.discount_percent AS "discountPercent",
             h.discount_value AS "discountValue", h.net_total AS "netTotal",
             h.status, h.journal_status AS "journalStatus"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.id = ${invoiceId} AND h.is_return = false
        AND (
          (h.status = 'collected' AND h.journal_status = 'posted'
           AND EXISTS (
             SELECT 1 FROM journal_entries je
             WHERE je.source_type = 'sales_invoice'
               AND je.source_document_id = h.id
               AND je.status = 'posted'
           ))
          OR (h.customer_type = 'credit' AND h.status = 'finalized')
        )
    `);
    if (!hdr.rows.length) return null;
    const header = hdr.rows[0] as Record<string, unknown>;

    const lines = await db.execute(sql`
      SELECT l.id, l.line_no AS "lineNo", l.item_id AS "itemId",
             i.item_code AS "itemCode", i.name_ar AS "itemNameAr",
             l.unit_level AS "unitLevel", l.qty, l.qty_in_minor AS "qtyInMinor",
             l.sale_price AS "salePrice", l.line_total AS "lineTotal",
             l.expiry_month AS "expiryMonth", l.expiry_year AS "expiryYear", l.lot_id AS "lotId",
             i.major_unit_name AS "majorUnitName", i.medium_unit_name AS "mediumUnitName",
             i.minor_unit_name AS "minorUnitName",
             i.major_to_minor AS "majorToMinor", i.major_to_medium AS "majorToMedium",
             i.medium_to_minor AS "mediumToMinor",
             COALESCE((
               SELECT SUM(ABS(rl.qty_in_minor::numeric))
               FROM sales_invoice_lines rl
               JOIN sales_invoice_headers rh ON rh.id = rl.invoice_id
               WHERE rh.original_invoice_id = ${invoiceId}
                 AND rh.is_return = true
                 AND rh.status IN ('finalized', 'collected')
                 AND rl.item_id = l.item_id
                 AND COALESCE(rl.lot_id,'') = COALESCE(l.lot_id,'')
             ), 0)::numeric AS "previouslyReturnedMinor"
      FROM sales_invoice_lines l
      JOIN items i ON i.id = l.item_id
      WHERE l.invoice_id = ${invoiceId}
      ORDER BY l.line_no
    `);
    header.lines = lines.rows;
    return header;
  },
};

export default methods;
