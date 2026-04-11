import { Express } from "express";
import { registerItemsDepartments } from "./items-master-departments";
import { registerItemsInventory } from "./items-master-inventory";

export function registerItemsMasterRoutes(app: Express, storage: any) {
  registerItemsDepartments(app, storage);
  registerItemsInventory(app, storage);
}
