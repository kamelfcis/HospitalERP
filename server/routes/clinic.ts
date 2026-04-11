// ACCOUNTING_PENDING: Clinic orders executeClinicOrder → creates patient invoice lines
//   but the invoice itself handles GL on finalization (see patient-invoices.ts).
//   Appointment refund via cancelAndRefundAppointment → treasury refund only, no GL entry.

import type { Express } from "express";
import { registerClinicAppointmentRoutes } from "./clinic-appointments";
import { registerClinicConsultationRoutes } from "./clinic-consultations";
import { registerClinicOrdersRoutes } from "./clinic-orders-routes";

export function registerClinicRoutes(app: Express) {
  registerClinicAppointmentRoutes(app);
  registerClinicConsultationRoutes(app);
  registerClinicOrdersRoutes(app);
}
