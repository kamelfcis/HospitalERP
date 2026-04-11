import type { Express } from "express";
import { registerServicesCatalogRoutes } from "./services-catalog";
import { registerServicesPricingRoutes } from "./services-pricing";

export function registerServicesRoutes(app: Express) {
  registerServicesCatalogRoutes(app);
  registerServicesPricingRoutes(app);
}
