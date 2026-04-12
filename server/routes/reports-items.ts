import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./_auth";
import { logger } from "../lib/logger";
import * as XLSX from "xlsx";
import { getItemMovementReport } from "../storage/item-movement-report-storage";

export function registerReportsItemsRoutes(app: Express) {

  app.get("/api/reports/item-movements", requireAuth, async (req, res) => {
    try {
      const { fromDate, toDate, itemId, warehouseId } = req.query as Record<string, string | undefined>;

      if (!fromDate || !toDate) {
        return res.status(400).json({ error: "fromDate و toDate مطلوبان" });
      }

      const dateRx = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRx.test(fromDate) || !dateRx.test(toDate)) {
        return res.status(400).json({ error: "صيغة التاريخ يجب أن تكون YYYY-MM-DD" });
      }

      if (fromDate > toDate) {
        return res.status(400).json({ error: "fromDate يجب أن يكون قبل أو يساوي toDate" });
      }

      const rows = await db.execute(sql`
        WITH

        period_moves AS (
          SELECT
            item_id,
            warehouse_id,
            MAX(item_name)                      AS item_name,
            MAX(item_category)                  AS item_category,
            MAX(warehouse_name)                 AS warehouse_name,
            SUM(received_qty)                   AS received_qty,
            SUM(received_value)                 AS received_value,
            SUM(receipt_tx_count)               AS receipt_tx_count,
            SUM(issued_qty)                     AS issued_qty,
            SUM(issued_value)                   AS issued_value,
            SUM(issue_tx_count)                 AS issue_tx_count,
            SUM(transfer_in_qty)                AS transfer_in_qty,
            SUM(transfer_out_qty)               AS transfer_out_qty,
            SUM(return_in_qty)                  AS return_in_qty,
            SUM(return_out_qty)                 AS return_out_qty,
            SUM(adjustment_qty)                 AS adjustment_qty,
            SUM(net_qty_change)                 AS net_qty_change
          FROM rpt_item_movements_summary
          WHERE movement_date BETWEEN ${fromDate}::date AND ${toDate}::date
            AND (${itemId ?? null}::text IS NULL OR item_id = ${itemId ?? null})
            AND (${warehouseId ?? null}::text IS NULL OR warehouse_id = ${warehouseId ?? null})
          GROUP BY item_id, warehouse_id
        ),

        after_period AS (
          SELECT
            item_id,
            warehouse_id,
            SUM(net_qty_change) AS net_after_end
          FROM rpt_item_movements_summary
          WHERE movement_date > ${toDate}::date
            AND (${itemId ?? null}::text IS NULL OR item_id = ${itemId ?? null})
            AND (${warehouseId ?? null}::text IS NULL OR warehouse_id = ${warehouseId ?? null})
          GROUP BY item_id, warehouse_id
        )

        SELECT
          pm.item_id                                                     AS "itemId",
          pm.item_name                                                   AS "itemName",
          pm.item_category                                               AS "itemCategory",
          pm.warehouse_id                                                AS "warehouseId",
          pm.warehouse_name                                              AS "warehouseName",
          pm.received_qty::numeric                                       AS "receivedQty",
          pm.received_value::numeric                                     AS "receivedValue",
          pm.issued_qty::numeric                                         AS "issuedQty",
          pm.issued_value::numeric                                       AS "issuedValue",
          pm.transfer_in_qty::numeric                                    AS "transferInQty",
          pm.transfer_out_qty::numeric                                   AS "transferOutQty",
          pm.return_in_qty::numeric                                      AS "returnInQty",
          pm.return_out_qty::numeric                                     AS "returnOutQty",
          pm.adjustment_qty::numeric                                     AS "adjustmentQty",
          pm.net_qty_change::numeric                                     AS "netQtyChange",
          COALESCE(snap.qty_in_minor, 0)::numeric                       AS "currentQty",
          (COALESCE(snap.qty_in_minor, 0) - COALESCE(ap.net_after_end, 0))::numeric
                                                                         AS "closingQty",
          (COALESCE(snap.qty_in_minor, 0) - COALESCE(ap.net_after_end, 0)
            - pm.net_qty_change)::numeric                               AS "openingQty"

        FROM period_moves pm
        LEFT JOIN after_period ap
          ON ap.item_id = pm.item_id AND ap.warehouse_id = pm.warehouse_id
        LEFT JOIN rpt_inventory_snapshot snap
          ON snap.item_id = pm.item_id AND snap.warehouse_id = pm.warehouse_id
        ORDER BY pm.item_name, pm.warehouse_name
      `);

      res.set("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
      return res.json({
        fromDate,
        toDate,
        itemId:      itemId ?? null,
        warehouseId: warehouseId ?? null,
        rows:        (rows as any).rows ?? rows,
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[reports] item-movements error");
      return res.status(500).json({ error: "خطأ في استرجاع تقرير الحركات" });
    }
  });

  app.get("/api/reports/item-movement-detail", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const {
        itemId,
        warehouseId,
        fromDate,
        toDate,
        txTypes: txTypesRaw,
        page:     pageRaw,
        pageSize: pageSizeRaw,
      } = req.query as Record<string, string | undefined>;

      if (!itemId) {
        return res.status(400).json({ error: "itemId مطلوب" });
      }

      const txTypes = txTypesRaw
        ? txTypesRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      const result = await getItemMovementReport({
        itemId,
        warehouseId: warehouseId || undefined,
        fromDate:    fromDate    || undefined,
        toDate:      toDate      || undefined,
        txTypes,
        page:        pageRaw     ? parseInt(pageRaw,     10) : 1,
        pageSize:    pageSizeRaw ? parseInt(pageSizeRaw, 10) : 50,
      });

      logger.info(
        { itemId, page: result.page, pageSize: result.pageSize, total: result.total, durationMs: Date.now() - t0 },
        "[PERF] item-movement-detail"
      );

      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[reports] item-movement-detail error");
      return res.status(500).json({ error: "خطأ في استرجاع تقرير حركة الصنف" });
    }
  });

  app.get("/api/reports/item-movement-detail/export", requireAuth, async (req, res) => {
    try {
      const {
        itemId,
        warehouseId,
        fromDate,
        toDate,
        txTypes: txTypesRaw,
        unitLevel = "minor",
      } = req.query as Record<string, string | undefined>;

      if (!itemId) {
        return res.status(400).json({ error: "itemId مطلوب" });
      }

      const txTypes = txTypesRaw
        ? txTypesRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      const exportResult = await getItemMovementReport({
        itemId,
        warehouseId: warehouseId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        txTypes,
        page:     1,
        pageSize: 50_000,
      });
      const rows = exportResult.rows;

      if (rows.length === 0) {
        return res.status(404).json({ error: "لا توجد بيانات للتصدير" });
      }

      const first = rows[0];
      const majorToMinor = first.majorToMinor || 1;
      const mediumToMinor = first.mediumToMinor || 1;

      const convertQty = (minor: number): number => {
        if (unitLevel === "major" && majorToMinor > 1) return minor / majorToMinor;
        if (unitLevel === "medium" && mediumToMinor > 1) return minor / mediumToMinor;
        return minor;
      };

      const unitName = (): string => {
        if (unitLevel === "major") return first.majorUnitName || "كبيرة";
        if (unitLevel === "medium") return first.mediumUnitName || "وسط";
        return first.minorUnitName || "صغيرة";
      };

      const TX_LABELS: Record<string, string> = {
        receiving:       "استلام شراء",
        sales_invoice:   "فاتورة مبيعات",
        patient_invoice: "فاتورة مريض",
        transfer:        "تحويل مخزن",
        stock_count:     "جرد دوري",
        purchase_return: "مرتجع مشتريات",
      };

      const u = unitName();
      const excelData = rows.map((r, idx) => ({
        "#": idx + 1,
        "التاريخ":          new Date(r.txDate).toLocaleDateString("ar-EG"),
        "الوقت":            new Date(r.txDate).toLocaleTimeString("ar-EG"),
        "نوع الحركة":       TX_LABELS[r.referenceType] ?? r.referenceType,
        "الاتجاه":          r.txType === "in" ? "وارد" : "صادر",
        [`الكمية (${u})`]:  parseFloat(convertQty(r.qtyChangeMinor).toFixed(4)),
        [`الرصيد (${u})`]:  parseFloat(convertQty(r.balanceAfterMinor).toFixed(4)),
        "سعر الشراء":       r.unitCost ?? r.lotPurchasePrice,
        "سعر البيع":        r.lotSalePrice,
        "المستودع":         r.warehouseName,
        "رقم المستند":      r.documentNumber ?? "",
        "فاتورة المورد":    r.supplierInvoiceNo ?? "",
        "المستخدم":         r.userName ?? "—",
        "هدية":             r.isBonus ? "نعم" : "",
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "حركة الصنف");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const itemName = rows[0].itemName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "_");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="item-movement-${itemName}.xlsx"`);
      return res.send(buf);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[reports] item-movement-detail/export error");
      return res.status(500).json({ error: "خطأ في تصدير التقرير" });
    }
  });

}
