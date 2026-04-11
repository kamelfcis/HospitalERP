import type { Express, Request, Response } from "express";
import {
  getStatusAll,
  runRefresh,
  REFRESH_KEYS,
  type RefreshKey,
} from "../lib/rpt-refresh-orchestrator";
import { storage } from "../storage";

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.session.userId) {
    res.status(401).json({ message: "يجب تسجيل الدخول" });
    return false;
  }
  if (!["admin", "owner"].includes(req.session.role as string)) {
    res.status(403).json({ message: "غير مصرح — هذا الإجراء للمشرف فقط" });
    return false;
  }
  return true;
}

type RefreshFn = () => Promise<{ upserted: number; durationMs: number; ranAt: string }>;

function getRefreshFn(key: string): RefreshFn | null {
  switch (key) {
    case REFRESH_KEYS.PATIENT_VISIT:       return () => storage.refreshPatientVisitSummary();
    case REFRESH_KEYS.PATIENT_VISIT_CLASS: return () => storage.refreshPatientVisitClassification();
    case REFRESH_KEYS.INVENTORY_SNAP:      return () => storage.refreshInventorySnapshot();
    case REFRESH_KEYS.ITEM_MOVEMENTS:      return () => storage.refreshItemMovementsSummary();
    default: return null;
  }
}

export { requireAdmin };

export function registerReportsAdminRpt(app: Express) {
  app.get("/api/admin/rpt/status", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const jobs = getStatusAll();
    return res.json({
      jobs,
      generatedAt: new Date().toISOString(),
    });
  });

  app.post("/api/admin/rpt/refresh/:key", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const key = req.params.key as RefreshKey;
    const fn  = getRefreshFn(key);

    if (!fn) {
      return res.status(400).json({
        error:    "unknown_key",
        message:  `مفتاح غير معروف: ${key}. القيم المقبولة: ${Object.values(REFRESH_KEYS).join(", ")}`,
        validKeys: Object.values(REFRESH_KEYS),
      });
    }

    try {
      const result = await runRefresh(key, fn, "manual");

      if (result === null) {
        return res.status(202).json({
          status:  "already_running",
          message: `الـ refresh لـ [${key}] يعمل حالياً، سيتم تحديث الحالة عند الانتهاء.`,
          key,
        });
      }

      return res.json({
        status:     "success",
        key,
        upserted:   result.upserted,
        durationMs: result.durationMs,
        ranAt:      result.ranAt,
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        status:  "error",
        key,
        error:   msg,
      });
    }
  });

  app.post("/api/admin/rpt/refresh-all", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const jobs = [
      { key: REFRESH_KEYS.PATIENT_VISIT,       fn: () => storage.refreshPatientVisitSummary() },
      { key: REFRESH_KEYS.PATIENT_VISIT_CLASS,  fn: () => storage.refreshPatientVisitClassification() },
      { key: REFRESH_KEYS.INVENTORY_SNAP,       fn: () => storage.refreshInventorySnapshot() },
      { key: REFRESH_KEYS.ITEM_MOVEMENTS,       fn: () => storage.refreshItemMovementsSummary() },
    ];

    const settled = await Promise.allSettled(
      jobs.map(j => runRefresh(j.key, j.fn, "manual"))
    );

    const results = jobs.map((j, i) => {
      const s = settled[i];
      if (s.status === "fulfilled") {
        if (s.value === null) {
          return { key: j.key, status: "already_running" };
        }
        return {
          key:        j.key,
          status:     "success",
          upserted:   s.value.upserted,
          durationMs: s.value.durationMs,
          ranAt:      s.value.ranAt,
        };
      } else {
        const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
        return { key: j.key, status: "error", error: msg };
      }
    });

    return res.json({
      results,
      completedAt: new Date().toISOString(),
    });
  });
}
