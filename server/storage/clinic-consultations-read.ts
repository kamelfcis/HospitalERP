import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

export const clinicConsultationsReadMethods = {
  async getUserDoctorId(this: DatabaseStorage, userId: string): Promise<string | null> {
    const rows = await db.execute(sql`
      SELECT doctor_id FROM clinic_user_doctor_assignments WHERE user_id = ${userId}
    `);
    return (rows.rows[0] as { doctor_id: string } | undefined)?.doctor_id ?? null;
  },

  async assignUserToDoctor(this: DatabaseStorage, userId: string, doctorId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO clinic_user_doctor_assignments (user_id, doctor_id)
      VALUES (${userId}, ${doctorId})
      ON CONFLICT (user_id) DO UPDATE SET doctor_id = EXCLUDED.doctor_id
    `);
  },

  async removeUserDoctorAssignment(this: DatabaseStorage, userId: string): Promise<void> {
    await db.execute(sql`DELETE FROM clinic_user_doctor_assignments WHERE user_id = ${userId}`);
  },

  async getUserAssignedDoctorId(this: DatabaseStorage, userId: string): Promise<string | null> {
    const rows = await db.execute(sql`SELECT doctor_id FROM clinic_user_doctor_assignments WHERE user_id = ${userId}`);
    return (rows.rows[0] as { doctor_id: string } | undefined)?.doctor_id ?? null;
  },

  async getConsultationByAppointment(this: DatabaseStorage, appointmentId: string): Promise<Record<string, unknown> | null> {
    const consRows = await db.execute(sql`
      SELECT c.*,
             a.patient_name, a.patient_phone, a.patient_id, a.appointment_date, a.appointment_time,
             a.turn_number, a.status AS appointment_status, a.doctor_id, a.clinic_id,
             a.payment_type, a.insurance_company,
             a.company_id, a.contract_id, a.contract_member_id,
             co.name_ar AS company_name,
             ct.contract_name,
             d.name AS doctor_name, d.specialty AS doctor_specialty,
             cl.name_ar AS clinic_name, cl.default_pharmacy_id,
             cl.consultation_service_id, cl.treasury_id,
             p.age AS patient_age, p.gender AS patient_gender,
             (SELECT cc.diagnosis
              FROM clinic_consultations cc
              JOIN clinic_appointments aa ON aa.id = cc.appointment_id
              WHERE aa.patient_id = a.patient_id
                AND cc.appointment_id != a.id
                AND cc.diagnosis IS NOT NULL
              ORDER BY aa.appointment_date DESC
              LIMIT 1) AS latest_diagnosis
      FROM clinic_consultations c
      JOIN clinic_appointments a ON a.id = c.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      LEFT JOIN patients p ON p.id = a.patient_id
      LEFT JOIN companies co ON co.id = a.company_id
      LEFT JOIN contracts ct ON ct.id = a.contract_id
      WHERE c.appointment_id = ${appointmentId}
    `);
    if (!consRows.rows.length) {
      const apptRows = await db.execute(sql`
        SELECT a.*,
               co.name_ar AS company_name,
               ct.contract_name,
               d.name AS doctor_name, d.specialty AS doctor_specialty,
               cl.name_ar AS clinic_name, cl.default_pharmacy_id,
               cl.consultation_service_id, cl.treasury_id,
               p.age AS patient_age, p.gender AS patient_gender,
               (SELECT cc.diagnosis
                FROM clinic_consultations cc
                JOIN clinic_appointments aa ON aa.id = cc.appointment_id
                WHERE aa.patient_id = a.patient_id
                  AND cc.appointment_id != a.id
                  AND cc.diagnosis IS NOT NULL
                ORDER BY aa.appointment_date DESC
                LIMIT 1) AS latest_diagnosis
        FROM clinic_appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN clinic_clinics cl ON cl.id = a.clinic_id
        LEFT JOIN patients p ON p.id = a.patient_id
        LEFT JOIN companies co ON co.id = a.company_id
        LEFT JOIN contracts ct ON ct.id = a.contract_id
        WHERE a.id = ${appointmentId}
      `);
      if (!apptRows.rows.length) return null;
      const appt = apptRows.rows[0] as Record<string, unknown>;
      const preloadedServiceOrders: Array<Record<string, unknown>> = [];
      if (appt.consultation_service_id) {
        const svcRows = await db.execute(sql`
          SELECT s.id, s.name_ar,
                 COALESCE(sdp.price, s.base_price) AS unit_price
          FROM services s
          LEFT JOIN clinic_service_doctor_prices sdp
            ON sdp.service_id = s.id AND sdp.doctor_id = ${appt.doctor_id}
          WHERE s.id = ${appt.consultation_service_id}
        `);
        if (svcRows.rows.length) {
          const svc = svcRows.rows[0] as { id: string, name_ar: string, unit_price: string };
          const actualOrderRows = await db.execute(sql`
            SELECT status FROM clinic_orders
            WHERE appointment_id = ${appointmentId}
              AND service_id = ${appt.consultation_service_id}
              AND consultation_id IS NULL
            ORDER BY created_at DESC LIMIT 1
          `);
          const actualStatus = actualOrderRows.rows.length > 0
            ? (actualOrderRows.rows[0] as { status: string }).status
            : 'executed';
          preloadedServiceOrders.push({
            service_id: svc.id,
            service_name_manual: svc.name_ar,
            unit_price: svc.unit_price,
            order_type: 'service',
            status: actualStatus,
            is_consultation_service: true,
          });
        }
      }
      const preloadedFee = preloadedServiceOrders.length > 0
        ? parseFloat(String(preloadedServiceOrders[0].unit_price || 0))
        : 0;
      let resolvedPatientId = appt.patient_id ?? null;
      if (!resolvedPatientId && appt.patient_name) {
        const ptSearch = await db.execute(sql`
          SELECT id FROM patients WHERE full_name = ${appt.patient_name} LIMIT 1
        `);
        if (ptSearch.rows.length) resolvedPatientId = (ptSearch.rows[0] as any).id;
      }
      return { ...appt, id: null, drugs: [], serviceOrders: preloadedServiceOrders, consultation_fee: preloadedFee, patient_id: resolvedPatientId };
    }
    const consultation = consRows.rows[0] as Record<string, unknown>;
    const drugRows = await db.execute(sql`
      SELECT d.*,
             i.major_unit_name, i.medium_unit_name, i.minor_unit_name,
             i.major_to_minor, i.medium_to_minor, i.major_to_medium,
             i.sale_price_current
      FROM clinic_consultation_drugs d
      LEFT JOIN items i ON i.id = d.item_id
      WHERE d.consultation_id = ${consultation.id} ORDER BY d.line_no
    `);
    const clinicServiceId = consultation.consultation_service_id || null;
    const orderRows = await db.execute(sql`
      SELECT o.*,
             CASE WHEN ${clinicServiceId} IS NOT NULL AND o.service_id = ${clinicServiceId}
                  THEN true ELSE false END AS is_consultation_service
      FROM clinic_orders o
      WHERE o.appointment_id = ${appointmentId}
        AND o.order_type = 'service'
      ORDER BY o.created_at
    `);
    const serviceOrders = orderRows.rows as Array<Record<string, unknown>>;
    if (clinicServiceId) {
      const hasConsService = serviceOrders.some((s: any) => s.is_consultation_service === true || s.service_id === clinicServiceId);
      if (!hasConsService) {
        const svcRows = await db.execute(sql`
          SELECT s.id, s.name_ar,
                 COALESCE(sdp.price, s.base_price) AS unit_price
          FROM services s
          LEFT JOIN clinic_service_doctor_prices sdp
            ON sdp.service_id = s.id AND sdp.doctor_id = ${consultation.doctor_id}
          WHERE s.id = ${clinicServiceId}
        `);
        if (svcRows.rows.length) {
          const svc = svcRows.rows[0] as { id: string, name_ar: string, unit_price: string };
          const actualOrderRows = await db.execute(sql`
            SELECT status FROM clinic_orders
            WHERE appointment_id = ${appointmentId}
              AND service_id = ${clinicServiceId}
              AND consultation_id IS NULL
            ORDER BY created_at DESC LIMIT 1
          `);
          const actualStatus = actualOrderRows.rows.length > 0
            ? (actualOrderRows.rows[0] as { status: string }).status
            : 'executed';
          serviceOrders.unshift({
            service_id: svc.id,
            service_name_manual: svc.name_ar,
            unit_price: svc.unit_price,
            order_type: 'service',
            status: actualStatus,
            is_consultation_service: true,
          });
        }
      }
    }
    let resolvedPatientId = consultation.patient_id ?? null;
    if (!resolvedPatientId && consultation.patient_name) {
      const ptSearch = await db.execute(sql`
        SELECT id FROM patients WHERE full_name = ${consultation.patient_name} LIMIT 1
      `);
      if (ptSearch.rows.length) resolvedPatientId = (ptSearch.rows[0] as any).id;
    }
    let consultationFee = parseFloat(String(consultation.consultation_fee || 0));
    if (consultationFee === 0 && serviceOrders.length > 0) {
      const consService = serviceOrders.find((s: any) => s.is_consultation_service);
      if (consService) consultationFee = parseFloat(String(consService.unit_price || 0));
    }
    return { ...consultation, consultation_fee: consultationFee, patient_id: resolvedPatientId, drugs: drugRows.rows, serviceOrders };
  },
};
