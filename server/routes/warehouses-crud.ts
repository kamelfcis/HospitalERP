import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
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
import { assertUserWarehousesAllowed } from "../lib/warehouse-guard";

export function registerWarehousesCrudRoutes(app: Express) {
  app.get("/api/warehouses", requireAuth, async (req, res) => {
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
      const { warehouseCode, nameAr, departmentId, pharmacyId, glAccountId, costCenterId, isActive } = validated;
      const updateData: any = {};
      if (warehouseCode !== undefined) updateData.warehouseCode = warehouseCode;
      if (nameAr !== undefined) updateData.nameAr = nameAr;
      if (departmentId !== undefined) updateData.departmentId = departmentId;
      if (pharmacyId !== undefined) updateData.pharmacyId = pharmacyId;
      if (glAccountId !== undefined) updateData.glAccountId = glAccountId;
      if (costCenterId !== undefined) updateData.costCenterId = costCenterId;
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

  app.post("/api/seed/pilot-test", requireAuth, async (req, res) => {
    try {
      const result = await runPilotTestSeed();
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
