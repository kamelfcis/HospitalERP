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
import { getVisitInvoiceSummary } from "../services/invoice-aggregation";
import { runFinalizationGuard } from "../services/finalization-guard";
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

  app.get("/api/visits/:visitId/invoice-summary", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const summary = await getVisitInvoiceSummary(req.params.visitId);
      res.json(summary);
    } catch (err: unknown) {
      const code = (err as any)?.statusCode ?? 500;
      res.status(code).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/visits/:visitId/finalization-check", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const result = await runFinalizationGuard(req.params.visitId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/visits/:visitId/finalize-invoice", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      const visitId = req.params.visitId;

      const guard = await runFinalizationGuard(visitId);
      if (!guard.canFinalize) {
        return res.status(400).json({ message: "لا يمكن اعتماد الفاتورة", issues: guard.issues, checks: guard.checks });
      }

      await db.transaction(async (tx) => {
        const invRes = await tx.execute(sql`
          SELECT id FROM patient_invoice_headers
          WHERE visit_id = ${visitId} AND status = 'draft'
          ORDER BY created_at DESC LIMIT 1
          FOR UPDATE
        `);
        const invoiceId = (invRes.rows[0] as Record<string, unknown>)?.id as string;
        if (!invoiceId) throw Object.assign(new Error("لا توجد فاتورة draft للاعتماد"), { statusCode: 404 });

        const snapshotRes = await tx.execute(sql`
          SELECT json_agg(row_to_json(pil)) AS lines_snapshot
          FROM patient_invoice_lines pil
          WHERE pil.header_id = ${invoiceId} AND pil.is_void = false
        `);
        const linesSnapshot = (snapshotRes.rows[0] as Record<string, unknown>)?.lines_snapshot ?? [];

        await tx.execute(sql`
          UPDATE patient_invoice_headers
          SET status = 'finalized',
              finalized_at = NOW(),
              finalized_snapshot_json = ${JSON.stringify(linesSnapshot)}::jsonb,
              journal_status = 'pending',
              version = version + 1,
              updated_at = NOW()
          WHERE id = ${invoiceId}
        `);

        console.log(`[FINALIZATION] visit=${visitId} invoice=${invoiceId} finalized by user=${req.session.userId}`);
      });

      const summary = await getVisitInvoiceSummary(visitId);
      res.json({ success: true, summary });
    } catch (err: unknown) {
      const code = (err as any)?.statusCode ?? 500;
      res.status(code).json({ message: err instanceof Error ? err.message : String(err) });
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
