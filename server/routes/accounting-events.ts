import type { Express } from "express";
import { registerAccountingEventsListRoutes } from "./accounting-events-list";
import { registerAccountingEventsActionsRoutes } from "./accounting-events-actions";

export function registerAccountingEventRoutes(app: Express) {
  registerAccountingEventsListRoutes(app);
  registerAccountingEventsActionsRoutes(app);
}
