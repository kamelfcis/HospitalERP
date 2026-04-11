import { Express } from "express";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import {
  insertDepartmentSchema,
  insertItemDepartmentPriceSchema,
} from "@shared/schema";

export function registerItemsMasterDeptPricing(app: Express, storage: any) {
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/departments/:id", async (req, res) => {
    try {
      const department = await storage.getDepartment(req.params.id as string);
      if (!department) {
        return res.status(404).json({ message: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/departments", requireAuth, checkPermission(PERMISSIONS.DEPARTMENTS_MANAGE), async (req, res) => {
    try {
      const parsed = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(parsed);
      res.status(201).json(department);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.put("/api/departments/:id", requireAuth, checkPermission(PERMISSIONS.DEPARTMENTS_MANAGE), async (req, res) => {
    try {
      const parsed = insertDepartmentSchema.partial().parse(req.body);
      const department = await storage.updateDepartment(req.params.id as string, parsed);
      if (!department) {
        return res.status(404).json({ message: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/departments/:id", requireAuth, checkPermission(PERMISSIONS.DEPARTMENTS_MANAGE), async (req, res) => {
    try {
      await storage.deleteDepartment(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:id/department-prices", async (req, res) => {
    try {
      const prices = await storage.getItemDepartmentPrices(req.params.id as string);
      res.json(prices);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/items/:id/department-prices", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const parsed = insertItemDepartmentPriceSchema.parse({
        ...req.body,
        itemId: req.params.id as string,
      });
      const price = await storage.createItemDepartmentPrice(parsed);
      res.status(201).json(price);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.put("/api/item-department-prices/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const parsed = insertItemDepartmentPriceSchema.partial().parse(req.body);
      const price = await storage.updateItemDepartmentPrice(req.params.id as string, parsed);
      if (!price) {
        return res.status(404).json({ message: "السعر غير موجود" });
      }
      res.json(price);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/item-department-prices/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      await storage.deleteItemDepartmentPrice(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/pricing", async (req, res) => {
    try {
      const { itemId, departmentId, warehouseId, lotId } = req.query;
      if (!itemId) {
        return res.status(400).json({ message: "itemId مطلوب" });
      }
      let resolvedDeptId = departmentId as string | undefined;
      if (!resolvedDeptId && warehouseId) {
        const wh = await storage.getWarehouse(warehouseId as string);
        resolvedDeptId = wh?.departmentId || undefined;
      }
      if (resolvedDeptId) {
        const deptPrice = await storage.getItemPriceForDepartment(
          itemId as string,
          resolvedDeptId
        );
        if (deptPrice && parseFloat(deptPrice) > 0) {
          return res.json({ price: deptPrice, source: "department" });
        }
      }
      if (lotId) {
        const lot = await storage.getLot(lotId as string);
        if (lot && lot.itemId === (itemId as string) && lot.salePrice && parseFloat(lot.salePrice) > 0) {
          return res.json({ price: lot.salePrice, source: "lot" });
        }
      }
      const item = await storage.getItem(itemId as string);
      res.json({ price: item?.salePriceCurrent || "0", source: "item" });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.put("/api/items/:id/expiry-settings", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const { hasExpiry } = req.body;
      if (typeof hasExpiry !== "boolean") {
        return res.status(400).json({ message: "قيمة hasExpiry يجب أن تكون true أو false" });
      }
      const item = await storage.getItem(req.params.id as string);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      if (item.category === "service" && hasExpiry) {
        return res.status(400).json({ message: "الخدمات لا يمكن أن يكون لها تاريخ صلاحية" });
      }
      if (!hasExpiry && item.hasExpiry) {
        const lots = await storage.getLots(req.params.id as string);
        const activeLotWithExpiry = lots.find((l: any) => l.expiryDate && parseFloat(l.qtyInMinor) > 0);
        if (activeLotWithExpiry) {
          return res.status(409).json({ message: "لا يمكن إلغاء الصلاحية: يوجد دفعات نشطة بصلاحية ورصيد أكبر من صفر" });
        }
      }
      const updated = await storage.updateItem(req.params.id as string, { hasExpiry });
      res.json(updated);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
