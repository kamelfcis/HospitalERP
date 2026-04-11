import type { Express } from "express";
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
import { db } from "../db";
import { accounts } from "@shared/schema/finance";
import { isNotNull, sql } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage() });

export function registerAccountSetupImport(app: Express) {
  app.post("/api/accounts/import", requireAuth, checkPermission(PERMISSIONS.ACCOUNTS_CREATE), upload.single("file"), async (req, res) => {
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

  app.post("/api/cost-centers/import", requireAuth, checkPermission(PERMISSIONS.COST_CENTERS_CREATE), upload.single("file"), async (req, res) => {
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

  app.post("/api/admin/backfill-cost-centers", requireAuth, async (req, res) => {
    try {
      const accountRows = await db
        .select({ id: accounts.id, defaultCostCenterId: accounts.defaultCostCenterId })
        .from(accounts)
        .where(isNotNull(accounts.defaultCostCenterId));

      let totalUpdated = 0;
      for (const acct of accountRows) {
        if (!acct.defaultCostCenterId) continue;
        const result = await db.execute(
          sql`UPDATE journal_lines
              SET cost_center_id = ${acct.defaultCostCenterId}
              WHERE account_id = ${acct.id}
                AND cost_center_id IS NULL`
        );
        totalUpdated += (result as any).rowCount ?? 0;
      }

      logger.info({ totalUpdated }, "[Backfill] Cost center backfill complete");
      res.json({ success: true, linesUpdated: totalUpdated });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      logger.error({ error: _em }, "[Backfill] Cost center backfill failed");
      res.status(500).json({ message: _em });
    }
  });
}
