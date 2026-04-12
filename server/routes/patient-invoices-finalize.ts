import type { Express } from "express";
import { registerFinalizePostRoute } from "./patient-invoices-finalize-route";
import { registerFinalCloseRoute } from "./patient-invoices-final-close";
import { registerPatientInvoiceRegenJournalRoute } from "./patient-invoices-regen-journal";

export function registerFinalizeRoutes(app: Express) {
  registerFinalizePostRoute(app);
  registerFinalCloseRoute(app);
  registerPatientInvoiceRegenJournalRoute(app);
}
