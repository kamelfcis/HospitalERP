import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  warehouseUpdateSchema,
  userDepartmentsAssignmentSchema,
  userWarehousesAssignmentSchema,
  validateReceivingLines,
} from "./_shared";
import {
  insertItemSchema,
  insertItemFormTypeSchema,
  insertItemUomSchema,
  insertDepartmentSchema,
  insertItemDepartmentPriceSchema,
  insertInventoryLotSchema,
  insertWarehouseSchema,
  insertSupplierSchema,
} from "@shared/schema";

export function registerInventoryRoutes(app: Express) {

  // ===== ITEMS =====
  app.get("/api/items", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string | undefined;
      const category = req.query.category as string | undefined;
      const isToxic = req.query.isToxic !== undefined ? req.query.isToxic === "true" : undefined;
      const formTypeId = req.query.formTypeId as string | undefined;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;
      const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
      const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;

      const result = await storage.getItems({
        page,
        limit,
        search,
        category,
        isToxic,
        formTypeId,
        isActive,
        minPrice,
        maxPrice,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/lookup", async (req, res) => {
    try {
      const { query, warehouseId, limit } = req.query;
      if (!query || !warehouseId) {
        return res.status(400).json({ message: "query و warehouseId مطلوبة" });
      }
      const results = await storage.searchItemsForTransfer(
        query as string,
        warehouseId as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/search", async (req, res) => {
    try {
      const { warehouseId, mode, q, limit, page, pageSize, includeZeroStock, drugsOnly, excludeServices, minPrice, maxPrice } = req.query;
      if (!q) {
        return res.status(400).json({ message: "q مطلوب" });
      }
      if (warehouseId) {
        const result = await storage.searchItemsAdvanced({
          mode: (mode as string || 'AR') as 'AR' | 'EN' | 'CODE' | 'BARCODE',
          query: q as string,
          warehouseId: warehouseId as string,
          page: parseInt(page as string) || 1,
          pageSize: parseInt(pageSize as string || limit as string) || 50,
          includeZeroStock: includeZeroStock === 'true',
          drugsOnly: drugsOnly === 'true',
          excludeServices: excludeServices === 'true',
          minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
          maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        });
        res.json(result);
      } else {
        const searchLimit = parseInt(limit as string || pageSize as string) || 15;
        const searchQuery = (q as string).replace(/%/g, '%');
        const items = await storage.searchItemsByPattern(searchQuery, searchLimit);
        res.json(items);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/expiry-options", async (req, res) => {
    try {
      const { warehouseId, asOfDate } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const options = await storage.getExpiryOptions(req.params.itemId, warehouseId as string, date);
      res.json(options);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/availability-summary", async (req, res) => {
    try {
      const { asOfDate, excludeExpired } = req.query;
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const exclude = excludeExpired !== "0";
      const summary = await storage.getItemAvailabilitySummary(req.params.itemId, date, exclude);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/availability", async (req, res) => {
    try {
      const { warehouseId } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const qty = await storage.getItemAvailability(req.params.itemId, warehouseId as string);
      res.json({ availableQtyMinor: qty });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/check-unique", async (req, res) => {
    try {
      const { code, nameAr, nameEn, excludeId } = req.query as { code?: string; nameAr?: string; nameEn?: string; excludeId?: string };
      const result = await storage.checkItemUniqueness(code, nameAr, nameEn, excludeId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:id", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/items", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), async (req, res) => {
    try {
      const parsed = insertItemSchema.parse(req.body);

      const errors: string[] = [];
      if (!parsed.itemCode?.trim()) errors.push("كود الصنف مطلوب");
      if (!parsed.nameAr?.trim()) errors.push("الاسم العربي مطلوب");
      if (!parsed.nameEn?.trim()) errors.push("الاسم الإنجليزي مطلوب");
      if (!parsed.formTypeId) errors.push("نوع الشكل مطلوب");

      const isServiceItem = parsed.category === "service";

      if (!isServiceItem) {
        if (!parsed.majorUnitName?.trim()) errors.push("الوحدة الكبرى مطلوبة");

        const hasMedium = !!parsed.mediumUnitName?.trim();
        const hasMinor = !!parsed.minorUnitName?.trim();

        if (hasMinor && !hasMedium) {
          errors.push("يجب اختيار الوحدة المتوسطة قبل الصغرى");
        }

        if (hasMedium) {
          const majorToMedium = parseFloat(parsed.majorToMedium as string || "0");
          if (majorToMedium <= 0) errors.push("معامل التحويل كبرى ← متوسطة يجب أن يكون أكبر من صفر");
        }
        if (hasMinor) {
          const majorToMinor = parseFloat(parsed.majorToMinor as string || "0");
          if (majorToMinor <= 0) errors.push("معامل التحويل كبرى ← صغرى يجب أن يكون أكبر من صفر");
          if (hasMedium) {
            const mediumToMinor = parseFloat(parsed.mediumToMinor as string || "0");
            if (mediumToMinor <= 0) errors.push("معامل التحويل متوسطة ← صغرى يجب أن يكون أكبر من صفر");
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: errors.join("، ") });
      }

      const uniqueness = await storage.checkItemUniqueness(parsed.itemCode, parsed.nameAr, parsed.nameEn);
      const uniqueErrors: string[] = [];
      if (!uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
      if (!uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
      if (!uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");

      if (uniqueErrors.length > 0) {
        return res.status(409).json({ message: uniqueErrors.join("، ") });
      }

      if (parsed.category === "service") {
        parsed.hasExpiry = false;
        parsed.majorUnitName = null as any;
        parsed.mediumUnitName = null as any;
        parsed.minorUnitName = null as any;
        parsed.majorToMedium = null as any;
        parsed.majorToMinor = null as any;
        parsed.mediumToMinor = null as any;
      } else if (parsed.category === "drug" && parsed.hasExpiry === undefined) {
        parsed.hasExpiry = true;
      }
      if (!parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null as any;
        parsed.majorToMedium = null as any;
      }
      if (!parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null as any;
        parsed.majorToMinor = null as any;
        parsed.mediumToMinor = null as any;
      }
      const item = await storage.createItem(parsed);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const parsed = insertItemSchema.partial().parse(req.body);

      if (parsed.itemCode || parsed.nameAr || parsed.nameEn) {
        const uniqueness = await storage.checkItemUniqueness(parsed.itemCode, parsed.nameAr, parsed.nameEn, req.params.id);
        const uniqueErrors: string[] = [];
        if (parsed.itemCode && !uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
        if (parsed.nameAr && !uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
        if (parsed.nameEn && !uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");
        if (uniqueErrors.length > 0) {
          return res.status(409).json({ message: uniqueErrors.join("، ") });
        }
      }

      if (parsed.mediumUnitName !== undefined && !parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null as any;
        parsed.majorToMedium = null as any;
      }
      if (parsed.minorUnitName !== undefined && !parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null as any;
        parsed.majorToMinor = null as any;
        parsed.mediumToMinor = null as any;
      }

      const item = await storage.updateItem(req.params.id, parsed);
      if (!item) return res.status(404).json({ message: "الصنف غير موجود" });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_DELETE), async (req, res) => {
    try {
      await storage.deleteItem(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      if (error.message?.includes("violates foreign key constraint") || error.code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف هذا الصنف لوجود حركات مرتبطة به. يمكنك إلغاء تفعيله بدلاً من ذلك." });
      } else {
        res.status(500).json({ message: error.message });
      }
    }
  });

  // Item Form Types
  app.get("/api/form-types", async (req, res) => {
    try {
      const formTypes = await storage.getItemFormTypes();
      res.json(formTypes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/form-types", async (req, res) => {
    try {
      const validated = insertItemFormTypeSchema.parse(req.body);
      const formType = await storage.createItemFormType(validated);
      res.status(201).json(formType);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== ITEM UOMS =====
  app.get("/api/uoms", async (req, res) => {
    try {
      const uoms = await storage.getItemUoms();
      res.json(uoms);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/uoms", async (req, res) => {
    try {
      const parsed = insertItemUomSchema.parse(req.body);
      const uom = await storage.createItemUom(parsed);
      res.status(201).json(uom);
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ message: "كود الوحدة مسجل بالفعل" });
      } else {
        res.status(400).json({ message: error.message });
      }
    }
  });

  // Item Transactions
  app.get("/api/items/:id/last-purchases", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const purchases = await storage.getLastPurchases(req.params.id, limit);
      res.json(purchases);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:id/avg-sales", async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];

      const result = await storage.getAverageSales(req.params.id, startDate, endDate);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== DEPARTMENTS =====
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/departments/:id", async (req, res) => {
    try {
      const department = await storage.getDepartment(req.params.id);
      if (!department) {
        return res.status(404).json({ message: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/departments", async (req, res) => {
    try {
      const parsed = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(parsed);
      res.status(201).json(department);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/departments/:id", async (req, res) => {
    try {
      const parsed = insertDepartmentSchema.partial().parse(req.body);
      const department = await storage.updateDepartment(req.params.id, parsed);
      if (!department) {
        return res.status(404).json({ message: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/departments/:id", async (req, res) => {
    try {
      await storage.deleteDepartment(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== ITEM DEPARTMENT PRICES =====
  app.get("/api/items/:id/department-prices", async (req, res) => {
    try {
      const prices = await storage.getItemDepartmentPrices(req.params.id);
      res.json(prices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/items/:id/department-prices", async (req, res) => {
    try {
      const parsed = insertItemDepartmentPriceSchema.parse({
        ...req.body,
        itemId: req.params.id,
      });
      const price = await storage.createItemDepartmentPrice(parsed);
      res.status(201).json(price);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/item-department-prices/:id", async (req, res) => {
    try {
      const parsed = insertItemDepartmentPriceSchema.partial().parse(req.body);
      const price = await storage.updateItemDepartmentPrice(req.params.id, parsed);
      if (!price) {
        return res.status(404).json({ message: "السعر غير موجود" });
      }
      res.json(price);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/item-department-prices/:id", async (req, res) => {
    try {
      await storage.deleteItemDepartmentPrice(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== EXPIRY SETTINGS =====
  app.put("/api/items/:id/expiry-settings", async (req, res) => {
    try {
      const { hasExpiry } = req.body;
      if (typeof hasExpiry !== "boolean") {
        return res.status(400).json({ message: "قيمة hasExpiry يجب أن تكون true أو false" });
      }
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      if (item.category === "service" && hasExpiry) {
        return res.status(400).json({ message: "الخدمات لا يمكن أن يكون لها تاريخ صلاحية" });
      }
      if (!hasExpiry && item.hasExpiry) {
        const lots = await storage.getLots(req.params.id);
        const activeLotWithExpiry = lots.find(l => l.expiryDate && parseFloat(l.qtyInMinor) > 0);
        if (activeLotWithExpiry) {
          return res.status(409).json({ message: "لا يمكن إلغاء الصلاحية: يوجد دفعات نشطة بصلاحية ورصيد أكبر من صفر" });
        }
      }
      const updated = await storage.updateItem(req.params.id, { hasExpiry });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== INVENTORY LOTS =====
  app.get("/api/items/:id/lots", async (req, res) => {
    try {
      const lots = await storage.getLots(req.params.id);
      res.json(lots);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lots", async (req, res) => {
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
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== ITEM BARCODES =====
  app.get("/api/items/:id/barcodes", async (req, res) => {
    try {
      const barcodes = await storage.getItemBarcodes(req.params.id);
      res.json(barcodes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/items/:id/barcodes", async (req, res) => {
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
        itemId: req.params.id,
        barcodeValue: normalized,
        barcodeType: barcodeType || null,
        isActive: true,
      });
      res.status(201).json(barcode);
    } catch (error: any) {
      if (error.code === "23505" || error.message?.includes("unique") || error.message?.includes("duplicate")) {
        return res.status(409).json({ message: "هذا الباركود مسجل بالفعل لصنف آخر" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/barcodes/:id", async (req, res) => {
    try {
      const barcode = await storage.deactivateBarcode(req.params.id);
      if (!barcode) {
        return res.status(404).json({ message: "الباركود غير موجود" });
      }
      res.json(barcode);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/warehouses", async (req, res) => {
    try {
      const validated = insertWarehouseSchema.parse(req.body);
      const wh = await storage.createWarehouse(validated);
      res.status(201).json(wh);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/warehouses/:id", async (req, res) => {
    try {
      const validated = warehouseUpdateSchema.parse(req.body);
      const { warehouseCode, nameAr, departmentId, pharmacyId, isActive } = validated;
      const updateData: any = {};
      if (warehouseCode !== undefined) updateData.warehouseCode = warehouseCode;
      if (nameAr !== undefined) updateData.nameAr = nameAr;
      if (departmentId !== undefined) updateData.departmentId = departmentId;
      if (pharmacyId !== undefined) updateData.pharmacyId = pharmacyId;
      if (isActive !== undefined) updateData.isActive = isActive;
      const wh = await storage.updateWarehouse(req.params.id, updateData);
      if (!wh) return res.status(404).json({ message: "المخزن غير موجود" });
      res.json(wh);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/warehouses/:id", async (req, res) => {
    try {
      await storage.deleteWarehouse(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== PILOT TEST SEED =====
  app.post("/api/seed/pilot-test", async (req, res) => {
    try {
      const result = await storage.seedPilotTest();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/transfers/:id", async (req, res) => {
    try {
      const transfer = await storage.getTransfer(req.params.id);
      if (!transfer) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json(addFormattedNumber(transfer, "transfer", "transferNumber"));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/transfers/auto-save", async (req, res) => {
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/transfers", async (req, res) => {
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/transfers/:id/post", async (req, res) => {
    try {
      const existing = await storage.getTransfer(req.params.id);
      if (!existing) return res.status(404).json({ message: "التحويل غير موجود" });
      if (existing.status !== "draft") return res.status(409).json({ message: "التحويل مُرحّل بالفعل", code: "ALREADY_POSTED" });

      await storage.assertPeriodOpen(existing.transferDate);

      const transfer = await storage.postTransfer(req.params.id);
      await storage.createAuditLog({ tableName: "store_transfers", recordId: req.params.id, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
      res.json(transfer);
    } catch (error: any) {
      if (error.message.includes("الفترة المحاسبية")) return res.status(403).json({ message: error.message });
      if (error.message.includes("غير مسودة") || error.message.includes("مُرحّل بالفعل")) {
        return res.status(409).json({ message: error.message, code: "ALREADY_POSTED" });
      }
      if (error.message.includes("غير كافية") || error.message.includes("مختلفين") || error.message.includes("لا يمكن") || error.message.includes("غير موجود") || error.message.includes("مطلوب")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/transfers/:id", async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      const deleted = await storage.deleteTransfer(req.params.id, reason);
      if (!deleted) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes("مُرحّل") || error.message.includes("لا يمكن حذف")) {
        return res.status(409).json({ message: error.message, code: "DOCUMENT_POSTED" });
      }
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== SUPPLIERS =====
  app.get("/api/suppliers", async (req, res) => {
    try {
      const { search, page, pageSize } = req.query;
      const result = await storage.getSuppliers({
        search: search as string | undefined,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 50,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/suppliers/search", async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const results = await storage.searchSuppliers(q, limit);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/suppliers/:id", async (req, res) => {
    try {
      const supplier = await storage.getSupplier(req.params.id);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/suppliers", async (req, res) => {
    try {
      const validated = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(validated);
      res.status(201).json(supplier);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      if (error.message?.includes('unique') || error.code === '23505') {
        return res.status(409).json({ message: "كود المورد مُستخدم بالفعل" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/suppliers/:id", async (req, res) => {
    try {
      const validated = insertSupplierSchema.partial().parse(req.body);
      const supplier = await storage.updateSupplier(req.params.id, validated);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== SUPPLIER RECEIVING =====
  app.get("/api/receivings", async (req, res) => {
    try {
      const { supplierId, warehouseId, status, statusFilter, fromDate, toDate, search, page, pageSize, includeCancelled } = req.query;
      const result = await storage.getReceivings({
        supplierId: supplierId as string | undefined,
        warehouseId: warehouseId as string | undefined,
        status: status as string | undefined,
        statusFilter: statusFilter as string | undefined,
        fromDate: fromDate as string | undefined,
        toDate: toDate as string | undefined,
        search: search as string | undefined,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 50,
        includeCancelled: includeCancelled === 'true',
      });
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "receiving", "receivingNumber") });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/receivings/check-invoice", async (req, res) => {
    try {
      const { supplierId, supplierInvoiceNo, excludeId } = req.query;
      if (!supplierId || !supplierInvoiceNo) return res.status(400).json({ message: "بيانات ناقصة" });
      const isUnique = await storage.checkSupplierInvoiceUnique(
        supplierId as string,
        supplierInvoiceNo as string,
        excludeId as string | undefined
      );
      res.json({ isUnique });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/receivings/:id", async (req, res) => {
    try {
      const receiving = await storage.getReceiving(req.params.id);
      if (!receiving) return res.status(404).json({ message: "المستند غير موجود" });
      res.json(addFormattedNumber(receiving, "receiving", "receivingNumber"));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/receivings/auto-save", async (req, res) => {
    try {
      const { header, lines, existingId } = req.body;
      if (!header) return res.status(400).json({ message: "بيانات ناقصة" });
      
      const receiveDate = header.receiveDate || new Date().toISOString().split("T")[0];
      const supplierId = header.supplierId || null;
      const warehouseId = header.warehouseId || null;
      let supplierInvoiceNo = header.supplierInvoiceNo?.trim() || "";
      
      if (!supplierId || !warehouseId) {
        return res.status(400).json({ message: "يجب اختيار المورد والمخزن أولاً للحفظ التلقائي" });
      }
      
      if (!supplierInvoiceNo) {
        supplierInvoiceNo = `__AUTO_${Date.now()}`;
      }
      
      const safeHeader = { ...header, supplierId, warehouseId, receiveDate, supplierInvoiceNo };
      const safeLines = Array.isArray(lines) ? lines.filter((l: any) => l.itemId) : [];
      
      if (existingId) {
        const existing = await storage.getReceiving(existingId);
        if (!existing) return res.status(404).json({ message: "المستند غير موجود" });
        if (existing.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل مستند مُرحّل" });
        
        if (supplierInvoiceNo && !supplierInvoiceNo.startsWith("__AUTO_")) {
          const isUnique = await storage.checkSupplierInvoiceUnique(supplierId, supplierInvoiceNo, existingId);
          if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر" });
        }
        
        const result = await storage.saveDraftReceiving(safeHeader, safeLines, existingId);
        return res.json(result);
      } else {
        if (supplierInvoiceNo && !supplierInvoiceNo.startsWith("__AUTO_")) {
          const isUnique = await storage.checkSupplierInvoiceUnique(supplierId, supplierInvoiceNo);
          if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر" });
        }
        
        const result = await storage.saveDraftReceiving(safeHeader, safeLines);
        return res.status(201).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/receivings", async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header || !lines) return res.status(400).json({ message: "بيانات ناقصة" });
      if (!header.supplierId) return res.status(400).json({ message: "المورد مطلوب" });
      if (!header.receiveDate) return res.status(400).json({ message: "تاريخ الاستلام مطلوب" });
      if (!header.supplierInvoiceNo?.trim()) return res.status(400).json({ message: "رقم فاتورة المورد مطلوب" });
      if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      const isUnique = await storage.checkSupplierInvoiceUnique(header.supplierId, header.supplierInvoiceNo);
      if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر لنفس المورد" });
      
      const lineErrors = await validateReceivingLines(lines);
      if (lineErrors.length > 0) {
        return res.status(400).json({ 
          message: "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
          lineErrors 
        });
      }
      
      const result = await storage.saveDraftReceiving(header, lines);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/receivings/:id", async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header || !lines) return res.status(400).json({ message: "بيانات ناقصة" });
      
      const existing = await storage.getReceiving(req.params.id);
      if (!existing) return res.status(404).json({ message: "المستند غير موجود" });
      if (existing.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن تعديل مستند مُرحّل", code: "DOCUMENT_POSTED" });
      }
      
      const isUnique = await storage.checkSupplierInvoiceUnique(header.supplierId, header.supplierInvoiceNo, req.params.id);
      if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر لنفس المورد" });
      
      const lineErrors = await validateReceivingLines(lines);
      if (lineErrors.length > 0) {
        return res.status(400).json({ 
          message: "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
          lineErrors 
        });
      }
      
      const result = await storage.saveDraftReceiving(header, lines, req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/receivings/:id/post", async (req, res) => {
    try {
      const receiving = await storage.getReceiving(req.params.id);
      if (!receiving) return res.status(404).json({ message: "المستند غير موجود" });
      if (receiving.status === 'posted' || receiving.status === 'posted_qty_only') {
        return res.status(409).json({ message: "المستند مُرحّل بالفعل", code: "ALREADY_POSTED" });
      }

      await storage.assertPeriodOpen(receiving.receiveDate);

      if (receiving.lines && receiving.lines.length > 0) {
        const lineErrors = await validateReceivingLines(receiving.lines);
        if (lineErrors.length > 0) {
          return res.status(400).json({ 
            message: "لا يمكن ترحيل الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
            lineErrors 
          });
        }
      }
      let result;
      if (receiving.correctionStatus === 'correction') {
        result = await storage.postReceivingCorrection(req.params.id);
      } else {
        result = await storage.postReceiving(req.params.id);
      }
      await storage.createAuditLog({ tableName: "receiving_headers", recordId: req.params.id, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes("الفترة المحاسبية")) return res.status(403).json({ message: error.message });
      if (error.message.includes("مطلوب") || error.message.includes("لا توجد") || error.message.includes("لا يمكن") || error.message.includes("غير موجود") || error.message.includes("سالباً")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/receivings/:id/correct", async (req, res) => {
    try {
      const result = await storage.createReceivingCorrection(req.params.id);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.message.includes("مسبقاً") || error.message.includes("فقط") || error.message.includes("لا يمكن") || error.message.includes("غير موجود") || error.message.includes("معتمدة")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/receivings/:id", async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      const deleted = await storage.deleteReceiving(req.params.id, reason);
      if (!deleted) return res.status(404).json({ message: "المستند غير موجود" });
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes("لا يمكن حذف") || error.message.includes("مُرحّل")) {
        return res.status(409).json({ message: error.message, code: "DOCUMENT_POSTED" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== CONVERT RECEIVING TO PURCHASE INVOICE =====
  app.post("/api/receivings/:id/convert-to-invoice", async (req, res) => {
    try {
      const invoice = await storage.convertReceivingToInvoice(req.params.id);
      res.status(201).json(invoice);
    } catch (error: any) {
      if (error.message.includes("مسبقاً") || error.message.includes("أولاً") || error.message.includes("غير موجود")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== PURCHASE INVOICES =====
  app.get("/api/purchase-invoices", async (req, res) => {
    try {
      const { supplierId, status, dateFrom, dateTo, page, pageSize, includeCancelled } = req.query;
      const result = await storage.getPurchaseInvoices({
        supplierId: supplierId as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 20,
        includeCancelled: includeCancelled === 'true',
      });
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "purchase_invoice", "invoiceNumber") });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(addFormattedNumber(invoice, "purchase_invoice", "invoiceNumber"));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  function validateInvoiceLineDiscounts(lines: any[]): { lineIndex: number; field: string; messageAr: string }[] {
    const errors: { lineIndex: number; field: string; messageAr: string }[] = [];
    if (!Array.isArray(lines)) return errors;
    const TOLERANCE = 0.02;
    lines.forEach((ln: any, i: number) => {
      const sp = parseFloat(ln.sellingPrice) || 0;
      const pp = parseFloat(ln.purchasePrice) || 0;
      const pct = parseFloat(ln.lineDiscountPct) || 0;
      const dv = parseFloat(ln.lineDiscountValue) || 0;

      if (pp < 0) {
        errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء لا يمكن أن يكون سالب" });
      }
      if (pct >= 100) {
        errors.push({ lineIndex: i, field: "lineDiscountPct", messageAr: "نسبة الخصم لا يمكن أن تكون 100% أو أكثر" });
      }
      if (sp > 0 && dv > sp + TOLERANCE) {
        errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم أكبر من سعر البيع" });
      }

      if (sp > 0 && (pct > 0 || dv > 0)) {
        const expectedDv = +(sp * (pct / 100)).toFixed(2);
        const expectedPp = +(sp - dv).toFixed(4);
        if (Math.abs(dv - expectedDv) > TOLERANCE) {
          errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم غير متوافقة مع نسبة الخصم" });
        }
        if (Math.abs(pp - expectedPp) > TOLERANCE) {
          errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء غير متوافق مع قيمة الخصم" });
        }
      }
    });
    return errors;
  }

  app.post("/api/purchase-invoices/:id/auto-save", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة" });
      const { lines, ...headerUpdates } = req.body;
      const safeLines = Array.isArray(lines) ? lines : [];
      const result = await storage.savePurchaseInvoice(req.params.id, safeLines, headerUpdates);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة ومُسعّرة", code: "INVOICE_APPROVED" });
      }
      const { lines, ...headerUpdates } = req.body;
      const discountErrors = validateInvoiceLineDiscounts(lines);
      if (discountErrors.length > 0) {
        return res.status(400).json({ message: "أخطاء في بيانات الخصم", lineErrors: discountErrors });
      }
      const result = await storage.savePurchaseInvoice(req.params.id, lines, headerUpdates);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      const deleted = await storage.deletePurchaseInvoice(req.params.id, reason);
      if (!deleted) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes("لا يمكن حذف")) {
        return res.status(409).json({ message: error.message, code: "INVOICE_APPROVED" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/purchase-invoices/:id/approve", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") return res.status(409).json({ message: "الفاتورة معتمدة بالفعل", code: "ALREADY_APPROVED" });

      await storage.assertPeriodOpen(invoice.invoiceDate);

      if (invoice.lines && Array.isArray(invoice.lines)) {
        const discountErrors = validateInvoiceLineDiscounts(invoice.lines);
        if (discountErrors.length > 0) {
          return res.status(400).json({ message: "أخطاء في بيانات الخصم - لا يمكن الاعتماد", lineErrors: discountErrors });
        }
      }
      const result = await storage.approvePurchaseInvoice(req.params.id);
      await storage.createAuditLog({ tableName: "purchase_invoice_headers", recordId: req.params.id, action: "approve", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "approved" }) });
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes("الفترة المحاسبية")) return res.status(403).json({ message: error.message });
      if (error.message.includes("معتمدة")) {
        return res.status(409).json({ message: error.message, code: "ALREADY_APPROVED" });
      }
      if (error.message.includes("غير موجودة")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/hints", async (req, res) => {
    try {
      const { supplierId, warehouseId } = req.query;
      const hints = await storage.getItemHints(req.params.itemId, (supplierId as string) || "", (warehouseId as string) || "");
      res.json(hints);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/warehouse-stats", async (req, res) => {
    try {
      const stats = await storage.getItemWarehouseStats(req.params.itemId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

}
