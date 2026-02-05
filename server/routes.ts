import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertAccountSchema, 
  insertCostCenterSchema, 
  insertFiscalPeriodSchema,
  insertJournalTemplateSchema,
  accounts,
  accountTypeLabels
} from "@shared/schema";
import { z } from "zod";
import * as XLSX from "xlsx";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const accountTypeMapArabicToEnglish: Record<string, string> = {
  "أصول": "asset",
  "خصوم": "liability",
  "حقوق ملكية": "equity",
  "إيرادات": "revenue",
  "مصروفات": "expense"
};

const accountTypeMapEnglishToArabic: Record<string, string> = {
  "asset": "أصول",
  "liability": "خصوم",
  "equity": "حقوق ملكية",
  "revenue": "إيرادات",
  "expense": "مصروفات"
};

function getDisplayList(accountType: string): string {
  if (["asset", "liability", "equity"].includes(accountType)) {
    return "الميزانية";
  }
  return "قائمة الدخل";
}

// Journal line schema
const journalLineSchema = z.object({
  lineNumber: z.number(),
  accountId: z.string(),
  costCenterId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  debit: z.string().or(z.number()),
  credit: z.string().or(z.number()),
});

// Journal entry creation/update schema with lines validation
const journalEntryWithLinesSchema = z.object({
  entryDate: z.string(),
  description: z.string().min(1, "الوصف مطلوب"),
  reference: z.string().optional().nullable(),
  periodId: z.string().optional().nullable(),
  lines: z.array(journalLineSchema).min(2, "يجب أن يحتوي القيد على سطرين على الأقل"),
  postAfterSave: z.boolean().optional(),
});

// Journal entry update schema (partial)
const journalEntryUpdateSchema = z.object({
  entryDate: z.string().optional(),
  description: z.string().min(1, "الوصف مطلوب").optional(),
  reference: z.string().optional().nullable(),
  periodId: z.string().optional().nullable(),
  lines: z.array(journalLineSchema).min(2, "يجب أن يحتوي القيد على سطرين على الأقل").optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Dashboard
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Accounts
  app.get("/api/accounts", async (req, res) => {
    try {
      const accounts = await storage.getAccounts();
      res.json(accounts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Accounts Export (must be before /:id to avoid conflict)
  app.get("/api/accounts/export", async (req, res) => {
    try {
      const accountsList = await storage.getAccounts();
      
      const excelData = accountsList.map(account => ({
        "كود الحساب": account.code,
        "اسم الحساب": account.name,
        "تصنيف الحساب": accountTypeMapEnglishToArabic[account.accountType] || account.accountType,
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/accounts/:id", async (req, res) => {
    try {
      const account = await storage.getAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ message: "الحساب غير موجود" });
      }
      res.json(account);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/accounts", async (req, res) => {
    try {
      const validated = insertAccountSchema.parse(req.body);
      const account = await storage.createAccount(validated);
      res.status(201).json(account);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/accounts/:id", async (req, res) => {
    try {
      const validated = insertAccountSchema.partial().parse(req.body);
      const account = await storage.updateAccount(req.params.id, validated);
      if (!account) {
        return res.status(404).json({ message: "الحساب غير موجود" });
      }
      res.json(account);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/accounts/:id", async (req, res) => {
    try {
      await storage.deleteAccount(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cost Centers
  app.get("/api/cost-centers", async (req, res) => {
    try {
      const costCenters = await storage.getCostCenters();
      res.json(costCenters);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cost Centers Export (must be before /:id to avoid conflict)
  app.get("/api/cost-centers/export", async (req, res) => {
    try {
      const costCentersList = await storage.getCostCenters();
      
      const excelData = costCentersList.map(cc => ({
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cost-centers/:id", async (req, res) => {
    try {
      const costCenter = await storage.getCostCenter(req.params.id);
      if (!costCenter) {
        return res.status(404).json({ message: "مركز التكلفة غير موجود" });
      }
      res.json(costCenter);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cost-centers", async (req, res) => {
    try {
      const validated = insertCostCenterSchema.parse(req.body);
      const costCenter = await storage.createCostCenter(validated);
      res.status(201).json(costCenter);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/cost-centers/:id", async (req, res) => {
    try {
      const validated = insertCostCenterSchema.partial().parse(req.body);
      const costCenter = await storage.updateCostCenter(req.params.id, validated);
      if (!costCenter) {
        return res.status(404).json({ message: "مركز التكلفة غير موجود" });
      }
      res.json(costCenter);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/cost-centers/:id", async (req, res) => {
    try {
      await storage.deleteCostCenter(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Fiscal Periods
  app.get("/api/fiscal-periods", async (req, res) => {
    try {
      const periods = await storage.getFiscalPeriods();
      res.json(periods);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/fiscal-periods", async (req, res) => {
    try {
      const validated = insertFiscalPeriodSchema.parse(req.body);
      const period = await storage.createFiscalPeriod(validated);
      res.status(201).json(period);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/fiscal-periods/:id/close", async (req, res) => {
    try {
      const period = await storage.closeFiscalPeriod(req.params.id, null);
      if (!period) {
        return res.status(404).json({ message: "الفترة غير موجودة" });
      }
      res.json(period);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/fiscal-periods/:id/reopen", async (req, res) => {
    try {
      const period = await storage.reopenFiscalPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ message: "الفترة غير موجودة" });
      }
      res.json(period);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Journal Entries
  app.get("/api/journal-entries", async (req, res) => {
    try {
      const entries = await storage.getJournalEntries();
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/journal-entries/:id", async (req, res) => {
    try {
      const entry = await storage.getJournalEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ message: "القيد غير موجود" });
      }
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/journal-entries", async (req, res) => {
    try {
      // Validate request body
      const validated = journalEntryWithLinesSchema.parse(req.body);
      const { lines, postAfterSave, ...entryData } = validated;
      
      // Validate balance
      const totalDebit = lines.reduce((sum, line) => sum + parseFloat(String(line.debit) || "0"), 0);
      const totalCredit = lines.reduce((sum, line) => sum + parseFloat(String(line.credit) || "0"), 0);
      
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ message: "القيد غير متوازن - إجمالي المدين يجب أن يساوي إجمالي الدائن" });
      }

      // Validate cost centers for accounts that require them
      const allAccounts = await storage.getAccounts();
      for (const line of lines) {
        const account = allAccounts.find(a => a.id === line.accountId);
        if (account?.requiresCostCenter && !line.costCenterId) {
          return res.status(400).json({ 
            message: `الحساب "${account.name}" يتطلب تحديد مركز تكلفة` 
          });
        }
      }

      // Check if posting into a closed period
      if (postAfterSave && entryData.periodId) {
        const period = await storage.getFiscalPeriod(entryData.periodId);
        if (period?.isClosed) {
          return res.status(400).json({ message: "لا يمكن الترحيل في فترة محاسبية مغلقة" });
        }
      }

      const formattedLines = lines.map(line => ({
        ...line,
        debit: String(line.debit),
        credit: String(line.credit),
        journalEntryId: "", // Will be set by storage
      }));

      const entry = await storage.createJournalEntry(
        { ...entryData, totalDebit: totalDebit.toFixed(2), totalCredit: totalCredit.toFixed(2) },
        formattedLines
      );

      if (postAfterSave) {
        const postedEntry = await storage.postJournalEntry(entry.id, null);
        return res.status(201).json(postedEntry);
      }

      res.status(201).json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/journal-entries/:id", async (req, res) => {
    try {
      // Validate request body with Zod
      const validated = journalEntryUpdateSchema.parse(req.body);
      const { lines, ...entryData } = validated;
      
      // Check if the entry exists and is a draft
      const existingEntry = await storage.getJournalEntry(req.params.id);
      if (!existingEntry) {
        return res.status(404).json({ message: "القيد غير موجود" });
      }
      if (existingEntry.status !== 'draft') {
        return res.status(400).json({ message: "لا يمكن تعديل قيد مُرحّل" });
      }

      // If changing period, check if target period is closed
      if (entryData.periodId) {
        const period = await storage.getFiscalPeriod(entryData.periodId);
        if (!period) {
          return res.status(400).json({ message: "الفترة المحاسبية غير موجودة" });
        }
        if (period.isClosed) {
          return res.status(400).json({ message: "لا يمكن تعيين قيد لفترة محاسبية مغلقة" });
        }
      }

      let updateData: any = { ...entryData };
      let formattedLines: any[] | undefined;
      
      if (lines && lines.length > 0) {
        const totalDebit = lines.reduce((sum, line) => sum + parseFloat(String(line.debit) || "0"), 0);
        const totalCredit = lines.reduce((sum, line) => sum + parseFloat(String(line.credit) || "0"), 0);
        
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return res.status(400).json({ message: "القيد غير متوازن" });
        }

        // Validate cost centers
        const allAccounts = await storage.getAccounts();
        for (const line of lines) {
          const account = allAccounts.find(a => a.id === line.accountId);
          if (account?.requiresCostCenter && !line.costCenterId) {
            return res.status(400).json({ 
              message: `الحساب "${account.name}" يتطلب تحديد مركز تكلفة` 
            });
          }
        }
        
        updateData.totalDebit = totalDebit.toFixed(2);
        updateData.totalCredit = totalCredit.toFixed(2);
        
        formattedLines = lines.map(line => ({
          ...line,
          debit: String(line.debit),
          credit: String(line.credit),
          journalEntryId: req.params.id,
        }));
      }

      const entry = await storage.updateJournalEntry(req.params.id, updateData, formattedLines);
      if (!entry) {
        return res.status(400).json({ message: "لا يمكن تعديل القيد. قد يكون مُرحّلاً أو غير موجود" });
      }
      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/journal-entries/:id/post", async (req, res) => {
    try {
      // Check entry exists and is draft
      const existingEntry = await storage.getJournalEntry(req.params.id);
      if (!existingEntry) {
        return res.status(404).json({ message: "القيد غير موجود" });
      }

      // Check if the entry's period is closed
      if (existingEntry.periodId) {
        const period = await storage.getFiscalPeriod(existingEntry.periodId);
        if (period?.isClosed) {
          return res.status(400).json({ message: "لا يمكن الترحيل في فترة محاسبية مغلقة" });
        }
      }

      const entry = await storage.postJournalEntry(req.params.id, null);
      if (!entry) {
        return res.status(400).json({ message: "لا يمكن ترحيل القيد" });
      }
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/journal-entries/:id/reverse", async (req, res) => {
    try {
      const entry = await storage.reverseJournalEntry(req.params.id, null);
      if (!entry) {
        return res.status(400).json({ message: "لا يمكن إلغاء القيد" });
      }
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/journal-entries/:id", async (req, res) => {
    try {
      const result = await storage.deleteJournalEntry(req.params.id);
      if (!result) {
        return res.status(400).json({ message: "لا يمكن حذف القيد. قد يكون مُرحّلاً" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const validated = insertJournalTemplateSchema.parse(req.body);
      const template = await storage.createTemplate(validated);
      res.status(201).json(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/templates/:id", async (req, res) => {
    try {
      const validated = insertJournalTemplateSchema.partial().parse(req.body);
      const template = await storage.updateTemplate(req.params.id, validated);
      if (!template) {
        return res.status(404).json({ message: "النموذج غير موجود" });
      }
      res.json(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/templates/:id", async (req, res) => {
    try {
      await storage.deleteTemplate(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Audit Log
  app.get("/api/audit-log", async (req, res) => {
    try {
      const logs = await storage.getAuditLogs();
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Reports
  app.get("/api/reports/trial-balance", async (req, res) => {
    try {
      const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
      const report = await storage.getTrialBalance(asOfDate);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/reports/balance-sheet", async (req, res) => {
    try {
      const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
      const report = await storage.getBalanceSheet(asOfDate);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      const existingCodes = new Set(existingAccounts.map(a => a.code));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of data) {
        const code = String(row["كود الحساب"] || "").trim();
        const name = String(row["اسم الحساب"] || "").trim();
        const accountTypeArabic = String(row["تصنيف الحساب"] || "").trim();
        const requiresCostCenterArabic = String(row["يتطلب مركز تكلفة"] || "").trim();
        const openingBalance = String(row["الرصيد الافتتاحي"] || "0");

        if (!code || !name) {
          errors.push(`سطر بدون كود أو اسم تم تخطيه`);
          skipped++;
          continue;
        }

        if (existingCodes.has(code)) {
          skipped++;
          continue;
        }

        const accountType = accountTypeMapArabicToEnglish[accountTypeArabic];
        if (!accountType) {
          errors.push(`تصنيف غير صالح للحساب ${code}: ${accountTypeArabic}`);
          skipped++;
          continue;
        }

        const requiresCostCenter = requiresCostCenterArabic === "نعم";

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
        } catch (err: any) {
          errors.push(`خطأ في إضافة الحساب ${code}: ${err.message}`);
          skipped++;
        }
      }

      res.json({
        message: `تم استيراد ${imported} حساب بنجاح، تم تخطي ${skipped} حساب`,
        imported,
        skipped,
        errors: errors.slice(0, 10)
      });
    } catch (error: any) {
      res.status(500).json({ message: `خطأ في معالجة الملف: ${error.message}` });
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
      const existingCodes = new Set(existingCostCenters.map(cc => cc.code));

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
        } catch (err: any) {
          errors.push(`خطأ في إضافة مركز التكلفة ${code}: ${err.message}`);
          skipped++;
        }
      }

      res.json({
        message: `تم استيراد ${imported} مركز تكلفة بنجاح، تم تخطي ${skipped} مركز`,
        imported,
        skipped,
        errors: errors.slice(0, 10)
      });
    } catch (error: any) {
      res.status(500).json({ message: `خطأ في معالجة الملف: ${error.message}` });
    }
  });

  return httpServer;
}
