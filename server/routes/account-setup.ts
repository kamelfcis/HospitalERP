import type { Express } from "express";
import { registerAccountSetupMappingsRoutes } from "./account-setup-mappings";
import { registerAccountSetupFiscalRoutes } from "./account-setup-fiscal";

export function registerAccountSetupRoutes(app: Express) {
  registerAccountSetupFiscalRoutes(app);
  registerAccountSetupMappingsRoutes(app);
}
