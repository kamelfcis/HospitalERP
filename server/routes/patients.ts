import type { Express } from "express";
import { registerPatientsCrudRoutes }    from "./patients-crud";
import { registerDoctorsRoutes }         from "./doctors-routes";
import { registerPatientInquiryRoutes }  from "./patient-inquiry";

export function registerPatientsRoutes(app: Express) {
  registerPatientsCrudRoutes(app);
  registerDoctorsRoutes(app);
  registerPatientInquiryRoutes(app);
}
