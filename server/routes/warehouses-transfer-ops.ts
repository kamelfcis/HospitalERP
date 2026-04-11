import type { Express } from "express";
import { storage } from "../storage";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";

export function registerTransferOps(app: Express) {
  app.post("/api/transfers/:id/post", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_EXECUTE), async (req, res) => {
    try {
      const existing = await storage.getTransfer(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "التحويل غير موجود" });
      if (existing.status !== "draft") return res.status(409).json({ message: "التحويل مُرحّل بالفعل", code: "ALREADY_POSTED" });

      await storage.assertPeriodOpen(existing.transferDate);

      const transfer = await storage.postTransfer(req.params.id as string);
      await storage.createAuditLog({ tableName: "store_transfers", recordId: req.params.id as string, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
      scheduleInventorySnapshotRefresh("transfer_posted");
      res.json(transfer);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? error.message : String(error)).includes("غير مسودة") || (error instanceof Error ? error.message : String(error)).includes("مُرحّل بالفعل")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)), code: "ALREADY_POSTED" });
      }
      if ((error instanceof Error ? error.message : String(error)).includes("غير كافية") || (error instanceof Error ? error.message : String(error)).includes("مختلفين") || (error instanceof Error ? error.message : String(error)).includes("لا يمكن") || (error instanceof Error ? error.message : String(error)).includes("غير موجود") || (error instanceof Error ? error.message : String(error)).includes("مطلوب")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/transfers/:id", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_EXECUTE), async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      const deleted = await storage.deleteTransfer(req.params.id as string, reason);
      if (!deleted) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("مُرحّل") || (error instanceof Error ? error.message : String(error)).includes("لا يمكن حذف")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)), code: "DOCUMENT_POSTED" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.get("/api/transfer-preparation/query", requireAuth, async (req, res) => {
    try {
      const { sourceWarehouseId, destWarehouseId, dateFrom, dateTo } = req.query;
      if (!sourceWarehouseId || !destWarehouseId || !dateFrom || !dateTo) {
        return res.status(400).json({ message: "جميع الحقول مطلوبة: المخزن المصدر، المخزن الوجهة، من تاريخ، إلى تاريخ" });
      }
      if (sourceWarehouseId === destWarehouseId) {
        return res.status(400).json({ message: "المخزن المصدر والمخزن الوجهة لا يمكن أن يكونا نفس المخزن" });
      }

      const result = await db.execute(sql`
        WITH sales_retail AS (
          SELECT l.item_id, SUM(l.qty_in_minor::numeric) AS total_sold_minor
          FROM sales_invoice_lines l
          JOIN sales_invoice_headers h ON l.invoice_id = h.id
          WHERE h.warehouse_id = ${destWarehouseId as string}
            AND h.invoice_date >= ${dateFrom as string}
            AND h.invoice_date <= ${dateTo as string}
            AND h.status = 'finalized'
            AND h.is_return = false
          GROUP BY l.item_id
        ),
        sales_patient AS (
          SELECT l.item_id,
            SUM(
              CASE
                WHEN l.unit_level = 'major' THEN l.quantity::numeric * COALESCE(i.major_to_minor::numeric, 1)
                WHEN l.unit_level = 'medium' THEN l.quantity::numeric * COALESCE(i.medium_to_minor::numeric, 1)
                ELSE l.quantity::numeric
              END
            ) AS total_sold_minor
          FROM patient_invoice_lines l
          JOIN patient_invoice_headers h ON l.header_id = h.id
          JOIN items i ON l.item_id = i.id
          WHERE h.warehouse_id = ${destWarehouseId as string}
            AND h.invoice_date >= ${dateFrom as string}
            AND h.invoice_date <= ${dateTo as string}
            AND h.status = 'finalized'
            AND l.line_type IN ('drug', 'consumable')
            AND l.item_id IS NOT NULL
            AND l.is_void = false
          GROUP BY l.item_id
        ),
        combined AS (
          SELECT item_id, SUM(total_sold_minor) AS total_sold
          FROM (
            SELECT * FROM sales_retail
            UNION ALL
            SELECT * FROM sales_patient
          ) u
          GROUP BY item_id
        ),
        source_stock AS (
          SELECT item_id,
            SUM(qty_in_minor::numeric) AS stock,
            MIN(CASE WHEN qty_in_minor::numeric > 0 AND expiry_year IS NOT NULL
              THEN make_date(expiry_year, GREATEST(COALESCE(expiry_month, 1), 1), 1)
            END) AS nearest_expiry
          FROM inventory_lots
          WHERE warehouse_id = ${sourceWarehouseId as string}
            AND is_active = true
            AND qty_in_minor::numeric > 0
          GROUP BY item_id
        ),
        dest_stock AS (
          SELECT item_id, SUM(qty_in_minor::numeric) AS stock
          FROM inventory_lots
          WHERE warehouse_id = ${destWarehouseId as string}
            AND is_active = true
            AND qty_in_minor::numeric > 0
          GROUP BY item_id
        )
        SELECT
          ss.item_id,
          i.item_code,
          i.name_ar,
          i.has_expiry,
          i.minor_unit_name,
          i.major_unit_name,
          i.medium_unit_name,
          i.major_to_minor::text,
          i.medium_to_minor::text,
          COALESCE(c.total_sold, 0)::text  AS total_sold,
          ss.stock::text                   AS source_stock,
          COALESCE(ds.stock, 0)::text      AS dest_stock,
          ss.nearest_expiry
        FROM source_stock ss
        JOIN  items i  ON i.id = ss.item_id
        LEFT JOIN combined   c  ON c.item_id  = ss.item_id
        LEFT JOIN dest_stock ds ON ds.item_id = ss.item_id
        WHERE i.is_active = true
          AND (
            COALESCE(c.total_sold, 0) > 0
            OR COALESCE(ds.stock, 0)  = 0
          )
        ORDER BY
          CASE WHEN COALESCE(c.total_sold, 0) > 0 THEN 0 ELSE 1 END,
          COALESCE(c.total_sold, 0) DESC,
          i.name_ar
      `);

      res.json(result.rows);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
