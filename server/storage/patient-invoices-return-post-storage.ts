import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  inventoryLotMovements,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logger } from "../lib/logger";

const methods = {
  async createSalesReturn(this: DatabaseStorage, data: {
    originalInvoiceId: string; warehouseId: string;
    returnLines: { originalLineId: string; itemId: string; unitLevel: string; qty: string; qtyInMinor: string; salePrice: string; lineTotal: string; expiryMonth: number | null; expiryYear: number | null; lotId: string | null }[];
    discountType: string; discountPercent: string; discountValue: string; notes: string; createdBy: string;
  }): Promise<any> {
    const result = await db.transaction(async (tx) => {
      const origHeader = await tx.execute(sql`
        SELECT id, invoice_date, warehouse_id, customer_type, customer_name, contract_company, pharmacy_id,
               status, is_return, journal_status
        FROM sales_invoice_headers WHERE id = ${data.originalInvoiceId} FOR UPDATE
      `);
      const orig = origHeader.rows[0] as Record<string, unknown>;
      if (!orig) throw new Error("الفاتورة الأصلية غير موجودة");
      if (orig.is_return) throw new Error("لا يمكن إرجاع فاتورة مرتجع");

      const isCreditInvoice = orig.customer_type === "credit";

      if (!isCreditInvoice && orig.status !== "collected") {
        throw new Error("لا يمكن إنشاء مرتجع لأن الفاتورة الأصلية لم تُحصَّل بالكامل من الخزنة");
      }
      if (isCreditInvoice && orig.status !== "finalized") {
        throw new Error("لا يمكن إنشاء مرتجع — الفاتورة الآجل يجب أن تكون مرحَّلة");
      }

      if (!isCreditInvoice) {
        const jeCheck = await tx.execute(sql`
          SELECT status FROM journal_entries
          WHERE source_type = 'sales_invoice'
            AND source_document_id = ${data.originalInvoiceId}
          LIMIT 1
        `);
        const jeStatus = (jeCheck.rows[0] as Record<string, unknown> | undefined)?.status as string | undefined;
        if (jeStatus !== "posted") {
          const detail = !jeStatus ? "لا يوجد قيد مرتبط بالفاتورة" : `حالة القيد: ${jeStatus}`;
          throw new Error(`لا يمكن إنشاء مرتجع قبل اكتمال القيد المالي للفاتورة الأصلية (${detail})`);
        }
      }

      if (orig.warehouse_id !== data.warehouseId) throw new Error("المخزن لا يتطابق مع فاتورة البيع الأصلية");

      const origLines = await tx.execute(sql`
        SELECT l.id, l.item_id, l.unit_level, l.qty_in_minor, l.sale_price, l.line_total, l.lot_id,
               l.tax_type, l.tax_rate, l.tax_amount, l.net_unit_price, l.gross_unit_price, l.line_net_amount, l.line_gross_amount,
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

      const validatedLines: (typeof data.returnLines[0] & {
        taxType: string | null; taxRate: string | null; taxAmount: string;
        netUnitPrice: string; grossUnitPrice: string; lineNetAmount: string; lineGrossAmount: string;
      })[] = [];

      for (const rl of data.returnLines) {
        const origLine = origLineMap.get(rl.originalLineId);
        if (!origLine) throw new Error(`السطر ${rl.originalLineId} لا ينتمي للفاتورة الأصلية`);
        if (origLine.item_id !== rl.itemId) throw new Error(`الصنف لا يتطابق مع السطر الأصلي`);

        const availMinor = parseFloat(origLine.qty_in_minor as string) - parseFloat(origLine.previouslyReturnedMinor as string);
        const returnMinor = parseFloat(rl.qtyInMinor);
        if (returnMinor <= 0) continue;
        if (returnMinor > availMinor + 0.0001) {
          throw new Error(
            `لا يمكن إرجاع كمية أكبر من الكمية المتاحة بعد احتساب المرتجعات السابقة (الصنف: ${rl.itemId})`
          );
        }
        const clampedMinor = Math.min(returnMinor, availMinor);
        if (clampedMinor <= 0) continue;

        const origQtyMinor = parseFloat(origLine.qty_in_minor as string) || 1;
        const returnFraction = clampedMinor / origQtyMinor;

        const pricePerMinor = parseFloat(origLine.line_total as string) / origQtyMinor;
        const lineTotal = Math.round(clampedMinor * pricePerMinor * 100) / 100;

        const origTaxAmount      = parseFloat(origLine.tax_amount as string || "0");
        const origLineNetAmount  = parseFloat(origLine.line_net_amount as string || "0");
        const origLineGrossAmount= parseFloat(origLine.line_gross_amount as string || "0");
        const lineTaxAmount      = parseFloat((origTaxAmount      * returnFraction).toFixed(2));
        const lineNetAmount      = parseFloat((origLineNetAmount  * returnFraction).toFixed(2));
        const lineGrossAmount    = origLineGrossAmount > 0
          ? parseFloat((origLineGrossAmount * returnFraction).toFixed(2))
          : lineTotal;

        validatedLines.push({
          ...rl,
          qtyInMinor: String(clampedMinor),
          salePrice: origLine.sale_price as string,
          lineTotal: lineTotal.toFixed(2),
          lotId: origLine.lot_id as string | null,
          taxType: (origLine.tax_type as string | null) ?? null,
          taxRate: (origLine.tax_rate as string | null) ?? null,
          taxAmount: lineTaxAmount.toFixed(2),
          netUnitPrice: (origLine.net_unit_price as string | null) ?? "0",
          grossUnitPrice: (origLine.gross_unit_price as string | null) ?? "0",
          lineNetAmount: lineNetAmount.toFixed(2),
          lineGrossAmount: lineGrossAmount.toFixed(2),
        });
      }

      if (!validatedLines.length) throw new Error("لا توجد كميات صالحة للإرجاع");

      const subtotal = validatedLines.reduce((s, l) => s + parseFloat(l.lineTotal), 0);
      const totalReturnTaxAmount  = validatedLines.reduce((s, l) => s + parseFloat(l.taxAmount), 0);
      const totalReturnNetAmount  = validatedLines.reduce((s, l) => s + parseFloat(l.lineNetAmount), 0);
      const totalReturnGrossAmount= validatedLines.reduce((s, l) => s + parseFloat(l.lineGrossAmount), 0);
      const discountValue = data.discountType === "percent"
        ? subtotal * (parseFloat(data.discountPercent) || 0) / 100
        : Math.min(parseFloat(data.discountValue) || 0, subtotal);
      const netTotal = Math.max(0, subtotal - discountValue);

      const nextNumResult = await tx.execute(sql`
        SELECT COALESCE(MAX(invoice_number), 0) + 1 AS "nextNum" FROM sales_invoice_headers
      `);
      const nextInvoiceNumber = (nextNumResult.rows[0] as Record<string, unknown>).nextNum;

      const finalTaxAmount  = parseFloat(totalReturnTaxAmount.toFixed(2));
      const finalNetAmount  = parseFloat(totalReturnNetAmount.toFixed(2));
      const finalGrossAmount= parseFloat(totalReturnGrossAmount.toFixed(2));

      const returnStatus = isCreditInvoice ? "collected" : "finalized";

      const hdr = await tx.execute(sql`
        INSERT INTO sales_invoice_headers
          (invoice_number, invoice_date, warehouse_id, pharmacy_id, customer_type, customer_name, contract_company,
           status, subtotal, discount_type, discount_percent, discount_value, net_total,
           notes, created_by, is_return, original_invoice_id, finalized_at, finalized_by,
           total_tax_amount, total_net_amount, total_gross_amount)
        VALUES
          (${nextInvoiceNumber}, now()::date, ${orig.warehouse_id}, ${orig.pharmacy_id ?? null},
           ${orig.customer_type ?? 'cash'}, ${orig.customer_name ?? null}, ${orig.contract_company ?? null},
           ${returnStatus}, ${subtotal.toFixed(2)}, ${data.discountType},
           ${data.discountType === 'percent' ? data.discountPercent : '0'},
           ${discountValue.toFixed(2)}, ${netTotal.toFixed(2)},
           ${data.notes || null}, ${data.createdBy}, true, ${data.originalInvoiceId}, now(), ${data.createdBy},
           ${finalTaxAmount > 0 ? finalTaxAmount.toFixed(2) : null},
           ${finalNetAmount > 0 ? finalNetAmount.toFixed(2) : null},
           ${finalGrossAmount > 0 ? finalGrossAmount.toFixed(2) : null})
        RETURNING id, invoice_number AS "invoiceNumber"
      `);
      const returnId = (hdr.rows[0] as Record<string, unknown>).id;
      const returnNumber = (hdr.rows[0] as Record<string, unknown>).invoiceNumber;

      for (let i = 0; i < validatedLines.length; i++) {
        const rl = validatedLines[i];
        await tx.execute(sql`
          INSERT INTO sales_invoice_lines
            (invoice_id, line_no, item_id, unit_level, qty, qty_in_minor, sale_price, line_total, expiry_month, expiry_year, lot_id,
             tax_type, tax_rate, tax_amount, net_unit_price, gross_unit_price, line_net_amount, line_gross_amount)
          VALUES
            (${returnId}, ${i + 1}, ${rl.itemId}, ${rl.unitLevel}, ${rl.qty}, ${rl.qtyInMinor},
             ${rl.salePrice}, ${rl.lineTotal}, ${rl.expiryMonth ?? null}, ${rl.expiryYear ?? null}, ${rl.lotId ?? null},
             ${rl.taxType ?? null}, ${rl.taxRate ?? null}, ${rl.taxAmount},
             ${rl.netUnitPrice}, ${rl.grossUnitPrice}, ${rl.lineNetAmount}, ${rl.lineGrossAmount})
        `);

        if (rl.lotId) {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${parseFloat(rl.qtyInMinor)}, updated_at = NOW()
            WHERE id = ${rl.lotId}
          `);

          const lotRow = await tx.execute(sql`
            SELECT purchase_price FROM inventory_lots WHERE id = ${rl.lotId} LIMIT 1
          `);
          const unitCost = (lotRow.rows[0] as Record<string, unknown>)?.purchase_price ?? "0";

          await tx.insert(inventoryLotMovements).values({
            lotId:           rl.lotId,
            warehouseId:     data.warehouseId,
            txType:          "in",
            qtyChangeInMinor: String(parseFloat(rl.qtyInMinor)),
            unitCost:        String(unitCost),
            referenceType:   "sales_return",
            referenceId:     returnId,
          });
        } else {
          const lotResult = await tx.execute(sql`
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
            RETURNING id, purchase_price
          `);
          const updatedLot = lotResult.rows[0] as Record<string, unknown> | undefined;
          if (updatedLot?.id) {
            await tx.insert(inventoryLotMovements).values({
              lotId:           updatedLot.id as string,
              warehouseId:     data.warehouseId,
              txType:          "in",
              qtyChangeInMinor: String(parseFloat(rl.qtyInMinor)),
              unitCost:        String(updatedLot.purchase_price ?? "0"),
              referenceType:   "sales_return",
              referenceId:     returnId,
            });
          }
        }
      }

      return {
        id:            returnId,
        invoiceNumber: returnNumber,
        netTotal:      netTotal.toFixed(2),
        pharmacyId:    orig.pharmacy_id as string | null,
        warehouseId:   data.warehouseId,
      };
    });

    const createdId = result.id as string;
    this.generateSalesReturnJournal(createdId).catch((err: unknown) => {
      logger.error({ returnId: createdId, err: err instanceof Error ? err.message : String(err) },
        "[SALES_RETURN] generateSalesReturnJournal: background failure — return was created successfully");
    });

    return result;
  },
};

export default methods;
