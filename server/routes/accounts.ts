import type { Express } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { logger } from "../lib/logger";
import {
  requireAuth,
  checkPermission,
  accountTypeMapEnglishToArabic,
  getDisplayList,
} from "./_shared";
import {
  insertAccountSchema,
  insertCostCenterSchema,
  insertFiscalPeriodSchema,
} from "@shared/schema";

export function registerAccountsRoutes(app: Express) {
  app.get("/api/accounts", requireAuth, async (req, res) => {
    try {
      const userId      = req.session.userId as string;
      const allAccounts = await storage.getAccounts();

      // Users who can manage account mappings must see ALL accounts in the picker
      // regardless of their personal account scope (scoping would break the mapping UI)
      const perms = await storage.getUserEffectivePermissions(userId);
      if (perms.includes(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS)) {
        return res.json(allAccounts);
      }

      const visibleIds = await storage.getVisibleAccountIds(userId);
      if (visibleIds === null) {
        res.json(allAccounts);
      } else {
        const idSet = new Set(visibleIds);
        res.json(allAccounts.filter(a => idSet.has(a.id)));
      }
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/accounts/export", requireAuth, async (req, res) => {
    try {
      const userId       = req.session.userId as string;
      const allAccounts  = await storage.getAccounts();
      const visibleIds   = await storage.getVisibleAccountIds(userId);
      const accountsList = visibleIds === null
        ? allAccounts
        : allAccounts.filter(a => (new Set(visibleIds)).has(a.id));
      
      const excelData = accountsList.map((account: any) => ({
        "كود الحساب": account.code,
        "اسم الحساب": account.name,
        "تصنيف الحساب": (accountTypeMapEnglishToArabic as any)[account.accountType] || account.accountType,
        "يتطلب مركز تكلفة": account.requiresCostCenter ? "نعم" : "لا",
        "قائمة العرض": getDisplayList(account.accountType),
        "الرصيد الافتتاحي": parseFloat(account.openingBalance),
        "نشط": account.isActive ? "نعم" : "لا"
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "دليل الحسابات");

      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=accounts.xlsx");
      res.send(buffer);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/accounts/:id", requireAuth, async (req, res) => {
    try {
      const account = await storage.getAccount(req.params.id as string);
      if (!account) {
        return res.status(404).json({ message: "الحساب غير موجود" });
      }
      const visibleIds = await storage.getVisibleAccountIds(req.session.userId as string);
      if (visibleIds !== null && !visibleIds.includes(account.id)) {
        return res.status(403).json({ message: "ليس لديك صلاحية الوصول لهذا الحساب" });
      }
      res.json(account);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/accounts", requireAuth, checkPermission(PERMISSIONS.ACCOUNTS_CREATE), async (req, res) => {
    try {
      const validated = insertAccountSchema.parse(req.body);
      const account = await storage.createAccount(validated);
      auditLog({
        tableName: "accounts",
        recordId: account.id as string,
        action: "create",
        newValues: validated,
        userId: req.session?.userId as string,
      }).catch(err => logger.warn({ err: err.message }, "[Audit] account create"));
      res.status(201).json(account);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.patch("/api/accounts/:id", requireAuth, checkPermission(PERMISSIONS.ACCOUNTS_EDIT), async (req, res) => {
    try {
      const validated = insertAccountSchema.partial().parse(req.body);
      const oldAccount = await storage.getAccount(req.params.id as string);
      const account = await storage.updateAccount(req.params.id as string, validated);
      if (!account) {
        return res.status(404).json({ message: "الحساب غير موجود" });
      }
      auditLog({
        tableName: "accounts",
        recordId: req.params.id as string,
        action: "update",
        oldValues: oldAccount,
        newValues: validated,
        userId: req.session?.userId as string,
      }).catch(err => logger.warn({ err: err.message }, "[Audit] account update"));
      res.json(account);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/accounts/:id", requireAuth, checkPermission(PERMISSIONS.ACCOUNTS_DELETE), async (req, res) => {
    try {
      const deletedAccount = await storage.getAccount(req.params.id as string);
      await storage.deleteAccount(req.params.id as string);
      auditLog({
        tableName: "accounts",
        recordId: req.params.id as string,
        action: "delete",
        oldValues: deletedAccount,
        userId: req.session?.userId as string,
      }).catch(err => logger.warn({ err: err.message }, "[Audit] account delete"));
      res.status(204).send();
    } catch (error: any) {
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("violates foreign key constraint") || error.code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف هذا الحساب لوجود حسابات فرعية أو قيود مرتبطة به." });
      } else {
        res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
    }
  });

  // Cost Centers
  app.get("/api/cost-centers", requireAuth, async (req, res) => {
    try {
      const costCenters = await storage.getCostCenters();
      res.json(costCenters);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/cost-centers/export", async (req, res) => {
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

  app.get("/api/cost-centers/:id", async (req, res) => {
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

  // Fiscal Periods
  app.get("/api/fiscal-periods", async (req, res) => {
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
