import type { Express } from "express";
import { registerAccountsCrud } from "./accounts-crud";
import { registerCostCentersFiscal } from "./accounts-costcenters-fiscal";

export function registerAccountsRoutes(app: Express) {
  registerAccountsCrud(app);
  registerCostCentersFiscal(app);
}
