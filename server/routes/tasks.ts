import type { Express } from "express";
import { registerTasksCrudRoutes } from "./tasks-crud-routes";
import { registerTasksStatusRoutes } from "./tasks-status-routes";

export function registerTaskRoutes(app: Express) {
  registerTasksCrudRoutes(app);
  registerTasksStatusRoutes(app);
}
