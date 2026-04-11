import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {
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

  async saveConsultation(this: DatabaseStorage, data: {
    appointmentId: string; chiefComplaint?: string; diagnosis?: string; notes?: string; createdBy?: string;
    subjectiveSummary?: string; objectiveSummary?: string; assessmentSummary?: string; planSummary?: string; followUpPlan?: string;
    followUpAfterDays?: number | null; followUpReason?: string | null; suggestedFollowUpDate?: string | null;
    drugs: { lineNo: number; itemId?: string | null; drugName: string; dose?: string; frequency?: string; duration?: string; notes?: string; unitLevel?: string; quantity?: number; unitPrice?: number }[];
    serviceOrders: { serviceId?: string | null; serviceNameManual?: string; targetId?: string; targetName?: string; unitPrice?: number }[];
  }): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const apptRes = await client.query(
        `SELECT a.*, d.name AS doctor_name, cl.default_pharmacy_id, cl.consultation_service_id
         FROM clinic_appointments a
         JOIN doctors d ON d.id = a.doctor_id
         JOIN clinic_clinics cl ON cl.id = a.clinic_id
         WHERE a.id = $1`, [data.appointmentId]
      );
      const appt = apptRes.rows[0];
      if (!appt) throw new Error("الموعد غير موجود");

      const consRes = await client.query(`
        INSERT INTO clinic_consultations
          (appointment_id, chief_complaint, diagnosis, notes, created_by,
           subjective_summary, objective_summary, assessment_summary, plan_summary, follow_up_plan,
           follow_up_after_days, follow_up_reason, suggested_follow_up_date,
           updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
        ON CONFLICT (appointment_id) DO UPDATE
          SET chief_complaint          = EXCLUDED.chief_complaint,
              diagnosis                = EXCLUDED.diagnosis,
              notes                    = EXCLUDED.notes,
              subjective_summary       = EXCLUDED.subjective_summary,
              objective_summary        = EXCLUDED.objective_summary,
              assessment_summary       = EXCLUDED.assessment_summary,
              plan_summary             = EXCLUDED.plan_summary,
              follow_up_plan           = EXCLUDED.follow_up_plan,
              follow_up_after_days     = EXCLUDED.follow_up_after_days,
              follow_up_reason         = EXCLUDED.follow_up_reason,
              suggested_follow_up_date = EXCLUDED.suggested_follow_up_date,
              updated_at               = now()
        RETURNING *
      `, [data.appointmentId, data.chiefComplaint ?? null, data.diagnosis ?? null,
          data.notes ?? null, data.createdBy ?? null,
          data.subjectiveSummary ?? null, data.objectiveSummary ?? null,
          data.assessmentSummary ?? null, data.planSummary ?? null,
          data.followUpPlan ?? null,
          data.followUpAfterDays ?? null, data.followUpReason ?? null,
          data.suggestedFollowUpDate ?? null]);
      const consultation = consRes.rows[0];

      await client.query(`DELETE FROM clinic_consultation_drugs WHERE consultation_id = $1`, [consultation.id]);
      for (const drug of data.drugs) {
        await client.query(`
          INSERT INTO clinic_consultation_drugs
            (consultation_id, line_no, item_id, drug_name, dose, frequency, duration, notes, unit_level, quantity, unit_price)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [consultation.id, drug.lineNo, drug.itemId ?? null, drug.drugName,
            drug.dose ?? null, drug.frequency ?? null, drug.duration ?? null,
            drug.notes ?? null, drug.unitLevel ?? 'major', drug.quantity ?? 1, drug.unitPrice ?? 0]);
      }

      await client.query(`DELETE FROM clinic_orders WHERE consultation_id = $1`, [consultation.id]);

      for (const drug of data.drugs) {
        if (!drug.itemId && !drug.drugName) continue;
        await client.query(`
          INSERT INTO clinic_orders
            (consultation_id, appointment_id, doctor_id, patient_name,
             order_type, target_type, target_id, target_name,
             item_id, drug_name, dose, quantity, unit_level, unit_price, status)
          VALUES ($1,$2,$3,$4,'pharmacy','pharmacy',$5,$6,$7,$8,$9,$10,$11,$12,'pending')
        `, [
          consultation.id, data.appointmentId, appt.doctor_id, appt.patient_name,
          appt.default_pharmacy_id ?? null, appt.default_pharmacy_id ? 'الصيدلية' : null,
          drug.itemId ?? null, drug.drugName, drug.dose ?? null,
          drug.quantity ?? 1, drug.unitLevel ?? 'major', drug.unitPrice ?? 0
        ]);
      }

      for (const svc of data.serviceOrders) {
        if (!svc.serviceId && !svc.serviceNameManual) continue;
        if (svc.serviceId && svc.serviceId === appt.consultation_service_id) continue;
        let orderPrice = svc.unitPrice ?? 0;
        if (svc.serviceId && !svc.unitPrice) {
          const dpRes = await client.query(
            `SELECT price FROM clinic_service_doctor_prices WHERE service_id = $1 AND doctor_id = $2`,
            [svc.serviceId, appt.doctor_id]
          );
          if (dpRes.rows.length > 0) {
            orderPrice = parseFloat(String(dpRes.rows[0].price));
          } else {
            const spRes = await client.query(`SELECT base_price FROM services WHERE id = $1`, [svc.serviceId]);
            if (spRes.rows.length > 0) orderPrice = parseFloat(String(spRes.rows[0].base_price || 0));
          }
        }
        await client.query(`
          INSERT INTO clinic_orders
            (consultation_id, appointment_id, doctor_id, patient_name,
             order_type, target_type, target_id, target_name,
             service_id, service_name_manual, quantity, unit_price, status)
          VALUES ($1,$2,$3,$4,'service','department',$5,$6,$7,$8,1,$9,'pending')
        `, [
          consultation.id, data.appointmentId, appt.doctor_id, appt.patient_name,
          svc.targetId ?? null, svc.targetName ?? null,
          svc.serviceId ?? null, svc.serviceNameManual ?? null,
          orderPrice
        ]);
      }

      await client.query('COMMIT');
      return consultation;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export default methods;
