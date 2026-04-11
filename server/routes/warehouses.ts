import type { Express } from "express";
import { registerWarehousesCrudRoutes } from "./warehouses-crud";
import { registerWarehousesDepartmentsRoutes } from "./warehouses-departments";

export function registerWarehousesRoutes(app: Express) {
  registerWarehousesCrudRoutes(app);
  registerWarehousesDepartmentsRoutes(app);
}
