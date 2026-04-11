import { pool } from "../db";
import type { DatabaseStorage } from "./index";

export const clinicConsultationsWriteMethods = {
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
