import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {

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
};

export default methods;
