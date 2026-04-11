import type { Express } from "express";
import { registerPatientFinancialSummaryRoutes } from "./patient-financial-summary";
import { registerPatientFinancialLinesRoutes } from "./patient-financial-lines";

export function registerPatientFinancialRoutes(app: Express) {
  registerPatientFinancialSummaryRoutes(app);
  registerPatientFinancialLinesRoutes(app);
}
