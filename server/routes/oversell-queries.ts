import { Express } from "express";
import { registerOversellStatusQueryRoutes } from "./oversell-status-queries";
import { registerOversellReportQueryRoutes } from "./oversell-report-queries";

export function registerOversellQueryRoutes(app: Express) {
  registerOversellStatusQueryRoutes(app);
  registerOversellReportQueryRoutes(app);
}
