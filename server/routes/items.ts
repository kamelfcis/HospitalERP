import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import {
  insertItemSchema,
  insertItemFormTypeSchema,
  insertItemUomSchema,
  insertDepartmentSchema,
  insertItemDepartmentPriceSchema,
  insertInventoryLotSchema,
} from "@shared/schema";

export function registerItemsRoutes(app: Express) {
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
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
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
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/search", async (req, res) => {
    try {
      const { warehouseId, mode, q, limit, page, pageSize, includeZeroStock, drugsOnly, excludeServices, minPrice, maxPrice } = req.query as Record<string, string | undefined>;
      if (!q) {
        return res.status(400).json({ message: "q مطلوب" });
      }
      if (warehouseId) {
        const result = await storage.searchItemsAdvanced({
          mode: (mode || 'AR') as 'AR' | 'EN' | 'CODE' | 'BARCODE',
          query: q,
          warehouseId,
          page: parseInt(page || "1") || 1,
          pageSize: parseInt(pageSize || limit || "50") || 50,
          includeZeroStock: includeZeroStock === 'true',
          drugsOnly: drugsOnly === 'true',
          excludeServices: excludeServices === 'true',
          minPrice: minPrice ? parseFloat(minPrice) : undefined,
          maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        });
        res.json(result);
      } else {
        const searchLimit = parseInt(limit || pageSize || "15") || 15;
        const searchQuery = q.replace(/%/g, '%');
        const items = await storage.searchItemsByPattern(searchQuery, searchLimit);
        res.json(items);
      }
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:itemId/expiry-options", async (req, res) => {
    try {
      const { warehouseId, asOfDate } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const options = await storage.getExpiryOptions(req.params.itemId as string, warehouseId as string, date);
      res.json(options);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:itemId/availability-summary", async (req, res) => {
    try {
      const { asOfDate, excludeExpired } = req.query;
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const exclude = excludeExpired !== "0";
      const summary = await storage.getItemAvailabilitySummary(req.params.itemId as string, date, exclude);
      res.json(summary);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:itemId/availability", async (req, res) => {
    try {
      const { warehouseId } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const qty = await storage.getItemAvailability(req.params.itemId as string, warehouseId as string);
      res.json({ availableQtyMinor: qty });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/check-unique", async (req, res) => {
    try {
      const { code, nameAr, nameEn, excludeId } = req.query as { code?: string; nameAr?: string; nameEn?: string; excludeId?: string };
      const result = await storage.checkItemUniqueness(code, nameAr, nameEn, excludeId);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:id", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id as string);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      res.json(item);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
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

      const uniqueness = await storage.checkItemUniqueness(parsed.itemCode ?? undefined, parsed.nameAr ?? undefined, parsed.nameEn ?? undefined);
      const uniqueErrors: string[] = [];
      if (!uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
      if (!uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
      if (!uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");

      if (uniqueErrors.length > 0) {
        return res.status(409).json({ message: uniqueErrors.join("، ") });
      }

      if (parsed.category === "service") {
        parsed.hasExpiry = false;
        parsed.majorUnitName = null;
        parsed.mediumUnitName = null;
        parsed.minorUnitName = null;
        parsed.majorToMedium = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      } else if (parsed.category === "drug" && parsed.hasExpiry === undefined) {
        parsed.hasExpiry = true;
      }
      if (!parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null;
        parsed.majorToMedium = null;
      }
      if (!parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      }
      const item = await storage.createItem(parsed);
      res.status(201).json(item);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.put("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const parsed = insertItemSchema.partial().parse(req.body);

      if (parsed.itemCode || parsed.nameAr || parsed.nameEn) {
        const uniqueness = await storage.checkItemUniqueness(parsed.itemCode ?? undefined, parsed.nameAr ?? undefined, parsed.nameEn ?? undefined, req.params.id as string);
        const uniqueErrors: string[] = [];
        if (parsed.itemCode && !uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
        if (parsed.nameAr && !uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
        if (parsed.nameEn && !uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");
        if (uniqueErrors.length > 0) {
          return res.status(409).json({ message: uniqueErrors.join("، ") });
        }
      }

      if (parsed.mediumUnitName !== undefined && !parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null;
        parsed.majorToMedium = null;
      }
      if (parsed.minorUnitName !== undefined && !parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      }

      const item = await storage.updateItem(req.params.id as string, parsed);
      if (!item) return res.status(404).json({ message: "الصنف غير موجود" });
      res.json(item);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_DELETE), async (req, res) => {
    try {
      await storage.deleteItem(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("violates foreign key constraint") || (error as { code?: string }).code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف هذا الصنف لوجود حركات مرتبطة به. يمكنك إلغاء تفعيله بدلاً من ذلك." });
      } else {
        res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
    }
  });

  // Item Form Types
  app.get("/api/form-types", async (req, res) => {
    try {
      const formTypes = await storage.getItemFormTypes();
      res.json(formTypes);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/form-types", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), async (req, res) => {
    try {
      const validated = insertItemFormTypeSchema.parse(req.body);
      const formType = await storage.createItemFormType(validated);
      res.status(201).json(formType);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== ITEM UOMS =====
  app.get("/api/uoms", async (req, res) => {
    try {
      const uoms = await storage.getItemUoms();
      res.json(uoms);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/uoms", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), async (req, res) => {
    try {
      const parsed = insertItemUomSchema.parse(req.body);
      const uom = await storage.createItemUom(parsed);
      res.status(201).json(uom);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        res.status(409).json({ message: "كود الوحدة مسجل بالفعل" });
      } else {
        res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
    }
  });

  // Item Transactions
  app.get("/api/items/:id/last-purchases", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const purchases = await storage.getLastPurchases(req.params.id as string, limit);
      res.json(purchases);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:id/avg-sales", async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];

      const result = await storage.getAverageSales(req.params.id as string, startDate, endDate);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== DEPARTMENTS =====
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/departments", requireAuth, checkPermission(PERMISSIONS.DEPARTMENTS_MANAGE), async (req, res) => {
    try {
      const parsed = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(parsed);
      res.status(201).json(department);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/departments/:id", requireAuth, checkPermission(PERMISSIONS.DEPARTMENTS_MANAGE), async (req, res) => {
    try {
      await storage.deleteDepartment(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== ITEM DEPARTMENT PRICES =====
  app.get("/api/items/:id/department-prices", async (req, res) => {
    try {
      const prices = await storage.getItemDepartmentPrices(req.params.id as string);
      res.json(prices);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/item-department-prices/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      await storage.deleteItemDepartmentPrice(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
        const activeLotWithExpiry = lots.find(l => l.expiryDate && parseFloat(l.qtyInMinor) > 0);
        if (activeLotWithExpiry) {
          return res.status(409).json({ message: "لا يمكن إلغاء الصلاحية: يوجد دفعات نشطة بصلاحية ورصيد أكبر من صفر" });
        }
      }
      const updated = await storage.updateItem(req.params.id as string, { hasExpiry });
      res.json(updated);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== INVENTORY LOTS =====
  app.get("/api/items/:id/lots", async (req, res) => {
    try {
      const lots = await storage.getLots(req.params.id as string);
      res.json(lots);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== ITEM BARCODES =====
  app.get("/api/items/:id/barcodes", async (req, res) => {
    try {
      const barcodes = await storage.getItemBarcodes(req.params.id as string);
      res.json(barcodes);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
      if ((error as { code?: string }).code === "23505" || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("unique") || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate")) {
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

}
