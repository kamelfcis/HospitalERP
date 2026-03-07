import type { Express } from "express";
import { registerItemsRoutes } from "./items";
import { registerWarehousesRoutes } from "./warehouses";
import { registerPurchasingRoutes } from "./purchasing";

export function registerInventoryRoutes(app: Express) {
  registerItemsRoutes(app);
  registerWarehousesRoutes(app);
  registerPurchasingRoutes(app);
}
