import { Express } from "express";
import { storage } from "../storage";
import { registerItemsCrudRoutes } from "./items-crud";
import { registerItemsMasterRoutes } from "./items-master";

export function registerItemsRoutes(app: Express) {
  registerItemsCrudRoutes(app, storage);
  registerItemsMasterRoutes(app, storage);
}
