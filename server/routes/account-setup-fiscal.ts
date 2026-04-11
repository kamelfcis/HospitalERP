import type { Express } from "express";
import { registerAccountSetupFiscalReportsRoutes } from "./account-setup-fiscal-reports";
import { registerAccountSetupFiscalImportRoutes } from "./account-setup-fiscal-import";

export function registerAccountSetupFiscalRoutes(app: Express) {
  registerAccountSetupFiscalReportsRoutes(app);
  registerAccountSetupFiscalImportRoutes(app);
}
