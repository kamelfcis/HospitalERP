import type { Express } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import multer from "multer";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { logger } from "../lib/logger";
import {
  requireAuth,
  checkPermission,
  accountTypeMapArabicToEnglish,
} from "./_shared";

const upload = multer({ storage: multer.memoryStorage() });

export function registerAccountSetupRoutes(app: Express) {
  app.get("/api/reports/trial-balance", async (req, res) => {
    try {
      const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
      const report = await storage.getTrialBalance(asOfDate);
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/income-statement", async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];
      const report = await storage.getIncomeStatement(startDate, endDate);
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/balance-sheet", async (req, res) => {
    try {
      const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
      const report = await storage.getBalanceSheet(asOfDate);
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/cost-centers", async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];
      const costCenterId = req.query.costCenterId as string | undefined;
      const report = await storage.getCostCenterReport(startDate, endDate, costCenterId);
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/account-ledger", async (req, res) => {
    try {
      const accountId = req.query.accountId as string;
      if (!accountId) {
        return res.status(400).json({ message: "معرف الحساب مطلوب" });
      }
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];
      const report = await storage.getAccountLedger(accountId, startDate, endDate);
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Accounts Import
  app.post("/api/accounts/import", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "لم يتم تحميل ملف" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      if (data.length === 0) {
        return res.status(400).json({ message: "الملف فارغ" });
      }

      const existingAccounts = await storage.getAccounts();
      const existingCodes = new Set(existingAccounts.map((a: any) => a.code));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      const getColumnValue = (row: Record<string, any>, possibleNames: string[]): string => {
        for (const name of possibleNames) {
          if (row[name] !== undefined && row[name] !== null) {
            return String(row[name]).trim();
          }
        }
        return "";
      };

      if (data.length > 0) {
        logger.debug({ columns: Object.keys(data[0]) }, "[IMPORT] column names detected");
      }

      for (const row of data) {
        const code = getColumnValue(row, ["كود الحساب", "الكود", "رقم الحساب", "كود", "Code", "code", "Account Code"]);
        const name = getColumnValue(row, ["اسم الحساب", "الاسم", "اسم", "Name", "name", "Account Name", "الحساب"]);
        const accountTypeArabic = getColumnValue(row, ["تصنيف الحساب", "التصنيف", "نوع الحساب", "النوع", "Type", "type", "Account Type"]);
        const displayList = getColumnValue(row, ["قائمة العرض", "القائمة"]);
        const requiresCostCenterValue = getColumnValue(row, ["يتطلب مركز تكلفة", "مركز التكلفة", "كود مركز التكلفة", "كود مركز التكلفة ", "Cost Center", "costCenter"]);
        const openingBalance = getColumnValue(row, ["الرصيد الافتتاحي", "الرصيد", "رصيد افتتاحي", "Opening Balance", "balance"]) || "0";

        if (!code || !name) {
          errors.push(`سطر بدون كود أو اسم تم تخطيه`);
          skipped++;
          continue;
        }

        if (existingCodes.has(code)) {
          skipped++;
          continue;
        }

        const extendedAccountTypeMap: Record<string, string> = {
          ...accountTypeMapArabicToEnglish,
          "الأصول": "asset",
          "الاصول": "asset",
          "اصول": "asset",
          "الخصوم": "liability",
          "خصوم": "liability",
          "الالتزامات": "liability",
          "التزامات": "liability",
          "حقوق الملكية": "equity",
          "حقوق ملكية": "equity",
          "الإيرادات": "revenue",
          "الايرادات": "revenue",
          "ايرادات": "revenue",
          "المصروفات": "expense",
          "المصاريف": "expense",
          "مصاريف": "expense",
        };

        let accountType = extendedAccountTypeMap[accountTypeArabic];
        
        if (!accountType && displayList) {
          const displayListMapping: Record<string, string> = {
            "قائمة المركز المالي": "asset",
            "الميزانية": "asset",
            "ميزانية": "asset",
            "قائمة الدخل": "expense",
            "الدخل": "expense",
          };
          
          if (displayList.includes("الدخل") || displayList.includes("دخل")) {
            if (accountTypeArabic.includes("إيراد") || accountTypeArabic.includes("ايراد")) {
              accountType = "revenue";
            } else if (accountTypeArabic.includes("مصروف") || accountTypeArabic.includes("مصاريف")) {
              accountType = "expense";
            } else {
              accountType = "expense";
            }
          } else {
            if (accountTypeArabic.includes("خصوم") || accountTypeArabic.includes("التزام")) {
              accountType = "liability";
            } else if (accountTypeArabic.includes("ملكية") || accountTypeArabic.includes("حقوق")) {
              accountType = "equity";
            } else {
              accountType = displayListMapping[displayList] || "asset";
            }
          }
        }
        
        if (!accountType) {
          accountType = "asset";
        }

        const requiresCostCenter = requiresCostCenterValue !== "" && requiresCostCenterValue !== "—" && requiresCostCenterValue !== "-";

        try {
          await storage.createAccount({
            code,
            name,
            accountType: accountType as any,
            requiresCostCenter,
            openingBalance,
            isActive: true,
            level: 1,
            parentId: null,
            description: null
          });
          imported++;
          existingCodes.add(code);
        } catch (err: unknown) {
          const _em = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err);
          errors.push(`خطأ في إضافة الحساب ${code}: ${_em}`);
          skipped++;
        }
      }

      res.json({
        message: `تم استيراد ${imported} حساب بنجاح، تم تخطي ${skipped} حساب`,
        imported,
        skipped,
        errors: errors.slice(0, 10)
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: `خطأ في معالجة الملف: ${_em}` });
    }
  });

  // Cost Centers Import
  app.post("/api/cost-centers/import", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "لم يتم تحميل ملف" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      if (data.length === 0) {
        return res.status(400).json({ message: "الملف فارغ" });
      }

      const existingCostCenters = await storage.getCostCenters();
      const existingCodes = new Set(existingCostCenters.map((cc: any) => cc.code));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of data) {
        const code = String(row["الكود"] || "").trim();
        const name = String(row["الاسم"] || "").trim();
        const type = String(row["النوع"] || "").trim() || null;

        if (!code || !name) {
          errors.push(`سطر بدون كود أو اسم تم تخطيه`);
          skipped++;
          continue;
        }

        if (existingCodes.has(code)) {
          skipped++;
          continue;
        }

        try {
          await storage.createCostCenter({
            code,
            name,
            type,
            isActive: true,
            parentId: null,
            description: null
          });
          imported++;
          existingCodes.add(code);
        } catch (err: unknown) {
          const _em = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err);
          errors.push(`خطأ في إضافة مركز التكلفة ${code}: ${_em}`);
          skipped++;
        }
      }

      res.json({
        message: `تم استيراد ${imported} مركز تكلفة بنجاح، تم تخطي ${skipped} مركز`,
        imported,
        skipped,
        errors: errors.slice(0, 10)
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: `خطأ في معالجة الملف: ${_em}` });
    }
  });

  // Account Mappings API
  app.get("/api/account-mappings", async (req, res) => {
    try {
      const { transactionType } = req.query;
      const mappings = await storage.getAccountMappings(transactionType as string | undefined);
      res.json(mappings);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/account-mappings/:id", async (req, res) => {
    try {
      const mapping = await storage.getAccountMapping(req.params.id as string);
      if (!mapping) return res.status(404).json({ message: "الإعداد غير موجود" });
      res.json(mapping);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/account-mappings", async (req, res) => {
    try {
      const { transactionType, lineType, debitAccountId, creditAccountId, description, isActive, warehouseId } = req.body;
      if (!transactionType || !lineType) {
        return res.status(400).json({ message: "نوع العملية ونوع السطر مطلوبان" });
      }
      const mapping = await storage.upsertAccountMapping({
        transactionType, lineType, debitAccountId, creditAccountId, description, isActive, warehouseId: warehouseId || null
      });
      res.json(mapping);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/account-mappings/:id", async (req, res) => {
    try {
      await storage.deleteAccountMapping(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/account-mappings/bulk", async (req, res) => {
    try {
      const { mappings } = req.body;
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ message: "يجب إرسال مصفوفة من الإعدادات" });
      }
      const results = [];
      for (const m of mappings) {
        const result = await storage.upsertAccountMapping(m);
        results.push(result);
      }
      res.json(results);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
