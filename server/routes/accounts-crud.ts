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
import { insertAccountSchema } from "@shared/schema";

export function registerAccountsCrud(app: Express) {
  app.get("/api/accounts", requireAuth, async (req, res) => {
    try {
      const userId      = req.session.userId as string;
      const allAccounts = await storage.getAccounts();

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

  app.get("/api/accounts/export", requireAuth, checkPermission(PERMISSIONS.ACCOUNTS_VIEW), async (req, res) => {
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
}
