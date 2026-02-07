import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { 
  insertAccountSchema, 
  insertCostCenterSchema, 
  insertFiscalPeriodSchema,
  insertJournalTemplateSchema,
  insertItemSchema,
  insertItemFormTypeSchema,
  insertItemUomSchema,
  insertDepartmentSchema,
  insertItemDepartmentPriceSchema,
  insertItemBarcodeSchema,
  insertInventoryLotSchema,
  insertWarehouseSchema,
  insertStoreTransferSchema,
  insertTransferLineSchema,
  insertSupplierSchema,
  insertServiceSchema,
  insertPriceListSchema,
  accounts,
  accountTypeLabels,
  salesInvoiceHeaders,
  salesInvoiceLines,
  warehouses,
  items,
  itemBarcodes,
  inventoryLots
} from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
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

// Warehouse update schema
const warehouseUpdateSchema = z.object({
  warehouseCode: z.string().min(1).optional(),
  nameAr: z.string().min(1).optional(),
  departmentId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// User departments assignment schema
const userDepartmentsAssignmentSchema = z.object({
  departmentIds: z.array(z.string()),
});

// User warehouses assignment schema
const userWarehousesAssignmentSchema = z.object({
  warehouseIds: z.array(z.string()),
});

async function validateReceivingLines(lines: any[]): Promise<{ lineIndex: number; field: string; messageAr: string }[]> {
  const errors: { lineIndex: number; field: string; messageAr: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.isRejected) continue;

    const sp = parseFloat(line.salePrice);
    if (!line.salePrice || isNaN(sp) || sp <= 0) {
      errors.push({ lineIndex: i, field: "salePrice", messageAr: "سعر البيع مطلوب ويجب أن يكون أكبر من صفر" });
    }

    const item = await storage.getItem(line.itemId);
    if (item) {
      if (item.hasExpiry) {
        const month = line.expiryMonth != null ? parseInt(String(line.expiryMonth)) : null;
        const year = line.expiryYear != null ? parseInt(String(line.expiryYear)) : null;
        if (month == null || isNaN(month) || month < 1 || month > 12) {
          errors.push({ lineIndex: i, field: "expiry", messageAr: "تاريخ الصلاحية مطلوب لهذا الصنف" });
        } else if (year == null || isNaN(year) || year < 2000 || year > 2100) {
          errors.push({ lineIndex: i, field: "expiry", messageAr: "سنة الصلاحية غير صحيحة" });
        }
      } else {
        if (line.expiryMonth != null || line.expiryYear != null) {
          line.expiryMonth = null;
          line.expiryYear = null;
        }
      }
    }
  }
  return errors;
}

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

  app.get("/api/items/lookup", async (req, res) => {
    try {
      const { query, warehouseId, limit } = req.query;
      if (!query || !warehouseId) {
        return res.status(400).json({ message: "query و warehouseId مطلوبة" });
      }
      const results = await storage.searchItemsForTransfer(
        query as string,
        warehouseId as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/search", async (req, res) => {
    try {
      const { warehouseId, mode, q, page, pageSize, includeZeroStock, drugsOnly } = req.query;
      if (!warehouseId || !q) {
        return res.status(400).json({ message: "warehouseId و q مطلوبة" });
      }
      const result = await storage.searchItemsAdvanced({
        mode: (mode as string || 'AR') as 'AR' | 'EN' | 'CODE' | 'BARCODE',
        query: q as string,
        warehouseId: warehouseId as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 50,
        includeZeroStock: includeZeroStock === 'true',
        drugsOnly: drugsOnly === 'true',
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/expiry-options", async (req, res) => {
    try {
      const { warehouseId, asOfDate } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const options = await storage.getExpiryOptions(req.params.itemId, warehouseId as string, date);
      res.json(options);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/availability-summary", async (req, res) => {
    try {
      const { asOfDate, excludeExpired } = req.query;
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const exclude = excludeExpired !== "0";
      const summary = await storage.getItemAvailabilitySummary(req.params.itemId, date, exclude);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/availability", async (req, res) => {
    try {
      const { warehouseId } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const qty = await storage.getItemAvailability(req.params.itemId, warehouseId as string);
      res.json({ availableQtyMinor: qty });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/check-unique", async (req, res) => {
    try {
      const { code, nameAr, nameEn, excludeId } = req.query as { code?: string; nameAr?: string; nameEn?: string; excludeId?: string };
      const result = await storage.checkItemUniqueness(code, nameAr, nameEn, excludeId);
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
      const parsed = insertItemSchema.parse(req.body);

      const errors: string[] = [];
      if (!parsed.itemCode?.trim()) errors.push("كود الصنف مطلوب");
      if (!parsed.nameAr?.trim()) errors.push("الاسم العربي مطلوب");
      if (!parsed.nameEn?.trim()) errors.push("الاسم الإنجليزي مطلوب");
      if (!parsed.formTypeId) errors.push("نوع الشكل مطلوب");
      if (!parsed.majorUnitName?.trim()) errors.push("الوحدة الكبرى مطلوبة");
      if (!parsed.mediumUnitName?.trim()) errors.push("الوحدة المتوسطة مطلوبة");
      if (!parsed.minorUnitName?.trim()) errors.push("الوحدة الصغرى مطلوبة");

      const majorToMedium = parseFloat(parsed.majorToMedium as string || "0");
      const majorToMinor = parseFloat(parsed.majorToMinor as string || "0");
      const mediumToMinor = parseFloat(parsed.mediumToMinor as string || "0");
      if (majorToMedium <= 0) errors.push("معامل التحويل كبرى ← متوسطة يجب أن يكون أكبر من صفر");
      if (majorToMinor <= 0) errors.push("معامل التحويل كبرى ← صغرى يجب أن يكون أكبر من صفر");
      if (mediumToMinor <= 0) errors.push("معامل التحويل متوسطة ← صغرى يجب أن يكون أكبر من صفر");

      if (errors.length > 0) {
        return res.status(400).json({ message: errors.join("، ") });
      }

      const uniqueness = await storage.checkItemUniqueness(parsed.itemCode, parsed.nameAr, parsed.nameEn);
      const uniqueErrors: string[] = [];
      if (!uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
      if (!uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
      if (!uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");

      if (uniqueErrors.length > 0) {
        return res.status(409).json({ message: uniqueErrors.join("، ") });
      }

      if (parsed.category === "service") {
        parsed.hasExpiry = false;
      } else if (parsed.category === "drug" && parsed.hasExpiry === undefined) {
        parsed.hasExpiry = true;
      }
      const item = await storage.createItem(parsed);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/items/:id", async (req, res) => {
    try {
      const parsed = insertItemSchema.partial().parse(req.body);

      if (parsed.itemCode || parsed.nameAr || parsed.nameEn) {
        const uniqueness = await storage.checkItemUniqueness(parsed.itemCode, parsed.nameAr, parsed.nameEn, req.params.id);
        const uniqueErrors: string[] = [];
        if (parsed.itemCode && !uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
        if (parsed.nameAr && !uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
        if (parsed.nameEn && !uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");
        if (uniqueErrors.length > 0) {
          return res.status(409).json({ message: uniqueErrors.join("، ") });
        }
      }

      const item = await storage.updateItem(req.params.id, parsed);
      if (!item) return res.status(404).json({ message: "الصنف غير موجود" });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
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

  // ===== ITEM UOMS =====
  app.get("/api/uoms", async (req, res) => {
    try {
      const uoms = await storage.getItemUoms();
      res.json(uoms);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/uoms", async (req, res) => {
    try {
      const parsed = insertItemUomSchema.parse(req.body);
      const uom = await storage.createItemUom(parsed);
      res.status(201).json(uom);
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ message: "كود الوحدة مسجل بالفعل" });
      } else {
        res.status(400).json({ message: error.message });
      }
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

  // ===== EXPIRY SETTINGS =====
  app.put("/api/items/:id/expiry-settings", async (req, res) => {
    try {
      const { hasExpiry } = req.body;
      if (typeof hasExpiry !== "boolean") {
        return res.status(400).json({ message: "قيمة hasExpiry يجب أن تكون true أو false" });
      }
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      if (item.category === "service" && hasExpiry) {
        return res.status(400).json({ message: "الخدمات لا يمكن أن يكون لها تاريخ صلاحية" });
      }
      if (!hasExpiry && item.hasExpiry) {
        const lots = await storage.getLots(req.params.id);
        const activeLotWithExpiry = lots.find(l => l.expiryDate && parseFloat(l.qtyInMinor) > 0);
        if (activeLotWithExpiry) {
          return res.status(409).json({ message: "لا يمكن إلغاء الصلاحية: يوجد دفعات نشطة بصلاحية ورصيد أكبر من صفر" });
        }
      }
      const updated = await storage.updateItem(req.params.id, { hasExpiry });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== INVENTORY LOTS =====
  app.get("/api/items/:id/lots", async (req, res) => {
    try {
      const lots = await storage.getLots(req.params.id);
      res.json(lots);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lots", async (req, res) => {
    try {
      const validated = insertInventoryLotSchema.parse(req.body);
      const item = await storage.getItem(validated.itemId);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      if (item.category === "service") {
        return res.status(400).json({ message: "الخدمات لا يمكن إنشاء دفعات مخزنية لها" });
      }
      if (!item.hasExpiry && validated.expiryDate) {
        return res.status(400).json({ message: "هذا الصنف لا يدعم تاريخ الصلاحية" });
      }
      if (item.hasExpiry && !validated.expiryDate) {
        return res.status(400).json({ message: "تاريخ الصلاحية مطلوب لهذا الصنف" });
      }
      if (parseFloat(validated.qtyInMinor || "0") <= 0) {
        return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }
      const lot = await storage.createLot(validated);
      res.status(201).json(lot);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== FEFO PREVIEW =====
  app.get("/api/fefo/preview", async (req, res) => {
    try {
      const { itemId, requiredQtyInMinor, asOfDate } = req.query;
      if (!itemId || !requiredQtyInMinor) {
        return res.status(400).json({ message: "itemId و requiredQtyInMinor مطلوبان" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const result = await storage.getFefoPreview(
        itemId as string,
        parseFloat(requiredQtyInMinor as string),
        date
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== ITEM BARCODES =====
  app.get("/api/items/:id/barcodes", async (req, res) => {
    try {
      const barcodes = await storage.getItemBarcodes(req.params.id);
      res.json(barcodes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/items/:id/barcodes", async (req, res) => {
    try {
      const { barcodeValue, barcodeType } = req.body;
      if (!barcodeValue || !barcodeValue.trim()) {
        return res.status(400).json({ message: "قيمة الباركود مطلوبة" });
      }
      const normalized = barcodeValue.trim();
      if (!/^[a-zA-Z0-9\-\.]+$/.test(normalized)) {
        return res.status(400).json({ message: "الباركود يجب أن يحتوي على أرقام وحروف إنجليزية فقط" });
      }
      const barcode = await storage.createItemBarcode({
        itemId: req.params.id,
        barcodeValue: normalized,
        barcodeType: barcodeType || null,
        isActive: true,
      });
      res.status(201).json(barcode);
    } catch (error: any) {
      if (error.code === "23505" || error.message?.includes("unique") || error.message?.includes("duplicate")) {
        return res.status(409).json({ message: "هذا الباركود مسجل بالفعل لصنف آخر" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/barcodes/:id", async (req, res) => {
    try {
      const barcode = await storage.deactivateBarcode(req.params.id);
      if (!barcode) {
        return res.status(404).json({ message: "الباركود غير موجود" });
      }
      res.json(barcode);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/barcode/resolve", async (req, res) => {
    try {
      const { value } = req.query;
      if (!value || !(value as string).trim()) {
        return res.status(400).json({ message: "قيمة البحث مطلوبة" });
      }
      const result = await storage.resolveBarcode(value as string);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== WAREHOUSES =====
  app.get("/api/warehouses", async (req, res) => {
    try {
      const whs = await storage.getWarehouses();
      res.json(whs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/warehouses", async (req, res) => {
    try {
      const validated = insertWarehouseSchema.parse(req.body);
      const wh = await storage.createWarehouse(validated);
      res.status(201).json(wh);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/warehouses/:id", async (req, res) => {
    try {
      const validated = warehouseUpdateSchema.parse(req.body);
      const { warehouseCode, nameAr, departmentId, isActive } = validated;
      const updateData: any = {};
      if (warehouseCode !== undefined) updateData.warehouseCode = warehouseCode;
      if (nameAr !== undefined) updateData.nameAr = nameAr;
      if (departmentId !== undefined) updateData.departmentId = departmentId;
      if (isActive !== undefined) updateData.isActive = isActive;
      const wh = await storage.updateWarehouse(req.params.id, updateData);
      if (!wh) return res.status(404).json({ message: "المخزن غير موجود" });
      res.json(wh);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/warehouses/:id", async (req, res) => {
    try {
      await storage.deleteWarehouse(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // User-Department assignments
  app.get("/api/users/:id/departments", async (req, res) => {
    try {
      const depts = await storage.getUserDepartments(req.params.id);
      res.json(depts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/departments", async (req, res) => {
    try {
      const validated = userDepartmentsAssignmentSchema.parse(req.body);
      const { departmentIds } = validated;
      await storage.setUserDepartments(req.params.id, departmentIds || []);
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "departmentIds يجب أن يكون مصفوفة" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // User-Warehouse assignments
  app.get("/api/users/:id/warehouses", async (req, res) => {
    try {
      const whs = await storage.getUserWarehouses(req.params.id);
      res.json(whs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/warehouses", async (req, res) => {
    try {
      const validated = userWarehousesAssignmentSchema.parse(req.body);
      const { warehouseIds } = validated;
      await storage.setUserWarehouses(req.params.id, warehouseIds || []);
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "warehouseIds يجب أن يكون مصفوفة" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== PILOT TEST SEED =====
  app.post("/api/seed/pilot-test", async (req, res) => {
    try {
      const result = await storage.seedPilotTest();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== STORE TRANSFERS =====
  app.get("/api/transfers", async (req, res) => {
    try {
      const { fromDate, toDate, sourceWarehouseId, destWarehouseId, status, search, page, pageSize } = req.query;

      if (page || pageSize || fromDate || toDate || sourceWarehouseId || destWarehouseId || status || search) {
        const result = await storage.getTransfersFiltered({
          fromDate: fromDate as string | undefined,
          toDate: toDate as string | undefined,
          sourceWarehouseId: sourceWarehouseId as string | undefined,
          destWarehouseId: destWarehouseId as string | undefined,
          status: status as string | undefined,
          search: search as string | undefined,
          page: parseInt(page as string) || 1,
          pageSize: parseInt(pageSize as string) || 50,
        });
        return res.json(result);
      }

      const transfers = await storage.getTransfers();
      res.json(transfers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/transfers/:id", async (req, res) => {
    try {
      const transfer = await storage.getTransfer(req.params.id);
      if (!transfer) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json(transfer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/transfer/fefo-preview", async (req, res) => {
    try {
      const { itemId, warehouseId, requiredQtyInMinor, asOfDate } = req.query;
      if (!itemId || !warehouseId || !requiredQtyInMinor) {
        return res.status(400).json({ message: "itemId, warehouseId, requiredQtyInMinor مطلوبة" });
      }
      const qty = parseFloat(requiredQtyInMinor as string);
      if (qty <= 0) {
        return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const preview = await storage.getWarehouseFefoPreview(
        itemId as string,
        warehouseId as string,
        qty,
        date
      );
      res.json(preview);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/transfers", async (req, res) => {
    try {
      const { transferDate, sourceWarehouseId, destinationWarehouseId, notes, lines } = req.body;

      if (!transferDate || !sourceWarehouseId || !destinationWarehouseId) {
        return res.status(400).json({ message: "بيانات التحويل غير مكتملة" });
      }
      if (sourceWarehouseId === destinationWarehouseId) {
        return res.status(400).json({ message: "مخزن المصدر والوجهة يجب أن يكونا مختلفين" });
      }
      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ message: "يجب إضافة سطر واحد على الأقل" });
      }

      const header = { transferDate, sourceWarehouseId, destinationWarehouseId, notes: notes || null };
      const transfer = await storage.createDraftTransfer(header, lines);
      res.status(201).json(transfer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/transfers/:id/post", async (req, res) => {
    try {
      const transfer = await storage.postTransfer(req.params.id);
      res.json(transfer);
    } catch (error: any) {
      if (error.message.includes("غير كافية") || error.message.includes("مختلفين") || error.message.includes("مسودة") || error.message.includes("لا يمكن") || error.message.includes("غير موجود") || error.message.includes("مطلوب")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/transfers/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTransfer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes("مُرحّل") || error.message.includes("لا يمكن حذف")) {
        return res.status(409).json({ message: error.message, code: "DOCUMENT_POSTED" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== SUPPLIERS =====
  app.get("/api/suppliers", async (req, res) => {
    try {
      const { search, page, pageSize } = req.query;
      const result = await storage.getSuppliers({
        search: search as string | undefined,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 50,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/suppliers/search", async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const results = await storage.searchSuppliers(q, limit);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/suppliers/:id", async (req, res) => {
    try {
      const supplier = await storage.getSupplier(req.params.id);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/suppliers", async (req, res) => {
    try {
      const validated = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(validated);
      res.status(201).json(supplier);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      if (error.message?.includes('unique') || error.code === '23505') {
        return res.status(409).json({ message: "كود المورد مُستخدم بالفعل" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/suppliers/:id", async (req, res) => {
    try {
      const validated = insertSupplierSchema.partial().parse(req.body);
      const supplier = await storage.updateSupplier(req.params.id, validated);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== SUPPLIER RECEIVING =====
  app.get("/api/receivings", async (req, res) => {
    try {
      const { supplierId, warehouseId, status, statusFilter, fromDate, toDate, search, page, pageSize } = req.query;
      const result = await storage.getReceivings({
        supplierId: supplierId as string | undefined,
        warehouseId: warehouseId as string | undefined,
        status: status as string | undefined,
        statusFilter: statusFilter as string | undefined,
        fromDate: fromDate as string | undefined,
        toDate: toDate as string | undefined,
        search: search as string | undefined,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 50,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/receivings/check-invoice", async (req, res) => {
    try {
      const { supplierId, supplierInvoiceNo, excludeId } = req.query;
      if (!supplierId || !supplierInvoiceNo) return res.status(400).json({ message: "بيانات ناقصة" });
      const isUnique = await storage.checkSupplierInvoiceUnique(
        supplierId as string,
        supplierInvoiceNo as string,
        excludeId as string | undefined
      );
      res.json({ isUnique });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/receivings/:id", async (req, res) => {
    try {
      const receiving = await storage.getReceiving(req.params.id);
      if (!receiving) return res.status(404).json({ message: "المستند غير موجود" });
      res.json(receiving);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/receivings", async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header || !lines) return res.status(400).json({ message: "بيانات ناقصة" });
      if (!header.supplierId) return res.status(400).json({ message: "المورد مطلوب" });
      if (!header.receiveDate) return res.status(400).json({ message: "تاريخ الاستلام مطلوب" });
      if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      if (header.supplierId && header.supplierInvoiceNo?.trim()) {
        const isUnique = await storage.checkSupplierInvoiceUnique(header.supplierId, header.supplierInvoiceNo);
        if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر لنفس المورد" });
      }
      
      const lineErrors = await validateReceivingLines(lines);
      if (lineErrors.length > 0) {
        return res.status(400).json({ 
          message: "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
          lineErrors 
        });
      }
      
      const result = await storage.saveDraftReceiving(header, lines);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/receivings/:id", async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header || !lines) return res.status(400).json({ message: "بيانات ناقصة" });
      
      const existing = await storage.getReceiving(req.params.id);
      if (!existing) return res.status(404).json({ message: "المستند غير موجود" });
      if (existing.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن تعديل مستند مُرحّل", code: "DOCUMENT_POSTED" });
      }
      
      const isUnique = await storage.checkSupplierInvoiceUnique(header.supplierId, header.supplierInvoiceNo, req.params.id);
      if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر لنفس المورد" });
      
      const lineErrors = await validateReceivingLines(lines);
      if (lineErrors.length > 0) {
        return res.status(400).json({ 
          message: "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
          lineErrors 
        });
      }
      
      const result = await storage.saveDraftReceiving(header, lines, req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/receivings/:id/post", async (req, res) => {
    try {
      const receiving = await storage.getReceiving(req.params.id);
      if (!receiving) return res.status(404).json({ message: "المستند غير موجود" });
      if (receiving.lines && receiving.lines.length > 0) {
        const lineErrors = await validateReceivingLines(receiving.lines);
        if (lineErrors.length > 0) {
          return res.status(400).json({ 
            message: "لا يمكن ترحيل الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
            lineErrors 
          });
        }
      }
      let result;
      if (receiving.correctionStatus === 'correction') {
        result = await storage.postReceivingCorrection(req.params.id);
      } else {
        result = await storage.postReceiving(req.params.id);
      }
      res.json(result);
    } catch (error: any) {
      if (error.message.includes("مطلوب") || error.message.includes("لا توجد") || error.message.includes("لا يمكن") || error.message.includes("غير موجود") || error.message.includes("سالباً")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/receivings/:id/correct", async (req, res) => {
    try {
      const result = await storage.createReceivingCorrection(req.params.id);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.message.includes("مسبقاً") || error.message.includes("فقط") || error.message.includes("لا يمكن") || error.message.includes("غير موجود") || error.message.includes("معتمدة")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/receivings/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteReceiving(req.params.id);
      if (!deleted) return res.status(404).json({ message: "المستند غير موجود" });
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes("لا يمكن حذف") || error.message.includes("مُرحّل")) {
        return res.status(409).json({ message: error.message, code: "DOCUMENT_POSTED" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== CONVERT RECEIVING TO PURCHASE INVOICE =====
  app.post("/api/receivings/:id/convert-to-invoice", async (req, res) => {
    try {
      const invoice = await storage.convertReceivingToInvoice(req.params.id);
      res.status(201).json(invoice);
    } catch (error: any) {
      if (error.message.includes("مسبقاً") || error.message.includes("أولاً") || error.message.includes("غير موجود")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== PURCHASE INVOICES =====
  app.get("/api/purchase-invoices", async (req, res) => {
    try {
      const { supplierId, status, dateFrom, dateTo, page, pageSize } = req.query;
      const result = await storage.getPurchaseInvoices({
        supplierId: supplierId as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 20,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  function validateInvoiceLineDiscounts(lines: any[]): { lineIndex: number; field: string; messageAr: string }[] {
    const errors: { lineIndex: number; field: string; messageAr: string }[] = [];
    if (!Array.isArray(lines)) return errors;
    const TOLERANCE = 0.02;
    lines.forEach((ln: any, i: number) => {
      const sp = parseFloat(ln.sellingPrice) || 0;
      const pp = parseFloat(ln.purchasePrice) || 0;
      const pct = parseFloat(ln.lineDiscountPct) || 0;
      const dv = parseFloat(ln.lineDiscountValue) || 0;

      if (pp < 0) {
        errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء لا يمكن أن يكون سالب" });
      }
      if (pct >= 100) {
        errors.push({ lineIndex: i, field: "lineDiscountPct", messageAr: "نسبة الخصم لا يمكن أن تكون 100% أو أكثر" });
      }
      if (sp > 0 && dv > sp + TOLERANCE) {
        errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم أكبر من سعر البيع" });
      }

      if (sp > 0) {
        const expectedDv = +(sp * (pct / 100)).toFixed(2);
        const expectedPp = +(sp - dv).toFixed(4);
        if (Math.abs(dv - expectedDv) > TOLERANCE) {
          errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم غير متوافقة مع نسبة الخصم" });
        }
        if (Math.abs(pp - expectedPp) > TOLERANCE) {
          errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء غير متوافق مع قيمة الخصم" });
        }
      }
    });
    return errors;
  }

  app.patch("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة ومُسعّرة", code: "INVOICE_APPROVED" });
      }
      const { lines, ...headerUpdates } = req.body;
      const discountErrors = validateInvoiceLineDiscounts(lines);
      if (discountErrors.length > 0) {
        return res.status(400).json({ message: "أخطاء في بيانات الخصم", lineErrors: discountErrors });
      }
      const result = await storage.savePurchaseInvoice(req.params.id, lines, headerUpdates);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/purchase-invoices/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePurchaseInvoice(req.params.id);
      if (!deleted) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes("لا يمكن حذف")) {
        return res.status(409).json({ message: error.message, code: "INVOICE_APPROVED" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/purchase-invoices/:id/approve", async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.lines && Array.isArray(invoice.lines)) {
        const discountErrors = validateInvoiceLineDiscounts(invoice.lines);
        if (discountErrors.length > 0) {
          return res.status(400).json({ message: "أخطاء في بيانات الخصم - لا يمكن الاعتماد", lineErrors: discountErrors });
        }
      }
      const result = await storage.approvePurchaseInvoice(req.params.id);
      res.json(result);
    } catch (error: any) {
      if (error.message.includes("معتمدة")) {
        return res.status(409).json({ message: error.message, code: "ALREADY_APPROVED" });
      }
      if (error.message.includes("غير موجودة")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/hints", async (req, res) => {
    try {
      const { supplierId, warehouseId } = req.query;
      const hints = await storage.getItemHints(req.params.itemId, (supplierId as string) || "", (warehouseId as string) || "");
      res.json(hints);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/items/:itemId/warehouse-stats", async (req, res) => {
    try {
      const stats = await storage.getItemWarehouseStats(req.params.itemId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Services =====

  app.get("/api/services", async (req, res) => {
    try {
      const { search, departmentId, category, active, page, pageSize } = req.query;
      const result = await storage.getServices({
        search: search as string,
        departmentId: departmentId as string,
        category: category as string,
        active: active as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/services", async (req, res) => {
    try {
      const validated = insertServiceSchema.parse(req.body);
      const service = await storage.createService(validated);
      res.status(201).json(service);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      if (error.message?.includes("duplicate key") || error.code === "23505") {
        return res.status(409).json({ message: "كود الخدمة مكرر" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/services/:id", async (req, res) => {
    try {
      const validated = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(req.params.id, validated);
      if (!service) {
        return res.status(404).json({ message: "الخدمة غير موجودة" });
      }
      res.json(service);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      if (error.message?.includes("duplicate key") || error.code === "23505") {
        return res.status(409).json({ message: "كود الخدمة مكرر" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/service-categories", async (req, res) => {
    try {
      const categories = await storage.getServiceCategories();
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Price Lists =====

  app.get("/api/price-lists", async (req, res) => {
    try {
      const lists = await storage.getPriceLists();
      res.json(lists);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/price-lists", async (req, res) => {
    try {
      const validated = insertPriceListSchema.parse(req.body);
      const list = await storage.createPriceList(validated);
      res.status(201).json(list);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      if (error.message?.includes("duplicate key") || error.code === "23505") {
        return res.status(409).json({ message: "كود قائمة الأسعار مكرر" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/price-lists/:id", async (req, res) => {
    try {
      const validated = insertPriceListSchema.partial().parse(req.body);
      const list = await storage.updatePriceList(req.params.id, validated);
      if (!list) {
        return res.status(404).json({ message: "قائمة الأسعار غير موجودة" });
      }
      res.json(list);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      if (error.message?.includes("duplicate key") || error.code === "23505") {
        return res.status(409).json({ message: "كود قائمة الأسعار مكرر" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Price List Items =====

  app.get("/api/price-lists/:id/items", async (req, res) => {
    try {
      const { search, departmentId, category, page, pageSize } = req.query;
      const result = await storage.getPriceListItems(req.params.id, {
        search: search as string,
        departmentId: departmentId as string,
        category: category as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const priceListItemsBodySchema = z.object({
    items: z.array(z.object({
      serviceId: z.string(),
      price: z.string(),
      minDiscountPct: z.string().optional(),
      maxDiscountPct: z.string().optional(),
    })).min(1, "يجب إرسال بند واحد على الأقل"),
  });

  app.post("/api/price-lists/:id/items", async (req, res) => {
    try {
      const validated = priceListItemsBodySchema.parse(req.body);
      await storage.upsertPriceListItems(req.params.id, validated.items);
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/price-lists/:id/copy-from", async (req, res) => {
    try {
      const { sourceListId } = z.object({ sourceListId: z.string() }).parse(req.body);
      await storage.copyPriceList(req.params.id, sourceListId);
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Bulk Adjustment =====

  const bulkAdjustBodySchema = z.object({
    mode: z.enum(['PCT', 'FIXED']),
    direction: z.enum(['INCREASE', 'DECREASE']),
    value: z.number().positive("القيمة يجب أن تكون أكبر من صفر"),
    departmentId: z.string().optional(),
    category: z.string().optional(),
    createMissingFromBasePrice: z.boolean().optional(),
  });

  app.post("/api/price-lists/:id/bulk-adjust/preview", async (req, res) => {
    try {
      const validated = bulkAdjustBodySchema.parse(req.body);
      const result = await storage.bulkAdjustPreview(req.params.id, validated);
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/price-lists/:id/bulk-adjust/apply", async (req, res) => {
    try {
      const validated = bulkAdjustBodySchema.parse(req.body);
      const result = await storage.bulkAdjustApply(req.params.id, validated);
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      if (error.message?.includes("أسعار سالبة")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Sales Invoices ====================
  
  app.get("/api/sales-invoices", async (req, res) => {
    try {
      const { status, dateFrom, dateTo, customerType, search, page, pageSize } = req.query;
      const result = await storage.getSalesInvoices({
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        customerType: customerType as string,
        search: search as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sales-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getSalesInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sales-invoices", async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header?.warehouseId) return res.status(400).json({ message: "المخزن مطلوب" });
      if (!header?.invoiceDate) return res.status(400).json({ message: "تاريخ الفاتورة مطلوب" });
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      for (const line of lines) {
        if (!line.itemId) return res.status(400).json({ message: "الصنف مطلوب في كل سطر" });
        if (!line.qty || parseFloat(line.qty) <= 0) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }

      const invoice = await storage.createSalesInvoice(header, lines);
      res.status(201).json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/sales-invoices/:id", async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      for (const line of lines) {
        if (!line.itemId) return res.status(400).json({ message: "الصنف مطلوب في كل سطر" });
        if (!line.qty || parseFloat(line.qty) <= 0) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }

      const invoice = await storage.updateSalesInvoice(req.params.id, header || {}, lines);
      res.json(invoice);
    } catch (error: any) {
      if (error.message.includes("نهائية") || error.message.includes("معتمدة")) {
        return res.status(409).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sales-invoices/:id/finalize", async (req, res) => {
    try {
      const invoice = await storage.finalizeSalesInvoice(req.params.id);
      res.json(invoice);
    } catch (error: any) {
      if (error.message.includes("ليست مسودة") || error.message.includes("نهائية")) {
        return res.status(409).json({ message: error.message });
      }
      if (error.message.includes("غير كاف") || error.message.includes("يتطلب") || error.message.includes("بدون أصناف")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/sales-invoices/:id", async (req, res) => {
    try {
      await storage.deleteSalesInvoice(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes("نهائية")) {
        return res.status(409).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/seed/pharmacy-sales-demo", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: "Seed not available in production" });
    }

    try {
      const today = new Date().toISOString().split("T")[0];

      const demoItems = [
        { code: "DEMO-DRUG-001", nameAr: "أموكسيسيلين 500مجم", nameEn: "Amoxicillin 500mg", price: "150", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-002", nameAr: "باراسيتامول 500مجم", nameEn: "Paracetamol 500mg", price: "80", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-003", nameAr: "أوميبرازول 20مجم", nameEn: "Omeprazole 20mg", price: "200", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-004", nameAr: "ميتفورمين 850مجم", nameEn: "Metformin 850mg", price: "120", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-005", nameAr: "أملوديبين 5مجم", nameEn: "Amlodipine 5mg", price: "180", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-006", nameAr: "سيبروفلوكساسين 500مجم", nameEn: "Ciprofloxacin 500mg", price: "250", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-007", nameAr: "ديكلوفيناك 50مجم", nameEn: "Diclofenac 50mg", price: "90", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-008", nameAr: "أزيثروميسين 250مجم", nameEn: "Azithromycin 250mg", price: "300", category: "drug" as const, hasExpiry: true },
        { code: "DEMO-DRUG-009", nameAr: "شاش طبي", nameEn: "Medical Gauze", price: "50", category: "supply" as const, hasExpiry: false },
        { code: "DEMO-DRUG-010", nameAr: "قطن طبي", nameEn: "Medical Cotton", price: "40", category: "supply" as const, hasExpiry: false },
      ];

      const barcodes = [
        "6901234560001", "6901234560002", "6901234560003", "6901234560004", "6901234560005",
        "6901234560006", "6901234560007", "6901234560008", "6901234560009", "6901234560010",
      ];

      const [existingWarehouse] = await db.select().from(warehouses).where(eq(warehouses.warehouseCode, "WH-PHARM")).limit(1);
      let warehouseId: string;
      if (existingWarehouse) {
        warehouseId = existingWarehouse.id;
      } else {
        const [newWarehouse] = await db.insert(warehouses).values({
          warehouseCode: "WH-PHARM",
          nameAr: "صيدلية رئيسية",
        }).returning();
        warehouseId = newWarehouse.id;
      }

      const resultItems: any[] = [];

      for (let i = 0; i < demoItems.length; i++) {
        const demo = demoItems[i];
        const barcode = barcodes[i];

        const [existingItem] = await db.select().from(items).where(eq(items.itemCode, demo.code)).limit(1);
        let itemId: string;
        if (existingItem) {
          itemId = existingItem.id;
        } else {
          const [newItem] = await db.insert(items).values({
            itemCode: demo.code,
            nameAr: demo.nameAr,
            nameEn: demo.nameEn,
            category: demo.category,
            hasExpiry: demo.hasExpiry,
            salePriceCurrent: demo.price,
            purchasePriceLast: "0",
            isToxic: false,
            majorUnitName: "علبة",
            mediumUnitName: "شريط",
            minorUnitName: "قرص",
            majorToMedium: "10",
            mediumToMinor: "10",
            majorToMinor: "100",
          }).returning();
          itemId = newItem.id;
        }

        await db.insert(itemBarcodes).values({
          itemId,
          barcodeValue: barcode,
          barcodeType: "EAN13",
          isActive: true,
        }).onConflictDoNothing();

        const createdLots: any[] = [];

        // Check if lots already exist for this item in the warehouse
        const existingLots = await db.select().from(inventoryLots)
          .where(and(
            eq(inventoryLots.itemId, itemId),
            eq(inventoryLots.warehouseId, warehouseId)
          )).limit(1);

        if (existingLots.length > 0) {
          // Lots already seeded, skip - just collect existing lots for response
          const allLots = await db.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, itemId),
              eq(inventoryLots.warehouseId, warehouseId)
            ));
          createdLots.push(...allLots);
        } else {
          // Create lots as before
          if (demo.hasExpiry) {
            const isFirstItem = demo.code === "DEMO-DRUG-001";
            const lotConfigs = [
              { expiryMonth: 3, expiryYear: 2026, qtyInMinor: isFirstItem ? "5" : "50" },
              { expiryMonth: 6, expiryYear: 2026, qtyInMinor: isFirstItem ? "5" : "50" },
              { expiryMonth: 12, expiryYear: 2026, qtyInMinor: "200" },
            ];

            for (const lot of lotConfigs) {
              const expiryDate = `${lot.expiryYear}-${String(lot.expiryMonth).padStart(2, "0")}-01`;
              const [newLot] = await db.insert(inventoryLots).values({
                itemId,
                warehouseId,
                expiryDate,
                expiryMonth: lot.expiryMonth,
                expiryYear: lot.expiryYear,
                receivedDate: today,
                purchasePrice: "1.00",
                qtyInMinor: lot.qtyInMinor,
                isActive: true,
              }).returning();
              createdLots.push(newLot);
            }
          } else {
            const [newLot] = await db.insert(inventoryLots).values({
              itemId,
              warehouseId,
              receivedDate: today,
              purchasePrice: "0.50",
              qtyInMinor: "500",
              isActive: true,
            }).returning();
            createdLots.push(newLot);
          }
        }

        resultItems.push({
          id: itemId,
          code: demo.code,
          nameAr: demo.nameAr,
          barcode,
          hasExpiry: demo.hasExpiry,
          salePriceCurrent: demo.price,
          lots: createdLots,
        });
      }

      res.json({
        success: true,
        warehouseId,
        items: resultItems,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
