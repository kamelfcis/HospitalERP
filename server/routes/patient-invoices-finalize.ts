import type { Express } from "express";
import { registerFinalizePostRoute } from "./patient-invoices-finalize-route";
import { registerFinalCloseRoute } from "./patient-invoices-final-close";

export function registerFinalizeRoutes(app: Express) {
  registerFinalizePostRoute(app);
  registerFinalCloseRoute(app);
}
