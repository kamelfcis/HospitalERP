import { Express } from "express";
import { registerItemsCrudCoreRoutes } from "./items-crud-core";
import { registerItemsLookupsRoutes } from "./items-lookups";

export function registerItemsCrudRoutes(app: Express, storage: any) {
  registerItemsLookupsRoutes(app, storage);
  registerItemsCrudCoreRoutes(app, storage);
}
