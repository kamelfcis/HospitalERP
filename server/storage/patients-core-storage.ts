import { db, pool } from "../db";
import { eq, and, sql, or, asc, ilike } from "drizzle-orm";
import {
  patients,
  clinicAppointments,
  patientInvoiceHeaders,
  type Patient,
  type PatientSearchResult,
  type InsertPatient,
} from "@shared/schema";
import {
  normalizePatientIdentity,
  normalizeArabicName,
} from "../services/patient-dedup";
import type { DatabaseStorage } from "./index";

const methods = {

  async getPatients(this: DatabaseStorage, limit = 200): Promise<Patient[]> {
    return db.select().from(patients)
      .where(eq(patients.isActive, true))
      .orderBy(asc(patients.fullName))
      .limit(limit);
  },

  async searchPatients(this: DatabaseStorage, search: string): Promise<PatientSearchResult[]> {
    if (!search.trim()) {
      const rows = await this.getPatients();
      return rows.map(p => ({ ...p, isWalkIn: false }));
    }
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern     = token.includes('%') ? token : `%${token}%`;
      const normToken   = normalizeArabicName(token);
      const normPattern = normToken.includes('%') ? normToken : `%${normToken}%`;
      return or(
        ilike(patients.fullName, pattern),
        ilike(patients.normalizedFullName, normPattern),
        ilike(patients.phone, pattern),
        ilike(patients.nationalId, pattern),
        ilike(patients.patientCode, pattern),
      );
    });

    const registered = await db.select({
      id:          patients.id,
      patientCode: patients.patientCode,
      fullName:    patients.fullName,
      phone:       patients.phone,
      nationalId:  patients.nationalId,
      age:         patients.age,
      isActive:    patients.isActive,
      createdAt:   patients.createdAt,
    }).from(patients)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(patients.fullName))
      .limit(40);

    const registeredNorm = new Set(registered.map(p => normalizeArabicName(p.fullName).toLowerCase()));

    const walkInWhere: string[] = ["a.patient_id IS NULL"];
    const walkInParams: string[] = [];
    for (const token of tokens) {
      const normToken = normalizeArabicName(token);
      const idx1 = walkInParams.length + 1;
      walkInParams.push(`%${token}%`);
      const idx2 = walkInParams.length + 1;
      walkInParams.push(`%${normToken}%`);
      walkInWhere.push(`(a.patient_name ILIKE $${idx1} OR TRANSLATE(REPLACE(REPLACE(REPLACE(REPLACE(a.patient_name, 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي') ILIKE $${idx2})`);
    }
    const walkInSql = `
      SELECT DISTINCT ON (LOWER(TRIM(a.patient_name)))
        a.patient_name AS full_name,
        a.patient_phone AS phone
      FROM admissions a
      WHERE ${walkInWhere.join(" AND ")}
      ORDER BY LOWER(TRIM(a.patient_name))
      LIMIT 10
    `;
    const { rows: walkInRows } = await pool.query(walkInSql, walkInParams);

    const walkIns: PatientSearchResult[] = (walkInRows as { full_name: string; phone: string | null }[])
      .filter(r => !registeredNorm.has(normalizeArabicName(r.full_name).toLowerCase()))
      .map(r => ({
        id:          "",
        patientCode: null,
        fullName:    r.full_name,
        phone:       r.phone ?? null,
        nationalId:  null,
        age:         null,
        isActive:    false,
        createdAt:   new Date(),
        isWalkIn:    true,
      }));

    return [
      ...registered.map(p => ({ ...p, isWalkIn: false })),
      ...walkIns,
    ];
  },

  async getPatientStats(this: DatabaseStorage, filters?: { search?: string; dateFrom?: string; dateTo?: string; deptIds?: string[]; statusFilter?: string; page?: number; pageSize?: number }): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

    const page     = Math.max(1, filters?.page     ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters?.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const hasDateFilter = !!(filters?.dateFrom || filters?.dateTo);

    let effectiveDateFrom = filters?.dateFrom;
    let effectiveDateTo   = filters?.dateTo;
    if (!hasDateFilter) {
      const d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      effectiveDateFrom = d90.toISOString().slice(0, 10);
    }

    const rptConds: string[] = ["r.invoice_count > 0"];
    if (effectiveDateFrom) rptConds.push(`r.visit_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   rptConds.push(`r.visit_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map((d: string) => `'${d.replace(/'/g, "''")}'`).join(", ");
      rptConds.push(`r.department_id IN (${ids})`);
    }
    if (filters?.statusFilter === "draft")        rptConds.push(`r.latest_invoice_status = 'draft'`);
    if (filters?.statusFilter === "finalized")    rptConds.push(`r.latest_invoice_status = 'finalized' AND r.is_any_final_closed = false`);
    if (filters?.statusFilter === "final_closed") rptConds.push(`r.is_any_final_closed = true`);
    const rptFilter = rptConds.join(" AND ");

    const liRptConds: string[] = ["r2.invoice_count > 0"];
    if (effectiveDateFrom) liRptConds.push(`r2.visit_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   liRptConds.push(`r2.visit_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map((d: string) => `'${d.replace(/'/g, "''")}'`).join(", ");
      liRptConds.push(`r2.department_id IN (${ids})`);
    }
    if (filters?.statusFilter === "draft")        liRptConds.push(`r2.latest_invoice_status = 'draft'`);
    if (filters?.statusFilter === "finalized")    liRptConds.push(`r2.latest_invoice_status = 'finalized' AND r2.is_any_final_closed = false`);
    if (filters?.statusFilter === "final_closed") liRptConds.push(`r2.is_any_final_closed = true`);
    const liRptFilter = liRptConds.join(" AND ");

    let patientFilter = "p.is_active = true";
    if (filters?.search?.trim()) {
      const tokens = filters.search.trim().split(/\s+/).filter(Boolean);
      const conds = tokens.map((t: string) => {
        const pat = `'%${t.replace(/'/g, "''").replace(/%/g, "\\%")}%'`;
        return (
          `(p.full_name ILIKE ${pat}` +
          ` OR p.phone ILIKE ${pat}` +
          ` OR p.national_id ILIKE ${pat}` +
          ` OR EXISTS (` +
            `SELECT 1 FROM rpt_patient_visit_summary r3` +
            ` WHERE r3.patient_name = p.full_name` +
            ` AND r3.doctor_name ILIKE ${pat}` +
          `))`
        );
      });
      patientFilter += ` AND (${conds.join(" AND ")})`;
    }

    const result = await db.execute(sql`
      SELECT
        p.id,
        p.patient_code,
        p.full_name,
        p.phone,
        p.national_id,
        p.age,
        p.created_at,
        COALESCE(SUM(r.service_revenue),    0)   AS services_total,
        COALESCE(SUM(r.drug_revenue),       0)   AS drugs_total,
        COALESCE(SUM(r.consumable_revenue), 0)   AS consumables_total,
        COALESCE(SUM(r.or_room_total),      0)   AS or_room_total,
        COALESCE(SUM(r.stay_revenue),       0)   AS stay_total,
        COALESCE(SUM(r.equipment_revenue),  0)   AS equipment_total,
        COALESCE(SUM(r.gas_revenue),        0)   AS gas_total,
        COALESCE(SUM(r.net_amount),         0)   AS grand_total,
        COALESCE(SUM(r.total_paid),         0)   AS paid_total,
        COALESCE(SUM(r.transferred_total),  0)   AS transferred_total,
        COALESCE(SUM(r.company_share_total),0)   AS company_share_total,
        COALESCE(SUM(r.patient_share_total),0)   AS patient_share_total,
        COALESCE(SUM(r.outstanding_balance),0)   AS outstanding_total,
        li.latest_invoice_id,
        li.latest_invoice_number,
        li.latest_invoice_status,
        li.latest_doctor_name,
        li.latest_patient_type,
        li.latest_is_final_closed,
        COUNT(*) OVER()                          AS total_count
      FROM patients p
      JOIN rpt_patient_visit_summary r ON r.patient_name = p.full_name
      LEFT JOIN (
        SELECT DISTINCT ON (r2.patient_name)
          r2.patient_name,
          r2.latest_invoice_id,
          r2.latest_invoice_number,
          r2.latest_invoice_status,
          r2.latest_doctor_name,
          r2.patient_type                        AS latest_patient_type,
          r2.is_any_final_closed                 AS latest_is_final_closed
        FROM rpt_patient_visit_summary r2
        WHERE ${sql.raw(liRptFilter)}
        ORDER BY r2.patient_name,
                 r2.latest_invoice_created_at DESC NULLS LAST,
                 r2.latest_invoice_id DESC
      ) li ON li.patient_name = p.full_name
      WHERE ${sql.raw(patientFilter)}
        AND ${sql.raw(rptFilter)}
      GROUP BY p.id, p.patient_code, p.full_name, p.phone, p.national_id, p.age, p.created_at,
               li.latest_invoice_id, li.latest_invoice_number,
               li.latest_invoice_status, li.latest_doctor_name,
               li.latest_patient_type, li.latest_is_final_closed
      ORDER BY p.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const rawRows = result.rows as any[];
    const total   = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0;
    const rows    = rawRows.map(row => {
      const { total_count, ...rest } = row;
      return Object.fromEntries(Object.entries(rest).map(([k, v]) => [toCamel(k), v]));
    });

    return { rows, total, page, pageSize };
  },

  async getPatient(this: DatabaseStorage, id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  },

  async createPatient(this: DatabaseStorage, data: InsertPatient): Promise<Patient> {
    const norm = normalizePatientIdentity(data);
    const [p] = await db.insert(patients).values({
      ...data,
      normalizedFullName: norm.normalizedFullName || null,
      normalizedPhone: norm.normalizedPhone || null,
      normalizedNationalId: norm.normalizedNationalId || null,
    }).returning();
    return p;
  },

  async updatePatient(this: DatabaseStorage, id: string, data: Partial<InsertPatient>): Promise<Patient> {
    return db.transaction(async (tx) => {
      const [old] = await tx.select({ fullName: patients.fullName })
        .from(patients).where(eq(patients.id, id));

      const norm = normalizePatientIdentity(data);
      const normalizedData: Partial<InsertPatient> & {
        normalizedFullName?: string | null;
        normalizedPhone?: string | null;
        normalizedNationalId?: string | null;
      } = { ...data };
      if (data.fullName !== undefined) normalizedData.normalizedFullName = norm.normalizedFullName || null;
      if (data.phone !== undefined) normalizedData.normalizedPhone = norm.normalizedPhone || null;
      if (data.nationalId !== undefined) normalizedData.normalizedNationalId = norm.normalizedNationalId || null;

      const [updated] = await tx.update(patients).set(normalizedData).where(eq(patients.id, id)).returning();

      if (data.fullName && old?.fullName && data.fullName !== old.fullName) {
        await tx.execute(sql`
          UPDATE patient_invoice_headers
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
        await tx.execute(sql`
          UPDATE admissions
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
      }

      return updated;
    });
  },

  async getPatientJourney(this: DatabaseStorage, patientId: string): Promise<Record<string, unknown> | null> {
    return this.getPatientTimeline(patientId);
  },

  async getPatientTimeline(this: DatabaseStorage, patientId: string): Promise<Record<string, unknown> | null> {
    const patientRes = await db.execute(sql`
      SELECT id, patient_code, full_name, phone, national_id, age, created_at
      FROM patients WHERE id = ${patientId}
    `);
    if (!patientRes.rows.length) return null;
    const patient = patientRes.rows[0] as Record<string, unknown>;

    const summaryRes = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM clinic_appointments
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))::int AS total_clinic_visits,
        (SELECT COUNT(*) FROM admissions
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))::int AS total_admissions,
        (SELECT COUNT(*) FROM patient_invoice_headers
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))::int AS total_invoices,
        COALESCE((SELECT SUM(net_amount) FROM patient_invoice_headers
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})), 0) AS total_billed,
        COALESCE((SELECT SUM(paid_amount) FROM patient_invoice_headers
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})), 0) AS total_paid,
        (SELECT MIN(appointment_date) FROM clinic_appointments
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})) AS first_visit_date,
        GREATEST(
          (SELECT MAX(appointment_date) FROM clinic_appointments
            WHERE patient_id = ${patientId}
               OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})),
          (SELECT MAX(admission_date) FROM admissions
            WHERE patient_id = ${patientId}
               OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))
        ) AS last_activity_date
    `);
    const s = summaryRes.rows[0] as Record<string, unknown>;
    const totalBilled = parseFloat(String(s.total_billed || "0"));
    const totalPaid   = parseFloat(String(s.total_paid   || "0"));

    const summary = {
      totalClinicVisits: Number(s.total_clinic_visits) || 0,
      totalAdmissions:   Number(s.total_admissions)    || 0,
      totalInvoices:     Number(s.total_invoices)      || 0,
      totalBilled,
      totalPaid,
      totalOutstanding:  Math.max(0, totalBilled - totalPaid),
      firstVisitDate:    s.first_visit_date   ?? null,
      lastActivityDate:  s.last_activity_date ?? null,
    };

    const clinicRes = await db.execute(sql`
      SELECT
        a.id AS event_id,
        a.appointment_date AS event_date,
        a.turn_number,
        a.status,
        cl.name_ar AS location,
        d.name AS doctor_name,
        c.id AS consultation_id,
        c.chief_complaint,
        c.diagnosis,
        c.notes AS consultation_notes,
        c.consultation_fee,
        c.final_amount AS amount,
        c.payment_status
      FROM clinic_appointments a
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN clinic_consultations c ON c.appointment_id = a.id
      WHERE a.patient_id = ${patientId}
         OR (a.patient_id IS NULL AND a.patient_name = ${patient.full_name as string})
      ORDER BY a.appointment_date DESC, a.turn_number DESC
      LIMIT 100
    `);

    const admissionRes = await db.execute(sql`
      SELECT
        adm.id AS event_id,
        adm.admission_date AS event_date,
        adm.admission_number,
        adm.discharge_date,
        adm.status,
        adm.doctor_name,
        adm.payment_type,
        adm.notes,
        r.name_ar AS room_name,
        f.name_ar AS floor_name
      FROM admissions adm
      LEFT JOIN beds b ON b.current_admission_id = adm.id
      LEFT JOIN rooms r ON r.id = b.room_id
      LEFT JOIN floors f ON f.id = r.floor_id
      WHERE adm.patient_id = ${patientId}
         OR (adm.patient_id IS NULL AND adm.patient_name = ${patient.full_name as string})
      ORDER BY adm.admission_date DESC
      LIMIT 50
    `);

    const invoiceRes = await db.execute(sql`
      SELECT
        pih.id AS event_id,
        pih.invoice_date AS event_date,
        pih.invoice_number,
        pih.net_amount AS amount,
        pih.paid_amount,
        pih.status,
        pih.patient_type,
        pih.admission_id,
        pih.created_at,
        ca.id            AS appointment_id,
        ca.status        AS apt_status,
        ca.payment_type,
        ca.accounting_posted_advance,
        ca.accounting_posted_revenue,
        cl.name_ar       AS clinic_name,
        dr.name          AS doctor_name,
        dp.name_ar       AS department_name
      FROM patient_invoice_headers pih
      LEFT JOIN clinic_appointments ca ON ca.invoice_id = pih.id
      LEFT JOIN clinic_clinics      cl ON cl.id = ca.clinic_id
      LEFT JOIN doctors             dr ON dr.id = ca.doctor_id
      LEFT JOIN departments         dp ON dp.id = cl.department_id
      WHERE (
        pih.patient_id = ${patientId}
        OR (pih.patient_id IS NULL AND pih.patient_name = ${patient.full_name as string})
      )
        AND pih.admission_id IS NULL
      ORDER BY pih.invoice_date DESC
      LIMIT 100
    `);

    const clinicEvents: Array<Record<string, unknown>> = [];
    for (const row of clinicRes.rows as Array<Record<string, unknown>>) {
      const consultId = row.consultation_id as string | null;
      let drugs: Array<Record<string, unknown>> = [];
      let serviceOrders: Array<Record<string, unknown>> = [];

      if (consultId) {
        const drugRows = await db.execute(sql`
          SELECT drug_name, dose, frequency, duration, quantity, unit_level
          FROM clinic_consultation_drugs WHERE consultation_id = ${consultId} ORDER BY line_no
        `);
        drugs = drugRows.rows as Array<Record<string, unknown>>;

        const orderRows = await db.execute(sql`
          SELECT order_type, service_name_manual, target_name, status, executed_at, quantity, unit_price
          FROM clinic_orders WHERE consultation_id = ${consultId} ORDER BY created_at
        `);
        serviceOrders = orderRows.rows as Array<Record<string, unknown>>;
      }

      clinicEvents.push({
        eventType:     "clinic_visit",
        eventId:       row.event_id,
        eventDate:     row.event_date,
        location:      row.location,
        doctorName:    row.doctor_name,
        turnNumber:    row.turn_number,
        status:        row.status,
        consultation:  consultId ? {
          id:              consultId,
          chiefComplaint:  row.chief_complaint,
          diagnosis:       row.diagnosis,
          notes:           row.consultation_notes,
          consultationFee: row.consultation_fee,
          finalAmount:     row.amount,
          paymentStatus:   row.payment_status,
        } : null,
        drugs,
        serviceOrders,
      });
    }

    const admissionEvents = (admissionRes.rows as Array<Record<string, unknown>>).map(row => {
      const room  = row.room_name  ? String(row.room_name)  : null;
      const floor = row.floor_name ? String(row.floor_name) : null;
      const location = [room, floor].filter(Boolean).join(" — ") || null;
      return {
        eventType:       "admission",
        eventId:         row.event_id,
        eventDate:       row.event_date,
        admissionNumber: row.admission_number,
        dischargeDate:   row.discharge_date,
        status:          row.status,
        doctorName:      row.doctor_name,
        location,
        notes:           row.notes,
        paymentType:     row.payment_type,
      };
    });

    const invoiceEvents = (invoiceRes.rows as Array<Record<string, unknown>>).map(row => ({
      eventType:                "invoice",
      eventId:                  row.event_id,
      eventDate:                row.event_date,
      invoiceNumber:            row.invoice_number,
      amount:                   row.amount,
      paidAmount:               row.paid_amount,
      status:                   row.status,
      patientType:              row.patient_type,
      createdAt:                row.created_at,
      appointmentId:            row.appointment_id,
      aptStatus:                row.apt_status,
      paymentType:              row.payment_type,
      accountingPostedAdvance:  row.accounting_posted_advance,
      accountingPostedRevenue:  row.accounting_posted_revenue,
      clinicName:               row.clinic_name,
      doctorName:               row.doctor_name,
      departmentName:           row.department_name,
    }));

    const allEvents = [...clinicEvents, ...admissionEvents, ...invoiceEvents].sort((a, b) => {
      const da = String(a.eventDate || "");
      const db2 = String(b.eventDate || "");
      return db2.localeCompare(da);
    });

    return {
      patient: {
        id:          patient.id,
        patientCode: patient.patient_code,
        fullName:    patient.full_name,
        phone:       patient.phone,
        nationalId:  patient.national_id,
        age:         patient.age,
        createdAt:   patient.created_at,
      },
      summary,
      events: allEvents,
      visits: clinicEvents,
    };
  },

  async getPatientPreviousConsultations(
    this: DatabaseStorage,
    patientId: string,
    limit: number = 5,
    allowedClinicIds?: string[] | null,
    offset: number = 0,
    excludeAppointmentId?: string | null
  ): Promise<{ data: Array<Record<string, unknown>>; hasMore: boolean }> {
    const clinicCond =
      allowedClinicIds && allowedClinicIds.length > 0
        ? sql`AND a.clinic_id = ANY(${allowedClinicIds}::varchar[])`
        : sql``;

    const excludeCond = excludeAppointmentId
      ? sql`AND a.id != ${excludeAppointmentId}`
      : sql``;

    const fetchLimit = limit + 1;

    const rows = await db.execute(sql`
      SELECT
        c.id,
        c.chief_complaint,
        c.diagnosis,
        c.notes,
        c.follow_up_plan,
        c.follow_up_after_days,
        c.follow_up_reason,
        c.suggested_follow_up_date,
        c.consultation_fee,
        c.discount_value,
        c.final_amount,
        c.payment_status,
        c.created_at,
        COALESCE(a.appointment_date::text, c.created_at::date::text) AS visit_date,
        a.turn_number,
        d.name AS doctor_name,
        cl.name_ar AS clinic_name,
        COALESCE(drugs_agg.drugs, '[]'::json) AS drugs,
        COALESCE(orders_agg.service_count, 0) AS service_count,
        COALESCE(orders_agg.pharmacy_count, 0) AS pharmacy_count
      FROM clinic_consultations c
      JOIN clinic_appointments a ON a.id = c.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      LEFT JOIN (
        SELECT
          consultation_id,
          json_agg(json_build_object(
            'drug_name', drug_name,
            'dose', dose,
            'frequency', frequency,
            'duration', duration
          ) ORDER BY line_no) AS drugs
        FROM clinic_consultation_drugs
        GROUP BY consultation_id
      ) drugs_agg ON drugs_agg.consultation_id = c.id
      LEFT JOIN (
        SELECT
          consultation_id,
          COUNT(*) FILTER (WHERE order_type = 'service')  AS service_count,
          COUNT(*) FILTER (WHERE order_type = 'pharmacy') AS pharmacy_count
        FROM clinic_orders
        WHERE status != 'cancelled'
        GROUP BY consultation_id
      ) orders_agg ON orders_agg.consultation_id = c.id
      WHERE a.patient_id = ${patientId}
        ${clinicCond}
        ${excludeCond}
      ORDER BY COALESCE(a.appointment_date, c.created_at::date) DESC, c.created_at DESC
      LIMIT ${fetchLimit}
      OFFSET ${offset}
    `);

    const all = rows.rows as Array<Record<string, unknown>>;
    const hasMore = all.length > limit;
    const data = hasMore ? all.slice(0, limit) : all;
    return { data, hasMore };
  },

  async deletePatient(this: DatabaseStorage, id: string): Promise<boolean> {
    const [patient] = await db.select({ fullName: patients.fullName }).from(patients).where(eq(patients.id, id));
    if (!patient) throw new Error("المريض غير موجود");

    const check = await db.execute(sql`
      SELECT COALESCE(SUM(net_amount), 0) AS total
      FROM patient_invoice_headers
      WHERE patient_name = ${patient.fullName}
        AND status != 'cancelled'
    `);
    const total = parseFloat((check.rows[0] as any)?.total ?? "0");
    if (total > 0) {
      throw new Error("لا يمكن حذف المريض لوجود فواتير بقيمة غير صفرية");
    }

    await db.update(patients).set({ isActive: false }).where(eq(patients.id, id));
    return true;
  },

  async checkPatientInScope(
    this: DatabaseStorage,
    patientId: string,
    forcedDeptIds: string[] | null,
  ): Promise<boolean> {
    if (forcedDeptIds === null) return true;
    if (forcedDeptIds.length === 0) return false;

    const byId = await db.execute(sql`
      SELECT 1 FROM patient_invoice_headers pih
      WHERE pih.patient_id = ${patientId}
        AND pih.department_id = ANY(${forcedDeptIds}::text[])
        AND pih.status != 'cancelled'
      LIMIT 1
    `);
    if (byId.rows.length > 0) return true;

    const byName = await db.execute(sql`
      SELECT 1 FROM patient_invoice_headers pih
      JOIN patients p ON p.full_name = pih.patient_name
      WHERE p.id = ${patientId}
        AND pih.department_id = ANY(${forcedDeptIds}::text[])
        AND pih.status != 'cancelled'
      LIMIT 1
    `);
    return byName.rows.length > 0;
  },

  async checkInvoiceInScope(
    this: DatabaseStorage,
    invoiceId: string,
    forcedDeptIds: string[] | null,
  ): Promise<boolean> {
    if (forcedDeptIds === null) return true;
    if (forcedDeptIds.length === 0) return false;

    const result = await db.execute(sql`
      SELECT 1 FROM patient_invoice_headers
      WHERE id = ${invoiceId}
        AND department_id = ANY(${forcedDeptIds}::text[])
      LIMIT 1
    `);
    return result.rows.length > 0;
  },

};

export default methods;
