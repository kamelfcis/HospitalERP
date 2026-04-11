import type { Express } from "express";
import { registerAdmissionsCrudRoutes } from "./admissions-crud-routes";
import { registerAdmissionsActionsRoutes } from "./admissions-actions-routes";

export function registerAdmissionsRoutes(app: Express) {
  registerAdmissionsCrudRoutes(app);
  registerAdmissionsActionsRoutes(app);
}
