/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Patient Invoices Returns Storage — مردودات المبيعات
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - البحث عن فواتير المردود (searchSaleInvoicesForReturn)
 *  - تفاصيل فاتورة المردود (getSaleInvoiceForReturn)
 *  - إنشاء مردود مبيعات (createSalesReturn)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { eq, desc, and, sql, asc, gte, lte, ilike } from "drizzle-orm";
import {
  services,
  departments,
  items,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  auditLog,
} from "@shared/schema";
import type {
  PatientInvoiceHeader,
  PatientInvoiceWithDetails,
  InsertPatientInvoiceHeader,
  InsertPatientInvoiceLine,
  InsertPatientInvoicePayment,
  PatientInvoiceLine,
  PatientInvoicePayment,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";

const methods = {
  async searchSaleInvoicesForReturn(this: DatabaseStorage, params: { invoiceNumber?: string; receiptBarcode?: string; itemBarcode?: string; itemCode?: string; itemId?: string; dateFrom?: string; dateTo?: string; warehouseId?: string }): Promise<any[]> {
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
    }

    const q = `
      SELECT h.id, h.invoice_number AS "invoiceNumber", h.invoice_date AS "invoiceDate",
             h.warehouse_id AS "warehouseId", w.name_ar AS "warehouseName",
             h.customer_name AS "customerName", h.net_total AS "netTotal",
             (SELECT COUNT(*)::int FROM sales_invoice_lines sl WHERE sl.invoice_id = h.id) AS "itemCount"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.is_return = false AND h.status = 'finalized'${whereExtra}
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
             h.discount_value AS "discountValue", h.net_total AS "netTotal"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.id = ${invoiceId} AND h.is_return = false AND h.status = 'finalized'
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
             i.major_to_minor AS "majorToMinor", i.medium_to_minor AS "mediumToMinor",
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

  async createSalesReturn(this: DatabaseStorage, data: {
    originalInvoiceId: string; warehouseId: string;
    returnLines: { originalLineId: string; itemId: string; unitLevel: string; qty: string; qtyInMinor: string; salePrice: string; lineTotal: string; expiryMonth: number | null; expiryYear: number | null; lotId: string | null }[];
    discountType: string; discountPercent: string; discountValue: string; notes: string; createdBy: string;
  }): Promise<any> {
    return await db.transaction(async (tx) => {
      const origHeader = await tx.execute(sql`
        SELECT id, invoice_date, warehouse_id, customer_type, customer_name, contract_company, pharmacy_id, status, is_return
        FROM sales_invoice_headers WHERE id = ${data.originalInvoiceId} FOR UPDATE
      `);
      const orig = origHeader.rows[0] as Record<string, unknown>;
      if (!orig) throw new Error("الفاتورة الأصلية غير موجودة");
      if (orig.is_return) throw new Error("لا يمكن إرجاع فاتورة مرتجع");
      if (orig.status !== "finalized") throw new Error("الفاتورة الأصلية غير مرحّلة");
      if (orig.warehouse_id !== data.warehouseId) throw new Error("المخزن لا يتطابق مع فاتورة البيع الأصلية");

      const origLines = await tx.execute(sql`
        SELECT l.id, l.item_id, l.unit_level, l.qty_in_minor, l.sale_price, l.line_total, l.lot_id,
               COALESCE((
                 SELECT SUM(ABS(rl2.qty_in_minor::numeric))
                 FROM sales_invoice_lines rl2
                 JOIN sales_invoice_headers rh2 ON rh2.id = rl2.invoice_id
                 WHERE rh2.original_invoice_id = ${data.originalInvoiceId}
                   AND rh2.is_return = true AND rh2.status IN ('finalized', 'collected')
                   AND rl2.item_id = l.item_id AND COALESCE(rl2.lot_id,'') = COALESCE(l.lot_id,'')
               ), 0)::numeric AS "previouslyReturnedMinor"
        FROM sales_invoice_lines l WHERE l.invoice_id = ${data.originalInvoiceId}
      `);
      const origLineMap = new Map<string, Record<string, unknown>>();
      for (const ol of origLines.rows as Array<Record<string, unknown>>) {
        origLineMap.set(ol.id as string, ol);
      }

      const validatedLines: typeof data.returnLines = [];
      for (const rl of data.returnLines) {
        const origLine = origLineMap.get(rl.originalLineId);
        if (!origLine) throw new Error(`السطر ${rl.originalLineId} لا ينتمي للفاتورة الأصلية`);
        if (origLine.item_id !== rl.itemId) throw new Error(`الصنف لا يتطابق مع السطر الأصلي`);

        const availMinor = parseFloat(origLine.qty_in_minor as string) - parseFloat(origLine.previouslyReturnedMinor as string);
        let returnMinor = parseFloat(rl.qtyInMinor);
        if (returnMinor <= 0) continue;
        if (returnMinor > availMinor) returnMinor = availMinor;
        if (returnMinor <= 0) continue;

        const pricePerMinor = parseFloat(origLine.line_total as string) / (parseFloat(origLine.qty_in_minor as string) || 1);
        const lineTotal = Math.round(returnMinor * pricePerMinor * 100) / 100;

        validatedLines.push({
          ...rl,
          qtyInMinor: String(returnMinor),
          salePrice: origLine.sale_price as string,
          lineTotal: lineTotal.toFixed(2),
          lotId: origLine.lot_id as string | null,
        });
      }

      if (!validatedLines.length) throw new Error("لا توجد كميات صالحة للإرجاع");

      const subtotal = validatedLines.reduce((s, l) => s + parseFloat(l.lineTotal), 0);
      const discountValue = data.discountType === "percent"
        ? subtotal * (parseFloat(data.discountPercent) || 0) / 100
        : Math.min(parseFloat(data.discountValue) || 0, subtotal);
      const netTotal = Math.max(0, subtotal - discountValue);

      const nextNumResult = await tx.execute(sql`
        SELECT COALESCE(MAX(invoice_number), 0) + 1 AS "nextNum" FROM sales_invoice_headers
      `);
      const nextInvoiceNumber = (nextNumResult.rows[0] as Record<string, unknown>).nextNum;

      const hdr = await tx.execute(sql`
        INSERT INTO sales_invoice_headers
          (invoice_number, invoice_date, warehouse_id, pharmacy_id, customer_type, customer_name, contract_company,
           status, subtotal, discount_type, discount_percent, discount_value, net_total,
           notes, created_by, is_return, original_invoice_id, finalized_at, finalized_by)
        VALUES
          (${nextInvoiceNumber}, now()::date, ${orig.warehouse_id}, ${orig.pharmacy_id ?? null},
           ${orig.customer_type ?? 'cash'}, ${orig.customer_name ?? null}, ${orig.contract_company ?? null},
           'finalized', ${subtotal.toFixed(2)}, ${data.discountType},
           ${data.discountType === 'percent' ? data.discountPercent : '0'},
           ${discountValue.toFixed(2)}, ${netTotal.toFixed(2)},
           ${data.notes || null}, ${data.createdBy}, true, ${data.originalInvoiceId}, now(), ${data.createdBy})
        RETURNING id, invoice_number AS "invoiceNumber"
      `);
      const returnId = (hdr.rows[0] as Record<string, unknown>).id;
      const returnNumber = (hdr.rows[0] as Record<string, unknown>).invoiceNumber;

      for (let i = 0; i < validatedLines.length; i++) {
        const rl = validatedLines[i];
        await tx.execute(sql`
          INSERT INTO sales_invoice_lines
            (invoice_id, line_no, item_id, unit_level, qty, qty_in_minor, sale_price, line_total, expiry_month, expiry_year, lot_id)
          VALUES
            (${returnId}, ${i + 1}, ${rl.itemId}, ${rl.unitLevel}, ${rl.qty}, ${rl.qtyInMinor},
             ${rl.salePrice}, ${rl.lineTotal}, ${rl.expiryMonth ?? null}, ${rl.expiryYear ?? null}, ${rl.lotId ?? null})
        `);

        if (rl.lotId) {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${parseFloat(rl.qtyInMinor)}, updated_at = NOW()
            WHERE id = ${rl.lotId}
          `);
        } else {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${parseFloat(rl.qtyInMinor)}, updated_at = NOW()
            WHERE id = (
              SELECT id FROM inventory_lots
              WHERE item_id = ${rl.itemId} AND warehouse_id = ${orig.warehouse_id}
                AND COALESCE(expiry_month, 0) = COALESCE(${rl.expiryMonth ?? null}, 0)
                AND COALESCE(expiry_year, 0) = COALESCE(${rl.expiryYear ?? null}, 0)
              ORDER BY expiry_year NULLS LAST, expiry_month NULLS LAST
              LIMIT 1
            )
          `);
        }
      }

      return { id: returnId, invoiceNumber: returnNumber, netTotal: netTotal.toFixed(2) };
    });
  },
};

export default methods;
