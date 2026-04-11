import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
} from "./_shared";
import { insertSupplierSchema } from "@shared/schema";

export function registerSupplierRoutes(app: Express) {
  app.get("/api/suppliers", requireAuth, async (req, res) => {
    try {
      const { search, page, pageSize, supplierType, isActive, sortBy, sortDir } = req.query;
      let isActiveFilter: boolean | null = true;
      if (isActive === "false") isActiveFilter = false;
      else if (isActive === "all") isActiveFilter = null;

      const validSortBy  = (sortBy === "nameAr" || sortBy === "currentBalance") ? sortBy : "currentBalance";
      const validSortDir = (sortDir === "asc" || sortDir === "desc") ? sortDir : "desc";

      const result = await storage.getSuppliers({
        search:       search as string | undefined,
        page:         parseInt(page as string) || 1,
        pageSize:     parseInt(pageSize as string) || 50,
        supplierType: supplierType as string | undefined,
        isActive:     isActiveFilter,
        sortBy:       validSortBy,
        sortDir:      validSortDir,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/suppliers/search", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const results = await storage.searchSuppliers(q, limit);
      res.json(results);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/suppliers/:id", requireAuth, async (req, res) => {
    try {
      const supplier = await storage.getSupplier(req.params.id as string);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/suppliers", requireAuth, checkPermission(PERMISSIONS.RECEIVING_CREATE), async (req, res) => {
    try {
      const validated = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(validated);
      res.status(201).json(supplier);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes('unique') || (error as { code?: string }).code === '23505') {
        return res.status(409).json({ message: "كود المورد مُستخدم بالفعل" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.patch("/api/suppliers/:id", requireAuth, checkPermission(PERMISSIONS.RECEIVING_EDIT), async (req, res) => {
    try {
      const validated = insertSupplierSchema.partial().parse(req.body);
      const supplier = await storage.updateSupplier(req.params.id as string, validated);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
