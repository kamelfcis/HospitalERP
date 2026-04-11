import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerPatientVisitsRoutes(app: Express) {

  app.post("/api/patient-visits", requireAuth, checkPermission(PERMISSIONS.PATIENTS_CREATE), async (req, res) => {
    try {
      const userId = (req.session as any)?.userId as string | undefined;
      const { patientId, visitType, requestedService, departmentId, notes } = req.body;
      if (!patientId?.trim()) return res.status(400).json({ message: "يجب تحديد المريض" });
      if (!["inpatient","outpatient"].includes(visitType)) return res.status(400).json({ message: "نوع الزيارة غير صحيح" });

      const cntRes = await db.execute(sql`SELECT COUNT(*) AS cnt FROM patient_visits`);
      const seq = parseInt((cntRes.rows[0] as Record<string,unknown>)?.cnt as string ?? "0") + 1;
      const visitNumber = `VIS-${String(seq).padStart(6,"0")}`;

      const row = await db.execute(sql`
        INSERT INTO patient_visits (id, visit_number, patient_id, visit_type, requested_service, department_id, status, notes, created_by, created_at, updated_at)
        VALUES (gen_random_uuid(), ${visitNumber}, ${patientId}, ${visitType}, ${requestedService || null}, ${departmentId || null}, 'open', ${notes || null}, ${userId || null}, NOW(), NOW())
        RETURNING *
      `);
      return res.status(201).json(row.rows[0]);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/patient-visits", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { date, visitType, status, deptId, search } = req.query as Record<string,string>;
      const today = date || new Date().toISOString().split("T")[0];

      const userId = (req.session as { userId?: string }).userId!;
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "admin" || user?.role === "owner";

      let clinicDeptFilter = sql``;
      if (!isAdmin) {
        const clinicIds = await storage.getUserClinicIds(userId);
        if (clinicIds.length > 0) {
          const clinicDeptRows = await db.execute(sql`
            SELECT DISTINCT department_id FROM clinic_clinics
            WHERE id = ANY(ARRAY[${sql.join(clinicIds.map(id => sql`${id}`), sql`, `)}]::text[])
              AND department_id IS NOT NULL
          `);
          const deptIds = (clinicDeptRows.rows as Array<{ department_id: string }>).map(r => r.department_id);
          if (deptIds.length > 0) {
            clinicDeptFilter = sql`AND (pv.department_id IS NULL OR pv.department_id = ANY(ARRAY[${sql.join(deptIds.map(id => sql`${id}`), sql`, `)}]::text[]))`;
          } else {
            clinicDeptFilter = sql`AND pv.department_id IS NULL`;
          }
        }
      }

      const rows = await db.execute(sql`
        SELECT
          pv.*,
          p.full_name   AS patient_name,
          p.patient_code,
          p.phone       AS patient_phone,
          d.name_ar     AS department_name
        FROM patient_visits pv
        JOIN patients p ON p.id = pv.patient_id
        LEFT JOIN departments d ON d.id = pv.department_id
        WHERE DATE(pv.created_at) = ${today}::date
          ${clinicDeptFilter}
          ${visitType ? sql`AND pv.visit_type = ${visitType}` : sql``}
          ${status ? sql`AND pv.status = ${status}` : sql``}
          ${deptId ? sql`AND pv.department_id = ${deptId}` : sql``}
          ${search ? sql`AND (p.full_name ILIKE ${'%' + search + '%'} OR p.phone ILIKE ${'%' + search + '%'} OR p.patient_code ILIKE ${'%' + search + '%'})` : sql``}
        ORDER BY pv.created_at DESC
        LIMIT 200
      `);
      return res.json(rows.rows);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/patients/:id/visits", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await db.execute(sql`
        SELECT pv.*,
          d.name_ar AS department_name,
          a.doctor_name,
          a.notes     AS admission_notes,
          a.admission_date,
          a.discharge_date,
          a.admission_number,
          a.patient_name AS admission_patient_name,
          a.created_at  AS admission_created_at,
          a.updated_at  AS admission_updated_at
        FROM patient_visits pv
        LEFT JOIN departments d ON d.id = pv.department_id
        LEFT JOIN admissions  a ON a.id = pv.admission_id
        WHERE pv.patient_id = ${id}
        ORDER BY pv.created_at DESC
        LIMIT 100
      `);
      return res.json(rows.rows);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch("/api/patient-visits/:id/status", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { status } = req.body;
      if (!["open","in_progress","completed","cancelled"].includes(status)) {
        return res.status(400).json({ message: "حالة غير صحيحة" });
      }
      const row = await db.execute(sql`
        UPDATE patient_visits SET status = ${status}, updated_at = NOW()
        WHERE id = ${req.params.id}
        RETURNING *
      `);
      if (!row.rows.length) return res.status(404).json({ message: "الزيارة غير موجودة" });
      return res.json(row.rows[0]);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/backfill-pharmacy-invoice-patients", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        WITH matched AS (
          SELECT
            sih.id   AS invoice_id,
            p.id     AS patient_id,
            COUNT(*) OVER (PARTITION BY sih.id) AS match_count
          FROM sales_invoice_headers sih
          JOIN patients p
            ON LOWER(TRIM(p.full_name)) = LOWER(TRIM(sih.customer_name))
           AND p.is_active = true
          WHERE sih.patient_id IS NULL
            AND sih.customer_name IS NOT NULL
            AND TRIM(sih.customer_name) <> ''
        )
        UPDATE sales_invoice_headers sih
        SET patient_id = m.patient_id,
            updated_at = NOW()
        FROM matched m
        WHERE sih.id = m.invoice_id
          AND m.match_count = 1
        RETURNING sih.id
      `);
      const updated = (result as any).rows?.length ?? 0;
      return res.json({ updated, message: `تم ربط ${updated} فاتورة بملف المريض بنجاح` });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });
}
