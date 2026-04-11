import type { Express } from "express";
import { registerDistributeRoutes } from "./patient-invoices-distribute";
import { registerPaymentOpsRoutes } from "./patient-invoices-payment-ops";

export function registerPaymentRoutes(app: Express) {
  registerDistributeRoutes(app);
  registerPaymentOpsRoutes(app);
}
