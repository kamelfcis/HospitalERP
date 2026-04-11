// ACCOUNTING_PENDING: Encounters create/transfer → no direct GL impact.
//   Financial impact flows through patient invoice lines linked via encounter_id.
//   GL entries are generated only at patient invoice finalization.

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
import { getVisitInvoiceSummary, refreshVisitAggregationCache } from "../services/invoice-aggregation";
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
        return res.status(400).json({
          message: "لا يمكن اعتماد الفاتورة",
          issues: guard.issues,
          warnings: guard.warnings,
          checks: guard.checks,
          paymentSummary: guard.paymentSummary,
        });
      }

      let invoiceId: string = "";

      await db.transaction(async (tx) => {
        const invRes = await tx.execute(sql`
          SELECT id, version FROM patient_invoice_headers
          WHERE visit_id = ${visitId} AND status = 'draft'
          ORDER BY created_at DESC LIMIT 1
          FOR UPDATE NOWAIT
        `);
        const inv = invRes.rows[0] as Record<string, unknown> | undefined;
        if (!inv) throw Object.assign(new Error("لا توجد فاتورة draft للاعتماد"), { statusCode: 404 });
        invoiceId = inv.id as string;

        await tx.execute(sql`
          UPDATE patient_invoice_headers
          SET status = 'finalizing', updated_at = NOW()
          WHERE id = ${invoiceId}
        `);
      });

      try {
        await db.transaction(async (tx) => {
          const lockRes = await tx.execute(sql`
            SELECT id, version FROM patient_invoice_headers
            WHERE id = ${invoiceId} AND status = 'finalizing'
            FOR UPDATE
          `);
          const lockedInv = lockRes.rows[0] as Record<string, unknown> | undefined;
          if (!lockedInv) throw Object.assign(new Error("الفاتورة لم تعد في حالة 'جاري الاعتماد'"), { statusCode: 409 });

          const snapshotRes = await tx.execute(sql`
            SELECT json_agg(row_to_json(pil)) AS lines_snapshot
            FROM patient_invoice_lines pil
            WHERE pil.header_id = ${invoiceId} AND pil.is_void = false
          `);
          const linesSnapshot = (snapshotRes.rows[0] as Record<string, unknown>)?.lines_snapshot ?? [];

          const livePayRes = await tx.execute(sql`
            SELECT COALESCE(SUM(amount::numeric), 0) AS paid FROM patient_invoice_payments WHERE header_id = ${invoiceId}
          `);
          const livePaid = parseFloat(String((livePayRes.rows[0] as Record<string, unknown>)?.paid ?? "0"));
          const liveNetRes = await tx.execute(sql`
            SELECT COALESCE(SUM(total_price::numeric), 0) AS net FROM patient_invoice_lines WHERE header_id = ${invoiceId} AND is_void = false
          `);
          const liveNet = parseFloat(String((liveNetRes.rows[0] as Record<string, unknown>)?.net ?? "0"));
          const liveRemaining = liveNet - livePaid;
          const liveClassification: string = Math.abs(liveRemaining) < 0.01 ? "fully_paid" : liveRemaining > 0.01 ? "accounts_receivable" : "refund_due";

          const encBreakdownRes = await tx.execute(sql`
            SELECT e.id AS encounter_id, e.encounter_type, e.department_id,
                   COUNT(pil.id) AS line_count,
                   COALESCE(SUM(pil.total_price::numeric), 0) AS net
            FROM encounters e
            LEFT JOIN patient_invoice_lines pil
              ON pil.encounter_id = e.id AND pil.header_id = ${invoiceId} AND pil.is_void = false
            WHERE e.visit_id = ${visitId} AND e.status != 'cancelled'
            GROUP BY e.id, e.encounter_type, e.department_id
          `);
          const encounterRevenue = (encBreakdownRes.rows as Array<Record<string, unknown>>).map(r => ({
            encounterId: r.encounter_id,
            encounterType: r.encounter_type,
            departmentId: r.department_id,
            lineCount: parseInt(String(r.line_count ?? "0")),
            net: parseFloat(String(r.net ?? "0")),
          }));

          const metadataPayload = {
            paymentClassification: liveClassification,
            remaining: Math.abs(liveRemaining) < 0.01 ? 0 : liveRemaining,
            payerBreakdown: guard.paymentSummary?.payerBreakdown ?? [],
            encounterRevenue,
            finalizedVia: "visit_finalization",
            visitId,
          };

          const currentVersion = parseInt(String(lockedInv.version ?? "1"));
          const updateRes = await tx.execute(sql`
            UPDATE patient_invoice_headers
            SET status = 'finalized',
                finalized_at = NOW(),
                finalized_snapshot_json = ${JSON.stringify({
                  lines: linesSnapshot,
                  metadata: metadataPayload,
                })}::jsonb,
                journal_status = 'pending',
                version = ${currentVersion + 1},
                updated_at = NOW()
            WHERE id = ${invoiceId} AND status = 'finalizing' AND version = ${currentVersion}
          `);
          if (updateRes.rowCount === 0) throw Object.assign(new Error("فشل الاعتماد: الفاتورة تم تعديلها بالتزامن"), { statusCode: 409 });

          console.log(`[FINALIZATION] visit=${visitId} invoice=${invoiceId} classification=${liveClassification} remaining=${metadataPayload.remaining} version=${currentVersion}→${currentVersion + 1} user=${req.session.userId}`);
        });
      } catch (err) {
        await db.execute(sql`
          UPDATE patient_invoice_headers
          SET status = 'draft', updated_at = NOW()
          WHERE id = ${invoiceId} AND status = 'finalizing'
        `);
        throw err;
      }

      void refreshVisitAggregationCache(visitId);
      const summary = await getVisitInvoiceSummary(visitId);
      res.json({
        success: true,
        paymentClassification: guard.paymentSummary?.classification,
        warnings: guard.warnings,
        summary,
      });
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
