import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {
  async getDoctorSchedules(this: DatabaseStorage, clinicId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await db.execute(sql`
      SELECT s.*, d.name AS doctor_name, d.specialty
      FROM clinic_doctor_schedules s
      JOIN doctors d ON d.id = s.doctor_id
      WHERE s.clinic_id = ${clinicId}
      ORDER BY s.weekday NULLS LAST, s.start_time
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },

  async upsertDoctorSchedule(this: DatabaseStorage, data: { clinicId: string; doctorId: string; weekday?: number | null; startTime?: string; endTime?: string; maxAppointments?: number }): Promise<Record<string, unknown>> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_doctor_schedules (clinic_id, doctor_id, weekday, start_time, end_time, max_appointments)
      VALUES (${data.clinicId}, ${data.doctorId}, ${data.weekday ?? null}, ${data.startTime ?? null}, ${data.endTime ?? null}, ${data.maxAppointments ?? 20})
      ON CONFLICT DO NOTHING
      RETURNING *
    `);
    return rows.rows[0] as Record<string, unknown>;
  },

  async getClinicAppointments(this: DatabaseStorage, clinicId: string, date: string, filterDoctorId?: string | null): Promise<Array<Record<string, unknown>>> {
    if (filterDoctorId) {
      const rows = await db.execute(sql`
        SELECT a.*,
               d.name AS doctor_name, d.specialty AS doctor_specialty,
               p.national_id AS patient_file_number,
               ih.paid_amount AS invoice_paid_amount,
               ih.status AS invoice_status
        FROM clinic_appointments a
        JOIN doctors d ON d.id = a.doctor_id
        LEFT JOIN patients p ON p.id = a.patient_id
        LEFT JOIN patient_invoice_headers ih ON ih.id = a.invoice_id
        WHERE a.clinic_id = ${clinicId} AND a.appointment_date = ${date}::date
          AND a.doctor_id = ${filterDoctorId}
        ORDER BY a.turn_number
      `);
      return rows.rows as Array<Record<string, unknown>>;
    }
    const rows = await db.execute(sql`
      SELECT a.*,
             d.name AS doctor_name, d.specialty AS doctor_specialty,
             p.national_id AS patient_file_number,
             ih.paid_amount AS invoice_paid_amount,
             ih.status AS invoice_status
      FROM clinic_appointments a
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN patients p ON p.id = a.patient_id
      LEFT JOIN patient_invoice_headers ih ON ih.id = a.invoice_id
      WHERE a.clinic_id = ${clinicId} AND a.appointment_date = ${date}::date
      ORDER BY a.turn_number
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },
};

export default methods;
