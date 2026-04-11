import { Express } from "express";
import { z } from "zod";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import {
  insertItemFormTypeSchema,
  insertItemUomSchema,
} from "@shared/schema";

export function registerItemsAuxRoutes(app: Express, storage: any) {
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

  app.get("/api/items/:id/consumables", requireAuth, async (req, res) => {
    try {
      const rows = await storage.getItemConsumables(req.params.id);
      res.json(rows);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.put("/api/items/:id/consumables", requireAuth, async (req, res) => {
    try {
      const lineSchema = z.object({
        consumableItemId: z.string().min(1),
        quantity: z.string(),
        unitLevel: z.string(),
        notes: z.string().nullable().optional(),
      });
      const lines = z.array(lineSchema).parse(req.body);
      const rows = await storage.replaceItemConsumables(req.params.id, lines);
      res.json(rows);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) return res.status(422).json({ errors: error.errors });
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
