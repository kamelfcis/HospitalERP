import type { Express } from "express";
import { registerClinicSetupRoutes } from "./clinic-setup-routes";
import { registerClinicBookingsRoutes } from "./clinic-bookings-routes";

export function registerClinicAppointmentRoutes(app: Express) {
  registerClinicSetupRoutes(app);
  registerClinicBookingsRoutes(app);
}
