import type { Express } from "express";
import { registerPatientInquiryGridRoutes } from "./patient-inquiry-grid";
import { registerPatientFinancialRoutes } from "./patient-financial";
import { registerPatientVisitsRoutes } from "./patient-visits-routes";

export function registerPatientInquiryRoutes(app: Express) {
  registerPatientInquiryGridRoutes(app);
  registerPatientFinancialRoutes(app);
  registerPatientVisitsRoutes(app);
}
