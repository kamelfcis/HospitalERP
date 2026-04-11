import { Express } from "express";
import { registerItemsListRoutes } from "./items-list-routes";
import { registerItemsDetailRoutes } from "./items-detail-routes";

export function registerItemsCrudCoreRoutes(app: Express, storage: any) {
  registerItemsListRoutes(app, storage);
  registerItemsDetailRoutes(app, storage);
}
