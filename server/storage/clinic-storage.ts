/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Clinic Module Storage — طبقة تخزين العيادات الخارجية
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  This module contains all database operations related to outpatient clinics:
 *  clinic management, doctor schedules, appointments, consultations,
 *  prescriptions, clinic orders, doctor statements, service-doctor pricing,
 *  and department service orders.
 *
 *  يحتوي هذا الملف على جميع عمليات قاعدة البيانات المتعلقة بالعيادات الخارجية:
 *  إدارة العيادات، جداول الأطباء، المواعيد، الاستشارات،
 *  الوصفات، أوامر العيادة، كشف حساب الطبيب، تسعير خدمات الأطباء،
 *  وأوامر خدمات الأقسام.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage, DeptServiceOrderInput, DeptServiceBatchInput } from "./index";

const methods = {
  async getClinics(this: DatabaseStorage, userId: string, role: string): Promise<any[]> {
    const isAdmin = role === 'admin' || role === 'owner';
    if (isAdmin) {
      const rows = await db.execute(sql`
        SELECT c.*, d.name_ar AS department_name,
               w.name_ar AS pharmacy_name,
               sv.name_ar AS consultation_service_name
        FROM clinic_clinics c
        LEFT JOIN departments d ON d.id = c.department_id
        LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
        LEFT JOIN services sv ON sv.id = c.consultation_service_id
        ORDER BY c.name_ar
      `);
      return rows.rows as any[];
    }
    const rows = await db.execute(sql`
      SELECT c.*, d.name_ar AS department_name,
             w.name_ar AS pharmacy_name,
             sv.name_ar AS consultation_service_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      JOIN clinic_user_clinic_assignments a ON a.clinic_id = c.id AND a.user_id = ${userId}
      ORDER BY c.name_ar
    `);
    return rows.rows as any[];
  },

  async getClinicById(this: DatabaseStorage, id: string): Promise<any | null> {
    const rows = await db.execute(sql`
      SELECT c.*, d.name_ar AS department_name,
             w.name_ar AS pharmacy_name,
             sv.name_ar AS consultation_service_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      WHERE c.id = ${id}
    `);
    return (rows.rows[0] as any) ?? null;
  },

  async createClinic(this: DatabaseStorage, data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string; consultationServiceId?: string; secretaryFeeType?: string; secretaryFeeValue?: number }): Promise<any> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_clinics (name_ar, department_id, default_pharmacy_id, consultation_service_id, secretary_fee_type, secretary_fee_value)
      VALUES (${data.nameAr}, ${data.departmentId ?? null}, ${data.defaultPharmacyId ?? null}, ${data.consultationServiceId ?? null}, ${data.secretaryFeeType ?? null}, ${data.secretaryFeeValue ?? 0})
      RETURNING *
    `);
    return rows.rows[0] as any;
  },

  async updateClinic(this: DatabaseStorage, id: string, data: Partial<{ nameAr: string; departmentId: string; defaultPharmacyId: string; consultationServiceId: string; secretaryFeeType: string; secretaryFeeValue: number; isActive: boolean }>): Promise<any> {
    const updates: any[] = [];
    if (data.nameAr !== undefined) updates.push(sql`name_ar = ${data.nameAr}`);
    if (data.departmentId !== undefined) updates.push(sql`department_id = ${data.departmentId || null}`);
    if (data.defaultPharmacyId !== undefined) updates.push(sql`default_pharmacy_id = ${data.defaultPharmacyId || null}`);
    if (data.consultationServiceId !== undefined) updates.push(sql`consultation_service_id = ${data.consultationServiceId || null}`);
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
    return (rows.rows as any[]).map(r => r.clinic_id);
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

  async getDoctorSchedules(this: DatabaseStorage, clinicId: string): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT s.*, d.name AS doctor_name, d.specialty
      FROM clinic_doctor_schedules s
      JOIN doctors d ON d.id = s.doctor_id
      WHERE s.clinic_id = ${clinicId}
      ORDER BY s.weekday NULLS LAST, s.start_time
    `);
    return rows.rows as any[];
  },

  async upsertDoctorSchedule(this: DatabaseStorage, data: { clinicId: string; doctorId: string; weekday?: number | null; startTime?: string; endTime?: string; maxAppointments?: number }): Promise<any> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_doctor_schedules (clinic_id, doctor_id, weekday, start_time, end_time, max_appointments)
      VALUES (${data.clinicId}, ${data.doctorId}, ${data.weekday ?? null}, ${data.startTime ?? null}, ${data.endTime ?? null}, ${data.maxAppointments ?? 20})
      ON CONFLICT DO NOTHING
      RETURNING *
    `);
    return rows.rows[0] as any;
  },

  async getClinicAppointments(this: DatabaseStorage, clinicId: string, date: string): Promise<any[]> {
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
    return rows.rows as any[];
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
    return (rows.rows[0] as any)?.clinic_id ?? null;
  },

  async updateAppointmentStatus(this: DatabaseStorage, id: string, status: string): Promise<void> {
    await db.execute(sql`UPDATE clinic_appointments SET status = ${status} WHERE id = ${id}`);
  },

  async getUserDoctorId(this: DatabaseStorage, userId: string): Promise<string | null> {
    const rows = await db.execute(sql`
      SELECT doctor_id FROM clinic_user_doctor_assignments WHERE user_id = ${userId}
    `);
    return (rows.rows[0] as any)?.doctor_id ?? null;
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
    return (rows.rows[0] as any)?.doctor_id ?? null;
  },

  async getConsultationByAppointment(this: DatabaseStorage, appointmentId: string): Promise<any | null> {
    const consRows = await db.execute(sql`
      SELECT c.*,
             a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
             a.turn_number, a.status AS appointment_status, a.doctor_id, a.clinic_id,
             d.name AS doctor_name, d.specialty AS doctor_specialty,
             cl.name_ar AS clinic_name, cl.default_pharmacy_id,
             cl.consultation_service_id
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
               cl.consultation_service_id
        FROM clinic_appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN clinic_clinics cl ON cl.id = a.clinic_id
        WHERE a.id = ${appointmentId}
      `);
      if (!apptRows.rows.length) return null;
      const appt = apptRows.rows[0] as any;
      const preloadedServiceOrders: any[] = [];
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
          const svc = svcRows.rows[0] as any;
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
      return { ...appt, id: null, drugs: [], serviceOrders: preloadedServiceOrders };
    }
    const consultation = consRows.rows[0] as any;
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
    const serviceOrders = [...orderRows.rows] as any[];
    if (clinicServiceId && !serviceOrders.some((o: any) => o.service_id === clinicServiceId)) {
      const svcRows = await db.execute(sql`
        SELECT s.id, s.name_ar,
               COALESCE(sdp.price, s.base_price) AS unit_price
        FROM services s
        LEFT JOIN clinic_service_doctor_prices sdp
          ON sdp.service_id = s.id AND sdp.doctor_id = ${consultation.doctor_id || (consultation as any).doctor_id}
        WHERE s.id = ${clinicServiceId}
      `);
      if (svcRows.rows.length) {
        const svc = svcRows.rows[0] as any;
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
    return { ...consultation, drugs: drugRows.rows, serviceOrders };
  },

  async saveConsultation(this: DatabaseStorage, data: {
    appointmentId: string; chiefComplaint?: string; diagnosis?: string; notes?: string; createdBy?: string;
    drugs: { lineNo: number; itemId?: string | null; drugName: string; dose?: string; frequency?: string; duration?: string; notes?: string; unitLevel?: string; quantity?: number; unitPrice?: number }[];
    serviceOrders: { serviceId?: string | null; serviceNameManual?: string; targetId?: string; targetName?: string; unitPrice?: number }[];
  }): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const apptRes = await client.query(
        `SELECT a.*, d.name AS doctor_name, cl.default_pharmacy_id, cl.consultation_service_id,
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

      const consRes = await client.query(`
        INSERT INTO clinic_consultations (appointment_id, chief_complaint, diagnosis, notes, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (appointment_id) DO UPDATE
          SET chief_complaint = EXCLUDED.chief_complaint,
              diagnosis = EXCLUDED.diagnosis,
              notes = EXCLUDED.notes,
              updated_at = now()
        RETURNING *
      `, [data.appointmentId, data.chiefComplaint ?? null, data.diagnosis ?? null, data.notes ?? null, data.createdBy ?? null]);
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

      await client.query('COMMIT');
      return consultation;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getDoctorFavoriteDrugs(this: DatabaseStorage, doctorId: string, clinicId?: string | null): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT f.*, i.name_ar AS item_name_ar, i.sale_price_current
      FROM clinic_doctor_favorite_drugs f
      LEFT JOIN items i ON i.id = f.item_id
      WHERE f.doctor_id = ${doctorId}
        AND (f.clinic_id IS NULL OR f.clinic_id = ${clinicId ?? null})
      ORDER BY f.sort_order, f.drug_name
    `);
    return rows.rows as any[];
  },

  async addFavoriteDrug(this: DatabaseStorage, data: { doctorId: string; clinicId?: string | null; itemId?: string | null; drugName: string; defaultDose?: string; defaultFrequency?: string; defaultDuration?: string }): Promise<any> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_doctor_favorite_drugs (doctor_id, clinic_id, item_id, drug_name, default_dose, default_frequency, default_duration)
      VALUES (${data.doctorId}, ${data.clinicId ?? null}, ${data.itemId ?? null}, ${data.drugName}, ${data.defaultDose ?? null}, ${data.defaultFrequency ?? null}, ${data.defaultDuration ?? null})
      RETURNING *
    `);
    return rows.rows[0] as any;
  },

  async removeFavoriteDrug(this: DatabaseStorage, id: string, doctorId?: string): Promise<void> {
    if (doctorId) {
      await db.execute(sql`DELETE FROM clinic_doctor_favorite_drugs WHERE id = ${id} AND doctor_id = ${doctorId}`);
    } else {
      await db.execute(sql`DELETE FROM clinic_doctor_favorite_drugs WHERE id = ${id}`);
    }
  },

  async getFrequentDrugsNotInFavorites(this: DatabaseStorage, doctorId: string, minCount: number = 2, clinicId?: string | null): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT cd.item_id, cd.drug_name,
             COUNT(DISTINCT cd.consultation_id)::int AS usage_count
      FROM clinic_consultation_drugs cd
      JOIN clinic_consultations c ON c.id = cd.consultation_id
      JOIN clinic_appointments a ON a.id = c.appointment_id
      WHERE a.doctor_id = ${doctorId}
        AND (${clinicId ?? null}::varchar IS NULL OR a.clinic_id = ${clinicId ?? null})
        AND cd.item_id IS NOT NULL
        AND cd.item_id NOT IN (
          SELECT item_id FROM clinic_doctor_favorite_drugs
          WHERE doctor_id = ${doctorId}
            AND (clinic_id IS NULL OR clinic_id = ${clinicId ?? null})
            AND item_id IS NOT NULL
        )
      GROUP BY cd.item_id, cd.drug_name
      HAVING COUNT(DISTINCT cd.consultation_id) >= ${minCount}
      ORDER BY usage_count DESC
      LIMIT 20
    `);
    return rows.rows as any[];
  },

  async getClinicOrders(this: DatabaseStorage, filters: { targetType?: string; status?: string; targetId?: string; doctorId?: string }): Promise<any[]> {
    const conditions: string[] = [
      `(cl.consultation_service_id IS NULL OR o.service_id IS DISTINCT FROM cl.consultation_service_id)`,
    ];
    if (filters.targetType) conditions.push(`o.target_type = '${filters.targetType}'`);
    if (filters.status) conditions.push(`o.status = '${filters.status}'`);
    if (filters.targetId) conditions.push(`o.target_id = '${filters.targetId}'`);
    if (filters.doctorId) conditions.push(`o.doctor_id = '${filters.doctorId}'`);
    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await db.execute(sql.raw(`
      SELECT o.*,
             d.name AS doctor_name, d.specialty AS doctor_specialty,
             s.name_ar AS service_name_ar, s.base_price AS service_price,
             s.department_id AS service_department_id,
             i.name_ar AS item_name_ar,
             a.appointment_date, a.appointment_time, a.turn_number,
             a.patient_name AS appt_patient_name,
             COALESCE(o.target_name, dep.name_ar) AS resolved_target_name,
             dep.code AS department_code
      FROM clinic_orders o
      JOIN doctors d ON d.id = o.doctor_id
      JOIN clinic_appointments a ON a.id = o.appointment_id
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      LEFT JOIN services s ON s.id = o.service_id
      LEFT JOIN departments dep ON o.target_type = 'department'
        AND dep.id = COALESCE(NULLIF(o.target_id, ''), s.department_id)
      LEFT JOIN items i ON i.id = o.item_id
      ${where}
      ORDER BY o.created_at DESC
    `));
    return (rows.rows as any[]).map((r) => ({
      ...r,
      target_name: r.resolved_target_name ?? r.target_name,
    }));
  },

  async getClinicOrder(this: DatabaseStorage, id: string): Promise<any | null> {
    const rows = await db.execute(sql`
      SELECT o.*,
             d.name AS doctor_name,
             s.name_ar AS service_name_ar, s.base_price AS service_price,
             i.name_ar AS item_name_ar,
             i.major_unit_name, i.medium_unit_name, i.minor_unit_name,
             i.major_to_minor, i.medium_to_minor, i.major_to_medium,
             i.sale_price_current, i.has_expiry,
             a.appointment_date, a.patient_name AS appt_patient_name
      FROM clinic_orders o
      JOIN doctors d ON d.id = o.doctor_id
      JOIN clinic_appointments a ON a.id = o.appointment_id
      LEFT JOIN services s ON s.id = o.service_id
      LEFT JOIN items i ON i.id = o.item_id
      WHERE o.id = ${id}
    `);
    return (rows.rows[0] as any) ?? null;
  },

  async executeClinicOrder(this: DatabaseStorage, orderId: string, userId: string): Promise<{ invoiceId: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(`
        SELECT o.*, s.base_price AS service_price, s.name_ar AS service_name_ar,
               a.patient_id, a.patient_name, a.doctor_id
        FROM clinic_orders o
        JOIN clinic_appointments a ON a.id = o.appointment_id
        LEFT JOIN services s ON s.id = o.service_id
        WHERE o.id = $1 AND o.status = 'pending'
        FOR UPDATE
      `, [orderId]);

      if (!orderRes.rows.length) throw new Error("الأمر غير موجود أو تم تنفيذه مسبقاً");
      const order = orderRes.rows[0];

      const unitPrice = parseFloat(order.unit_price ?? '0') || parseFloat(order.service_price ?? '0') || 0;
      const totalAmount = unitPrice.toFixed(2);

      const invNumRes = await client.query(`SELECT COALESCE(MAX(invoice_number), 0) + 1 AS next_num FROM patient_invoice_headers`);
      const invoiceNumber = invNumRes.rows[0].next_num;

      const invRes = await client.query(`
        INSERT INTO patient_invoice_headers
          (invoice_number, patient_id, patient_name, admission_id,
           doctor_id, status, invoice_date,
           total_amount, net_amount, paid_amount, discount_amount,
           created_by, notes)
        VALUES ($1,$2,$3,NULL,$4,'finalized',CURRENT_DATE,$5,$5,0,0,$6,$7)
        RETURNING id
      `, [
        invoiceNumber, order.patient_id ?? null, order.patient_name,
        order.doctor_id ?? null, totalAmount, userId,
        `تنفيذ أمر طبيب: ${order.service_name_ar ?? order.service_name_manual ?? ''}`
      ]);
      const invoiceId = invRes.rows[0].id;

      await client.query(`
        INSERT INTO patient_invoice_lines
          (invoice_id, line_type, service_id, service_name, unit_price, quantity, total_price, notes)
        VALUES ($1,'service',$2,$3,$4,1,$4,NULL)
      `, [invoiceId, order.service_id ?? null, order.service_name_ar ?? order.service_name_manual ?? '', totalAmount]);

      await client.query(`
        UPDATE clinic_orders
        SET status = 'executed', executed_invoice_id = $1, executed_by = $2, executed_at = now()
        WHERE id = $3
      `, [invoiceId, userId, orderId]);

      await client.query('COMMIT');
      return { invoiceId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async cancelClinicOrder(this: DatabaseStorage, orderId: string): Promise<void> {
    await db.execute(sql`UPDATE clinic_orders SET status = 'cancelled' WHERE id = ${orderId} AND status = 'pending'`);
  },

  async getClinicDoctorStatement(this: DatabaseStorage, doctorId: string | null, dateFrom: string, dateTo: string, clinicId?: string | null): Promise<any[]> {
    const doctorFilter = doctorId ? sql`AND a.doctor_id = ${doctorId}` : sql``;
    const clinicFilter = clinicId ? sql`AND a.clinic_id = ${clinicId}` : sql``;
    const rows = await db.execute(sql`
      SELECT
        a.id AS appointment_id,
        a.appointment_date,
        a.turn_number,
        a.patient_name,
        a.status AS appointment_status,
        cl.name_ar AS clinic_name,
        cl.secretary_fee_type,
        cl.secretary_fee_value,
        d.name AS doctor_name,
        COALESCE(sdp_fee.price, s_fee.base_price, 0) AS consultation_fee,
        COALESCE(drugs_totals.total, 0) AS drugs_total,
        COALESCE(services_by_dept.details, '[]'::json) AS services_by_department,
        COALESCE(exec_stats.total_orders, 0) AS total_orders,
        COALESCE(exec_stats.executed_orders, 0) AS executed_orders,
        COALESCE(exec_stats.pending_orders, 0) AS pending_orders,
        COALESCE(exec_stats.total_service_orders, 0) AS total_service_orders,
        COALESCE(exec_stats.executed_service_orders, 0) AS executed_service_orders,
        COALESCE(exec_stats.total_pharmacy_orders, 0) AS total_pharmacy_orders,
        COALESCE(exec_stats.executed_pharmacy_orders, 0) AS executed_pharmacy_orders
      FROM clinic_appointments a
      LEFT JOIN clinic_consultations c ON c.appointment_id = a.id
      LEFT JOIN clinic_clinics cl ON cl.id = a.clinic_id
      LEFT JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN services s_fee ON s_fee.id = cl.consultation_service_id
      LEFT JOIN clinic_service_doctor_prices sdp_fee ON sdp_fee.service_id = cl.consultation_service_id AND sdp_fee.doctor_id = a.doctor_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cd.quantity * cd.unit_price), 0) AS total
        FROM clinic_consultation_drugs cd
        WHERE cd.consultation_id = c.id
      ) drugs_totals ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(json_build_object(
          'departmentId', sub.department_id,
          'departmentName', sub.dept_name,
          'total', sub.dept_total
        )), '[]'::json) AS details
        FROM (
          SELECT
            COALESCE(dep.id, '__none__') AS department_id,
            COALESCE(dep.name_ar, 'بدون قسم') AS dept_name,
            SUM(
              CASE WHEN co.service_id IS NOT NULL THEN COALESCE(co.unit_price, sv.base_price, 0) * COALESCE(co.quantity, 1)
                   ELSE COALESCE(co.unit_price, 0) * COALESCE(co.quantity, 1) END
            ) AS dept_total
          FROM clinic_orders co
          LEFT JOIN services sv ON sv.id = co.service_id
          LEFT JOIN departments dep ON dep.id = sv.department_id
          WHERE co.appointment_id = a.id
            AND co.order_type = 'service'
            AND co.status != 'cancelled'
            AND (cl.consultation_service_id IS NULL OR co.service_id IS DISTINCT FROM cl.consultation_service_id)
          GROUP BY dep.id, dep.name_ar
        ) sub
      ) services_by_dept ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE eo.status = 'executed')::int AS executed_orders,
          COUNT(*) FILTER (WHERE eo.status = 'pending')::int AS pending_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'service' AND eo.status != 'cancelled')::int AS total_service_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'service' AND eo.status = 'executed')::int AS executed_service_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'pharmacy' AND eo.status != 'cancelled')::int AS total_pharmacy_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'pharmacy' AND eo.status = 'executed')::int AS executed_pharmacy_orders
        FROM clinic_orders eo
        WHERE eo.appointment_id = a.id AND eo.status != 'cancelled'
      ) exec_stats ON true
      WHERE a.appointment_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
        AND a.status IN ('in_consultation', 'done')
        ${doctorFilter}
        ${clinicFilter}
      ORDER BY a.appointment_date DESC, a.turn_number
    `);
    return rows.rows as any[];
  },

  async getServiceDoctorPrices(this: DatabaseStorage, serviceId: string): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT sdp.*, d.name AS doctor_name, d.specialty
      FROM clinic_service_doctor_prices sdp
      JOIN doctors d ON d.id = sdp.doctor_id
      WHERE sdp.service_id = ${serviceId}
      ORDER BY d.name
    `);
    return rows.rows as any[];
  },

  async upsertServiceDoctorPrice(this: DatabaseStorage, serviceId: string, doctorId: string, price: number): Promise<any> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_service_doctor_prices (service_id, doctor_id, price)
      VALUES (${serviceId}, ${doctorId}, ${price})
      ON CONFLICT (service_id, doctor_id) DO UPDATE SET price = EXCLUDED.price
      RETURNING *
    `);
    return rows.rows[0] as any;
  },

  async deleteServiceDoctorPrice(this: DatabaseStorage, id: string): Promise<void> {
    await db.execute(sql`DELETE FROM clinic_service_doctor_prices WHERE id = ${id}`);
  },

  async getDoctorServicePrice(this: DatabaseStorage, serviceId: string, doctorId: string): Promise<number | null> {
    const rows = await db.execute(sql`
      SELECT price FROM clinic_service_doctor_prices
      WHERE service_id = ${serviceId} AND doctor_id = ${doctorId}
    `);
    if (rows.rows.length > 0) return parseFloat(String((rows.rows[0] as any).price));
    return null;
  },

  async saveDeptServiceOrder(this: DatabaseStorage, data: DeptServiceOrderInput): Promise<{ invoiceId: string; invoiceNumber: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE');

      const numRes = await client.query(`SELECT COALESCE(MAX(CASE WHEN invoice_number ~ '^[0-9]+$' THEN invoice_number::int ELSE 0 END), 0) + 1 AS next_num FROM patient_invoice_headers`);
      const invoiceNumber = String(numRes.rows[0].next_num);

      const totalAmount = data.services.reduce((sum, s) => sum + s.quantity * s.unitPrice, 0);
      const discountAmount = data.discountAmount ?? (data.discountPercent ? totalAmount * data.discountPercent / 100 : 0);
      const netAmount = Math.max(totalAmount - discountAmount, 0);
      const paidAmount = data.orderType === 'cash' ? netAmount : 0;

      const invRes = await client.query(`
        INSERT INTO patient_invoice_headers
          (invoice_number, invoice_date, patient_name, patient_phone,
           department_id, doctor_name, patient_type, contract_name,
           total_amount, discount_amount, header_discount_amount, header_discount_percent,
           net_amount, paid_amount, status, notes, version)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, 'finalized', $13, 1)
        RETURNING id
      `, [
        invoiceNumber, data.patientName, data.patientPhone ?? null,
        data.departmentId, data.doctorName ?? null,
        data.orderType, data.contractName ?? null,
        totalAmount.toFixed(2), discountAmount.toFixed(2),
        data.discountPercent ?? 0, netAmount.toFixed(2), paidAmount.toFixed(2),
        data.notes ?? null,
      ]);
      const invoiceId = invRes.rows[0].id;

      for (let i = 0; i < data.services.length; i++) {
        const svc = data.services[i];
        await client.query(`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description, quantity, unit_price, total_price, sort_order)
          VALUES ($1, 'service', $2, $3, $4, $5, $6, $7)
        `, [invoiceId, svc.serviceId, svc.serviceName, svc.quantity, svc.unitPrice.toFixed(2), (svc.quantity * svc.unitPrice).toFixed(2), i]);
      }

      if (data.orderType === 'cash' && data.treasuryId && netAmount > 0) {
        await client.query(`
          INSERT INTO patient_invoice_payments (header_id, amount, payment_method, treasury_id, notes)
          VALUES ($1, $2, 'cash', $3, 'سداد تلقائي من شاشة خدمات القسم')
        `, [invoiceId, netAmount.toFixed(2), data.treasuryId]);
        await client.query(`
          INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
          VALUES ($1, 'in', $2, $3, 'patient_invoice', $4, CURRENT_DATE)
        `, [data.treasuryId, netAmount.toFixed(2),
            `تحصيل خدمات قسم - فاتورة ${invoiceNumber} - ${data.patientName}`, invoiceId]);
      }

      const today = new Date();
      const tYear = today.getFullYear();
      const tMonth = today.getMonth() + 1;

      const whRes = await client.query(`
        SELECT w.id FROM warehouses w WHERE w.department_id = $1 AND w.is_active = true LIMIT 1
      `, [data.departmentId]);
      const warehouseId = whRes.rows[0]?.id;

      if (warehouseId) {
        for (const svc of data.services) {
          const consumRes = await client.query(`
            SELECT sc.item_id, sc.quantity AS consume_qty, sc.unit_level,
                   i.major_to_minor, i.medium_to_minor, i.name_ar
            FROM service_consumables sc
            JOIN items i ON i.id = sc.item_id
            WHERE sc.service_id = $1
          `, [svc.serviceId]);

          for (const cons of consumRes.rows) {
            const consumeQty = parseFloat(cons.consume_qty) * svc.quantity;
            let qtyInMinor: number;
            if (cons.unit_level === 'major') {
              qtyInMinor = consumeQty * parseFloat(cons.major_to_minor || '1');
            } else if (cons.unit_level === 'medium') {
              qtyInMinor = consumeQty * parseFloat(cons.medium_to_minor || '1');
            } else {
              qtyInMinor = consumeQty;
            }

            const lotsRes = await client.query(`
              SELECT id, qty_in_minor, purchase_price, expiry_date, expiry_month, expiry_year
              FROM inventory_lots
              WHERE item_id = $1 AND warehouse_id = $2 AND is_active = true
                AND qty_in_minor::numeric > 0
                AND (expiry_year IS NULL OR expiry_year > $3 OR (expiry_year = $3 AND expiry_month >= $4))
              ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
            `, [cons.item_id, warehouseId, tYear, tMonth]);

            let remaining = qtyInMinor;
            for (const lot of lotsRes.rows) {
              if (remaining <= 0) break;
              const available = parseFloat(lot.qty_in_minor);
              const deducted = Math.min(available, remaining);

              await client.query(`
                UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - $1::numeric, updated_at = NOW()
                WHERE id = $2
              `, [deducted.toFixed(4), lot.id]);

              await client.query(`
                INSERT INTO inventory_lot_movements
                  (lot_id, warehouse_id, tx_type, tx_date, qty_change_in_minor, unit_cost, reference_type, reference_id)
                VALUES ($1, $2, 'out', NOW(), $3, $4, 'dept_service', $5)
              `, [lot.id, warehouseId, (-deducted).toFixed(4), lot.purchase_price, invoiceId]);

              remaining -= deducted;
            }
          }
        }
      }

      if (data.clinicOrderIds?.length) {
        for (const orderId of data.clinicOrderIds) {
          await client.query(`
            UPDATE clinic_orders SET status = 'executed', executed_invoice_id = $1, executed_by = $2, executed_at = now()
            WHERE id = $3 AND status = 'pending'
          `, [invoiceId, data.userId, orderId]);
        }
      }

      await client.query(`
        INSERT INTO audit_log (table_name, record_id, action, new_values, user_id)
        VALUES ('patient_invoice_headers', $1, 'dept_service_create', $2, $3)
      `, [invoiceId, JSON.stringify({
        department: data.departmentId, patientName: data.patientName,
        doctor: data.doctorName, orderType: data.orderType,
        services: data.services.map(s => s.serviceName), total: netAmount,
      }), data.userId]);

      await client.query('COMMIT');
      return { invoiceId, invoiceNumber };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async saveDeptServiceOrderBatch(this: DatabaseStorage, data: DeptServiceBatchInput): Promise<{ results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> }> {
    const results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> = [];
    for (const patient of data.patients) {
      try {
        const result = await this.saveDeptServiceOrder({
          patientName: patient.patientName,
          patientPhone: patient.patientPhone,
          doctorId: data.doctorId,
          doctorName: data.doctorName,
          departmentId: data.departmentId,
          orderType: data.orderType,
          contractName: data.contractName,
          treasuryId: data.treasuryId,
          services: data.services,
          discountPercent: data.discountPercent,
          discountAmount: data.discountAmount,
          notes: data.notes,
          userId: data.userId,
        });
        results.push({ patientName: patient.patientName, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber });
      } catch (err: any) {
        results.push({ patientName: patient.patientName, error: err.message });
      }
    }
    return { results };
  },

  async checkDeptServiceDuplicate(this: DatabaseStorage, patientName: string, serviceIds: string[], date: string): Promise<Array<{ serviceName: string; invoiceNumber: number }>> {
    if (!serviceIds.length) return [];
    const placeholders = serviceIds.map((_, i) => `$${i + 3}`).join(',');
    const res = await pool.query(`
      SELECT DISTINCT l.description AS service_name, h.invoice_number
      FROM patient_invoice_headers h
      JOIN patient_invoice_lines l ON l.header_id = h.id
      WHERE h.patient_name = $1
        AND h.invoice_date = $2
        AND h.status != 'cancelled'
        AND l.service_id IN (${placeholders})
    `, [patientName, date, ...serviceIds]);
    return res.rows.map((r: any) => ({ serviceName: r.service_name, invoiceNumber: r.invoice_number }));
  },
};

export default methods;
