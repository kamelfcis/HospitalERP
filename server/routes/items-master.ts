import { Express } from "express";
import { z } from "zod";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import {
  insertDepartmentSchema,
  insertItemDepartmentPriceSchema,
  insertInventoryLotSchema,
} from "@shared/schema";

export function registerItemsMasterRoutes(app: Express, storage: any) {
  // ===== DEPARTMENTS =====
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

  // ===== ITEM DEPARTMENT PRICES =====
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

  // ===== EXPIRY SETTINGS =====
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

  // ===== INVENTORY LOTS =====
  app.get("/api/items/:id/lots", async (req, res) => {
    try {
      const lots = await storage.getLots(req.params.id as string);
      res.json(lots);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/lots", requireAuth, checkPermission(PERMISSIONS.RECEIVING_CREATE), async (req, res) => {
    try {
      const validated = insertInventoryLotSchema.parse(req.body);
      const item = await storage.getItem(validated.itemId);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      if (item.category === "service") {
        return res.status(400).json({ message: "الخدمات لا يمكن إنشاء دفعات مخزنية لها" });
      }
      if (!item.hasExpiry && validated.expiryDate) {
        return res.status(400).json({ message: "هذا الصنف لا يدعم تاريخ الصلاحية" });
      }
      if (item.hasExpiry && !validated.expiryDate) {
        return res.status(400).json({ message: "تاريخ الصلاحية مطلوب لهذا الصنف" });
      }
      if (parseFloat(validated.qtyInMinor || "0") <= 0) {
        return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }
      const unitLevel = req.body.unitLevel || "minor";
      if (validated.purchasePrice && unitLevel !== "minor") {
        const price = parseFloat(validated.purchasePrice);
        let divisor = 1;
        if (unitLevel === "major" && item.majorToMinor && parseFloat(item.majorToMinor) > 0) {
          divisor = parseFloat(item.majorToMinor);
        } else if (unitLevel === "medium" && item.mediumToMinor && parseFloat(item.mediumToMinor) > 0) {
          divisor = parseFloat(item.mediumToMinor);
        }
        validated.purchasePrice = (price / divisor).toFixed(4);
      }
      const lot = await storage.createLot(validated);
      res.status(201).json(lot);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== FEFO PREVIEW =====
  app.get("/api/fefo/preview", async (req, res) => {
    try {
      const { itemId, requiredQtyInMinor, asOfDate } = req.query;
      if (!itemId || !requiredQtyInMinor) {
        return res.status(400).json({ message: "itemId و requiredQtyInMinor مطلوبان" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const result = await storage.getFefoPreview(
        itemId as string,
        parseFloat(requiredQtyInMinor as string),
        date
      );
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== ITEM BARCODES =====
  app.get("/api/items/:id/barcodes", async (req, res) => {
    try {
      const barcodes = await storage.getItemBarcodes(req.params.id as string);
      res.json(barcodes);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/items/:id/barcodes", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const { barcodeValue, barcodeType } = req.body;
      if (!barcodeValue || !barcodeValue.trim()) {
        return res.status(400).json({ message: "قيمة الباركود مطلوبة" });
      }
      const normalized = barcodeValue.trim();
      if (!/^[a-zA-Z0-9\-\.]+$/.test(normalized)) {
        return res.status(400).json({ message: "الباركود يجب أن يحتوي على أرقام وحروف إنجليزية فقط" });
      }
      const barcode = await storage.createItemBarcode({
        itemId: req.params.id as string,
        barcodeValue: normalized,
        barcodeType: barcodeType || null,
        isActive: true,
      });
      res.status(201).json(barcode);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "23505" || (error instanceof Error ? error.message : String(error)).includes("unique") || (error instanceof Error ? error.message : String(error)).includes("duplicate")) {
        return res.status(409).json({ message: "هذا الباركود مسجل بالفعل لصنف آخر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/barcodes/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const barcode = await storage.deactivateBarcode(req.params.id as string);
      if (!barcode) {
        return res.status(404).json({ message: "الباركود غير موجود" });
      }
      res.json(barcode);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/barcode/resolve", async (req, res) => {
    try {
      const { value } = req.query;
      if (!value || !(value as string).trim()) {
        return res.status(400).json({ message: "قيمة البحث مطلوبة" });
      }
      const result = await storage.resolveBarcode(value as string);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
