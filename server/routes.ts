import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertAccountSchema, 
  insertCostCenterSchema, 
  insertFiscalPeriodSchema,
  insertJournalTemplateSchema,
  insertItemSchema,
  insertItemFormTypeSchema,
  insertDepartmentSchema,
  insertItemDepartmentPriceSchema,
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
      if (error.message?.includes("violates foreign key constraint") || error.code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف هذا الحساب لوجود حسابات فرعية أو قيود مرتبطة به." });
      } else {
        res.status(500).json({ message: error.message });
      }
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
      if (error.message?.includes("violates foreign key constraint") || error.code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف مركز التكلفة لوجود مراكز فرعية أو قيود مرتبطة به." });
      } else {
        res.status(500).json({ message: error.message });
      }
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

  app.get("/api/templates/:id", async (req, res) => {
    try {
      const template = await storage.getTemplateWithLines(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "النموذج غير موجود" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const { lines, ...templateData } = req.body;
      const validated = insertJournalTemplateSchema.parse(templateData);
      
      if (lines && Array.isArray(lines) && lines.length > 0) {
        const validatedLines = lines.map((line: any, index: number) => ({
          templateId: "", // Will be set by storage method
          lineNumber: index + 1,
          accountId: line.accountId,
          costCenterId: line.costCenterId || null,
          description: line.description || "",
          debitPercent: line.debit || line.debitPercent || null,
          creditPercent: line.credit || line.creditPercent || null,
        }));
        const template = await storage.createTemplateWithLines(validated, validatedLines);
        res.status(201).json(template);
      } else {
        const template = await storage.createTemplate(validated);
        res.status(201).json(template);
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/templates/:id", async (req, res) => {
    try {
      const { lines, ...templateData } = req.body;
      const validated = insertJournalTemplateSchema.partial().parse(templateData);
      
      if (lines && Array.isArray(lines)) {
        const validatedLines = lines.map((line: any, index: number) => ({
          templateId: req.params.id,
          lineNumber: index + 1,
          accountId: line.accountId,
          costCenterId: line.costCenterId || null,
          description: line.description || "",
          debitPercent: line.debit || line.debitPercent || null,
          creditPercent: line.credit || line.creditPercent || null,
        }));
        const template = await storage.updateTemplateWithLines(req.params.id, validated, validatedLines);
        if (!template) {
          return res.status(404).json({ message: "النموذج غير موجود" });
        }
        res.json(template);
      } else {
        const template = await storage.updateTemplate(req.params.id, validated);
        if (!template) {
          return res.status(404).json({ message: "النموذج غير موجود" });
        }
        res.json(template);
      }
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

      // Helper function to find value from multiple possible column names
      const getColumnValue = (row: Record<string, any>, possibleNames: string[]): string => {
        for (const name of possibleNames) {
          if (row[name] !== undefined && row[name] !== null) {
            return String(row[name]).trim();
          }
        }
        return "";
      };

      // Log first row keys for debugging
      if (data.length > 0) {
        console.log("أسماء الأعمدة في الملف:", Object.keys(data[0]));
      }

      for (const row of data) {
        // Try multiple possible column names for each field (including variations with/without spaces)
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

        // Extended mapping for account types with Arabic variations
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

        // Map account type from تصنيف الحساب
        let accountType = extendedAccountTypeMap[accountTypeArabic];
        
        // If not found from تصنيف, try to derive from قائمة العرض
        if (!accountType && displayList) {
          const displayListMapping: Record<string, string> = {
            "قائمة المركز المالي": "asset", // Balance sheet - default to asset
            "الميزانية": "asset",
            "ميزانية": "asset",
            "قائمة الدخل": "expense", // Income statement - need to determine if revenue or expense
            "الدخل": "expense",
          };
          
          // Use تصنيف الحساب to determine if it's revenue or expense for income statement items
          if (displayList.includes("الدخل") || displayList.includes("دخل")) {
            // Check تصنيف to see if it's revenue or expense
            if (accountTypeArabic.includes("إيراد") || accountTypeArabic.includes("ايراد")) {
              accountType = "revenue";
            } else if (accountTypeArabic.includes("مصروف") || accountTypeArabic.includes("مصاريف")) {
              accountType = "expense";
            } else {
              accountType = "expense"; // Default for income statement
            }
          } else {
            // For balance sheet, check تصنيف
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
          // Default to asset if no type specified
          accountType = "asset";
        }

        // Check if cost center is required (not "—" or empty)
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

  // Items
  app.get("/api/items", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string | undefined;
      const category = req.query.category as string | undefined;
      const isToxic = req.query.isToxic !== undefined ? req.query.isToxic === "true" : undefined;
      const formTypeId = req.query.formTypeId as string | undefined;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;
      const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
      const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;

      const result = await storage.getItems({
        page,
        limit,
        search,
        category,
        isToxic,
        formTypeId,
        isActive,
        minPrice,
        maxPrice,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:id", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/items", async (req, res) => {
    try {
      const validated = insertItemSchema.parse(req.body);
      const item = await storage.createItem(validated);
      res.status(201).json(item);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/items/:id", async (req, res) => {
    try {
      const validated = insertItemSchema.partial().parse(req.body);
      const item = await storage.updateItem(req.params.id, validated);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      res.json(item);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/items/:id", async (req, res) => {
    try {
      await storage.deleteItem(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      if (error.message?.includes("violates foreign key constraint") || error.code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف هذا الصنف لوجود حركات مرتبطة به. يمكنك إلغاء تفعيله بدلاً من ذلك." });
      } else {
        res.status(500).json({ message: error.message });
      }
    }
  });

  // Item Form Types
  app.get("/api/form-types", async (req, res) => {
    try {
      const formTypes = await storage.getItemFormTypes();
      res.json(formTypes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/form-types", async (req, res) => {
    try {
      const validated = insertItemFormTypeSchema.parse(req.body);
      const formType = await storage.createItemFormType(validated);
      res.status(201).json(formType);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Item Transactions
  app.get("/api/items/:id/last-purchases", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const purchases = await storage.getLastPurchases(req.params.id, limit);
      res.json(purchases);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:id/avg-sales", async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];

      const result = await storage.getAverageSales(req.params.id, startDate, endDate);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== DEPARTMENTS =====
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/departments/:id", async (req, res) => {
    try {
      const department = await storage.getDepartment(req.params.id);
      if (!department) {
        return res.status(404).json({ message: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/departments", async (req, res) => {
    try {
      const parsed = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(parsed);
      res.status(201).json(department);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/departments/:id", async (req, res) => {
    try {
      const parsed = insertDepartmentSchema.partial().parse(req.body);
      const department = await storage.updateDepartment(req.params.id, parsed);
      if (!department) {
        return res.status(404).json({ message: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/departments/:id", async (req, res) => {
    try {
      await storage.deleteDepartment(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== ITEM DEPARTMENT PRICES =====
  app.get("/api/items/:id/department-prices", async (req, res) => {
    try {
      const prices = await storage.getItemDepartmentPrices(req.params.id);
      res.json(prices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/items/:id/department-prices", async (req, res) => {
    try {
      const parsed = insertItemDepartmentPriceSchema.parse({
        ...req.body,
        itemId: req.params.id,
      });
      const price = await storage.createItemDepartmentPrice(parsed);
      res.status(201).json(price);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/item-department-prices/:id", async (req, res) => {
    try {
      const parsed = insertItemDepartmentPriceSchema.partial().parse(req.body);
      const price = await storage.updateItemDepartmentPrice(req.params.id, parsed);
      if (!price) {
        return res.status(404).json({ message: "السعر غير موجود" });
      }
      res.json(price);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/item-department-prices/:id", async (req, res) => {
    try {
      await storage.deleteItemDepartmentPrice(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pricing", async (req, res) => {
    try {
      const { itemId, departmentId } = req.query;
      if (!itemId || !departmentId) {
        return res.status(400).json({ message: "itemId و departmentId مطلوبان" });
      }
      const price = await storage.getItemPriceForDepartment(
        itemId as string,
        departmentId as string
      );
      res.json({ price });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
