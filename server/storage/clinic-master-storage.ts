/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Clinic Master Storage — إدارة العيادات والمواعيد والاستشارات
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - إدارة العيادات (Clinics CRUD + User Assignments)
 *  - جداول الأطباء (Doctor Schedules)
 *  - المواعيد (Appointments)
 *  - الاستشارات الطبية (Consultations)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage, DeptServiceOrderInput, DeptServiceBatchInput } from "./index";

const methods = {
  async getClinics(this: DatabaseStorage, userId: string, role: string): Promise<Array<Record<string, unknown>>> {
    const isAdmin = role === 'admin' || role === 'owner';
    if (isAdmin) {
      const rows = await db.execute(sql`
        SELECT c.*, d.name_ar AS department_name,
               w.name_ar AS pharmacy_name,
               sv.name_ar AS consultation_service_name,
               (acc.code || ' - ' || acc.name) AS treasury_name
        FROM clinic_clinics c
        LEFT JOIN departments d ON d.id = c.department_id
        LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
        LEFT JOIN services sv ON sv.id = c.consultation_service_id
        LEFT JOIN accounts acc ON acc.id = c.treasury_id
        ORDER BY c.name_ar
      `);
      return rows.rows as Array<Record<string, unknown>>;
    }
    const rows = await db.execute(sql`
      SELECT c.*, d.name_ar AS department_name,
             w.name_ar AS pharmacy_name,
             sv.name_ar AS consultation_service_name,
             (acc.code || ' - ' || acc.name) AS treasury_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      LEFT JOIN accounts acc ON acc.id = c.treasury_id
      JOIN clinic_user_clinic_assignments a ON a.clinic_id = c.id AND a.user_id = ${userId}
      ORDER BY c.name_ar
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },

  async getClinicById(this: DatabaseStorage, id: string): Promise<Record<string, unknown> | null> {
    const rows = await db.execute(sql`
      SELECT c.*, d.name_ar AS department_name,
             w.name_ar AS pharmacy_name,
             sv.name_ar AS consultation_service_name,
             (acc.code || ' - ' || acc.name) AS treasury_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      LEFT JOIN accounts acc ON acc.id = c.treasury_id
      WHERE c.id = ${id}
    `);
    return (rows.rows[0] as Record<string, unknown>) ?? null;
  },

  async createClinic(this: DatabaseStorage, data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string; consultationServiceId?: string; treasuryId?: string; secretaryFeeType?: string; secretaryFeeValue?: number }): Promise<Record<string, unknown>> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_clinics (name_ar, department_id, default_pharmacy_id, consultation_service_id, treasury_id, secretary_fee_type, secretary_fee_value)
      VALUES (${data.nameAr}, ${data.departmentId ?? null}, ${data.defaultPharmacyId ?? null}, ${data.consultationServiceId ?? null}, ${data.treasuryId ?? null}, ${data.secretaryFeeType ?? null}, ${data.secretaryFeeValue ?? 0})
      RETURNING *
    `);
    return rows.rows[0] as Record<string, unknown>;
  },

  async updateClinic(this: DatabaseStorage, id: string, data: Partial<{ nameAr: string; departmentId: string; defaultPharmacyId: string; consultationServiceId: string; treasuryId: string; secretaryFeeType: string; secretaryFeeValue: number; isActive: boolean }>): Promise<Record<string, unknown> | null> {
    const updates = [];
    if (data.nameAr !== undefined) updates.push(sql`name_ar = ${data.nameAr}`);
    if (data.departmentId !== undefined) updates.push(sql`department_id = ${data.departmentId || null}`);
    if (data.defaultPharmacyId !== undefined) updates.push(sql`default_pharmacy_id = ${data.defaultPharmacyId || null}`);
    if (data.consultationServiceId !== undefined) updates.push(sql`consultation_service_id = ${data.consultationServiceId || null}`);
    if (data.treasuryId !== undefined) updates.push(sql`treasury_id = ${data.treasuryId || null}`);
    if (data.secretaryFeeType !== undefined) updates.push(sql`secretary_fee_type = ${data.secretaryFeeType || null}`);
    if (data.secretaryFeeValue !== undefined) updates.push(sql`secretary_fee_value = ${data.secretaryFeeValue ?? 0}`);
    if (data.isActive !== undefined) updates.push(sql`is_active = ${data.isActive}`);
    if (updates.length === 0) return this.getClinicById(id);
    const setClauses = updates.reduce((acc, clause, i) => i === 0 ? clause : sql`${acc}, ${clause}`);
    await db.execute(sql`UPDATE clinic_clinics SET ${setClauses} WHERE id = ${id}`);
    return this.getClinicById(id);
  },

  async getUserClinicIds(this: DatabaseStorage, userId: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT clinic_id FROM clinic_user_clinic_assignments WHERE user_id = ${userId}
    `);
    return (rows.rows as Array<{ clinic_id: string }>).map(r => r.clinic_id);
  },

  async assignUserToClinic(this: DatabaseStorage, userId: string, clinicId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO clinic_user_clinic_assignments (user_id, clinic_id)
      VALUES (${userId}, ${clinicId})
      ON CONFLICT (user_id, clinic_id) DO NOTHING
    `);
  },

  async removeUserFromClinic(this: DatabaseStorage, userId: string, clinicId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM clinic_user_clinic_assignments WHERE user_id = ${userId} AND clinic_id = ${clinicId}
    `);
  },

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

  async getClinicAppointments(this: DatabaseStorage, clinicId: string, date: string): Promise<Array<Record<string, unknown>>> {
    const rows = await db.execute(sql`
      SELECT a.*,
             d.name AS doctor_name, d.specialty AS doctor_specialty,
             p.national_id AS patient_file_number
      FROM clinic_appointments a
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.clinic_id = ${clinicId} AND a.appointment_date = ${date}::date
      ORDER BY a.turn_number
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },

  async createAppointment(this: DatabaseStorage, data: { clinicId: string; doctorId: string; patientId?: string; patientName: string; patientPhone?: string; appointmentDate: string; appointmentTime?: string; notes?: string; createdBy?: string }): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const turnRes = await client.query(`
        SELECT COALESCE(MAX(turn_number), 0) + 1 AS next_turn
        FROM clinic_appointments
        WHERE clinic_id = $1 AND appointment_date = $2::date
      `, [data.clinicId, data.appointmentDate]);
      const turnNumber = turnRes.rows[0].next_turn;
      const ins = await client.query(`
        INSERT INTO clinic_appointments
          (clinic_id, doctor_id, patient_id, patient_name, patient_phone,
           appointment_date, appointment_time, turn_number, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10)
        RETURNING *
      `, [
        data.clinicId, data.doctorId, data.patientId ?? null, data.patientName,
        data.patientPhone ?? null, data.appointmentDate, data.appointmentTime ?? null,
        turnNumber, data.notes ?? null, data.createdBy ?? null
      ]);
      await client.query('COMMIT');
      return ins.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getAppointmentClinicId(this: DatabaseStorage, appointmentId: string): Promise<string | null> {
    const rows = await db.execute(sql`SELECT clinic_id FROM clinic_appointments WHERE id = ${appointmentId}`);
    return (rows.rows[0] as { clinic_id: string } | undefined)?.clinic_id ?? null;
  },

  async updateAppointmentStatus(this: DatabaseStorage, id: string, status: string): Promise<void> {
    await db.execute(sql`UPDATE clinic_appointments SET status = ${status} WHERE id = ${id}`);
  },

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
             d.name AS doctor_name, d.specialty AS doctor_specialty,
             cl.name_ar AS clinic_name, cl.default_pharmacy_id,
             cl.consultation_service_id, cl.treasury_id
      FROM clinic_consultations c
      JOIN clinic_appointments a ON a.id = c.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      WHERE c.appointment_id = ${appointmentId}
    `);
    if (!consRows.rows.length) {
      const apptRows = await db.execute(sql`
        SELECT a.*,
               d.name AS doctor_name, d.specialty AS doctor_specialty,
               cl.name_ar AS clinic_name, cl.default_pharmacy_id,
               cl.consultation_service_id, cl.treasury_id
        FROM clinic_appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN clinic_clinics cl ON cl.id = a.clinic_id
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
          preloadedServiceOrders.push({
            service_id: svc.id,
            service_name_manual: svc.name_ar,
            unit_price: svc.unit_price,
            order_type: 'service',
            status: 'pending',
            is_consultation_service: true,
          });
        }
      }
      const preloadedFee = preloadedServiceOrders.length > 0
        ? parseFloat(String(preloadedServiceOrders[0].unit_price || 0))
        : 0;
      // بحث عن المريض بالاسم إذا لم يكن مرتبطاً بملف مريض
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
      WHERE o.consultation_id = ${consultation.id} AND o.order_type = 'service' ORDER BY o.created_at
    `);
    const serviceOrders = [...orderRows.rows] as Array<Record<string, unknown>>;
    if (clinicServiceId && !serviceOrders.some((o: Record<string, unknown>) => o.service_id === clinicServiceId)) {
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
        serviceOrders.unshift({
          service_id: svc.id,
          service_name_manual: svc.name_ar,
          unit_price: svc.unit_price,
          order_type: 'service',
          status: 'pending',
          is_consultation_service: true,
        });
      }
    }
    // بحث عن المريض بالاسم إذا لم يكن مرتبطاً بملف مريض
    let resolvedPatientId = consultation.patient_id ?? null;
    if (!resolvedPatientId && consultation.patient_name) {
      const ptSearch = await db.execute(sql`
        SELECT id FROM patients WHERE full_name = ${consultation.patient_name} LIMIT 1
      `);
      if (ptSearch.rows.length) resolvedPatientId = (ptSearch.rows[0] as any).id;
    }
    // حساب رسم الكشف من السعر المحفوظ أو من خدمة الكشف كـ fallback
    let consultationFee = parseFloat(String(consultation.consultation_fee || 0));
    if (consultationFee === 0 && serviceOrders.length > 0) {
      const consService = serviceOrders.find((s: any) => s.is_consultation_service);
      if (consService) consultationFee = parseFloat(String(consService.unit_price || 0));
    }
    return { ...consultation, consultation_fee: consultationFee, patient_id: resolvedPatientId, drugs: drugRows.rows, serviceOrders };
  },

  async saveConsultation(this: DatabaseStorage, data: {
    appointmentId: string; chiefComplaint?: string; diagnosis?: string; notes?: string; createdBy?: string;
    discountType?: string; discountValue?: number;
    drugs: { lineNo: number; itemId?: string | null; drugName: string; dose?: string; frequency?: string; duration?: string; notes?: string; unitLevel?: string; quantity?: number; unitPrice?: number }[];
    serviceOrders: { serviceId?: string | null; serviceNameManual?: string; targetId?: string; targetName?: string; unitPrice?: number }[];
  }): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const apptRes = await client.query(
        `SELECT a.*, d.name AS doctor_name, cl.default_pharmacy_id, cl.consultation_service_id,
                cl.treasury_id AS clinic_treasury_id,
                s.name_ar AS consultation_service_name, s.base_price AS consultation_service_base_price,
                s.department_id AS consultation_service_dept_id,
                dep.name_ar AS consultation_service_dept_name
         FROM clinic_appointments a
         JOIN doctors d ON d.id = a.doctor_id
         JOIN clinic_clinics cl ON cl.id = a.clinic_id
         LEFT JOIN services s ON s.id = cl.consultation_service_id
         LEFT JOIN departments dep ON dep.id = s.department_id
         WHERE a.id = $1`, [data.appointmentId]
      );
      const appt = apptRes.rows[0];
      if (!appt) throw new Error("الموعد غير موجود");

      // حساب رسم الكشف والخصم
      let consultationFee = 0;
      if (appt.consultation_service_id) {
        const dpRes = await client.query(
          `SELECT price FROM clinic_service_doctor_prices WHERE service_id = $1 AND doctor_id = $2`,
          [appt.consultation_service_id, appt.doctor_id]
        );
        consultationFee = dpRes.rows.length > 0
          ? parseFloat(String(dpRes.rows[0].price))
          : parseFloat(String(appt.consultation_service_base_price || 0));
      }
      const discountType = data.discountType || 'amount';
      const discountValue = parseFloat(String(data.discountValue || 0));
      const discountAmount = discountType === 'percent'
        ? Math.round((consultationFee * discountValue / 100) * 100) / 100
        : discountValue;
      const finalAmount = Math.max(0, consultationFee - discountAmount);

      const consRes = await client.query(`
        INSERT INTO clinic_consultations
          (appointment_id, chief_complaint, diagnosis, notes, created_by,
           consultation_fee, discount_type, discount_value, final_amount, payment_status, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'paid', now())
        ON CONFLICT (appointment_id) DO UPDATE
          SET chief_complaint = EXCLUDED.chief_complaint,
              diagnosis = EXCLUDED.diagnosis,
              notes = EXCLUDED.notes,
              consultation_fee = EXCLUDED.consultation_fee,
              discount_type = EXCLUDED.discount_type,
              discount_value = EXCLUDED.discount_value,
              final_amount = EXCLUDED.final_amount,
              payment_status = 'paid',
              updated_at = now()
        RETURNING *
      `, [data.appointmentId, data.chiefComplaint ?? null, data.diagnosis ?? null, data.notes ?? null,
          data.createdBy ?? null, consultationFee, discountType, discountValue, finalAmount]);
      const consultation = consRes.rows[0];

      await client.query(`DELETE FROM clinic_consultation_drugs WHERE consultation_id = $1`, [consultation.id]);
      for (const drug of data.drugs) {
        await client.query(`
          INSERT INTO clinic_consultation_drugs (consultation_id, line_no, item_id, drug_name, dose, frequency, duration, notes, unit_level, quantity, unit_price)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [consultation.id, drug.lineNo, drug.itemId ?? null, drug.drugName, drug.dose ?? null, drug.frequency ?? null, drug.duration ?? null, drug.notes ?? null, drug.unitLevel ?? 'major', drug.quantity ?? 1, drug.unitPrice ?? 0]);
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
        let orderPrice = 0;
        if (svc.serviceId) {
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

      if (appt.consultation_service_id) {
        const alreadyHasConsultationService = data.serviceOrders.some(
          (s) => s.serviceId === appt.consultation_service_id
        );
        if (!alreadyHasConsultationService) {
          const doctorPriceRes = await client.query(
            `SELECT price FROM clinic_service_doctor_prices WHERE service_id = $1 AND doctor_id = $2`,
            [appt.consultation_service_id, appt.doctor_id]
          );
          const consultationPrice = doctorPriceRes.rows.length > 0
            ? parseFloat(String(doctorPriceRes.rows[0].price))
            : parseFloat(String(appt.consultation_service_base_price || 0));

          await client.query(`
            INSERT INTO clinic_orders
              (consultation_id, appointment_id, doctor_id, patient_name,
               order_type, target_type, target_id, target_name,
               service_id, service_name_manual, quantity, unit_price, status)
            VALUES ($1,$2,$3,$4,'service','department',$5,$6,$7,$8,1,$9,'executed')
          `, [
            consultation.id, data.appointmentId, appt.doctor_id, appt.patient_name,
            appt.consultation_service_dept_id ?? null, appt.consultation_service_dept_name ?? null,
            appt.consultation_service_id, appt.consultation_service_name,
            consultationPrice
          ]);
        }
      }

      await client.query(`UPDATE clinic_appointments SET status = 'in_consultation' WHERE id = $1 AND status = 'waiting'`, [data.appointmentId]);

      // تسجيل رسم الكشف في الخزنة (idempotent) - فقط إذا كان الـ ID يخص خزنة وليس حسابًا محاسبيًا
      if (appt.clinic_treasury_id && finalAmount > 0) {
        const treasuryCheck = await client.query(
          `SELECT id FROM treasuries WHERE id = $1`,
          [appt.clinic_treasury_id]
        );
        if (treasuryCheck.rows.length > 0) {
          await client.query(`
            INSERT INTO treasury_transactions
              (treasury_id, type, amount, description, source_type, source_id, transaction_date)
            VALUES ($1, 'receipt', $2, $3, 'clinic_consultation', $4, CURRENT_DATE)
            ON CONFLICT (source_type, source_id, treasury_id) DO UPDATE
              SET amount = EXCLUDED.amount,
                  description = EXCLUDED.description
          `, [
            appt.clinic_treasury_id,
            finalAmount,
            `رسم كشف: ${appt.patient_name} - د. ${appt.doctor_name}`,
            consultation.id,
          ]);
        }
      }

      await client.query('COMMIT');
      return { ...consultation, consultationFee, discountType, discountValue, finalAmount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export default methods;
