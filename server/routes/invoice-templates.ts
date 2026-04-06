import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { checkPermission } from "./_shared";

const lineInputSchema = z.object({
  lineType:              z.string(),
  serviceId:             z.string().nullable().optional(),
  itemId:                z.string().nullable().optional(),
  descriptionSnapshot:   z.string(),
  defaultQty:            z.union([z.string(), z.number()]).nullable().optional(),
  unitLevel:             z.string().nullable().optional(),
  notes:                 z.string().nullable().optional(),
  doctorName:            z.string().nullable().optional(),
  nurseName:             z.string().nullable().optional(),
  businessClassification: z.string().nullable().optional(),
  sortOrder:             z.number().optional(),
});

const createTemplateSchema = z.object({
  name:        z.string().min(1),
  description: z.string().nullable().optional(),
  category:    z.string().nullable().optional(),
  lines:       z.array(lineInputSchema).default([]),
});

const updateTemplateSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category:    z.string().nullable().optional(),
  isActive:    z.boolean().optional(),
  lines:       z.array(lineInputSchema).optional(),
});

export function registerInvoiceTemplateRoutes(app: Express) {

  // GET /api/invoice-templates — list (with optional search/category filters)
  app.get("/api/invoice-templates", requireAuth, async (req, res) => {
    try {
      const search     = req.query.search as string | undefined;
      const category   = req.query.category as string | undefined;
      const activeOnly = req.query.activeOnly !== "false";
      const templates  = await storage.listTemplates({ search, category, activeOnly });
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: "فشل تحميل النماذج" });
    }
  });

  // GET /api/invoice-templates/categories — distinct active categories
  app.get("/api/invoice-templates/categories", requireAuth, async (_req, res) => {
    try {
      const cats = await storage.getTemplateCategories();
      res.json(cats);
    } catch {
      res.status(500).json({ error: "فشل تحميل التصنيفات" });
    }
  });

  // GET /api/invoice-templates/:id — full template with lines
  app.get("/api/invoice-templates/:id", requireAuth, async (req, res) => {
    try {
      const tmpl = await storage.getTemplateById(String(req.params.id));
      if (!tmpl) return res.status(404).json({ error: "النموذج غير موجود" });
      res.json(tmpl);
    } catch {
      res.status(500).json({ error: "فشل تحميل النموذج" });
    }
  });

  // GET /api/invoice-templates/:id/apply — enriched for apply (bulk service+item)
  app.get("/api/invoice-templates/:id/apply", requireAuth, async (req, res) => {
    try {
      const tmpl = await storage.getTemplateForApply(String(req.params.id));
      if (!tmpl) return res.status(404).json({ error: "النموذج غير موجود أو غير نشط" });
      res.json(tmpl);
    } catch {
      res.status(500).json({ error: "فشل تحميل النموذج للتطبيق" });
    }
  });

  // POST /api/invoice-templates — create
  app.post("/api/invoice-templates", requireAuth, async (req, res) => {
    try {
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const userId = req.session?.userId as string | undefined;
      const tmpl = await storage.createTemplate(parsed.data, userId);
      res.status(201).json(tmpl);
    } catch {
      res.status(500).json({ error: "فشل إنشاء النموذج" });
    }
  });

  // PATCH /api/invoice-templates/:id — update header and/or lines
  app.patch("/api/invoice-templates/:id", requireAuth, async (req, res) => {
    try {
      const parsed = updateTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const tmpl = await storage.updateTemplate(String(req.params.id), parsed.data);
      if (!tmpl) return res.status(404).json({ error: "النموذج غير موجود" });
      res.json(tmpl);
    } catch {
      res.status(500).json({ error: "فشل تحديث النموذج" });
    }
  });

  // DELETE /api/invoice-templates/:id — soft delete (set isActive=false)
  app.delete("/api/invoice-templates/:id", requireAuth, async (req, res) => {
    try {
      const tmpl = await storage.deactivateTemplate(String(req.params.id));
      if (!tmpl) return res.status(404).json({ error: "النموذج غير موجود" });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "فشل تعطيل النموذج" });
    }
  });
}
