/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Clinic Intake Storage — بيانات الاستقبال والقياسات الحيوية
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Handles persistence for:
 *    - clinic_visit_intake  (one per appointment, pre-consultation)
 *    - clinic_doctor_favorites  (reusable saved-text helpers, NOT diagnosis)
 *
 *  These two domains are INTENTIONALLY SEPARATE:
 *    - intake  → reception/nursing workflow, locked after consultation starts
 *    - favorites → doctor-side text reuse, no medical logic
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and } from "drizzle-orm";
import { db } from "../db";
import {
  clinicVisitIntake,
  clinicDoctorFavorites,
  type ClinicVisitIntake,
  type InsertClinicVisitIntake,
  type ClinicDoctorFavorite,
  type InsertClinicDoctorFavorite,
} from "@shared/schema/intake";

// ─── INTAKE SECTION ──────────────────────────────────────────────────────────

/**
 * Fetch the intake record for a given appointment.
 * Returns null if no intake has been recorded yet.
 */
async function getIntakeByAppointment(
  appointmentId: string
): Promise<ClinicVisitIntake | null> {
  const rows = await db
    .select()
    .from(clinicVisitIntake)
    .where(eq(clinicVisitIntake.appointmentId, appointmentId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Create or update the intake record for an appointment.
 * `createdBy` is only set on insert (ignored on update).
 * `updatedBy` is always set on update.
 */
async function upsertIntake(
  appointmentId: string,
  data: Omit<InsertClinicVisitIntake, "appointmentId">,
  userId: string
): Promise<ClinicVisitIntake> {
  const existing = await getIntakeByAppointment(appointmentId);

  if (existing) {
    // Update path — preserve createdBy, update updatedBy
    const [updated] = await db
      .update(clinicVisitIntake)
      .set({
        ...data,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(clinicVisitIntake.appointmentId, appointmentId))
      .returning();
    return updated;
  }

  // Insert path
  const [inserted] = await db
    .insert(clinicVisitIntake)
    .values({
      ...data,
      appointmentId,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  return inserted;
}

/**
 * Lock the intake for an appointment.
 * Called by the consultation route when the doctor opens the consultation screen.
 * After locking, reception/nursing cannot edit without elevated permission.
 */
async function lockIntake(appointmentId: string): Promise<void> {
  await db
    .update(clinicVisitIntake)
    .set({ isLocked: true, updatedAt: new Date() })
    .where(eq(clinicVisitIntake.appointmentId, appointmentId));
}

/**
 * Mark intake as completed (completedBy + completedAt).
 */
async function markIntakeCompleted(
  appointmentId: string,
  userId: string
): Promise<ClinicVisitIntake> {
  const [updated] = await db
    .update(clinicVisitIntake)
    .set({
      completedBy: userId,
      completedAt: new Date(),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(clinicVisitIntake.appointmentId, appointmentId))
    .returning();
  return updated;
}

// ─── FAVORITES SECTION ───────────────────────────────────────────────────────
// Favorites are doctor-side text reuse helpers only.
// They contain NO medical decision logic.

/**
 * List all favorites for a doctor, optionally filtered by clinicId.
 * Pinned favorites appear first, then sorted by most-recently updated.
 */
async function getDoctorFavorites(
  doctorId: string,
  clinicId?: string | null
): Promise<ClinicDoctorFavorite[]> {
  const conditions = clinicId
    ? and(
        eq(clinicDoctorFavorites.doctorId, doctorId),
        eq(clinicDoctorFavorites.clinicId, clinicId)
      )
    : eq(clinicDoctorFavorites.doctorId, doctorId);

  const rows = await db
    .select()
    .from(clinicDoctorFavorites)
    .where(conditions)
    .orderBy(clinicDoctorFavorites.isPinned, clinicDoctorFavorites.updatedAt);

  // Pinned first
  return [...rows.filter((r) => r.isPinned), ...rows.filter((r) => !r.isPinned)];
}

/**
 * Add a new favorite for a doctor.
 * Ownership: doctorId is always taken from session, not from client payload.
 */
async function addDoctorFavorite(
  doctorId: string,
  data: Omit<InsertClinicDoctorFavorite, "doctorId">
): Promise<ClinicDoctorFavorite> {
  const [inserted] = await db
    .insert(clinicDoctorFavorites)
    .values({ ...data, doctorId })
    .returning();
  return inserted;
}

/**
 * Update a favorite. Verifies ownership (doctorId) before updating.
 * Returns null if the favorite does not belong to this doctor.
 */
async function updateDoctorFavorite(
  id: string,
  doctorId: string,
  data: Partial<Pick<ClinicDoctorFavorite, "title" | "content" | "isPinned" | "type">>
): Promise<ClinicDoctorFavorite | null> {
  const [updated] = await db
    .update(clinicDoctorFavorites)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(clinicDoctorFavorites.id, id),
        eq(clinicDoctorFavorites.doctorId, doctorId)
      )
    )
    .returning();
  return updated ?? null;
}

/**
 * Delete a favorite. Verifies ownership before deleting.
 */
async function deleteDoctorFavorite(
  id: string,
  doctorId: string
): Promise<boolean> {
  const result = await db
    .delete(clinicDoctorFavorites)
    .where(
      and(
        eq(clinicDoctorFavorites.id, id),
        eq(clinicDoctorFavorites.doctorId, doctorId)
      )
    )
    .returning({ id: clinicDoctorFavorites.id });
  return result.length > 0;
}

// ─── Export ──────────────────────────────────────────────────────────────────
export default {
  getIntakeByAppointment,
  upsertIntake,
  lockIntake,
  markIntakeCompleted,
  getDoctorFavorites,
  addDoctorFavorite,
  updateDoctorFavorite,
  deleteDoctorFavorite,
};
