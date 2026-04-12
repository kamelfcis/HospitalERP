import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";

export function registerAccountSetupReports(app: Express) {
  app.get("/api/reports/trial-balance", requireAuth, checkPermission(PERMISSIONS.REPORTS_TRIAL_BALANCE), async (req, res) => {
    try {
      const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
      const report = await storage.getTrialBalance(asOfDate);
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/income-statement", requireAuth, checkPermission(PERMISSIONS.REPORTS_INCOME_STATEMENT), async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];
      const report = await storage.getIncomeStatement(startDate, endDate);
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/balance-sheet", requireAuth, checkPermission(PERMISSIONS.REPORTS_BALANCE_SHEET), async (req, res) => {
    try {
      const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
      const report = await storage.getBalanceSheet(asOfDate);
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/cost-centers", requireAuth, checkPermission(PERMISSIONS.REPORTS_COST_CENTERS), async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];
      const costCenterId = req.query.costCenterId as string | undefined;
      const report = await storage.getCostCenterReport(startDate, endDate, costCenterId);
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/reports/account-ledger", requireAuth, checkPermission(PERMISSIONS.REPORTS_ACCOUNT_LEDGER), async (req, res) => {
    try {
      const accountId = req.query.accountId as string;
      if (!accountId) {
        return res.status(400).json({ message: "معرف الحساب مطلوب" });
      }
      const visibleIds = await storage.getVisibleAccountIds(req.session.userId as string);
      if (visibleIds !== null && !visibleIds.includes(accountId)) {
        return res.status(403).json({ message: "ليس لديك صلاحية الوصول لهذا الحساب" });
      }
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];
      const report = await storage.getAccountLedger(accountId, startDate, endDate);
      res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
      res.json(report);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
