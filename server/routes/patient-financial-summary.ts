import type { Express } from "express";
import { registerPatientFinancialSummaryBasicRoutes } from "./patient-financial-summary-basic";
import { registerPatientFinancialSummaryAggregatedRoutes } from "./patient-financial-summary-aggregated";

export function registerPatientFinancialSummaryRoutes(app: Express) {
  registerPatientFinancialSummaryBasicRoutes(app);
  registerPatientFinancialSummaryAggregatedRoutes(app);
}
