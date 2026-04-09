/**
 * clinic-scope.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Reusable clinic-isolation helpers.
 *
 * Usage in routes:
 *   const scope = await resolveClinicScope(req.session.userId!, perms);
 *   if (!scope.all && !scope.clinicIds.includes(targetClinicId)) {
 *     return res.status(403).json({ message: "غير مصرح لهذه العيادة" });
 *   }
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";

export type ClinicScope =
  | { all: true }
  | { all: false; clinicIds: string[] };

/**
 * Resolve the clinic scope for a user.
 *
 * - If the user holds `clinic.view_all` → { all: true }
 * - Otherwise → { all: false, clinicIds: [...their assigned clinic IDs] }
 *   Reads from both `clinic_user_clinic_assignments` AND `user_clinics` tables.
 *
 * @param userId  - session user ID
 * @param perms   - effective permission strings (already fetched by the route)
 */
export async function resolveClinicScope(
  userId: string,
  perms: string[]
): Promise<ClinicScope> {
  if (perms.includes("clinic.view_all")) {
    return { all: true };
  }
  const clinicIds = await storage.getUserClinicIds(userId);
  return { all: false, clinicIds };
}

/**
 * Check whether a given clinicId is accessible under the resolved scope.
 */
export function clinicAllowed(scope: ClinicScope, clinicId: string): boolean {
  if (scope.all) return true;
  return scope.clinicIds.includes(clinicId);
}

/**
 * Fetch the clinic_id of an appointment. Returns null if not found.
 */
export async function getAppointmentClinicId(
  appointmentId: string
): Promise<string | null> {
  const rows = await db.execute(
    sql`SELECT clinic_id FROM clinic_appointments WHERE id = ${appointmentId}`
  );
  return (rows.rows[0] as { clinic_id: string } | undefined)?.clinic_id ?? null;
}

/**
 * Fetch the clinic_id of a clinic_order (via its appointment). Returns null if not found.
 */
export async function getOrderClinicId(
  orderId: string
): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT a.clinic_id
    FROM clinic_orders o
    JOIN clinic_appointments a ON a.id = o.appointment_id
    WHERE o.id = ${orderId}
  `);
  return (rows.rows[0] as { clinic_id: string } | undefined)?.clinic_id ?? null;
}
