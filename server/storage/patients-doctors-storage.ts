import { db } from "../db";
import { eq, and, sql, or, asc, ilike, ne, isNull } from "drizzle-orm";
import {
  patients,
  doctors,
  admissions,
  clinicAppointments,
  patientMergeAudit,
  patientAliases,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  doctorTransfers,
  doctorSettlementAllocations,
  type Patient,
  type InsertPatient,
  type Doctor,
  type InsertDoctor,
  type Admission,
  type InsertAdmission,
  type PatientInvoiceHeader,
} from "@shared/schema";
import {
  normalizePatientIdentity,
  scoreCandidateMatch,
  scoreToStatus,
  statusToRecommendedAction,
  DEDUP_BLOCK_THRESHOLD,
  DEDUP_WARN_THRESHOLD,
  type DuplicateCandidate,
  type DuplicateCheckResult,
} from "../services/patient-dedup";
import type { DatabaseStorage } from "./index";

const methods = {

  async getPatients(this: DatabaseStorage, limit = 200): Promise<Patient[]> {
    return db.select().from(patients)
      .where(eq(patients.isActive, true))
      .orderBy(asc(patients.fullName))
      .limit(limit);
  },

  async searchPatients(this: DatabaseStorage, search: string): Promise<Patient[]> {
    if (!search.trim()) return this.getPatients();
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern = token.includes('%') ? token : `%${token}%`;
      return or(
        ilike(patients.fullName, pattern),
        ilike(patients.phone, pattern),
        ilike(patients.nationalId, pattern),
      );
    });
    return db.select().from(patients)
      .where(and(eq(patients.isActive, true), ...conditions.filter(Boolean)))
      .orderBy(asc(patients.fullName))
      .limit(50);
  },

  async getPatientStats(this: DatabaseStorage, filters?: { search?: string; dateFrom?: string; dateTo?: string; deptIds?: string[]; page?: number; pageSize?: number }): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
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

    const invConds: string[] = ["pih.status != 'cancelled'"];
    if (effectiveDateFrom) invConds.push(`pih.invoice_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   invConds.push(`pih.invoice_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map(d => `'${d.replace(/'/g, "''")}'`).join(", ");
      invConds.push(
        `(pih.department_id IN (${ids}) OR (pih.department_id IS NULL AND EXISTS (` +
        `SELECT 1 FROM warehouses w WHERE w.id = pih.warehouse_id AND w.department_id IN (${ids})` +
        `)))`
      );
    }
    const invFilter = invConds.join(" AND ");

    // فلتر "أحدث فاتورة" — نفس شروط التاريخ والحالة بدون alias pih.
    // يُستخدم في subquery منفصلة مع DISTINCT ON بدلاً من ARRAY_AGG
    const liConds: string[] = ["li2.status != 'cancelled'"];
    if (effectiveDateFrom) liConds.push(`li2.invoice_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   liConds.push(`li2.invoice_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map((d: string) => `'${d.replace(/'/g, "''")}'`).join(", ");
      liConds.push(
        `(li2.department_id IN (${ids}) OR (li2.department_id IS NULL AND EXISTS (` +
        `SELECT 1 FROM warehouses w WHERE w.id = li2.warehouse_id AND w.department_id IN (${ids})` +
        `)))`
      );
    }
    const liFilter = liConds.join(" AND ");

    const joinType = "JOIN";

    let patientFilter = "p.is_active = true";
    if (filters?.search?.trim()) {
      const tokens = filters.search.trim().split(/\s+/).filter(Boolean);
      const conds = tokens.map((t: string) => {
        const pat = `'%${t.replace(/'/g, "''").replace(/%/g, "\\%")}%'`;
        return (
          `(p.full_name ILIKE ${pat}` +
          ` OR p.phone ILIKE ${pat}` +
          ` OR EXISTS (` +
            `SELECT 1 FROM patient_invoice_headers pih2` +
            ` WHERE pih2.patient_name = p.full_name` +
            ` AND pih2.doctor_name ILIKE ${pat}` +
          `))`
        );
      });
      patientFilter += ` AND (${conds.join(" AND ")})`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // الاستعلام المحسَّن:
    //   1. dt_agg: تجميع doctor_transfers مُسبقاً (بدلاً من correlated subquery
    //      لكل فاتورة — يُلغي N+1 على جدول doctor_transfers)
    //   2. li_agg: DISTINCT ON لأحدث فاتورة لكل مريض (بدلاً من 4×ARRAY_AGG)
    //
    // سبب عدم الاعتماد الكامل على rpt_patient_visit_summary:
    //   الـ rpt يغطي الإقامات فقط (6 فواتير من 55 غير ملغاة). 15 مريضاً من 18
    //   لديهم فواتير مستقلة (صيدلية / عيادة) غير مربوطة بإقامة → migration
    //   كامل إلى rpt ستُضيّع 83% من المرضى. يبقى هذا على base tables مع إزالة
    //   الأنماط المكلفة (correlated subquery + ARRAY_AGG).
    // ─────────────────────────────────────────────────────────────────────────
    const result = await db.execute(sql`
      SELECT
        p.id,
        p.patient_code,
        p.full_name,
        p.phone,
        p.national_id,
        p.age,
        p.created_at,
        COALESCE(s.services_total, 0)      AS services_total,
        COALESCE(s.drugs_total, 0)         AS drugs_total,
        COALESCE(s.consumables_total, 0)   AS consumables_total,
        COALESCE(s.or_room_total, 0)       AS or_room_total,
        COALESCE(s.stay_total, 0)          AS stay_total,
        COALESCE(s.services_total, 0) + COALESCE(s.drugs_total, 0) +
          COALESCE(s.consumables_total, 0) + COALESCE(s.or_room_total, 0) +
          COALESCE(s.stay_total, 0)        AS grand_total,
        COALESCE(s.paid_total, 0)          AS paid_total,
        COALESCE(s.transferred_total, 0)   AS transferred_total,
        li_agg.id                          AS latest_invoice_id,
        li_agg.invoice_number              AS latest_invoice_number,
        li_agg.status                      AS latest_invoice_status,
        li_agg.doctor_name                 AS latest_doctor_name,
        COUNT(*) OVER()                    AS total_count
      FROM patients p
      ${sql.raw(joinType)} (
        SELECT
          inv.patient_name,
          SUM(inv.services_total)               AS services_total,
          SUM(inv.drugs_total)                  AS drugs_total,
          SUM(inv.consumables_total)            AS consumables_total,
          SUM(inv.or_room_total)                AS or_room_total,
          SUM(inv.stay_total)                   AS stay_total,
          SUM(inv.paid_amount)                  AS paid_total,
          COALESCE(SUM(inv.transferred_total), 0) AS transferred_total
        FROM (
          SELECT
            pih.id,
            pih.patient_name,
            pih.paid_amount,
            -- transferred_total: مُجمَّع مُسبقاً عبر JOIN بدلاً من correlated subquery
            COALESCE(dt_agg.invoice_transferred, 0)                         AS transferred_total,
            SUM(CASE WHEN pil.source_type IS NULL AND pil.line_type = 'service'
                     AND pil.is_void = false
                THEN pil.total_price::numeric ELSE 0 END)                   AS services_total,
            SUM(CASE WHEN pil.line_type = 'drug' AND pil.is_void = false
                THEN pil.total_price::numeric ELSE 0 END)                   AS drugs_total,
            SUM(CASE WHEN pil.line_type = 'consumable' AND pil.is_void = false
                THEN pil.total_price::numeric ELSE 0 END)                   AS consumables_total,
            SUM(CASE WHEN pil.source_type = 'OR_ROOM' AND pil.is_void = false
                THEN pil.total_price::numeric ELSE 0 END)                   AS or_room_total,
            SUM(CASE WHEN pil.source_type = 'STAY_ENGINE' AND pil.is_void = false
                THEN pil.total_price::numeric ELSE 0 END)                   AS stay_total
          FROM patient_invoice_headers pih
          LEFT JOIN patient_invoice_lines pil
            ON pil.header_id = pih.id
          -- تجميع doctor_transfers مُسبقاً — يُلغي N+1 correlated subquery
          LEFT JOIN (
            SELECT invoice_id, SUM(amount::numeric) AS invoice_transferred
            FROM doctor_transfers
            GROUP BY invoice_id
          ) dt_agg ON dt_agg.invoice_id = pih.id
          WHERE ${sql.raw(invFilter)}
          GROUP BY pih.id, pih.patient_name, pih.paid_amount,
                   dt_agg.invoice_transferred
        ) inv
        GROUP BY inv.patient_name
      ) s ON s.patient_name = p.full_name
      -- أحدث فاتورة لكل مريض — DISTINCT ON بدلاً من 4×ARRAY_AGG
      -- tie-breaker: id DESC يضمن حتمية النتائج عند تساوي created_at
      LEFT JOIN (
        SELECT DISTINCT ON (li2.patient_name)
          li2.patient_name,
          li2.id,
          li2.invoice_number,
          li2.status,
          li2.doctor_name
        FROM patient_invoice_headers li2
        WHERE ${sql.raw(liFilter)}
        ORDER BY li2.patient_name, li2.created_at DESC, li2.id DESC
      ) li_agg ON li_agg.patient_name = s.patient_name
      WHERE ${sql.raw(patientFilter)}
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
        pih.admission_id
      FROM patient_invoice_headers pih
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
      eventType:     "invoice",
      eventId:       row.event_id,
      eventDate:     row.event_date,
      invoiceNumber: row.invoice_number,
      amount:        row.amount,
      paidAmount:    row.paid_amount,
      status:        row.status,
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

  async getPatientPreviousConsultations(this: DatabaseStorage, patientId: string, limit: number = 5): Promise<Array<Record<string, unknown>>> {
    const rows = await db.execute(sql`
      SELECT
        c.id,
        c.chief_complaint,
        c.diagnosis,
        c.notes,
        c.consultation_fee,
        c.discount_value,
        c.final_amount,
        c.payment_status,
        c.created_at,
        a.appointment_date,
        a.turn_number,
        d.name AS doctor_name,
        cl.name_ar AS clinic_name
      FROM clinic_consultations c
      JOIN clinic_appointments a ON a.id = c.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      WHERE a.patient_id = ${patientId}
      ORDER BY a.appointment_date DESC, a.turn_number DESC
      LIMIT ${limit}
    `);

    const result = [];
    for (const row of rows.rows as Array<Record<string, unknown>>) {
      const consultationId = row.id as string;
      const drugRes = await db.execute(sql`
        SELECT drug_name, dose, frequency, duration, quantity
        FROM clinic_consultation_drugs WHERE consultation_id = ${consultationId} ORDER BY line_no
      `);
      result.push({ ...row, drugs: drugRes.rows });
    }
    return result;
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

  async getDoctors(this: DatabaseStorage, includeInactive?: boolean): Promise<Doctor[]> {
    if (includeInactive) {
      return db.select().from(doctors).orderBy(asc(doctors.name));
    }
    return db.select().from(doctors).where(eq(doctors.isActive, true)).orderBy(asc(doctors.name));
  },

  async searchDoctors(this: DatabaseStorage, search: string): Promise<Doctor[]> {
    if (!search.trim()) return this.getDoctors();
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern = token.includes('%') ? token : `%${token}%`;
      return or(
        ilike(doctors.name, pattern),
        ilike(doctors.specialty, pattern),
      );
    });
    return db.select().from(doctors)
      .where(and(eq(doctors.isActive, true), ...conditions.filter(Boolean) as any))
      .orderBy(asc(doctors.name))
      .limit(50);
  },

  async getDoctorBalances(this: DatabaseStorage): Promise<{ id: string; name: string; specialty: string | null; totalTransferred: string; totalSettled: string; remaining: string }[]> {
    const res = await db.execute(sql`
      SELECT
        d.id, d.name, d.specialty,
        COALESCE(SUM(DISTINCT dt.amount), 0)::text                              AS total_transferred,
        COALESCE((
          SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
          JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
          WHERE dt2.doctor_name = d.name
        ), 0)::text                                                              AS total_settled,
        (
          COALESCE(SUM(dt.amount), 0) - COALESCE((
            SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
            JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
            WHERE dt2.doctor_name = d.name
          ), 0)
        )::text                                                                  AS remaining
      FROM doctors d
      LEFT JOIN doctor_transfers dt ON dt.doctor_name = d.name
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.specialty
      ORDER BY d.name ASC
    `);
    return (res.rows as any[]).map(r => ({
      id: r.id,
      name: r.name,
      specialty: r.specialty,
      totalTransferred: r.total_transferred,
      totalSettled: r.total_settled,
      remaining: r.remaining,
    }));
  },

  async getDoctorStatement(this: DatabaseStorage, params: { doctorName: string; dateFrom?: string; dateTo?: string }): Promise<any[]> {
    const { doctorName, dateFrom, dateTo } = params;
    const dateFromFilter = dateFrom ? sql`AND dt.transferred_at::date >= ${dateFrom}::date` : sql``;
    const dateToFilter   = dateTo   ? sql`AND dt.transferred_at::date <= ${dateTo}::date`   : sql``;
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id        AS "invoiceId",
        dt.doctor_name       AS "doctorName",
        dt.amount::text      AS amount,
        dt.transferred_at    AS "transferredAt",
        dt.notes,
        COALESCE(SUM(dsa.amount), 0)::text              AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining,
        pi.patient_name      AS "patientName",
        pi.invoice_date      AS "invoiceDate",
        pi.net_amount::text  AS "invoiceTotal",
        pi.status            AS "invoiceStatus"
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      LEFT JOIN patient_invoice_headers pi ON pi.id = dt.invoice_id
      WHERE dt.doctor_name = ${doctorName}
      ${dateFromFilter}
      ${dateToFilter}
      GROUP BY dt.id, pi.id, pi.patient_name, pi.invoice_date, pi.net_amount, pi.status
      ORDER BY dt.transferred_at DESC
    `);
    return res.rows as any[];
  },

  async getDoctor(this: DatabaseStorage, id: string): Promise<Doctor | undefined> {
    const [d] = await db.select().from(doctors).where(eq(doctors.id, id));
    return d;
  },

  async createDoctor(this: DatabaseStorage, data: InsertDoctor): Promise<Doctor> {
    const [d] = await db.insert(doctors).values(data).returning();
    return d;
  },

  async updateDoctor(this: DatabaseStorage, id: string, data: Partial<InsertDoctor>): Promise<Doctor> {
    const [d] = await db.update(doctors).set(data).where(eq(doctors.id, id)).returning();
    return d;
  },

  async deleteDoctor(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.update(doctors).set({ isActive: false }).where(eq(doctors.id, id));
    return true;
  },

  async getAdmissions(this: DatabaseStorage, filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string; deptId?: string; page?: number; pageSize?: number }): Promise<any[] | { data: any[]; total: number; page: number; pageSize: number }> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const paginate = filters?.page !== undefined;
    const page     = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters?.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const conds: any[] = [];
    if (filters?.status) conds.push(sql`a.status = ${filters.status}`);

    if (filters?.dateFrom) {
      conds.push(sql`a.admission_date >= ${filters.dateFrom}`);
    } else if (paginate && !filters?.dateTo) {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      conds.push(sql`a.admission_date >= ${d30.toISOString().slice(0, 10)}`);
    }
    if (filters?.dateTo) conds.push(sql`a.admission_date <= ${filters.dateTo}`);

    if (filters?.search) {
      const s = `%${filters.search}%`;
      conds.push(sql`(a.patient_name ILIKE ${s} OR a.admission_number ILIKE ${s} OR a.patient_phone ILIKE ${s} OR a.doctor_name ILIKE ${s})`);
    }
    if (filters?.deptId) {
      conds.push(sql`rpt.department_id = ${filters.deptId}`);
    }

    const whereExpr = conds.length > 0
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;

    const limitClause = paginate
      ? sql`LIMIT ${pageSize} OFFSET ${offset}`
      : sql``;

    const countCol = paginate
      ? sql`, COUNT(*) OVER() AS total_count`
      : sql``;

    // ── جدول rpt يوفر المبالغ المجمَّعة وإسم القسم دون ARRAY_AGG أو DISTINCT ON ──
    // الفواتير المرتبطة مباشرةً فقط (admission_id IS NOT NULL).
    // inv_latest يوفر رقم الفاتورة الأخيرة وحالتها والمبالغ المحوَّلة (doctor_transfers).
    const result = await db.execute(sql`
      SELECT
        a.*,
        COALESCE(rpt.net_amount,   0)                    AS total_net_amount,
        COALESCE(rpt.total_paid,   0)                    AS total_paid_amount,
        COALESCE(inv_latest.total_transferred, 0)        AS total_transferred_amount,
        inv_latest.latest_invoice_number                 AS latest_invoice_number,
        inv_latest.latest_invoice_id                     AS latest_invoice_id,
        inv_latest.latest_invoice_status                 AS latest_invoice_status,
        rpt.department_id                                AS latest_invoice_dept_id,
        rpt.department_name                              AS latest_invoice_dept_name
        ${countCol}
      FROM admissions a
      LEFT JOIN rpt_patient_visit_summary rpt
        ON rpt.source_type = 'admission' AND rpt.source_id = a.id
      LEFT JOIN (
        SELECT
          pih.admission_id,
          (ARRAY_AGG(pih.invoice_number ORDER BY pih.created_at DESC))[1]  AS latest_invoice_number,
          (ARRAY_AGG(pih.id             ORDER BY pih.created_at DESC))[1]  AS latest_invoice_id,
          (ARRAY_AGG(pih.status         ORDER BY pih.created_at DESC))[1]  AS latest_invoice_status,
          COALESCE(SUM(dt_agg.dt_total), 0)                                AS total_transferred
        FROM patient_invoice_headers pih
        LEFT JOIN (
          SELECT invoice_id, SUM(amount::numeric) AS dt_total
          FROM doctor_transfers
          GROUP BY invoice_id
        ) dt_agg ON dt_agg.invoice_id = pih.id
        WHERE pih.status != 'cancelled'
          AND pih.admission_id IS NOT NULL
        GROUP BY pih.admission_id
      ) inv_latest ON inv_latest.admission_id = a.id
      ${whereExpr}
      ORDER BY a.created_at DESC
      ${limitClause}
    `);

    const rawRows = result.rows as any[];

    if (!paginate) {
      return rawRows.map(row =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
      );
    }

    const total = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0;
    const data  = rawRows.map(row => {
      const { total_count, ...rest } = row;
      return Object.fromEntries(Object.entries(rest).map(([k, v]) => [toCamel(k), v]));
    });
    return { data, total, page, pageSize };
  },

  async getAdmission(this: DatabaseStorage, id: string): Promise<Admission | undefined> {
    const [a] = await db.select().from(admissions).where(eq(admissions.id, id));
    return a;
  },

  async createAdmission(this: DatabaseStorage, data: InsertAdmission): Promise<Admission> {
    const maxNumResult = await db.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(admission_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM admissions`);
    const nextNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

    const [a] = await db.insert(admissions).values({
      ...data,
      admissionNumber: data.admissionNumber || String(nextNum),
    }).returning();
    return a;
  },

  async updateAdmission(this: DatabaseStorage, id: string, data: Partial<InsertAdmission>): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async dischargeAdmission(this: DatabaseStorage, id: string): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      status: "discharged",
      dischargeDate: new Date().toISOString().split("T")[0],
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async getAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader[]> {
    return await db.select().from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.admissionId, admissionId))
      .orderBy(asc(patientInvoiceHeaders.createdAt));
  },

  async consolidateAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [admission] = await tx.select().from(admissions).where(eq(admissions.id, admissionId));
      if (!admission) throw new Error("الإقامة غير موجودة");

      const invoices = await tx.select().from(patientInvoiceHeaders)
        .where(and(
          eq(patientInvoiceHeaders.admissionId, admissionId),
          eq(patientInvoiceHeaders.isConsolidated, false),
        ))
        .orderBy(asc(patientInvoiceHeaders.createdAt));

      if (invoices.length === 0) throw new Error("لا توجد فواتير لتجميعها");

      const existingConsolidated = await tx.select().from(patientInvoiceHeaders)
        .where(and(
          eq(patientInvoiceHeaders.admissionId, admissionId),
          eq(patientInvoiceHeaders.isConsolidated, true),
        ));

      if (existingConsolidated.length > 0) {
        for (const ec of existingConsolidated) {
          await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, ec.id));
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, ec.id));
        }
      }

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const nextNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const totalAmount = invoices.reduce((s, inv) => s + parseFloat(inv.totalAmount), 0);
      const discountAmount = invoices.reduce((s, inv) => s + parseFloat(inv.discountAmount), 0);
      const netAmount = invoices.reduce((s, inv) => s + parseFloat(inv.netAmount), 0);
      const paidAmount = invoices.reduce((s, inv) => s + parseFloat(inv.paidAmount), 0);

      const [consolidated] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber: String(nextNum),
        invoiceDate: new Date().toISOString().split("T")[0],
        patientName: admission.patientName,
        patientPhone: admission.patientPhone,
        patientType: invoices[0].patientType,
        admissionId: admissionId,
        isConsolidated: true,
        sourceInvoiceIds: JSON.stringify(invoices.map(i => i.id)),
        doctorName: admission.doctorName,
        notes: `فاتورة مجمعة - إقامة رقم ${admission.admissionNumber}`,
        status: "draft",
        totalAmount: String(+totalAmount.toFixed(2)),
        discountAmount: String(+discountAmount.toFixed(2)),
        netAmount: String(+netAmount.toFixed(2)),
        paidAmount: String(+paidAmount.toFixed(2)),
      }).returning();

      let sortOrder = 0;
      for (const inv of invoices) {
        const lines = await tx.select().from(patientInvoiceLines)
          .where(eq(patientInvoiceLines.headerId, inv.id))
          .orderBy(asc(patientInvoiceLines.sortOrder));

        if (lines.length > 0) {
          const newLines = lines.map(l => ({
            headerId: consolidated.id,
            lineType: l.lineType,
            serviceId: l.serviceId,
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent,
            discountAmount: l.discountAmount,
            totalPrice: l.totalPrice,
            unitLevel: l.unitLevel,
            lotId: l.lotId,
            expiryMonth: l.expiryMonth,
            expiryYear: l.expiryYear,
            priceSource: l.priceSource,
            doctorName: l.doctorName,
            nurseName: l.nurseName,
            notes: l.notes ? `[${inv.invoiceNumber}] ${l.notes}` : `[فاتورة ${inv.invoiceNumber}]`,
            sortOrder: sortOrder++,
          }));
          await tx.insert(patientInvoiceLines).values(newLines);
        }
      }

      const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, consolidated.id));
      return finalHeader;
    });
  },

  // ==================== Patient Inquiry ====================

  async getPatientInquiry(
    this: DatabaseStorage,
    filters: {
      adminDeptFilter?: string | null;
      clinicId?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
      search?: string | null;
    },
    forcedDeptIds: string[] | null,
  ): Promise<{ rows: Record<string, unknown>[]; count: number; limit: number; hasMore: boolean }> {

    const LIMIT = 200;
    const esc = (s: string) => s.replace(/'/g, "''");

    // ─── R1/R2/R3: dept isolation ────────────────────────────
    // forcedDeptIds === null  → full access (admin / cashier.all_units)
    // forcedDeptIds = [...]   → restricted to those depts (route guarantees length >= 1)
    let deptClause: string;
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    } else if (filters.adminDeptFilter) {
      deptClause = `AND pih.department_id = '${esc(filters.adminDeptFilter)}'`;
    } else {
      deptClause = "";
    }

    // ─── clinic sub-filter ───────────────────────────────────
    let clinicClause = "";
    if (filters.clinicId) {
      const safeClinic = esc(filters.clinicId);
      clinicClause = `AND EXISTS (
        SELECT 1 FROM clinic_appointments ca
        WHERE (
          (pih.patient_id IS NOT NULL AND ca.patient_id = pih.patient_id)
          OR (pih.patient_id IS NULL AND ca.patient_name = pih.patient_name)
        )
        AND ca.clinic_id = '${safeClinic}'
      )`;
    }

    // ─── date filters (R11: inclusive full day) ──────────────
    let dateClause = "";
    if (filters.dateFrom) {
      dateClause += ` AND pih.invoice_date >= '${esc(filters.dateFrom)}'::date`;
    }
    if (filters.dateTo) {
      dateClause += ` AND pih.invoice_date <= '${esc(filters.dateTo)}'::date`;
    }

    // ─── search ──────────────────────────────────────────────
    let searchClause = "";
    if (filters.search?.trim()) {
      const term = `%${esc(filters.search.trim().replace(/%/g, "\\%"))}%`;
      searchClause = `AND (pih.patient_name ILIKE '${term}' OR pih.patient_phone ILIKE '${term}')`;
    }

    const result = await db.execute(sql.raw(`
      WITH filtered_invoices AS (
        SELECT
          pih.id,
          COALESCE(pih.patient_id, 'anon:' || pih.patient_name) AS uid,
          pih.patient_id,
          pih.patient_name,
          pih.patient_phone,
          pih.department_id,
          pih.invoice_date,
          pih.net_amount::numeric          AS net_amount,
          pih.paid_amount::numeric         AS paid_amount,
          (pih.net_amount - pih.paid_amount)::numeric AS outstanding
        FROM patient_invoice_headers pih
        WHERE pih.status != 'cancelled'
          ${deptClause}
          ${clinicClause}
          ${dateClause}
          ${searchClause}
      ),
      invoice_totals AS (
        SELECT
          uid,
          patient_id,
          patient_name,
          patient_phone,
          department_id,
          COUNT(id)          AS invoice_count,
          SUM(net_amount)    AS total_net,
          SUM(paid_amount)   AS total_paid,
          SUM(outstanding)   AS total_outstanding,
          MAX(invoice_date)  AS last_invoice_date
        FROM filtered_invoices
        GROUP BY uid, patient_id, patient_name, patient_phone, department_id
      ),
      line_totals AS (
        SELECT
          fi.uid,
          COALESCE(SUM(CASE WHEN pil.line_type = 'service'    AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS services_total,
          COALESCE(SUM(CASE WHEN pil.line_type = 'drug'       AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS drugs_total,
          COALESCE(SUM(CASE WHEN pil.line_type = 'consumable' AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS consumables_total
        FROM filtered_invoices fi
        JOIN patient_invoice_lines pil ON pil.header_id = fi.id
        GROUP BY fi.uid
      )
      SELECT
        it.uid,
        it.patient_id,
        p.patient_code,
        COALESCE(p.full_name, it.patient_name) AS patient_name,
        COALESCE(p.phone, it.patient_phone)    AS patient_phone,
        it.department_id,
        d.name_ar                              AS dept_name,
        it.invoice_count,
        COALESCE(lt.services_total,    0)      AS services_total,
        COALESCE(lt.drugs_total,       0)      AS drugs_total,
        COALESCE(lt.consumables_total, 0)      AS consumables_total,
        it.total_net,
        it.total_paid,
        it.total_outstanding,
        it.last_invoice_date
      FROM invoice_totals it
      LEFT JOIN patients    p  ON p.id  = it.patient_id
      LEFT JOIN departments d  ON d.id  = it.department_id
      LEFT JOIN line_totals lt ON lt.uid = it.uid
      ORDER BY it.last_invoice_date DESC NULLS LAST
      LIMIT ${LIMIT + 1}
    `));

    const all = result.rows as Record<string, unknown>[];
    const hasMore = all.length > LIMIT;
    const rows = hasMore ? all.slice(0, LIMIT) : all;

    return { rows, count: rows.length, limit: LIMIT, hasMore };
  },

  async getPatientInquiryLines(
    this: DatabaseStorage,
    patientKey: { patientId?: string | null; patientName?: string | null },
    forcedDeptIds: string[] | null,
    lineType?: string | null,
  ): Promise<Record<string, unknown>[]> {

    const esc = (s: string) => s.replace(/'/g, "''");

    // ─── R4: patient matching — id first, then name ───────────
    let patientClause: string;
    if (patientKey.patientId) {
      patientClause = `pih.patient_id = '${esc(patientKey.patientId)}'`;
    } else if (patientKey.patientName) {
      patientClause = `(pih.patient_id IS NULL AND pih.patient_name = '${esc(patientKey.patientName)}')`;
    } else {
      return [];
    }

    // ─── R3/R9: dept isolation ────────────────────────────────
    // forcedDeptIds === null → full access; string[] → restricted (route guarantees length >= 1)
    let deptClause = "";
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    }

    // ─── line type filter ─────────────────────────────────────
    let lineTypeClause = "";
    if (lineType && ["service", "drug", "consumable"].includes(lineType)) {
      lineTypeClause = `AND pil.line_type = '${lineType}'`;
    }

    const result = await db.execute(sql.raw(`
      SELECT
        pil.id               AS line_id,
        pil.line_type,
        pil.description,
        pil.quantity,
        pil.unit_price,
        pil.total_price,
        pih.invoice_number,
        pih.invoice_date,
        pih.status           AS invoice_status,
        pih.department_id,
        d.name_ar            AS dept_name
      FROM patient_invoice_lines pil
      JOIN patient_invoice_headers pih ON pih.id = pil.header_id
      LEFT JOIN departments d ON d.id = pih.department_id
      WHERE pih.status != 'cancelled'
        AND NOT pil.is_void
        AND ${patientClause}
        ${deptClause}
        ${lineTypeClause}
      ORDER BY pih.invoice_date DESC, pil.created_at DESC
    `));

    return result.rows as Record<string, unknown>[];
  },
  // ─── Duplicate Detection & Merge ──────────────────────────────────────────────

  /**
   * Search for duplicate candidates for a given patient input.
   * Returns scored, sorted candidates.
   */
  async checkPatientDuplicateCandidates(
    this: DatabaseStorage,
    input: { fullName?: string | null; phone?: string | null; nationalId?: string | null; age?: number | null },
    excludePatientId?: string,
  ): Promise<DuplicateCheckResult> {
    const norm = normalizePatientIdentity(input);

    // Build OR conditions for the broad candidate search
    const orClauses = [];
    if (norm.normalizedNationalId) {
      orClauses.push(eq(patients.normalizedNationalId, norm.normalizedNationalId));
    }
    if (norm.normalizedPhone) {
      orClauses.push(eq(patients.normalizedPhone, norm.normalizedPhone));
    }
    if (norm.normalizedFullName) {
      const firstToken = norm.normalizedFullName.split(" ")[0];
      if (firstToken) orClauses.push(ilike(patients.normalizedFullName, `%${firstToken}%`));
    }
    if (orClauses.length === 0) {
      return { duplicateStatus: "none", candidates: [], recommendedAction: statusToRecommendedAction("none") };
    }

    const baseConditions = [
      eq(patients.isActive, true),
      isNull(patients.mergedIntoPatientId),
      or(...orClauses)!,
    ];
    if (excludePatientId) baseConditions.push(ne(patients.id, excludePatientId));

    const rows = await db
      .select({
        id: patients.id,
        patientCode: patients.patientCode,
        fullName: patients.fullName,
        phone: patients.phone,
        nationalId: patients.nationalId,
        age: patients.age,
        gender: patients.gender,
        normalizedFullName: patients.normalizedFullName,
        normalizedPhone: patients.normalizedPhone,
        normalizedNationalId: patients.normalizedNationalId,
      })
      .from(patients)
      .where(and(...baseConditions))
      .limit(20);

    const candidates: DuplicateCandidate[] = rows.map(row => {
      const { score, reasons } = scoreCandidateMatch(
        { ...norm, age: input.age ?? null },
        {
          normalizedFullName: row.normalizedFullName,
          normalizedPhone: row.normalizedPhone,
          normalizedNationalId: row.normalizedNationalId,
          age: row.age,
        },
      );
      return {
        patientId: row.id,
        patientCode: row.patientCode,
        fullName: row.fullName,
        phone: row.phone,
        nationalId: row.nationalId,
        age: row.age,
        gender: row.gender,
        score,
        reasons,
      };
    })
    .filter(c => c.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

    const maxScore = candidates.length > 0 ? candidates[0].score : 0;
    const duplicateStatus = scoreToStatus(maxScore);

    return {
      duplicateStatus,
      candidates,
      recommendedAction: statusToRecommendedAction(duplicateStatus),
    };
  },

  /**
   * Preview the impact of merging duplicate into master (dry run, no DB changes).
   */
  async getPatientMergeImpact(
    this: DatabaseStorage,
    masterPatientId: string,
    duplicatePatientId: string,
  ): Promise<{
    masterPatient: Record<string, unknown>;
    duplicatePatient: Record<string, unknown>;
    invoiceCount: number;
    admissionCount: number;
    appointmentCount: number;
  }> {
    const [masterRow, duplicateRow, invoicesRow, admissionsRow, appointmentsRow] = await Promise.all([
      db.execute(sql`SELECT id, patient_code, full_name, phone, national_id, age FROM patients WHERE id = ${masterPatientId}`),
      db.execute(sql`SELECT id, patient_code, full_name, phone, national_id, age FROM patients WHERE id = ${duplicatePatientId}`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers WHERE patient_id = ${duplicatePatientId}`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM admissions WHERE patient_id = ${duplicatePatientId}`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM clinic_appointments WHERE patient_id = ${duplicatePatientId}`),
    ]);

    if (!masterRow.rows.length) throw Object.assign(new Error("المريض الرئيسي غير موجود"), { statusCode: 404 });
    if (!duplicateRow.rows.length) throw Object.assign(new Error("المريض المكرر غير موجود"), { statusCode: 404 });

    return {
      masterPatient: masterRow.rows[0] as Record<string, unknown>,
      duplicatePatient: duplicateRow.rows[0] as Record<string, unknown>,
      invoiceCount: parseInt(String((invoicesRow.rows[0] as Record<string, unknown>).cnt)) || 0,
      admissionCount: parseInt(String((admissionsRow.rows[0] as Record<string, unknown>).cnt)) || 0,
      appointmentCount: parseInt(String((appointmentsRow.rows[0] as Record<string, unknown>).cnt)) || 0,
    };
  },

  /**
   * Execute a governed patient merge inside a single DB transaction.
   * Moves all related records from duplicate → master, marks duplicate as merged.
   */
  async mergePatients(
    this: DatabaseStorage,
    masterPatientId: string,
    duplicatePatientId: string,
    reason: string,
    userId: string,
  ): Promise<void> {
    if (masterPatientId === duplicatePatientId) {
      throw Object.assign(new Error("لا يمكن دمج مريض مع نفسه"), { statusCode: 400 });
    }

    // Snapshot impact before merge
    const impact = await this.getPatientMergeImpact(masterPatientId, duplicatePatientId);

    await db.transaction(async (tx) => {
      // Move invoices
      await tx.execute(sql`
        UPDATE patient_invoice_headers
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      // Move admissions
      await tx.execute(sql`
        UPDATE admissions
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      // Move clinic appointments
      await tx.execute(sql`
        UPDATE clinic_appointments
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      // Save old patient_code as alias on master
      const dupPatient = impact.duplicatePatient as { patient_code?: string | null; full_name?: string };
      if (dupPatient.patient_code) {
        await tx.execute(sql`
          INSERT INTO patient_aliases(patient_id, alias_type, alias_value)
          VALUES (${masterPatientId}, 'merged_from_code', ${dupPatient.patient_code})
          ON CONFLICT DO NOTHING
        `);
      }

      // Mark duplicate as merged
      await tx.execute(sql`
        UPDATE patients
        SET merged_into_patient_id = ${masterPatientId},
            merged_at = now(),
            merged_by_user_id = ${userId},
            merge_reason = ${reason},
            is_active = false
        WHERE id = ${duplicatePatientId}
      `);

      // Write merge audit log
      await tx.execute(sql`
        INSERT INTO patient_merge_audit(
          master_patient_id, merged_patient_id, merged_by_user_id,
          reason, moved_invoice_count, moved_admission_count, moved_appointment_count,
          raw_snapshot_json
        ) VALUES (
          ${masterPatientId}, ${duplicatePatientId}, ${userId},
          ${reason}, ${impact.invoiceCount}, ${impact.admissionCount}, ${impact.appointmentCount},
          ${JSON.stringify({ master: impact.masterPatient, duplicate: impact.duplicatePatient })}
        )
      `);
    });
  },

  /**
   * Get a list of potential duplicate patient groups for the review screen.
   * Groups patients by shared normalized_phone or normalized_national_id,
   * and finds name-similar patients with approximate name matching.
   */
  async getPatientDuplicateCandidatesList(
    this: DatabaseStorage,
    limit = 50,
  ): Promise<Array<{ patientA: Record<string, unknown>; patientB: Record<string, unknown>; matchReason: string; score: number }>> {
    // Phone duplicates
    const phoneDups = await db.execute(sql`
      SELECT
        a.id AS id_a, a.patient_code AS code_a, a.full_name AS name_a,
        a.phone AS phone_a, a.national_id AS nid_a, a.age AS age_a, a.gender AS gender_a,
        b.id AS id_b, b.patient_code AS code_b, b.full_name AS name_b,
        b.phone AS phone_b, b.national_id AS nid_b, b.age AS age_b, b.gender AS gender_b,
        'رقم الهاتف متطابق' AS match_reason, 70 AS score
      FROM patients a
      JOIN patients b ON a.normalized_phone = b.normalized_phone
        AND a.id < b.id
      WHERE a.normalized_phone IS NOT NULL
        AND a.merged_into_patient_id IS NULL
        AND b.merged_into_patient_id IS NULL
        AND a.is_active = true AND b.is_active = true
      LIMIT ${Math.floor(limit / 2)}
    `);

    // National ID duplicates
    const nidDups = await db.execute(sql`
      SELECT
        a.id AS id_a, a.patient_code AS code_a, a.full_name AS name_a,
        a.phone AS phone_a, a.national_id AS nid_a, a.age AS age_a, a.gender AS gender_a,
        b.id AS id_b, b.patient_code AS code_b, b.full_name AS name_b,
        b.phone AS phone_b, b.national_id AS nid_b, b.age AS age_b, b.gender AS gender_b,
        'رقم الهوية متطابق' AS match_reason, 100 AS score
      FROM patients a
      JOIN patients b ON a.normalized_national_id = b.normalized_national_id
        AND a.id < b.id
      WHERE a.normalized_national_id IS NOT NULL
        AND a.merged_into_patient_id IS NULL
        AND b.merged_into_patient_id IS NULL
        AND a.is_active = true AND b.is_active = true
      LIMIT ${Math.floor(limit / 2)}
    `);

    type Row = Record<string, unknown>;
    const mapRow = (r: Row) => ({
      patientA: { id: r.id_a, patientCode: r.code_a, fullName: r.name_a, phone: r.phone_a, nationalId: r.nid_a, age: r.age_a, gender: r.gender_a },
      patientB: { id: r.id_b, patientCode: r.code_b, fullName: r.name_b, phone: r.phone_b, nationalId: r.nid_b, age: r.age_b, gender: r.gender_b },
      matchReason: String(r.match_reason),
      score: Number(r.score),
    });

    return [
      ...(nidDups.rows as Row[]).map(mapRow),
      ...(phoneDups.rows as Row[]).map(mapRow),
    ].sort((a, b) => b.score - a.score);
  },

  // ─── Scope validation helpers (parameterized — no esc() needed) ─────────────

  /**
   * Returns true if a full-access user OR if the patient has at least one
   * non-cancelled invoice whose department_id is within forcedDeptIds.
   * Used by patient detail endpoints to prevent cross-department ID enumeration.
   */
  async checkPatientInScope(
    this: DatabaseStorage,
    patientId: string,
    forcedDeptIds: string[] | null,
  ): Promise<boolean> {
    if (forcedDeptIds === null) return true;
    if (forcedDeptIds.length === 0) return false;

    // Check by patient_id column (most patients have one)
    const byId = await db.execute(sql`
      SELECT 1 FROM patient_invoice_headers pih
      WHERE pih.patient_id = ${patientId}
        AND pih.department_id = ANY(${forcedDeptIds}::text[])
        AND pih.status != 'cancelled'
      LIMIT 1
    `);
    if (byId.rows.length > 0) return true;

    // Fallback: match by patient name (older invoices may lack patient_id)
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

  /**
   * Returns true if the invoice belongs to one of forcedDeptIds.
   * Used by /api/patient-invoices/:id/transfers to prevent cross-dept access.
   */
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
