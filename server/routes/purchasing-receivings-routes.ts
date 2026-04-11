import type { Express } from "express";
import { registerReceivingCrudRoutes } from "./purchasing-receiving-crud-routes";
import { registerReceivingPostRoutes } from "./purchasing-receiving-post-routes";

export function registerReceivingRoutes(app: Express) {
  registerReceivingCrudRoutes(app);
  registerReceivingPostRoutes(app);
}
