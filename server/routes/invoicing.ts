import type { Express } from "express";
import { registerServicesRoutes } from "./services";
import { registerSalesInvoicesRoutes } from "./sales-invoices";
import { registerPatientInvoicesRoutes } from "./patient-invoices";
import { registerPatientsRoutes } from "./patients";
import { registerAdmissionsRoutes } from "./admissions";

export function registerInvoicingRoutes(app: Express) {
  registerServicesRoutes(app);
  registerSalesInvoicesRoutes(app);
  registerPatientInvoicesRoutes(app);
  registerPatientsRoutes(app);
  registerAdmissionsRoutes(app);
}
