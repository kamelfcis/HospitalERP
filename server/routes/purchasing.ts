import type { Express } from "express";
import { registerSupplierRoutes } from "./purchasing-suppliers-routes";
import { registerReceivingRoutes } from "./purchasing-receivings-routes";

export function registerPurchasingRoutes(app: Express) {
  registerSupplierRoutes(app);
  registerReceivingRoutes(app);
}
