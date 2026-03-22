import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  journalEntryWithLinesSchema,
  journalEntryUpdateSchema,
} from "./_shared";
import { insertJournalTemplateSchema } from "@shared/schema";

export function registerJournalEntriesRoutes(app: Express) {
  app.get("/api/journal-entries", requireAuth, checkPermission(PERMISSIONS.JOURNAL_VIEW), async (req, res) => {
    try {
      const { page, pageSize, status, sourceType, dateFrom, dateTo, search } = req.query;
      const result = await storage.getJournalEntriesPaginated({
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 50,
        status: status as string | undefined,
        sourceType: sourceType as string | undefined,
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        search: search as string | undefined,
      });
      res.json({
        data: addFormattedNumbers(result.data, "journal_entry"),
        total: result.total,
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/journal-entries/:id", requireAuth, checkPermission(PERMISSIONS.JOURNAL_VIEW), async (req, res) => {
    try {
      const entry = await storage.getJournalEntry(req.params.id as string);
      if (!entry) {
        return res.status(404).json({ message: "القيد غير موجود" });
      }
      res.json(addFormattedNumber(entry, "journal_entry"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/journal-entries", requireAuth, checkPermission(PERMISSIONS.JOURNAL_CREATE), async (req, res) => {
    try {
      const validated = journalEntryWithLinesSchema.parse(req.body);
      const { lines, postAfterSave, ...entryData } = validated;
      
      const totalDebit = lines.reduce((sum, line) => sum + parseFloat(String(line.debit) || "0"), 0);
      const totalCredit = lines.reduce((sum, line) => sum + parseFloat(String(line.credit) || "0"), 0);
      
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ message: "القيد غير متوازن - إجمالي المدين يجب أن يساوي إجمالي الدائن" });
      }

      const allAccounts = await storage.getAccounts();
      for (const line of lines) {
        const account = allAccounts.find((a: any) => a.id === line.accountId);
        if (account?.requiresCostCenter && !line.costCenterId) {
          return res.status(400).json({ 
            message: `الحساب "${account.name}" يتطلب تحديد مركز تكلفة` 
          });
        }
      }

      if (postAfterSave && entryData.periodId) {
        const period = await storage.getFiscalPeriod(entryData.periodId);
        if (period?.isClosed) {
          return res.status(400).json({ message: "لا يمكن الترحيل في فترة محاسبية مغلقة" });
        }
      }

      const formattedLines = lines.map(line => ({
        ...line,
        debit: parseFloat(String(line.debit) || "0").toFixed(2),
        credit: parseFloat(String(line.credit) || "0").toFixed(2),
        journalEntryId: "",
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
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.patch("/api/journal-entries/:id", requireAuth, checkPermission(PERMISSIONS.JOURNAL_EDIT), async (req, res) => {
    try {
      const validated = journalEntryUpdateSchema.parse(req.body);
      const { lines, ...entryData } = validated;
      
      const existingEntry = await storage.getJournalEntry(req.params.id as string);
      if (!existingEntry) {
        return res.status(404).json({ message: "القيد غير موجود" });
      }
      if (existingEntry.status !== 'draft') {
        return res.status(409).json({ message: "لا يمكن تعديل قيد مُرحّل", code: "NOT_DRAFT" });
      }

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

        const allAccounts = await storage.getAccounts();
        for (const line of lines) {
          const account = allAccounts.find((a: any) => a.id === line.accountId);
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
          debit: parseFloat(String(line.debit) || "0").toFixed(2),
          credit: parseFloat(String(line.credit) || "0").toFixed(2),
          journalEntryId: req.params.id as string,
        }));
      }

      const entry = await storage.updateJournalEntry(req.params.id as string, updateData, formattedLines);
      if (!entry) {
        return res.status(400).json({ message: "لا يمكن تعديل القيد. قد يكون مُرحّلاً أو غير موجود" });
      }
      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/journal-entries/:id/post", requireAuth, checkPermission(PERMISSIONS.JOURNAL_POST), async (req, res) => {
    try {
      const existingEntry = await storage.getJournalEntry(req.params.id as string);
      if (!existingEntry) {
        return res.status(404).json({ message: "القيد غير موجود" });
      }
      if (existingEntry.status !== 'draft') {
        return res.status(409).json({ message: "القيد مُرحّل بالفعل", code: "ALREADY_POSTED" });
      }

      await storage.assertPeriodOpen(existingEntry.entryDate);

      if (existingEntry.periodId) {
        const period = await storage.getFiscalPeriod(existingEntry.periodId);
        if (period?.isClosed) {
          return res.status(400).json({ message: "لا يمكن الترحيل في فترة محاسبية مغلقة" });
        }
      }

      const entry = await storage.postJournalEntry(req.params.id as string, null);
      if (!entry) {
        return res.status(409).json({ message: "القيد مُرحّل بالفعل", code: "ALREADY_POSTED" });
      }
      await storage.createAuditLog({ tableName: "journal_entries", recordId: req.params.id as string, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
      res.json(entry);
    } catch (error: any) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/journal-entries/:id/reverse", requireAuth, checkPermission(PERMISSIONS.JOURNAL_REVERSE), async (req, res) => {
    try {
      const existingEntry = await storage.getJournalEntry(req.params.id as string);
      if (!existingEntry) return res.status(404).json({ message: "القيد غير موجود" });
      if (existingEntry.status !== 'posted') return res.status(409).json({ message: "لا يمكن عكس قيد غير مُرحّل" });

      await storage.assertPeriodOpen(existingEntry.entryDate);

      const entry = await storage.reverseJournalEntry(req.params.id as string, null);
      if (!entry) {
        return res.status(400).json({ message: "لا يمكن إلغاء القيد" });
      }
      await storage.createAuditLog({ tableName: "journal_entries", recordId: req.params.id as string, action: "reverse", oldValues: JSON.stringify({ status: "posted" }), newValues: JSON.stringify({ status: "reversed" }) });
      res.json(entry);
    } catch (error: any) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/journal-entries/:id", requireAuth, checkPermission(PERMISSIONS.JOURNAL_EDIT), async (req, res) => {
    try {
      const result = await storage.deleteJournalEntry(req.params.id as string);
      if (!result) {
        return res.status(400).json({ message: "لا يمكن حذف القيد. قد يكون مُرحّلاً" });
      }
      res.status(204).send();
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Batch post journal entries
  app.post("/api/journal-entries/batch-post", requireAuth, checkPermission(PERMISSIONS.JOURNAL_POST), async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "يجب تحديد قيود للترحيل" });
      }
      const sessionUserId: string | null = (req.session as any)?.userId || null;
      const result = await storage.batchPostJournalEntries(ids, sessionUserId);
      res.json({ posted: result.posted, total: ids.length, errors: result.errors });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/templates/:id", async (req, res) => {
    try {
      const template = await storage.getTemplateWithLines(req.params.id as string);
      if (!template) {
        return res.status(404).json({ message: "النموذج غير موجود" });
      }
      res.json(template);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const { lines, ...templateData } = req.body;
      const validated = insertJournalTemplateSchema.parse(templateData);
      
      if (lines && Array.isArray(lines) && lines.length > 0) {
        const validatedLines = lines.map((line: any, index: number) => ({
          templateId: "",
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
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.patch("/api/templates/:id", async (req, res) => {
    try {
      const { lines, ...templateData } = req.body;
      const validated = insertJournalTemplateSchema.partial().parse(templateData);
      
      if (lines && Array.isArray(lines)) {
        const validatedLines = lines.map((line: any, index: number) => ({
          templateId: req.params.id as string,
          lineNumber: index + 1,
          accountId: line.accountId,
          costCenterId: line.costCenterId || null,
          description: line.description || "",
          debitPercent: line.debit || line.debitPercent || null,
          creditPercent: line.credit || line.creditPercent || null,
        }));
        const template = await storage.updateTemplateWithLines(req.params.id as string, validated, validatedLines);
        if (!template) {
          return res.status(404).json({ message: "النموذج غير موجود" });
        }
        res.json(template);
      } else {
        const template = await storage.updateTemplate(req.params.id as string, validated);
        if (!template) {
          return res.status(404).json({ message: "النموذج غير موجود" });
        }
        res.json(template);
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/templates/:id", async (req, res) => {
    try {
      await storage.deleteTemplate(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Audit Log
  app.get("/api/audit-log", requireAuth, checkPermission(PERMISSIONS.AUDIT_LOG_VIEW), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
      const tableName = req.query.tableName as string | undefined;
      const action = req.query.action as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const result = await storage.getAuditLogsPaginated({
        page,
        pageSize,
        tableName: tableName || undefined,
        action: action || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

}
