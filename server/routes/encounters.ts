import type { Express } from "express";
import { requireAuth, checkPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import {
  createEncounter,
  completeEncounter,
  cancelEncounter,
  getEncountersByVisit,
  getEncounter,
} from "../services/encounter-lifecycle";
import { addLinesToVisitInvoice } from "../services/encounter-routing";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerEncounterRoutes(app: Express) {
  app.get("/api/visits/:visitId/encounters", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { visitId } = req.params;
      const rows = await db.execute(sql`
        SELECT e.*,
               d.name_ar AS department_name
        FROM encounters e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.visit_id = ${visitId}
        ORDER BY e.started_at DESC
      `);
      res.json(rows.rows);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/encounters/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const enc = await getEncounter(req.params.id);
      if (!enc) return res.status(404).json({ message: "المقابلة غير موجودة" });
      res.json(enc);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/encounters", requireAuth, checkPermission(PERMISSIONS.PATIENTS_CREATE), async (req, res) => {
    try {
      const { visitId, admissionId, parentEncounterId, departmentId, encounterType, doctorId, metadata } = req.body;
      if (!visitId || !encounterType) {
        return res.status(400).json({ message: "visitId و encounterType مطلوبان" });
      }
      const enc = await createEncounter({
        visitId,
        admissionId: admissionId ?? null,
        parentEncounterId: parentEncounterId ?? null,
        departmentId: departmentId ?? null,
        encounterType,
        doctorId: doctorId ?? null,
        metadata: metadata ?? null,
        createdBy: req.session.userId ?? null,
      });
      res.status(201).json(enc);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch("/api/encounters/:id/complete", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      const enc = await completeEncounter(req.params.id);
      res.json(enc);
    } catch (err: unknown) {
      const code = (err as any)?.statusCode ?? 500;
      res.status(code).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch("/api/encounters/:id/cancel", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      const enc = await cancelEncounter(req.params.id);
      res.json(enc);
    } catch (err: unknown) {
      const code = (err as any)?.statusCode ?? 500;
      res.status(code).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/encounters/:id/lines", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT pil.*, pih.invoice_number
        FROM patient_invoice_lines pil
        JOIN patient_invoice_headers pih ON pih.id = pil.header_id
        WHERE pil.encounter_id = ${req.params.id}
          AND pil.is_void = false
        ORDER BY pil.sort_order
      `);
      res.json(rows.rows);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });
}
