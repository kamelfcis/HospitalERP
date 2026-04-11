import type { Express } from "express";
import { registerTransfersCrud } from "./warehouses-transfers";
import { registerTransferOps } from "./warehouses-transfer-ops";

export function registerWarehousesDepartmentsRoutes(app: Express) {
  registerTransfersCrud(app);
  registerTransferOps(app);
}
