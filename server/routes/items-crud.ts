import { Express } from "express";
import { z } from "zod";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import {
  insertItemSchema,
  insertItemFormTypeSchema,
  insertItemUomSchema,
} from "@shared/schema";

export function registerItemsCrudRoutes(app: Express, storage: any) {
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/check-unique", async (req, res) => {
    try {
      const { code, nameAr, nameEn, excludeId } = req.query as { code?: string; nameAr?: string; nameEn?: string; excludeId?: string };
      const result = await storage.checkItemUniqueness(code, nameAr, nameEn, excludeId);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_DELETE), async (req, res) => {
    try {
      await storage.deleteItem(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes("violates foreign key constraint") || (error as { code?: string }).code === "23503") {
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
      const _em = error instanceof Error ? error.message : String(error);
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
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
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
      const _em = error instanceof Error ? error.message : String(error);
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
      const fromDate = (req.query.fromDate as string) || undefined;
      const limit = fromDate ? 500 : 5;
      const purchases = await storage.getLastPurchases(req.params.id as string, limit, fromDate);
      res.json(purchases);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
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
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
