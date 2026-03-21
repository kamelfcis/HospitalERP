/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Cashier Handover Routes — تسليم الدرج
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  GET /api/cashier-shifts/drawer-handover-summary
 *    ملخص ورديات الكاشير لتقرير تسليم الدرج.
 *
 *  Query params:
 *    from         — YYYY-MM-DD (business_date >=)
 *    to           — YYYY-MM-DD (business_date <=)
 *    cashierName  — partial match (ILIKE)
 *    status       — all | open | closed
 *    page         — default 1
 *    pageSize     — default 50
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth } from "./_auth";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { PERMISSIONS } from "@shared/permissions";

export function registerCashierHandoverRoutes(app: Express): void {
  app.get(
    "/api/cashier-shifts/drawer-handover-summary",
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session as Record<string, unknown>;
        const perms = (user.permissions as string[] | undefined) ?? [];
        if (!perms.includes(PERMISSIONS.CASHIER_VIEW) && !perms.includes(PERMISSIONS.CASHIER_VIEW_TOTALS)) {
          return res.status(403).json({ message: "غير مصرح بعرض تقرير تسليم الدرج" });
        }

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
          pageSize: pageSize ? parseInt(pageSize, 10) : 50,
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
