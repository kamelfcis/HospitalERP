import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  journalEntryWithLinesSchema,
  journalEntryUpdateSchema,
} from "./_shared";

export function registerJournalEntriesCrudRoutes(app: Express) {
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
}
