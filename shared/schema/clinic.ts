import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { items } from "./inventory";
import { services } from "./invoicing";
import { doctors, patients } from "./hospital";

export const clinicClinics = pgTable("clinic_clinics", {
  id:               varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr:           text("name_ar").notNull(),
  departmentId:     varchar("department_id"),
  defaultPharmacyId:varchar("default_pharmacy_id"),
  consultationServiceId: varchar("consultation_service_id"),
  secretaryFeeType: varchar("secretary_fee_type", { length: 20 }),
  secretaryFeeValue:decimal("secretary_fee_value", { precision: 10, scale: 2 }).default("0"),
  isActive:         boolean("is_active").notNull().default(true),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});

export const clinicDoctorSchedules = pgTable("clinic_doctor_schedules", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId:        varchar("clinic_id").notNull().references(() => clinicClinics.id, { onDelete: "cascade" }),
  doctorId:        varchar("doctor_id").notNull().references(() => doctors.id),
  weekday:         integer("weekday"),
  startTime:       text("start_time"),
  endTime:         text("end_time"),
  maxAppointments: integer("max_appointments").default(20),
});

export const clinicAppointments = pgTable("clinic_appointments", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId:        varchar("clinic_id").notNull().references(() => clinicClinics.id),
  doctorId:        varchar("doctor_id").notNull().references(() => doctors.id),
  patientId:       varchar("patient_id").references(() => patients.id),
  patientName:     text("patient_name").notNull(),
  patientPhone:    text("patient_phone"),
  appointmentDate: date("appointment_date").notNull(),
  appointmentTime: text("appointment_time"),
  turnNumber:      integer("turn_number").notNull(),
  status:          varchar("status").notNull().default("waiting"),
  notes:           text("notes"),
  createdBy:       varchar("created_by"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

export const clinicUserClinicAssignments = pgTable("clinic_user_clinic_assignments", {
  id:       varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:   varchar("user_id").notNull(),
  clinicId: varchar("clinic_id").notNull().references(() => clinicClinics.id),
});

export const clinicUserDoctorAssignments = pgTable("clinic_user_doctor_assignments", {
  id:       varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:   varchar("user_id").notNull(),
  doctorId: varchar("doctor_id").notNull().references(() => doctors.id),
});

export const clinicConsultations = pgTable("clinic_consultations", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().unique().references(() => clinicAppointments.id),
  chiefComplaint:text("chief_complaint"),
  diagnosis:     text("diagnosis"),
  notes:         text("notes"),
  createdBy:     varchar("created_by"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

export const clinicConsultationDrugs = pgTable("clinic_consultation_drugs", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  consultationId: varchar("consultation_id").notNull().references(() => clinicConsultations.id, { onDelete: "cascade" }),
  lineNo:         integer("line_no").notNull(),
  itemId:         varchar("item_id").references(() => items.id),
  drugName:       text("drug_name").notNull(),
  dose:           text("dose"),
  frequency:      text("frequency"),
  duration:       text("duration"),
  notes:          text("notes"),
  unitLevel:      varchar("unit_level").default("major"),
  quantity:       decimal("quantity", { precision: 10, scale: 3 }).default("1"),
  unitPrice:      decimal("unit_price", { precision: 10, scale: 3 }).default("0"),
});

export const clinicDoctorFavoriteDrugs = pgTable("clinic_doctor_favorite_drugs", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  doctorId:        varchar("doctor_id").notNull().references(() => doctors.id),
  clinicId:        varchar("clinic_id").references(() => clinicClinics.id),
  itemId:          varchar("item_id").references(() => items.id),
  drugName:        text("drug_name").notNull(),
  defaultDose:     text("default_dose"),
  defaultFrequency:text("default_frequency"),
  defaultDuration: text("default_duration"),
  sortOrder:       integer("sort_order").default(0),
});

export const clinicServiceDoctorPrices = pgTable("clinic_service_doctor_prices", {
  id:         varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId:  varchar("service_id").notNull(),
  doctorId:   varchar("doctor_id").notNull(),
  price:      decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

export const clinicOrders = pgTable("clinic_orders", {
  id:                varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  consultationId:    varchar("consultation_id").references(() => clinicConsultations.id),
  appointmentId:     varchar("appointment_id").notNull().references(() => clinicAppointments.id),
  doctorId:          varchar("doctor_id").notNull().references(() => doctors.id),
  patientName:       text("patient_name").notNull(),
  orderType:         varchar("order_type").notNull(),
  targetType:        varchar("target_type").notNull(),
  targetId:          varchar("target_id"),
  targetName:        text("target_name"),
  serviceId:         varchar("service_id").references(() => services.id),
  serviceNameManual: text("service_name_manual"),
  itemId:            varchar("item_id").references(() => items.id),
  drugName:          text("drug_name"),
  dose:              text("dose"),
  quantity:          decimal("quantity", { precision: 10, scale: 3 }),
  unitLevel:         varchar("unit_level").default("major"),
  unitPrice:         decimal("unit_price", { precision: 10, scale: 3 }),
  status:            varchar("status").notNull().default("pending"),
  executedInvoiceId: varchar("executed_invoice_id"),
  executedBy:        varchar("executed_by"),
  executedAt:        timestamp("executed_at"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas
export const insertClinicClinicSchema = createInsertSchema(clinicClinics).omit({ id: true, createdAt: true });
export const insertClinicAppointmentSchema = createInsertSchema(clinicAppointments).omit({ id: true, createdAt: true });
export const insertClinicConsultationSchema = createInsertSchema(clinicConsultations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClinicConsultationDrugSchema = createInsertSchema(clinicConsultationDrugs).omit({ id: true });
export const insertClinicFavoriteDrugSchema = createInsertSchema(clinicDoctorFavoriteDrugs).omit({ id: true });
export const insertClinicOrderSchema = createInsertSchema(clinicOrders).omit({ id: true, createdAt: true });

// Types
export type ClinicClinic = typeof clinicClinics.$inferSelect;
export type InsertClinicClinic = z.infer<typeof insertClinicClinicSchema>;
export type ClinicDoctorSchedule = typeof clinicDoctorSchedules.$inferSelect;
export type ClinicAppointment = typeof clinicAppointments.$inferSelect;
export type InsertClinicAppointment = z.infer<typeof insertClinicAppointmentSchema>;
export type ClinicConsultation = typeof clinicConsultations.$inferSelect;
export type InsertClinicConsultation = z.infer<typeof insertClinicConsultationSchema>;
export type ClinicConsultationDrug = typeof clinicConsultationDrugs.$inferSelect;
export type InsertClinicConsultationDrug = z.infer<typeof insertClinicConsultationDrugSchema>;
export type ClinicDoctorFavoriteDrug = typeof clinicDoctorFavoriteDrugs.$inferSelect;
export type InsertClinicFavoriteDrug = z.infer<typeof insertClinicFavoriteDrugSchema>;
export type ClinicOrder = typeof clinicOrders.$inferSelect;
export type InsertClinicOrder = z.infer<typeof insertClinicOrderSchema>;
