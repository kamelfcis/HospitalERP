import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  warehouseUpdateSchema,
} from "./_shared";
import { insertWarehouseSchema } from "@shared/schema";
import { runPilotTestSeed } from "../seeds/pilot-test";

export function registerWarehousesRoutes(app: Express) {
  // ===== WAREHOUSES =====
  app.get("/api/warehouses", async (req, res) => {
    try {
      const userId = req.session?.userId as string | undefined;
      const role   = req.session?.role   as string | undefined;

      const fullAccessRoles = ["admin", "accountant", "manager"];

      if (!userId || fullAccessRoles.includes(role || "")) {
        const whs = await storage.getWarehouses();
        return res.json(whs);
      }

      const assigned = await storage.getUserWarehouses(userId);

      if (assigned.length > 0) {
        return res.json(assigned);
      }

      const whs = await storage.getWarehouses();
      res.json(whs);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/warehouses", requireAuth, checkPermission(PERMISSIONS.WAREHOUSES_MANAGE), async (req, res) => {
    try {
      const validated = insertWarehouseSchema.parse(req.body);
      const wh = await storage.createWarehouse(validated);
      res.status(201).json(wh);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.put("/api/warehouses/:id", requireAuth, checkPermission(PERMISSIONS.WAREHOUSES_MANAGE), async (req, res) => {
    try {
      const validated = warehouseUpdateSchema.parse(req.body);
      const { warehouseCode, nameAr, departmentId, pharmacyId, glAccountId, isActive } = validated;
      const updateData: any = {};
      if (warehouseCode !== undefined) updateData.warehouseCode = warehouseCode;
      if (nameAr !== undefined) updateData.nameAr = nameAr;
      if (departmentId !== undefined) updateData.departmentId = departmentId;
      if (pharmacyId !== undefined) updateData.pharmacyId = pharmacyId;
      if (glAccountId !== undefined) updateData.glAccountId = glAccountId;
      if (isActive !== undefined) updateData.isActive = isActive;
      const wh = await storage.updateWarehouse(req.params.id as string, updateData);
      if (!wh) return res.status(404).json({ message: "المخزن غير موجود" });
      res.json(wh);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/warehouses/:id", requireAuth, checkPermission(PERMISSIONS.WAREHOUSES_MANAGE), async (req, res) => {
    try {
      await storage.deleteWarehouse(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== PILOT TEST SEED =====
  app.post("/api/seed/pilot-test", requireAuth, async (req, res) => {
    try {
      const result = await runPilotTestSeed();
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== STORE TRANSFERS =====
  app.get("/api/transfers", async (req, res) => {
    try {
      const { fromDate, toDate, sourceWarehouseId, destWarehouseId, status, search, page, pageSize, includeCancelled } = req.query;

      if (page || pageSize || fromDate || toDate || sourceWarehouseId || destWarehouseId || status || search || includeCancelled) {
        const result = await storage.getTransfersFiltered({
          fromDate: fromDate as string | undefined,
          toDate: toDate as string | undefined,
          sourceWarehouseId: sourceWarehouseId as string | undefined,
          destWarehouseId: destWarehouseId as string | undefined,
          status: status as string | undefined,
          search: search as string | undefined,
          page: parseInt(page as string) || 1,
          pageSize: parseInt(pageSize as string) || 50,
          includeCancelled: includeCancelled === 'true',
        });
        return res.json({ ...result, data: addFormattedNumbers(result.data || [], "transfer", "transferNumber") });
      }

      const transfers = await storage.getTransfers();
      res.json(addFormattedNumbers(transfers, "transfer", "transferNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/transfers/:id", async (req, res) => {
    try {
      const transfer = await storage.getTransfer(req.params.id as string);
      if (!transfer) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json(addFormattedNumber(transfer, "transfer", "transferNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/transfer/fefo-preview", async (req, res) => {
    try {
      const { itemId, warehouseId, requiredQtyInMinor, asOfDate } = req.query;
      if (!itemId || !warehouseId || !requiredQtyInMinor) {
        return res.status(400).json({ message: "itemId, warehouseId, requiredQtyInMinor مطلوبة" });
      }
      const qty = parseFloat(requiredQtyInMinor as string);
      if (qty <= 0) {
        return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const preview = await storage.getWarehouseFefoPreview(
        itemId as string,
        warehouseId as string,
        qty,
        date
      );
      res.json(preview);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/transfers/auto-save", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_CREATE), async (req, res) => {
    try {
      const { header, lines, existingId } = req.body;
      if (!header) return res.status(400).json({ message: "بيانات ناقصة" });
      const { transferDate, sourceWarehouseId, destinationWarehouseId, notes } = header;
      if (!sourceWarehouseId || !destinationWarehouseId) {
        return res.status(400).json({ message: "يجب اختيار مخزن المصدر والوجهة" });
      }
      const safeLines = Array.isArray(lines) ? lines.filter((l: any) => l.itemId) : [];
      const safeHeader = { transferDate: transferDate || new Date().toISOString().split("T")[0], sourceWarehouseId, destinationWarehouseId, notes: notes || null };

      if (existingId) {
        const existing = await storage.getTransfer(existingId);
        if (!existing) return res.status(404).json({ message: "التحويل غير موجود" });
        if (existing.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل تحويل مُرحّل" });
        await storage.updateDraftTransfer(existingId, safeHeader, safeLines);
        return res.json({ id: existingId, transferNumber: existing.transferNumber });
      } else {
        const transfer = await storage.createDraftTransfer(safeHeader, safeLines);
        return res.status(201).json({ id: transfer.id, transferNumber: transfer.transferNumber });
      }
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/transfers", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_CREATE), async (req, res) => {
    try {
      const { transferDate, sourceWarehouseId, destinationWarehouseId, notes, lines } = req.body;

      if (!transferDate || !sourceWarehouseId || !destinationWarehouseId) {
        return res.status(400).json({ message: "بيانات التحويل غير مكتملة" });
      }
      if (sourceWarehouseId === destinationWarehouseId) {
        return res.status(400).json({ message: "مخزن المصدر والوجهة يجب أن يكونا مختلفين" });
      }
      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ message: "يجب إضافة سطر واحد على الأقل" });
      }

      const header = { transferDate, sourceWarehouseId, destinationWarehouseId, notes: notes || null };
      const transfer = await storage.createDraftTransfer(header, lines);
      res.status(201).json(transfer);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/transfers/:id/post", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_EXECUTE), async (req, res) => {
    try {
      const existing = await storage.getTransfer(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "التحويل غير موجود" });
      if (existing.status !== "draft") return res.status(409).json({ message: "التحويل مُرحّل بالفعل", code: "ALREADY_POSTED" });

      await storage.assertPeriodOpen(existing.transferDate);

      const transfer = await storage.postTransfer(req.params.id as string);
      await storage.createAuditLog({ tableName: "store_transfers", recordId: req.params.id as string, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
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

  // ===== TRANSFER PREPARATION =====
  app.get("/api/transfer-preparation/query", async (req, res) => {
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
          SELECT l.item_id, SUM(l.qty_in_minor::numeric) as total_sold_minor
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
            ) as total_sold_minor
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
          SELECT item_id, SUM(total_sold_minor) as total_sold
          FROM (
            SELECT * FROM sales_retail
            UNION ALL
            SELECT * FROM sales_patient
          ) u
          GROUP BY item_id
        ),
        source_stock AS (
          SELECT item_id,
            SUM(qty_in_minor::numeric) as stock,
            MIN(CASE WHEN qty_in_minor::numeric > 0 AND expiry_year IS NOT NULL
              THEN make_date(expiry_year, GREATEST(COALESCE(expiry_month, 1), 1), 1)
            END) as nearest_expiry
          FROM inventory_lots
          WHERE warehouse_id = ${sourceWarehouseId as string} AND is_active = true AND qty_in_minor::numeric > 0
          GROUP BY item_id
        ),
        dest_stock AS (
          SELECT item_id, SUM(qty_in_minor::numeric) as stock
          FROM inventory_lots
          WHERE warehouse_id = ${destWarehouseId as string} AND is_active = true AND qty_in_minor::numeric > 0
          GROUP BY item_id
        )
        SELECT
          c.item_id,
          i.item_code,
          i.name_ar,
          i.has_expiry,
          i.minor_unit_name,
          i.major_unit_name,
          i.medium_unit_name,
          i.major_to_minor::text,
          i.medium_to_minor::text,
          c.total_sold::text,
          COALESCE(ss.stock, 0)::text as source_stock,
          COALESCE(ds.stock, 0)::text as dest_stock,
          ss.nearest_expiry
        FROM combined c
        JOIN items i ON c.item_id = i.id
        LEFT JOIN source_stock ss ON c.item_id = ss.item_id
        LEFT JOIN dest_stock ds ON c.item_id = ds.item_id
        WHERE i.is_active = true
          AND c.total_sold > 0
        ORDER BY c.total_sold DESC
      `);

      res.json(result.rows);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

}
