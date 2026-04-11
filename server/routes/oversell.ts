import { Express } from "express";
import { registerOversellQueryRoutes } from "./oversell-queries";
import { registerOversellActionRoutes } from "./oversell-actions";

export function registerOversellRoutes(app: Express) {
  registerOversellQueryRoutes(app);
  registerOversellActionRoutes(app);
}
