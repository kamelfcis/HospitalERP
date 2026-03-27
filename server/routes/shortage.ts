/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Shortage Routes — كشكول النواقص (Thin Routes)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  POST /api/shortage/request
 *    تسجيل نقص صنف (من Alt+S). يشترط فقط requireAuth — لا permission خاص.
 *    مدمج مع duplicate guard (30 ثانية) في storage.
 *
 *  GET  /api/shortage/dashboard
 *    لوحة التحليل — وضعان: shortage_driven | full_analysis
 *    يشترط: SHORTAGE_VIEW
 *
 *  GET  /api/shortage/item/:itemId/stock
 *    رصيد الصنف لكل مخزن (lazy). يشترط: SHORTAGE_VIEW
 *
 *  PATCH /api/shortage/resolve/:itemId
 *    حل النقص (is_resolved = true). يشترط: SHORTAGE_MANAGE
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth, checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import {
  recordShortage,
  getDashboard,
  getWarehouseStock,
  resolveShortage,
  type DashboardMode,
  type DisplayUnit,
} from "../storage/shortage-storage";

export function registerShortageRoutes(app: Express): void {

  // ── POST /api/shortage/request ────────────────────────────────────────────
  //
  // يسجّل حدث نقص. يعمل من Alt+S في أي شاشة تحتوي صنف selected.
  // لا يحتاج SHORTAGE_VIEW — أي مستخدم مسجّل دخول يستطيع الإبلاغ.
  //
  app.post("/api/shortage/request", requireAuth, async (req, res) => {
    try {
      const { itemId, warehouseId, sourceScreen, notes } = req.body as {
        itemId:       string;
        warehouseId?: string;
        sourceScreen: string;
        notes?:       string;
      };

      if (!itemId || typeof itemId !== "string") {
        return res.status(400).json({ error: "itemId مطلوب" });
      }
      if (!sourceScreen || typeof sourceScreen !== "string") {
        return res.status(400).json({ error: "sourceScreen مطلوب" });
      }

      const requestedBy = (req.session as any).userId as string;
      const result = await recordShortage({
        itemId,
        warehouseId: warehouseId ?? null,
        requestedBy,
        sourceScreen,
        notes: notes ?? null,
      });

      if (!result.recorded && result.reason === "duplicate") {
        // 200 مع recorded:false — الـ frontend يعرض رسالة مختلفة
        return res.json({ recorded: false, reason: "duplicate" });
      }

      return res.json({ recorded: true });
    } catch (err) {
      console.error("[shortage/request]", err);
      return res.status(500).json({ error: "خطأ داخلي" });
    }
  });

  // ── GET /api/shortage/dashboard ───────────────────────────────────────────
  app.get(
    "/api/shortage/dashboard",
    requireAuth,
    checkPermission(PERMISSIONS.SHORTAGE_VIEW),
    async (req, res) => {
      try {
        const q = req.query as Record<string, string>;

        const mode        = (q.mode ?? "shortage_driven") as DashboardMode;
        const displayUnit = (q.displayUnit ?? "major") as DisplayUnit;
        const fromDate    = q.fromDate || defaultFromDate();
        const toDate      = q.toDate   || todayStr();
        // categories: comma-separated من الـ frontend (e.g. "drug,supply")
        const categoriesRaw = q.categories || "";
        const categories = categoriesRaw
          ? categoriesRaw.split(",").map((c) => c.trim()).filter(Boolean)
          : null;
        const status      = (q.status   || null) as string | null;
        const search      = q.search    || null;
        const warehouseId = q.warehouseId || null;
        const showResolved = q.showResolved === "true";
        const page        = Math.max(1, parseInt(q.page  || "1"));
        const limit       = Math.min(100, Math.max(10, parseInt(q.limit || "50")));
        const sortBy      = q.sortBy  || "request_count";
        const sortDir     = (q.sortDir === "asc" ? "asc" : "desc") as "asc" | "desc";

        if (!["shortage_driven", "full_analysis"].includes(mode)) {
          return res.status(400).json({ error: "mode غير صالح" });
        }
        if (!["major", "medium", "minor"].includes(displayUnit)) {
          return res.status(400).json({ error: "displayUnit غير صالح" });
        }

        const { rows, total } = await getDashboard({
          mode, displayUnit, fromDate, toDate,
          categories, status: status as any, search, warehouseId,
          showResolved, page, limit, sortBy, sortDir,
        });

        return res.json({ rows, total, page, limit });
      } catch (err) {
        console.error("[shortage/dashboard]", err);
        return res.status(500).json({ error: "خطأ داخلي" });
      }
    }
  );

  // ── GET /api/shortage/item/:itemId/stock ──────────────────────────────────
  app.get(
    "/api/shortage/item/:itemId/stock",
    requireAuth,
    checkPermission(PERMISSIONS.SHORTAGE_VIEW),
    async (req, res) => {
      try {
        const { itemId } = req.params;
        const displayUnit = ((req.query.displayUnit as string) ?? "major") as DisplayUnit;
        const rows = await getWarehouseStock(itemId, displayUnit);
        return res.json(rows);
      } catch (err) {
        console.error("[shortage/stock]", err);
        return res.status(500).json({ error: "خطأ داخلي" });
      }
    }
  );

  // ── PATCH /api/shortage/resolve/:itemId ───────────────────────────────────
  app.patch(
    "/api/shortage/resolve/:itemId",
    requireAuth,
    checkPermission(PERMISSIONS.SHORTAGE_MANAGE),
    async (req, res) => {
      try {
        const { itemId } = req.params;
        const userId = (req.session as any).userId as string;
        await resolveShortage(itemId, userId);
        return res.json({ success: true });
      } catch (err) {
        console.error("[shortage/resolve]", err);
        return res.status(500).json({ error: "خطأ داخلي" });
      }
    }
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
