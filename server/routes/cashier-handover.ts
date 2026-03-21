/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Cashier Handover Routes — تسليم الدرج
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  GET /api/cashier-shifts/cashier-names
 *    قائمة أسماء الكاشير المميزة من سجل الورديات.
 *
 *  GET /api/cashier-shifts/drawer-handover-summary
 *    ملخص ورديات الكاشير لتقرير تسليم الدرج.
 *
 *  Query params for summary:
 *    from         — YYYY-MM-DD (business_date >=)
 *    to           — YYYY-MM-DD (business_date <=)
 *    cashierName  — exact match (picked from dropdown)
 *    status       — all | open | closed
 *    page         — default 1
 *    pageSize     — default 100
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth, checkPermission } from "./_auth";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { PERMISSIONS } from "@shared/permissions";

export function registerCashierHandoverRoutes(app: Express): void {
  /*
   * GET /api/cashier-shifts/cashier-names
   * Returns distinct cashier names for dropdown population.
   * Permission: cashier.handover_view (same as the main report)
   */
  app.get(
    "/api/cashier-shifts/cashier-names",
    requireAuth,
    checkPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW),
    async (_req, res) => {
      try {
        const names = await storage.getDistinctCashierNames();
        res.set("Cache-Control", "no-store");
        return res.json(names);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, "[HANDOVER] getDistinctCashierNames failed");
        return res.status(500).json({ message: msg });
      }
    }
  );

  /*
   * GET /api/cashier-shifts/drawer-handover-summary
   * Main handover summary report.
   * Permission: cashier.handover_view
   */
  app.get(
    "/api/cashier-shifts/drawer-handover-summary",
    requireAuth,
    checkPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW),
    async (req, res) => {
      try {
        const {
          from,
          to,
          cashierName,
          status,
          page,
          pageSize,
        } = req.query as Record<string, string | undefined>;

        const result = await storage.getDrawerHandoverSummary({
          from,
          to,
          cashierName,
          status: (status as "all" | "open" | "closed" | undefined) ?? "all",
          page:     page     ? parseInt(page, 10)     : 1,
          pageSize: pageSize ? parseInt(pageSize, 10) : 100,
        });

        res.set("Cache-Control", "no-store");
        return res.json(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, "[HANDOVER] getDrawerHandoverSummary failed");
        return res.status(500).json({ message: msg });
      }
    }
  );
}
