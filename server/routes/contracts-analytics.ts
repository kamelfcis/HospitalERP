/**
 * contracts-analytics.ts — Phase 6 Routes
 *
 * READ-ONLY analytics endpoints.
 * No writes. No side effects. All data from contracts-analytics-service.ts.
 *
 * Routes:
 *   GET /api/contracts-analytics/ar-aging
 *   GET /api/contracts-analytics/company-performance
 *   GET /api/contracts-analytics/variance
 *   GET /api/contracts-analytics/control-flags
 */

import type { Express } from "express";
import { requireAuth, checkPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import {
  getARAging,
  getCompanyPerformance,
  getClaimVariance,
  getControlFlags,
} from "../lib/contracts-analytics-service";

export function registerContractsAnalyticsRoutes(app: Express) {
  // All analytics require contracts claims view permission
  const guard = [requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_VIEW)];

  /** AR Aging — outstanding grouped into 0-30 / 31-60 / 61-90 / 90+ day buckets */
  app.get("/api/contracts-analytics/ar-aging", ...guard, async (_req, res) => {
    try {
      res.json(await getARAging());
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "خطأ في التحليل" });
    }
  });

  /** Per-company claim summary: claimed / approved / settled / outstanding / rejection % */
  app.get("/api/contracts-analytics/company-performance", ...guard, async (_req, res) => {
    try {
      res.json(await getCompanyPerformance());
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "خطأ في التحليل" });
    }
  });

  /** Per-batch claimed vs approved variance */
  app.get("/api/contracts-analytics/variance", ...guard, async (_req, res) => {
    try {
      res.json(await getClaimVariance());
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "خطأ في التحليل" });
    }
  });

  /** Control flags: high rejection / high outstanding / high write-off alerts */
  app.get("/api/contracts-analytics/control-flags", ...guard, async (_req, res) => {
    try {
      res.json(await getControlFlags());
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "خطأ في التحليل" });
    }
  });
}
