import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { insertServiceSchema, insertPriceListSchema } from "@shared/schema";
import { resolveServicePrice } from "../lib/service-price-resolver";

export function registerServicesRoutes(app: Express) {
  // ===== Services =====

  // Layer 2: requireAuth — service catalog used in invoicing; any logged-in user may need this
  // Deferred: SERVICES.VIEW not required here — service lookup is cross-module operational data
  app.get("/api/services", requireAuth, async (req, res) => {
    try {
      const { search, departmentId, category, active, page, pageSize } = req.query;
      const result = await storage.getServices({
        search: search as string,
        departmentId: departmentId as string,
        category: category as string,
        active: active as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/services", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertServiceSchema.parse(req.body);
      const service = await storage.createService(validated);
      res.status(201).json(service);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود الخدمة مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.get("/api/services/:id", requireAuth, async (req, res) => {
    try {
      const service = await storage.getService(req.params.id as string);
      if (!service) return res.status(404).json({ message: "الخدمة غير موجودة" });
      res.json(service);
    } catch (error: unknown) {
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  /**
   * GET /api/services/:id/resolve-price
   * يُحلّ سعر الخدمة بناءً على العقد والقوائم المتاحة.
   * يُستخدم من واجهة فاتورة المريض لعرض السعر الصحيح قبل الحفظ.
   * Query params:
   *   contractId?      — معرّف العقد (يجلب base_price_list_id منه)
   *   evaluationDate?  — تاريخ التقييم (افتراضي: اليوم)
   */
  app.get("/api/services/:id/resolve-price", requireAuth, async (req, res) => {
    try {
      const serviceId = req.params.id as string;
      const { contractId, evaluationDate } = req.query as { contractId?: string; evaluationDate?: string };

      let contractBasePriceListId: string | null = null;
      if (contractId) {
        const contract = await storage.getContractById(contractId);
        contractBasePriceListId = (contract as any)?.basePriceListId ?? null;
      }

      const resolved = await resolveServicePrice({
        serviceId,
        contractBasePriceListId,
        evaluationDate,
      });

      res.json(resolved);
    } catch (error: unknown) {
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.put("/api/services/:id", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(req.params.id as string, validated);
      if (!service) {
        return res.status(404).json({ message: "الخدمة غير موجودة" });
      }
      res.json(service);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود الخدمة مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // Layer 2: requireAuth — category lookup for service forms
  app.get("/api/service-categories", requireAuth, async (req, res) => {
    try {
      const categories = await storage.getServiceCategories();
      res.json(categories);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== Service Consumables =====

  // Layer 2: requireAuth — consumables linked to service, used in invoicing forms
  app.get("/api/services/:id/consumables", requireAuth, async (req, res) => {
    try {
      const consumables = await storage.getServiceConsumables(req.params.id as string);
      res.json(consumables);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.put("/api/services/:id/consumables", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const lines = req.body;
      if (!Array.isArray(lines)) {
        return res.status(400).json({ message: "يجب إرسال مصفوفة من المستهلكات" });
      }
      const validUnitLevels = ["major", "medium", "minor"];
      for (const line of lines) {
        if (!line.itemId || !line.quantity || Number(line.quantity) <= 0) {
          return res.status(400).json({ message: "كل مستهلك يجب أن يحتوي على صنف وكمية صحيحة" });
        }
        if (line.unitLevel && !validUnitLevels.includes(line.unitLevel)) {
          return res.status(400).json({ message: "مستوى الوحدة غير صالح" });
        }
      }
      const result = await storage.replaceServiceConsumables(req.params.id as string, lines);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== Price Lists =====

  // Layer 2: requireAuth — price list lookup used in patient/sales invoicing
  app.get("/api/price-lists", requireAuth, async (req, res) => {
    try {
      const lists = await storage.getPriceLists();
      res.json(lists);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/price-lists", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertPriceListSchema.parse(req.body);
      const list = await storage.createPriceList(validated);
      res.status(201).json(list);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود قائمة الأسعار مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.put("/api/price-lists/:id", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertPriceListSchema.partial().parse(req.body);
      const list = await storage.updatePriceList(req.params.id as string, validated);
      if (!list) {
        return res.status(404).json({ message: "قائمة الأسعار غير موجودة" });
      }
      res.json(list);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود قائمة الأسعار مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== Price List Items =====

  // Layer 2: requireAuth — price list items used in invoicing and OPD
  app.get("/api/price-lists/:id/items", requireAuth, async (req, res) => {
    try {
      const { search, departmentId, category, page, pageSize } = req.query;
      const result = await storage.getPriceListItems(req.params.id as string, {
        search: search as string,
        departmentId: departmentId as string,
        category: category as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  const priceListItemsBodySchema = z.object({
    items: z.array(z.object({
      serviceId: z.string(),
      price: z.string(),
      minDiscountPct: z.string().optional(),
      maxDiscountPct: z.string().optional(),
    })).min(1, "يجب إرسال بند واحد على الأقل"),
  });

  app.post("/api/price-lists/:id/items", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = priceListItemsBodySchema.parse(req.body);
      await storage.upsertPriceListItems(req.params.id as string, validated.items);
      res.json({ success: true });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/price-lists/:id/copy-from", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const { sourceListId } = z.object({ sourceListId: z.string() }).parse(req.body);
      await storage.copyPriceList(req.params.id as string, sourceListId);
      res.json({ success: true });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== Bulk Adjustment =====

  const bulkAdjustBodySchema = z.object({
    mode: z.enum(['PCT', 'FIXED']),
    direction: z.enum(['INCREASE', 'DECREASE']),
    value: z.number().positive("القيمة يجب أن تكون أكبر من صفر"),
    departmentId: z.string().optional(),
    category: z.string().optional(),
    createMissingFromBasePrice: z.boolean().optional(),
  });

  app.post("/api/price-lists/:id/bulk-adjust/preview", requireAuth, async (req, res) => {
    try {
      const validated = bulkAdjustBodySchema.parse(req.body);
      const result = await storage.bulkAdjustPreview(req.params.id as string, validated);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/price-lists/:id/bulk-adjust/apply", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = bulkAdjustBodySchema.parse(req.body);
      const result = await storage.bulkAdjustApply(req.params.id as string, validated);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("أسعار سالبة")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

}
