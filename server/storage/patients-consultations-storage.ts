import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {

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
