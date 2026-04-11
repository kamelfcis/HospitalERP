/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  intake.ts — استقبال العيادة: بيانات ما قبل الاستشارة، مفضلات الطبيب
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ┌──────────────────────────────┬──────────────────────────────────────────────┐
 *  │ الجدول                       │ الغرض                                        │
 *  ├──────────────────────────────┼──────────────────────────────────────────────┤
 *  │ clinic_visit_intake          │ بيانات الاستقبال: قياسات حيوية، سبب الزيارة │
 *  │ clinic_doctor_favorites      │ نصوص مفضلة للطبيب (ملاحظات/تقييم/خطة)      │
 *  └──────────────────────────────┴──────────────────────────────────────────────┘
 *
 *  العلاقات:
 *    clinic_visit_intake → clinic_appointments (1:1)
 *    clinic_doctor_favorites → doctors, clinic_clinics
 *
 *  يُستورد من: clinic.ts, hospital.ts
 *  لا يُستورد بواسطة ملفات schema أخرى
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clinicAppointments, clinicClinics } from "./clinic";
import { doctors } from "./hospital";

// ─── clinic_visit_intake ─────────────────────────────────────────────────────
// One intake record per appointment. Created by reception/nursing before the
// doctor starts the consultation. Becomes read-only once consultation begins.
export const clinicVisitIntake = pgTable("clinic_visit_intake", {
  id:                   varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId:        varchar("appointment_id").notNull().unique().references(() => clinicAppointments.id, { onDelete: "cascade" }),

  // ── زيارة ──────────────────────────────────────────────────────────────────
  visitType:            varchar("visit_type", { length: 30 }),       // new | follow_up | review_results | procedure | urgent
  reasonForVisit:       text("reason_for_visit"),

  // ── قياسات الحيوية ────────────────────────────────────────────────────────
  bloodPressure:        varchar("blood_pressure", { length: 20 }),   // e.g. "120/80"
  pulse:                varchar("pulse", { length: 10 }),
  temperature:          varchar("temperature", { length: 10 }),
  weight:               varchar("weight", { length: 10 }),
  height:               varchar("height", { length: 10 }),
  spo2:                 varchar("spo2", { length: 10 }),             // nullable — oxygen saturation
  randomBloodSugar:     varchar("random_blood_sugar", { length: 10 }), // nullable

  // ── ملاحظات ──────────────────────────────────────────────────────────────
  intakeNotes:          text("intake_notes"),

  // ── Template persistence (structured intake templates) ────────────────────
  // Stored so the exact template & answers can be reviewed later
  templateKey:          varchar("template_key", { length: 50 }),       // e.g. "hypertension_followup"
  templateLabel:        text("template_label"),                         // human-readable Arabic label
  structuredFlags:      jsonb("structured_flags"),                      // { flag: boolean } pairs selected
  selectedPromptValues: jsonb("selected_prompt_values"),                // { prompt: value } pairs

  // ── Locking rule ─────────────────────────────────────────────────────────
  // Set to true by route layer when doctor opens consultation.
  // Reception/nursing cannot edit a locked intake without elevated permission.
  isLocked:             boolean("is_locked").notNull().default(false),

  // ── Audit fields ─────────────────────────────────────────────────────────
  completedBy:          varchar("completed_by"),   // user who marked intake done
  completedAt:          timestamp("completed_at"),
  createdBy:            varchar("created_by").notNull(),
  updatedBy:            varchar("updated_by"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_clinic_intake_appointment_id").on(t.appointmentId),
  index("idx_clinic_intake_completed_by").on(t.completedBy),
  index("idx_clinic_intake_completed_at").on(t.completedAt),
  index("idx_clinic_intake_created_at").on(t.createdAt),
]);

// ─── clinic_doctor_favorites ─────────────────────────────────────────────────
// Reusable saved text helpers for doctors (NOT diagnosis templates).
// Doctors save frequently typed phrases to reduce repetitive typing.
// clinicId is nullable: null = favorite available across all doctor's clinics;
// set = clinic-specific favorite.
export const clinicDoctorFavorites = pgTable("clinic_doctor_favorites", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  doctorId:  varchar("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  clinicId:  varchar("clinic_id").references(() => clinicClinics.id, { onDelete: "cascade" }), // nullable = doctor-wide
  type:      varchar("type", { length: 20 }).notNull(),  // note | assessment_note | plan | followup | quick_text
  title:     text("title").notNull(),
  content:   text("content").notNull(),
  isPinned:  boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_clinic_fav_notes_doctor_id").on(t.doctorId),
  index("idx_clinic_fav_notes_clinic_id").on(t.clinicId),
  index("idx_clinic_fav_notes_type").on(t.type),
  index("idx_clinic_fav_notes_doctor_clinic").on(t.doctorId, t.clinicId),
]);

// ─── Insert schemas ──────────────────────────────────────────────────────────
export const insertClinicVisitIntakeSchema = createInsertSchema(clinicVisitIntake).omit({
  id: true, createdAt: true, updatedAt: true, isLocked: true,
});

export const insertClinicDoctorFavoriteSchema = createInsertSchema(clinicDoctorFavorites).omit({
  id: true, createdAt: true, updatedAt: true,
});

// ─── Types ───────────────────────────────────────────────────────────────────
export type ClinicVisitIntake = typeof clinicVisitIntake.$inferSelect;
export type InsertClinicVisitIntake = z.infer<typeof insertClinicVisitIntakeSchema>;
export type ClinicDoctorFavorite = typeof clinicDoctorFavorites.$inferSelect;
export type InsertClinicDoctorFavorite = z.infer<typeof insertClinicDoctorFavoriteSchema>;
