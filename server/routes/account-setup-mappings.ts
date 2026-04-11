import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
} from "./_shared";
import {
  transactionTypeLabels,
  mappingLineTypeLabels,
} from "@shared/schema";
import { validateAccountCategory } from "../lib/account-category-validator";

export function registerAccountSetupMappingsRoutes(app: Express) {
  app.get("/api/account-mappings", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { transactionType } = req.query;
      const mappings = await storage.getAccountMappings(transactionType as string | undefined);
      res.json(mappings);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/account-mappings/:id", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const mapping = await storage.getAccountMapping(req.params.id as string);
      if (!mapping) return res.status(404).json({ message: "الإعداد غير موجود" });
      res.json(mapping);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/account-mappings", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { transactionType, lineType, debitAccountId, creditAccountId, description, isActive, warehouseId, pharmacyId } = req.body;
      if (!transactionType || !lineType) {
        return res.status(400).json({ message: "نوع العملية ونوع السطر مطلوبان" });
      }

      const allAccounts = await storage.getAccounts();
      const accountMap  = new Map((allAccounts as any[]).map((a: any) => [a.id, a]));

      if (debitAccountId) {
        const acct = accountMap.get(debitAccountId) as any;
        if (!acct) return res.status(400).json({ message: `حساب المدين غير موجود: ${debitAccountId}` });
        const vr = validateAccountCategory(acct.accountType, lineType, "debit");
        if (!vr.valid) return res.status(422).json({ message: vr.message });
      }
      if (creditAccountId) {
        const acct = accountMap.get(creditAccountId) as any;
        if (!acct) return res.status(400).json({ message: `حساب الدائن غير موجود: ${creditAccountId}` });
        const vr = validateAccountCategory(acct.accountType, lineType, "credit");
        if (!vr.valid) return res.status(422).json({ message: vr.message });
      }

      const mapping = await storage.upsertAccountMapping({
        transactionType, lineType, debitAccountId, creditAccountId, description, isActive,
        warehouseId: warehouseId || null,
        pharmacyId:  pharmacyId  || null,
      });
      res.json(mapping);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/account-mappings/:id", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      await storage.deleteAccountMapping(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/account-mappings/bulk", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { mappings } = req.body;
      if (!Array.isArray(mappings) || mappings.length === 0) {
        return res.status(400).json({ message: "يجب إرسال مصفوفة من الإعدادات" });
      }

      const validTxTypes   = new Set(Object.keys(transactionTypeLabels));
      const validLineTypes = new Set(Object.keys(mappingLineTypeLabels));

      const allAccounts  = await storage.getAccounts();
      const accountIdSet = new Set(allAccounts.map((a: any) => a.id));
      const accountMap   = new Map((allAccounts as any[]).map((a: any) => [a.id, a]));

      const cleaned: any[] = [];
      for (const m of mappings) {
        if (!m.transactionType || !validTxTypes.has(m.transactionType)) {
          return res.status(400).json({ message: `نوع العملية غير صالح: ${m.transactionType}` });
        }
        if (!m.lineType || !validLineTypes.has(m.lineType)) {
          return res.status(400).json({ message: `نوع البند غير صالح: ${m.lineType}` });
        }
        if (m.debitAccountId && !accountIdSet.has(m.debitAccountId)) {
          return res.status(400).json({ message: `حساب المدين غير موجود: ${m.debitAccountId}` });
        }
        if (m.creditAccountId && !accountIdSet.has(m.creditAccountId)) {
          return res.status(400).json({ message: `حساب الدائن غير موجود: ${m.creditAccountId}` });
        }
        if (m.debitAccountId) {
          const acct = accountMap.get(m.debitAccountId) as any;
          const vr   = validateAccountCategory(acct.accountType, m.lineType, "debit");
          if (!vr.valid) return res.status(422).json({ message: vr.message });
        }
        if (m.creditAccountId) {
          const acct = accountMap.get(m.creditAccountId) as any;
          const vr   = validateAccountCategory(acct.accountType, m.lineType, "credit");
          if (!vr.valid) return res.status(422).json({ message: vr.message });
        }
        cleaned.push({
          transactionType: m.transactionType,
          lineType:        m.lineType,
          debitAccountId:  m.debitAccountId  || null,
          creditAccountId: m.creditAccountId || null,
          warehouseId:     m.warehouseId     || null,
          pharmacyId:      m.pharmacyId      || null,
          departmentId:    m.departmentId    || null,
          description:     m.description     || null,
          isActive:        m.isActive !== false,
        });
      }

      const results = await storage.bulkUpsertAccountMappings(cleaned);
      res.json(results);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
