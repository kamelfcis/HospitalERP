import { Express } from "express";
import { registerItemsListQueryRoutes } from "./items-list-query";
import { registerItemsListImportRoutes } from "./items-list-import";

export function registerItemsListRoutes(app: Express, storage: any) {
  registerItemsListQueryRoutes(app, storage);
  registerItemsListImportRoutes(app, storage);
}
