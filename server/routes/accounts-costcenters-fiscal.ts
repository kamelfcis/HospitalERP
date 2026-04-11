import type { Express } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { logger } from "../lib/logger";
import { requireAuth, checkPermission } from "./_shared";
import { insertCostCenterSchema, insertFiscalPeriodSchema } from "@shared/schema";

export function registerCostCentersFiscal(app: Express) {
  app.get("/api/cost-centers", requireAuth, checkPermission(PERMISSIONS.COST_CENTERS_VIEW), async (req, res) => {
    try {
      const costCenters = await storage.getCostCenters();
      res.json(costCenters);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/cost-centers/export", requireAuth, checkPermission(PERMISSIONS.COST_CENTERS_VIEW), async (req, res) => {
    try {
      const costCentersList = await storage.getCostCenters();
      
      const excelData = costCentersList.map((cc: any) => ({
        "الكود": cc.code,
        "الاسم": cc.name,
        "النوع": cc.type || "",
        "نشط": cc.isActive ? "نعم" : "لا"
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "مراكز التكلفة");

      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=cost-centers.xlsx");
      res.send(buffer);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/cost-centers/:id", requireAuth, checkPermission(PERMISSIONS.COST_CENTERS_VIEW), async (req, res) => {
    try {
      const costCenter = await storage.getCostCenter(req.params.id as string);
      if (!costCenter) {
        return res.status(404).json({ message: "مركز التكلفة غير موجود" });
      }
      res.json(costCenter);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/cost-centers", requireAuth, checkPermission(PERMISSIONS.COST_CENTERS_CREATE), async (req, res) => {
    try {
      const validated = insertCostCenterSchema.parse(req.body);
      const costCenter = await storage.createCostCenter(validated);
      res.status(201).json(costCenter);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.patch("/api/cost-centers/:id", requireAuth, checkPermission(PERMISSIONS.COST_CENTERS_EDIT), async (req, res) => {
    try {
      const validated = insertCostCenterSchema.partial().parse(req.body);
      const costCenter = await storage.updateCostCenter(req.params.id as string, validated);
      if (!costCenter) {
        return res.status(404).json({ message: "مركز التكلفة غير موجود" });
      }
      res.json(costCenter);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/cost-centers/:id", requireAuth, checkPermission(PERMISSIONS.COST_CENTERS_DELETE), async (req, res) => {
    try {
      await storage.deleteCostCenter(req.params.id as string);
      res.status(204).send();
    } catch (error: any) {
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("violates foreign key constraint") || error.code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف مركز التكلفة لوجود مراكز فرعية أو قيود مرتبطة به." });
      } else {
        res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
    }
  });

  app.get("/api/fiscal-periods", requireAuth, checkPermission(PERMISSIONS.FISCAL_PERIODS_VIEW), async (req, res) => {
    try {
      const periods = await storage.getFiscalPeriods();
      res.json(periods);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/fiscal-periods", requireAuth, checkPermission(PERMISSIONS.FISCAL_PERIODS_MANAGE), async (req, res) => {
    try {
      const validated = insertFiscalPeriodSchema.parse(req.body);
      const period = await storage.createFiscalPeriod(validated);
      res.status(201).json(period);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/fiscal-periods/:id/close", requireAuth, checkPermission(PERMISSIONS.FISCAL_PERIODS_MANAGE), async (req, res) => {
    try {
      const period = await storage.closeFiscalPeriod(req.params.id as string, req.session.userId || null);
      if (!period) {
        return res.status(404).json({ message: "الفترة غير موجودة" });
      }
      auditLog({
        tableName: "fiscal_periods",
        recordId: req.params.id as string,
        action: "close",
        newValues: { name: period.name },
        userId: req.session.userId as string,
      }).catch(err => logger.warn({ err: err.message }, "[Audit] fiscal period close"));
      res.json(period);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/fiscal-periods/:id/reopen", requireAuth, checkPermission(PERMISSIONS.FISCAL_PERIODS_MANAGE), async (req, res) => {
    try {
      const period = await storage.reopenFiscalPeriod(req.params.id as string);
      if (!period) {
        return res.status(404).json({ message: "الفترة غير موجودة" });
      }
      auditLog({
        tableName: "fiscal_periods",
        recordId: req.params.id as string,
        action: "reopen",
        newValues: { name: period.name },
        userId: req.session.userId as string,
      }).catch(err => logger.warn({ err: err.message }, "[Audit] fiscal period reopen"));
      res.json(period);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
