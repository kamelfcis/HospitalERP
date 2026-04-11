import type { Express } from "express";
import { registerReportsItemsRoutes } from "./reports-items";
import { registerReportsAdminRoutes } from "./reports-admin";
import { registerReportsWarehouseRoutes } from "./reports-warehouse";

export function registerReportsRoutes(app: Express) {
  registerReportsItemsRoutes(app);
  registerReportsAdminRoutes(app);
  registerReportsWarehouseRoutes(app);
}
