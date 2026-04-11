import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { insertServiceSchema } from "@shared/schema";
import { resolveServicePrice } from "../lib/service-price-resolver";
import { resolveUserDeptScope, ScopeViolationError } from "../lib/scope-guard";

export function registerServicesCatalogRoutes(app: Express) {
  app.get("/api/services", requireAuth, async (req, res) => {
    try {
      const { search, category, active, page, pageSize } = req.query;
      let requestedDeptId = (req.query.departmentId as string) || undefined;

      const userId = (req.session as any).userId as string;
      const deptScope = await resolveUserDeptScope(userId);

      if (!deptScope.isFullAccess && deptScope.allowedDeptIds.length > 0) {
        if (requestedDeptId) {
          if (!deptScope.allowedDeptIds.includes(requestedDeptId)) {
            return res.status(403).json({ message: "غير مسموح لك بعرض خدمات هذا القسم" });
          }
        } else {
          requestedDeptId = deptScope.allowedDeptIds[0];
        }
      }

      const result = await storage.getServices({
        search: search as string,
        departmentId: requestedDeptId,
        category: category as string,
        active: active as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ScopeViolationError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      const _em = error instanceof Error ? error.message : String(error);
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

  app.get("/api/service-categories", requireAuth, async (req, res) => {
    try {
      const categories = await storage.getServiceCategories();
      res.json(categories);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

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
}
