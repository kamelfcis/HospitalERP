import type { Express } from "express";
import { registerReportsWarehouseQueryRoutes } from "./reports-warehouse-query";
import { registerReportsWarehouseExportRoutes } from "./reports-warehouse-export";

export function registerReportsWarehouseRoutes(app: Express) {
  registerReportsWarehouseQueryRoutes(app);
  registerReportsWarehouseExportRoutes(app);
}
