import { db } from "../db";
import { eq, and, sql, or, asc, ilike } from "drizzle-orm";
import {
  patients,
  doctors,
  admissions,
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
import type { DatabaseStorage } from "./index";

const methods = {

  async getPatients(this: DatabaseStorage): Promise<Patient[]> {
    return db.select().from(patients).where(eq(patients.isActive, true)).orderBy(asc(patients.fullName));
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

  async getPatientStats(this: DatabaseStorage, filters?: { search?: string; dateFrom?: string; dateTo?: string; deptId?: string }): Promise<Record<string, unknown>[]> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

    const invConds: string[] = ["pih.status != 'cancelled'"];
    if (filters?.dateFrom) invConds.push(`pih.invoice_date >= '${filters.dateFrom}'`);
    if (filters?.dateTo)   invConds.push(`pih.invoice_date <= '${filters.dateTo}'`);
    if (filters?.deptId) {
      const d = filters.deptId.replace(/'/g, "''");
      invConds.push(
        `(pih.department_id = '${d}' OR (pih.department_id IS NULL AND EXISTS (` +
        `SELECT 1 FROM warehouses w WHERE w.id = pih.warehouse_id AND w.department_id = '${d}'` +
        `)))`
      );
    }
    const invFilter = invConds.join(" AND ");

    const hasDateFilter = !!(filters?.dateFrom || filters?.dateTo);
    const joinType = hasDateFilter ? "JOIN" : "LEFT JOIN";

    let patientFilter = "p.is_active = true";
    if (filters?.search?.trim()) {
      const tokens = filters.search.trim().split(/\s+/).filter(Boolean);
      const conds = tokens.map(t => {
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
        s.latest_invoice_id,
        s.latest_invoice_number,
        s.latest_invoice_status,
        s.latest_doctor_name
      FROM patients p
      ${sql.raw(joinType)} (
        SELECT
          inv.patient_name,
          SUM(inv.services_total)      AS services_total,
          SUM(inv.drugs_total)         AS drugs_total,
          SUM(inv.consumables_total)   AS consumables_total,
          SUM(inv.or_room_total)       AS or_room_total,
          SUM(inv.stay_total)          AS stay_total,
          SUM(inv.paid_amount)         AS paid_total,
          SUM(inv.transferred_total)   AS transferred_total,
          (ARRAY_AGG(inv.id             ORDER BY inv.created_at DESC))[1] AS latest_invoice_id,
          (ARRAY_AGG(inv.invoice_number ORDER BY inv.created_at DESC))[1] AS latest_invoice_number,
          (ARRAY_AGG(inv.status         ORDER BY inv.created_at DESC))[1] AS latest_invoice_status,
          (ARRAY_AGG(inv.doctor_name    ORDER BY inv.created_at DESC))[1] AS latest_doctor_name
        FROM (
          SELECT
            pih.id,
            pih.patient_name,
            pih.created_at,
            pih.invoice_number,
            pih.status,
            pih.paid_amount,
            pih.doctor_name,
            COALESCE((
              SELECT SUM(dt.amount)
              FROM doctor_transfers dt
              WHERE dt.invoice_id = pih.id
            ), 0) AS transferred_total,
            SUM(CASE WHEN pil.source_type IS NULL AND pil.line_type = 'service'
                THEN pil.total_price ELSE 0 END) AS services_total,
            SUM(CASE WHEN pil.line_type = 'drug'
                THEN pil.total_price ELSE 0 END) AS drugs_total,
            SUM(CASE WHEN pil.line_type = 'consumable'
                THEN pil.total_price ELSE 0 END) AS consumables_total,
            SUM(CASE WHEN pil.source_type = 'OR_ROOM'
                THEN pil.total_price ELSE 0 END) AS or_room_total,
            SUM(CASE WHEN pil.source_type = 'STAY_ENGINE'
                THEN pil.total_price ELSE 0 END) AS stay_total
          FROM patient_invoice_headers pih
          LEFT JOIN patient_invoice_lines pil
            ON pil.header_id = pih.id AND pil.is_void = false
          WHERE ${sql.raw(invFilter)}
          GROUP BY pih.id, pih.patient_name, pih.created_at,
                   pih.invoice_number, pih.status, pih.paid_amount, pih.doctor_name
        ) inv
        GROUP BY inv.patient_name
      ) s ON s.patient_name = p.full_name
      WHERE ${sql.raw(patientFilter)}
      ORDER BY p.created_at DESC
    `);
    return (result.rows as any[]).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
    );
  },

  async getPatient(this: DatabaseStorage, id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  },

  async createPatient(this: DatabaseStorage, data: InsertPatient): Promise<Patient> {
    const [p] = await db.insert(patients).values(data).returning();
    return p;
  },

  async updatePatient(this: DatabaseStorage, id: string, data: Partial<InsertPatient>): Promise<Patient> {
    return db.transaction(async (tx) => {
      const [old] = await tx.select({ fullName: patients.fullName })
        .from(patients).where(eq(patients.id, id));

      const [updated] = await tx.update(patients).set(data).where(eq(patients.id, id)).returning();

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

  async getAdmissions(this: DatabaseStorage, filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string; deptId?: string }): Promise<any[]> {
    const conds: any[] = [];
    if (filters?.status)   conds.push(sql`a.status = ${filters.status}`);
    if (filters?.dateFrom) conds.push(sql`a.admission_date >= ${filters.dateFrom}`);
    if (filters?.dateTo)   conds.push(sql`a.admission_date <= ${filters.dateTo}`);
    if (filters?.search) {
      const s = `%${filters.search}%`;
      conds.push(sql`(a.patient_name ILIKE ${s} OR a.admission_number ILIKE ${s} OR a.patient_phone ILIKE ${s} OR a.doctor_name ILIKE ${s})`);
    }
    if (filters?.deptId) {
      conds.push(sql`inv_agg.latest_invoice_dept_id = ${filters.deptId}`);
    }

    const whereExpr = conds.length > 0
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        a.*,
        COALESCE(inv_agg.total_net_amount, 0)          AS total_net_amount,
        COALESCE(inv_agg.total_paid_amount, 0)         AS total_paid_amount,
        COALESCE(inv_agg.total_transferred, 0)         AS total_transferred_amount,
        inv_agg.latest_invoice_number                   AS latest_invoice_number,
        inv_agg.latest_invoice_id                       AS latest_invoice_id,
        inv_agg.latest_invoice_status                   AS latest_invoice_status,
        inv_agg.latest_invoice_dept_id                  AS latest_invoice_dept_id,
        inv_agg.latest_invoice_dept_name                AS latest_invoice_dept_name
      FROM admissions a
      LEFT JOIN (
        SELECT
          COALESCE(pi.admission_id, a_fb.id)                                       AS eff_admission_id,
          SUM(pi.net_amount::numeric)                                               AS total_net_amount,
          SUM(pi.paid_amount::numeric)                                              AS total_paid_amount,
          COALESCE(SUM(dt_agg.dt_total), 0)                                        AS total_transferred,
          (ARRAY_AGG(pi.invoice_number ORDER BY pi.created_at DESC))[1]            AS latest_invoice_number,
          (ARRAY_AGG(pi.id             ORDER BY pi.created_at DESC))[1]            AS latest_invoice_id,
          (ARRAY_AGG(pi.status         ORDER BY pi.created_at DESC))[1]            AS latest_invoice_status,
          (ARRAY_AGG(pi.department_id  ORDER BY pi.created_at DESC))[1]            AS latest_invoice_dept_id,
          (ARRAY_AGG(d.name_ar         ORDER BY pi.created_at DESC))[1]            AS latest_invoice_dept_name
        FROM patient_invoice_headers pi
        LEFT JOIN departments d ON d.id = pi.department_id
        LEFT JOIN (
          SELECT DISTINCT ON (patient_name) id, patient_name
          FROM admissions
          ORDER BY patient_name, created_at DESC
        ) a_fb ON a_fb.patient_name = pi.patient_name AND pi.admission_id IS NULL
        LEFT JOIN (
          SELECT invoice_id, SUM(amount::numeric) AS dt_total
          FROM doctor_transfers
          GROUP BY invoice_id
        ) dt_agg ON dt_agg.invoice_id = pi.id
        WHERE pi.status != 'cancelled'
          AND COALESCE(pi.admission_id, a_fb.id) IS NOT NULL
        GROUP BY COALESCE(pi.admission_id, a_fb.id)
      ) inv_agg ON inv_agg.eff_admission_id = a.id
      ${whereExpr}
      ORDER BY a.created_at DESC
    `);

    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return (result.rows as any[]).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
    );
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
    forcedDeptId: string | null,
    isAdmin: boolean,
  ): Promise<{ rows: Record<string, unknown>[]; count: number; limit: number; hasMore: boolean }> {

    const LIMIT = 200;
    const esc = (s: string) => s.replace(/'/g, "''");

    // ─── R1/R2/R3: dept isolation ────────────────────────────
    let deptClause: string;
    if (!isAdmin) {
      const safe = esc(forcedDeptId ?? "");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id = '${safe}'`;
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
    forcedDeptId: string | null,
    isAdmin: boolean,
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
    let deptClause = "";
    if (!isAdmin) {
      const safe = esc(forcedDeptId ?? "");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id = '${safe}'`;
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
};

export default methods;
