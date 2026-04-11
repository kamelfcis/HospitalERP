/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  clinic.ts — العيادات الخارجية: عيادات، جداول، مواعيد، استشارات، أوامر
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ┌──────────────────────────────────┬──────────────────────────────────────────┐
 *  │ الجدول                           │ الغرض                                    │
 *  ├──────────────────────────────────┼──────────────────────────────────────────┤
 *  │ clinic_clinics                   │ العيادات — مع إعدادات الخدمة والخزنة    │
 *  │ clinic_doctor_schedules          │ جداول دوام الأطباء في العيادات           │
 *  │ clinic_appointments              │ مواعيد المرضى — مع بيانات محاسبية OPD    │
 *  │ clinic_user_clinic_assignments   │ ربط المستخدمين بالعيادات                │
 *  │ clinic_user_doctor_assignments   │ ربط المستخدمين بالأطباء                 │
 *  │ clinic_consultations             │ الاستشارات الطبية (SOAP)                │
 *  │ clinic_consultation_drugs        │ الأدوية المصروفة بالاستشارة             │
 *  │ clinic_doctor_favorite_drugs     │ الأدوية المفضلة للطبيب                  │
 *  │ clinic_service_doctor_prices     │ أسعار خدمات مخصصة حسب الطبيب            │
 *  │ clinic_orders                    │ أوامر الطبيب (فحوصات/أدوية/خدمات)       │
 *  └──────────────────────────────────┴──────────────────────────────────────────┘
 *
 *  العلاقات:
 *    clinic_doctor_schedules → clinic_clinics, doctors
 *    clinic_appointments → clinic_clinics, doctors, patients, companies, contracts, contract_members
 *    clinic_consultations → clinic_appointments
 *    clinic_consultation_drugs → clinic_consultations, items
 *    clinic_orders → clinic_consultations, clinic_appointments, doctors, services, items
 *
 *  يُستورد من: inventory.ts, invoicing.ts, hospital.ts, companies.ts, contracts.ts
 *  يُستورد بواسطة: intake.ts
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { items } from "./inventory";
import { services } from "./invoicing";
import { doctors, patients } from "./hospital";
import { companies } from "./companies";
import { contracts, contractMembers } from "./contracts";

export const clinicClinics = pgTable("clinic_clinics", {
  id:               varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr:           text("name_ar").notNull(),
  departmentId:     varchar("department_id"),
  defaultPharmacyId:varchar("default_pharmacy_id"),
  consultationServiceId: varchar("consultation_service_id"),
  treasuryId:       varchar("treasury_id"),
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
}, (t) => [
  index("idx_clinic_schedules_clinic_id").on(t.clinicId),
  index("idx_clinic_schedules_doctor_id").on(t.doctorId),
  index("idx_clinic_schedules_doctor_weekday").on(t.doctorId, t.weekday),
]);

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
  paymentType:     varchar("payment_type", { length: 20 }).default("CASH"),
  insuranceCompany: text("insurance_company"),
  payerReference:  text("payer_reference"),
  invoiceId:       varchar("invoice_id"),
  accountingPostedAdvance: boolean("accounting_posted_advance").notNull().default(false),
  accountingPostedRevenue: boolean("accounting_posted_revenue").notNull().default(false),
  // ── محاسبة متقدمة (OPD Engine v2) ──────────────────────────────────────
  grossAmount:             decimal("gross_amount", { precision: 18, scale: 2 }).default("0"),
  paidAmount:              decimal("paid_amount", { precision: 18, scale: 2 }).default("0"),
  remainingAmount:         decimal("remaining_amount", { precision: 18, scale: 2 }).default("0"),
  doctorDeductionAmount:   decimal("doctor_deduction_amount", { precision: 18, scale: 2 }).default("0"),
  serviceDelivered:        boolean("service_delivered").notNull().default(false),
  refundAmount:            decimal("refund_amount", { precision: 18, scale: 2 }).default("0"),
  refundReason:            text("refund_reason"),
  // ── Contract FK fields (nullable — Phase 1 foundation) ─────────────────────
  // Legacy fields insuranceCompany + payerReference remain untouched
  companyId:               varchar("company_id").references(() => companies.id),
  contractId:              varchar("contract_id").references(() => contracts.id),
  contractMemberId:        varchar("contract_member_id").references(() => contractMembers.id),
  visitId:                 varchar("visit_id"),
  encounterId:             varchar("encounter_id"),
}, (t) => [
  index("idx_clinic_appts_visit_id").on(t.visitId),
  index("idx_clinic_appts_clinic_date").on(t.clinicId, t.appointmentDate),
  index("idx_clinic_appts_clinic_date_status").on(t.clinicId, t.appointmentDate, t.status),
  index("idx_clinic_appts_doctor_date").on(t.doctorId, t.appointmentDate),
  index("idx_clinic_appts_patient_id").on(t.patientId),
  index("idx_clinic_appts_status").on(t.status),
  index("idx_clinic_appts_company").on(t.companyId),
  index("idx_clinic_appts_contract").on(t.contractId),
  index("idx_clinic_appts_contract_member").on(t.contractMemberId),
  index("idx_clinic_appts_patient_date").on(t.patientId, t.appointmentDate),
]);

export const clinicUserClinicAssignments = pgTable("clinic_user_clinic_assignments", {
  id:       varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:   varchar("user_id").notNull(),
  clinicId: varchar("clinic_id").notNull().references(() => clinicClinics.id),
}, (t) => [
  index("idx_clinic_user_clinic_user_id").on(t.userId),
  uniqueIndex("idx_clinic_user_clinic_unique").on(t.userId, t.clinicId),
]);

export const clinicUserDoctorAssignments = pgTable("clinic_user_doctor_assignments", {
  id:       varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:   varchar("user_id").notNull(),
  doctorId: varchar("doctor_id").notNull().references(() => doctors.id),
}, (t) => [
  index("idx_clinic_user_doctor_user_id").on(t.userId),
  uniqueIndex("idx_clinic_user_doctor_unique").on(t.userId, t.doctorId),
]);

export const clinicConsultations = pgTable("clinic_consultations", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId:   varchar("appointment_id").notNull().unique().references(() => clinicAppointments.id),
  chiefComplaint:  text("chief_complaint"),
  diagnosis:       text("diagnosis"),
  notes:           text("notes"),
  consultationFee: decimal("consultation_fee", { precision: 10, scale: 2 }).default("0"),
  discountType:    varchar("discount_type", { length: 10 }).default("amount"),
  discountValue:   decimal("discount_value", { precision: 10, scale: 2 }).default("0"),
  finalAmount:     decimal("final_amount", { precision: 10, scale: 2 }).default("0"),
  paymentStatus:   varchar("payment_status", { length: 20 }).default("pending"),
  // ── Structured encounter fields (Step 2 — nullable, additive only) ──────
  subjectiveSummary:  text("subjective_summary"),
  objectiveSummary:   text("objective_summary"),
  assessmentSummary:  text("assessment_summary"),
  planSummary:        text("plan_summary"),
  followUpPlan:       text("follow_up_plan"),
  // ── Follow-up planning fields (Step 4 — nullable, additive only) ─────────
  followUpAfterDays:      integer("follow_up_after_days"),
  followUpReason:         text("follow_up_reason"),
  suggestedFollowUpDate:  varchar("suggested_follow_up_date"),
  createdBy:       varchar("created_by"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_clinic_consultations_created_at").on(t.createdAt),
]);

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
}, (t) => [
  index("idx_clinic_consult_drugs_consultation_id").on(t.consultationId),
  index("idx_clinic_consult_drugs_item_id").on(t.itemId),
]);

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
}, (t) => [
  index("idx_clinic_fav_drugs_doctor_clinic").on(t.doctorId, t.clinicId),
  index("idx_clinic_fav_drugs_item_id").on(t.itemId),
]);

export const clinicServiceDoctorPrices = pgTable("clinic_service_doctor_prices", {
  id:         varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId:  varchar("service_id").notNull(),
  doctorId:   varchar("doctor_id").notNull(),
  price:      decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_clinic_svc_doctor_price_unique").on(t.serviceId, t.doctorId),
  index("idx_clinic_svc_doctor_price_doctor_id").on(t.doctorId),
]);

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
}, (t) => [
  index("idx_clinic_orders_appointment_id").on(t.appointmentId),
  index("idx_clinic_orders_consultation_id").on(t.consultationId),
  index("idx_clinic_orders_doctor_id").on(t.doctorId),
  index("idx_clinic_orders_status").on(t.status),
  index("idx_clinic_orders_status_type").on(t.status, t.orderType),
  index("idx_clinic_orders_created_at").on(t.createdAt),
  index("idx_clinic_orders_target_id").on(t.targetId),
]);

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
