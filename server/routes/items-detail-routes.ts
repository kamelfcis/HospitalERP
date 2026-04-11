import { Express } from "express";
import { registerItemsDetailCrudRoutes } from "./items-detail-crud";
import { registerItemsDetailAuxRoutes } from "./items-detail-aux";

export function registerItemsDetailRoutes(app: Express, storage: any) {
  registerItemsDetailCrudRoutes(app, storage);
  registerItemsDetailAuxRoutes(app, storage);
}
