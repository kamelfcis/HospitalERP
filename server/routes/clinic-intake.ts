/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Clinic Intake Routes — مسارات الاستقبال والمفضلة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Intake  → pre-consultation data collected by reception/nursing
 *  Favorites → doctor-side reusable text helpers (NOT diagnosis logic)
 *
 *  Locking rule:
 *    Once a clinic_consultation row exists for an appointment,
 *    the intake is locked for reception/nursing.
 *    Only users with DOCTOR_CONSULTATION (doctors/admins) can edit it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { resolveClinicScope, clinicAllowed } from "../lib/clinic-scope";
import { db } from "../db";
import { clinicConsultations, clinicAppointments } from "@shared/schema/clinic";
import { eq } from "drizzle-orm";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Returns true if a clinic_consultation record exists for this appointment */
async function consultationExists(appointmentId: string): Promise<boolean> {
  const rows = await db
    .select({ id: clinicConsultations.id })
    .from(clinicConsultations)
    .where(eq(clinicConsultations.appointmentId, appointmentId))
    .limit(1);
  return rows.length > 0;
}

/** Returns the clinicId of an appointment (for scope check) */
async function getAppointmentClinicId(appointmentId: string): Promise<string | null> {
  const rows = await db
    .select({ clinicId: clinicAppointments.clinicId })
    .from(clinicAppointments)
    .where(eq(clinicAppointments.id, appointmentId))
    .limit(1);
  return rows[0]?.clinicId ?? null;
}

// ─── Zod validation schemas ─────────────────────────────────────────────────

const upsertIntakeSchema = z.object({
  visitType:             z.enum(["new", "follow_up", "review_results", "procedure", "urgent"]).optional(),
  reasonForVisit:        z.string().max(1000).optional(),
  bloodPressure:         z.string().max(20).optional(),
  pulse:                 z.string().max(10).optional(),
  temperature:           z.string().max(10).optional(),
  weight:                z.string().max(10).optional(),
  height:                z.string().max(10).optional(),
  spo2:                  z.string().max(10).optional().nullable(),
  randomBloodSugar:      z.string().max(10).optional().nullable(),
  intakeNotes:           z.string().max(2000).optional().nullable(),
  templateKey:           z.string().max(50).optional().nullable(),
  templateLabel:         z.string().max(200).optional().nullable(),
  structuredFlags:       z.record(z.boolean()).optional().nullable(),
  selectedPromptValues:  z.record(z.unknown()).optional().nullable(),
  completedBy:           z.string().optional().nullable(),
  completedAt:           z.string().datetime().optional().nullable(),
});

const favoriteSchema = z.object({
  type:     z.enum(["note", "assessment_note", "plan", "followup", "quick_text"]),
  title:    z.string().min(1).max(200),
  content:  z.string().min(1).max(5000),
  isPinned: z.boolean().optional().default(false),
  clinicId: z.string().optional().nullable(),
});

const favoritePatchSchema = z.object({
  type:     z.enum(["note", "assessment_note", "plan", "followup", "quick_text"]).optional(),
  title:    z.string().min(1).max(200).optional(),
  content:  z.string().min(1).max(5000).optional(),
  isPinned: z.boolean().optional(),
});

// ─── Route registration ─────────────────────────────────────────────────────

export function registerClinicIntakeRoutes(app: Express) {

  // ── GET /api/clinic-intake/:appointmentId ──────────────────────────────
  // Returns intake data. Any user with CLINIC_INTAKE_VIEW may call this.
  app.get(
    "/api/clinic-intake/:appointmentId",
    requireAuth,
    checkPermission(PERMISSIONS.CLINIC_INTAKE_VIEW),
    async (req, res) => {
      try {
        const { appointmentId } = req.params;
        const userId = req.session.userId!;
        const perms = await storage.getUserEffectivePermissions(userId);
        const scope = await resolveClinicScope(userId, perms);

        // Verify clinic scope
        const clinicId = await getAppointmentClinicId(appointmentId);
        if (clinicId && !clinicAllowed(scope, clinicId)) {
          return res.status(403).json({ message: "ليس لديك صلاحية عرض هذه العيادة" });
        }

        const intake = await storage.getIntakeByAppointment(appointmentId);
        res.json(intake ?? null);
      } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // ── PUT /api/clinic-intake/:appointmentId ──────────────────────────────
  // Create or update intake. Reception/nursing need CLINIC_INTAKE_MANAGE.
  // If the consultation has started, only users with DOCTOR_CONSULTATION can edit.
  app.put(
    "/api/clinic-intake/:appointmentId",
    requireAuth,
    checkPermission(PERMISSIONS.CLINIC_INTAKE_MANAGE),
    async (req, res) => {
      try {
        const { appointmentId } = req.params;
        const userId = req.session.userId!;
        const perms = await storage.getUserEffectivePermissions(userId);
        const scope = await resolveClinicScope(userId, perms);

        // Clinic scope check
        const clinicId = await getAppointmentClinicId(appointmentId);
        if (!clinicId) return res.status(404).json({ message: "الموعد غير موجود" });
        if (!clinicAllowed(scope, clinicId)) {
          return res.status(403).json({ message: "ليس لديك صلاحية تعديل هذه العيادة" });
        }

        // Locking rule: if consultation started, only doctors/admins can edit
        const locked = await consultationExists(appointmentId);
        if (locked && !perms.includes(PERMISSIONS.DOCTOR_CONSULTATION)) {
          return res.status(423).json({
            message: "الاستقبال مقفل — الكشف قد بدأ بالفعل. لا يمكن التعديل بعد بدء الكشف.",
            code: "INTAKE_LOCKED",
          });
        }

        const parsed = upsertIntakeSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.errors });
        }

        const intake = await storage.upsertIntake(appointmentId, parsed.data as any, userId);
        res.json(intake);
      } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // ── POST /api/clinic-intake/:appointmentId/complete ────────────────────
  // Marks intake as completed (completedBy + completedAt set).
  app.post(
    "/api/clinic-intake/:appointmentId/complete",
    requireAuth,
    checkPermission(PERMISSIONS.CLINIC_INTAKE_MANAGE),
    async (req, res) => {
      try {
        const { appointmentId } = req.params;
        const userId = req.session.userId!;
        const perms = await storage.getUserEffectivePermissions(userId);
        const scope = await resolveClinicScope(userId, perms);

        const clinicId = await getAppointmentClinicId(appointmentId);
        if (!clinicId) return res.status(404).json({ message: "الموعد غير موجود" });
        if (!clinicAllowed(scope, clinicId)) {
          return res.status(403).json({ message: "ليس لديك صلاحية الوصول لهذه العيادة" });
        }

        // Must have an intake record to complete
        const existing = await storage.getIntakeByAppointment(appointmentId);
        if (!existing) {
          return res.status(404).json({ message: "لا توجد بيانات استقبال لهذا الموعد" });
        }

        const intake = await storage.markIntakeCompleted(appointmentId, userId);
        res.json(intake);
      } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // FAVORITES — doctor-side reusable saved-text helpers
  // These routes require CLINIC_FAVORITES_MANAGE.
  // Ownership is enforced by doctorId derived from the session user.
  // ─────────────────────────────────────────────────────────────────────────

  // ── GET /api/doctor-favorites ──────────────────────────────────────────
  // Returns all favorites for the calling doctor. clinicId filter optional.
  app.get(
    "/api/doctor-favorites",
    requireAuth,
    checkPermission(PERMISSIONS.CLINIC_FAVORITES_MANAGE),
    async (req, res) => {
      try {
        const doctorId = await storage.getUserDoctorId(req.session.userId!);
        if (!doctorId) {
          return res.status(404).json({ message: "لم يتم ربط حسابك بطبيب" });
        }
        const clinicId = (req.query.clinicId as string) || null;
        const favorites = await storage.getDoctorFavorites(doctorId, clinicId);
        res.json(favorites);
      } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // ── POST /api/doctor-favorites ─────────────────────────────────────────
  // Create a new favorite. doctorId comes from session, not from body.
  app.post(
    "/api/doctor-favorites",
    requireAuth,
    checkPermission(PERMISSIONS.CLINIC_FAVORITES_MANAGE),
    async (req, res) => {
      try {
        const doctorId = await storage.getUserDoctorId(req.session.userId!);
        if (!doctorId) {
          return res.status(404).json({ message: "لم يتم ربط حسابك بطبيب" });
        }

        const parsed = favoriteSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.errors });
        }

        const favorite = await storage.addDoctorFavorite(doctorId, parsed.data);
        res.status(201).json(favorite);
      } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // ── PATCH /api/doctor-favorites/:id ───────────────────────────────────
  // Update a favorite. Ownership check via doctorId.
  app.patch(
    "/api/doctor-favorites/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CLINIC_FAVORITES_MANAGE),
    async (req, res) => {
      try {
        const doctorId = await storage.getUserDoctorId(req.session.userId!);
        if (!doctorId) {
          return res.status(404).json({ message: "لم يتم ربط حسابك بطبيب" });
        }

        const parsed = favoritePatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.errors });
        }

        const updated = await storage.updateDoctorFavorite(req.params.id, doctorId, parsed.data);
        if (!updated) {
          return res.status(404).json({ message: "العنصر غير موجود أو لا تملك صلاحية تعديله" });
        }
        res.json(updated);
      } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // ── DELETE /api/doctor-favorites/:id ──────────────────────────────────
  // Delete a favorite. Ownership check via doctorId.
  app.delete(
    "/api/doctor-favorites/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CLINIC_FAVORITES_MANAGE),
    async (req, res) => {
      try {
        const doctorId = await storage.getUserDoctorId(req.session.userId!);
        if (!doctorId) {
          return res.status(404).json({ message: "لم يتم ربط حسابك بطبيب" });
        }
        const deleted = await storage.deleteDoctorFavorite(req.params.id, doctorId);
        if (!deleted) {
          return res.status(404).json({ message: "العنصر غير موجود أو لا تملك صلاحية حذفه" });
        }
        res.status(204).end();
      } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
      }
    }
  );
}
