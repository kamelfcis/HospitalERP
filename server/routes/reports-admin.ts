import type { Express } from "express";
import { registerReportsAdminRpt } from "./reports-admin-rpt";
import { registerReportsAdminConsistency } from "./reports-admin-consistency";

export function registerReportsAdminRoutes(app: Express) {
  registerReportsAdminRpt(app);
  registerReportsAdminConsistency(app);
}
