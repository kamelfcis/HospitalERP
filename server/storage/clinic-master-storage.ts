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
import type { PoolClient } from "pg";

const OPD_DEFERRED_ACCOUNT_CODE = '21163';

async function postOpdJournalEntry(client: PoolClient, params: {
  appointmentId: string;
  sourceEntryType: 'OPD_ADVANCE_RECEIPT' | 'OPD_REVENUE_RECOGNITION' | 'OPD_ADVANCE_REVERSAL';
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  description: string;
  entryDate: string;
  createdBy?: string | null;
}): Promise<string> {
  const idempotencyCheck = await client.query(
    `SELECT id FROM journal_entries
     WHERE source_type = 'clinic_appointment' AND source_document_id = $1 AND source_entry_type = $2`,
    [params.appointmentId, params.sourceEntryType]
  );
  if (idempotencyCheck.rows.length > 0) {
    return idempotencyCheck.rows[0].id;
  }

  const periodRes = await client.query(
    `SELECT id FROM fiscal_periods WHERE is_closed = false AND start_date <= $1::date AND end_date >= $1::date LIMIT 1`,
    [params.entryDate]
  );
  const periodId = periodRes.rows.length > 0 ? periodRes.rows[0].id : null;

  const seqRes = await client.query(`SELECT nextval('journal_entry_number_seq') AS next_num`);
  const entryNumber = Number(seqRes.rows[0].next_num);

  const jeRes = await client.query(`
    INSERT INTO journal_entries
      (entry_number, entry_date, description, status, period_id,
       total_debit, total_credit, reference,
       source_type, source_document_id, source_entry_type,
       created_by, posted_by, posted_at)
    VALUES ($1, $2::date, $3, 'posted', $4, $5, $5, $6,
            'clinic_appointment', $7, $8, $9, $9, now())
    RETURNING id
  `, [
    entryNumber, params.entryDate, params.description, periodId,
    params.amount.toFixed(2),
    `OPD-${params.sourceEntryType}-${params.appointmentId.slice(0, 8)}`,
    params.appointmentId, params.sourceEntryType,
    params.createdBy ?? null,
  ]);
  const journalId = jeRes.rows[0].id;

  await client.query(`
    INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
    VALUES ($1, 1, $2, $3, '0.00', $4),
           ($1, 2, $5, '0.00', $3, $4)
  `, [journalId, params.debitAccountId, params.amount.toFixed(2), params.description, params.creditAccountId]);

  return journalId;
}

async function getDeferredAccountId(client: PoolClient): Promise<string> {
  const res = await client.query(
    `SELECT id FROM accounts WHERE code = $1 AND is_active = true LIMIT 1`,
    [OPD_DEFERRED_ACCOUNT_CODE]
  );
  if (!res.rows.length) throw new Error(`حساب الإيراد المؤجل (${OPD_DEFERRED_ACCOUNT_CODE}) غير موجود — يرجى إعداده أولاً`);
  return res.rows[0].id;
}

async function getTreasuryGlAccountId(client: PoolClient, treasuryId: string): Promise<string> {
  const res = await client.query(
    `SELECT gl_account_id FROM treasuries WHERE id = $1`, [treasuryId]
  );
  if (!res.rows.length || !res.rows[0].gl_account_id) {
    throw new Error("الخزينة ليس لها حساب دفتر أستاذ مرتبط — يرجى مراجعة الإعدادات");
  }
  return res.rows[0].gl_account_id;
}

const methods = {
  async getClinics(this: DatabaseStorage, userId: string, role: string): Promise<Array<Record<string, unknown>>> {
    const isAdmin = role === 'admin' || role === 'owner';
    if (isAdmin) {
      const rows = await db.execute(sql`
        SELECT c.*, d.name_ar AS department_name,
               w.name_ar AS pharmacy_name,
               sv.name_ar AS consultation_service_name,
               sv.base_price AS consultation_service_base_price,
               tr.name AS treasury_name
        FROM clinic_clinics c
        LEFT JOIN departments d ON d.id = c.department_id
        LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
        LEFT JOIN services sv ON sv.id = c.consultation_service_id
        LEFT JOIN treasuries tr ON tr.id = c.treasury_id
        ORDER BY c.name_ar
      `);
      return rows.rows as Array<Record<string, unknown>>;
    }
    const rows = await db.execute(sql`
      SELECT c.*, d.name_ar AS department_name,
             w.name_ar AS pharmacy_name,
             sv.name_ar AS consultation_service_name,
             sv.base_price AS consultation_service_base_price,
             tr.name AS treasury_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      LEFT JOIN treasuries tr ON tr.id = c.treasury_id
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
             sv.base_price AS consultation_service_base_price,
             tr.name AS treasury_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      LEFT JOIN treasuries tr ON tr.id = c.treasury_id
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

  async createAppointment(this: DatabaseStorage, data: {
    clinicId: string; doctorId: string; patientId?: string; patientName: string;
    patientPhone?: string; appointmentDate: string; appointmentTime?: string;
    notes?: string; createdBy?: string;
    paymentType?: string; insuranceCompany?: string; payerReference?: string;
  }): Promise<any> {
    const paymentType = (data.paymentType || 'CASH').toUpperCase();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── 1. احضر بيانات العيادة والخدمة ────────────────────────────────────
      // قفل صف العيادة أولاً ثم جلب البيانات المرتبطة (FOR UPDATE لا يعمل مع LEFT JOIN)
      const lockRes = await client.query(
        `SELECT id FROM clinic_clinics WHERE id = $1 FOR UPDATE`, [data.clinicId]
      );
      if (!lockRes.rows.length) throw new Error("العيادة غير موجودة");

      const clinicRes = await client.query(`
        SELECT c.*, s.name_ar AS svc_name, s.base_price AS svc_base_price,
               s.department_id AS svc_dept_id, dep.name_ar AS svc_dept_name
        FROM clinic_clinics c
        LEFT JOIN services s ON s.id = c.consultation_service_id
        LEFT JOIN departments dep ON dep.id = s.department_id
        WHERE c.id = $1
      `, [data.clinicId]);
      const clinic = clinicRes.rows[0];
      if (!clinic) throw new Error("العيادة غير موجودة");

      // ── 2. التحقق من متطلبات الدفع ────────────────────────────────────────
      if (paymentType === 'CASH') {
        if (!clinic.treasury_id) throw new Error("العيادة لا تملك خزينة مرتبطة — لا يمكن تحصيل نقداً");
        const treasuryCheck = await client.query(
          `SELECT id FROM treasuries WHERE id = $1`, [clinic.treasury_id]
        );
        // Fallback: treat treasury_id as GL account → find treasury by gl_account_id
        if (treasuryCheck.rows.length === 0) {
          const byGl = await client.query(
            `SELECT id FROM treasuries WHERE gl_account_id = $1 AND is_active = true LIMIT 1`,
            [clinic.treasury_id]
          );
          if (byGl.rows.length === 0) {
            throw new Error("لم يتم العثور على خزينة صالحة مرتبطة بالعيادة — يرجى مراجعة إعداد العيادة");
          }
          clinic.resolved_treasury_id = byGl.rows[0].id;
        } else {
          clinic.resolved_treasury_id = clinic.treasury_id;
        }
      }
      if (paymentType === 'INSURANCE' && !data.insuranceCompany?.trim()) {
        throw new Error("اسم شركة التأمين مطلوب");
      }
      if (paymentType === 'CONTRACT' && !data.payerReference?.trim()) {
        throw new Error("اسم الجهة المتعاقدة مطلوب");
      }

      // ── 2b. حماية من الحجز المكرر ─────────────────────────────────────────
      // نرفض إنشاء موعد ثانٍ لنفس المريض + العيادة + الطبيب + التاريخ
      // إذا كان هناك موعد قائم (غير ملغى) — يمنع تضاعف الفاتورة
      if (data.patientId) {
        const dupCheck = await client.query(`
          SELECT id, turn_number FROM clinic_appointments
          WHERE clinic_id = $1 AND doctor_id = $2 AND patient_id = $3
            AND appointment_date = $4::date AND status != 'cancelled'
          LIMIT 1
        `, [data.clinicId, data.doctorId, data.patientId, data.appointmentDate]);
        if (dupCheck.rows.length > 0) {
          throw new Error(
            `يوجد حجز قائم بالفعل لهذا المريض مع نفس الطبيب في هذا اليوم (دور #${dupCheck.rows[0].turn_number}) — يُرجى الإلغاء أولاً إن كان مطلوباً إعادة الحجز`
          );
        }
      }

      // ── 3. احسب رقم الدور ──────────────────────────────────────────────────
      const turnRes = await client.query(`
        SELECT COALESCE(MAX(turn_number), 0) + 1 AS next_turn
        FROM clinic_appointments
        WHERE clinic_id = $1 AND appointment_date = $2::date
      `, [data.clinicId, data.appointmentDate]);
      const turnNumber = turnRes.rows[0].next_turn;

      // ── 4. أنشئ الموعد ─────────────────────────────────────────────────────
      const ins = await client.query(`
        INSERT INTO clinic_appointments
          (clinic_id, doctor_id, patient_id, patient_name, patient_phone,
           appointment_date, appointment_time, turn_number, notes, created_by,
           payment_type, insurance_company, payer_reference)
        VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [
        data.clinicId, data.doctorId, data.patientId ?? null, data.patientName,
        data.patientPhone ?? null, data.appointmentDate, data.appointmentTime ?? null,
        turnNumber, data.notes ?? null, data.createdBy ?? null,
        paymentType,
        paymentType === 'INSURANCE' ? (data.insuranceCompany?.trim() ?? null) : null,
        paymentType === 'CONTRACT'  ? (data.payerReference?.trim()   ?? null) : null,
      ]);
      const appointment = ins.rows[0];

      // ── 5. إنشاء فاتورة رسم الكشف (إذا كانت العيادة تملك خدمة كشف) ──────
      if (clinic.consultation_service_id) {
        // حساب سعر الكشف: سعر الطبيب أو السعر الأساسي
        const dpRes = await client.query(
          `SELECT price FROM clinic_service_doctor_prices WHERE service_id = $1 AND doctor_id = $2`,
          [clinic.consultation_service_id, data.doctorId]
        );
        const consultationFee = dpRes.rows.length > 0
          ? parseFloat(String(dpRes.rows[0].price))
          : parseFloat(String(clinic.svc_base_price || 0));

        // رقم الفاتورة التالي
        const numRes = await client.query(
          `SELECT COALESCE(MAX(CASE WHEN invoice_number ~ '^[0-9]+$' THEN invoice_number::int ELSE 0 END), 0) + 1 AS next_num FROM patient_invoice_headers`
        );
        const invoiceNumber = String(numRes.rows[0].next_num);

        // نوع المريض في الفاتورة
        const invoicePatientType = paymentType === 'CASH' ? 'cash' : 'contract';
        const contractName = paymentType === 'INSURANCE'
          ? (data.insuranceCompany?.trim() ?? null)
          : paymentType === 'CONTRACT'
          ? (data.payerReference?.trim() ?? null)
          : null;

        // أنشئ رأس الفاتورة
        const headerRes = await client.query(`
          INSERT INTO patient_invoice_headers
            (invoice_number, invoice_date, patient_id, patient_name, patient_phone,
             patient_type, contract_name, doctor_name,
             total_amount, discount_amount, net_amount, paid_amount,
             status, notes)
          VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, 0, $8, 0, 'draft', $9)
          RETURNING id, invoice_number
        `, [
          invoiceNumber,
          data.patientId ?? null,
          data.patientName,
          data.patientPhone ?? null,
          invoicePatientType,
          contractName,
          null, // doctor_name — filled by department when executing
          consultationFee,
          `رسم كشف عيادة — ${clinic.name_ar ?? ''}`,
        ]);
        const invoiceId = headerRes.rows[0].id;

        // أضف سطر الخدمة
        await client.query(`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description, quantity, unit_price, total_price, sort_order)
          VALUES ($1, 'service', $2, $3, 1, $4, $4, 1)
        `, [
          invoiceId,
          clinic.consultation_service_id,
          clinic.svc_name ?? 'رسم كشف',
          consultationFee,
        ]);

        // ── CASH: أنشئ دفع فوري + معاملة خزنة + غيّر الفاتورة لـ finalized ──
        if (paymentType === 'CASH' && consultationFee > 0) {
          const resolvedTreasuryId = clinic.resolved_treasury_id;

          await client.query(`
            INSERT INTO patient_invoice_payments
              (header_id, payment_date, amount, payment_method, treasury_id, notes)
            VALUES ($1, CURRENT_DATE, $2, 'cash', $3, $4)
          `, [
            invoiceId,
            consultationFee,
            resolvedTreasuryId,
            `سداد رسم كشف — موعد #${appointment.id}`,
          ]);

          await client.query(`
            INSERT INTO treasury_transactions
              (treasury_id, type, amount, description, source_type, source_id, transaction_date)
            VALUES ($1, 'receipt', $2, $3, 'clinic_appointment', $4, CURRENT_DATE)
            ON CONFLICT (source_type, source_id, treasury_id)
              WHERE source_type IS NOT NULL AND source_id IS NOT NULL
            DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description
          `, [
            resolvedTreasuryId,
            consultationFee,
            `رسم كشف: ${data.patientName}`,
            invoiceId,
          ]);

          await client.query(`
            UPDATE patient_invoice_headers
            SET status = 'finalized', paid_amount = $2, finalized_at = now(), updated_at = now()
            WHERE id = $1
          `, [invoiceId, consultationFee]);

          // ── GL: قيد استلام مقدم (د. خزينة / ك. 21163) ──────────────────────
          try {
            await client.query('SAVEPOINT gl_advance');
            const treasuryGlAccountId = await getTreasuryGlAccountId(client, resolvedTreasuryId);
            const deferredAccountId = await getDeferredAccountId(client);
            await postOpdJournalEntry(client, {
              appointmentId: appointment.id,
              sourceEntryType: 'OPD_ADVANCE_RECEIPT',
              debitAccountId: treasuryGlAccountId,
              creditAccountId: deferredAccountId,
              amount: consultationFee,
              description: `مقدم كشف عيادة: ${data.patientName} — ${clinic.name_ar ?? ''}`,
              entryDate: data.appointmentDate,
              createdBy: data.createdBy,
            });
            await client.query(
              `UPDATE clinic_appointments SET accounting_posted_advance = TRUE WHERE id = $1`,
              [appointment.id]
            );
            await client.query('RELEASE SAVEPOINT gl_advance');
          } catch (glErr) {
            await client.query('ROLLBACK TO SAVEPOINT gl_advance');
            console.error('[GL] OPD_ADVANCE_RECEIPT failed (non-blocking):', glErr);
          }
        }

        // ── INSURANCE / CONTRACT: الفاتورة تبقى draft (لا دفع) ──────────────
        // لا شيء إضافي — الفاتورة في وضع draft جاهزة للتحصيل لاحقاً

        // أنشئ أمر خدمة كشف بحالة executed (مُنفَّذ عند الحجز)
        await client.query(`
          INSERT INTO clinic_orders
            (appointment_id, doctor_id, patient_name,
             order_type, target_type, target_id, target_name,
             service_id, service_name_manual, quantity, unit_price, status)
          VALUES ($1,$2,$3,'service','department',$4,$5,$6,$7,1,$8,'executed')
        `, [
          appointment.id, data.doctorId, data.patientName,
          clinic.svc_dept_id ?? null,
          clinic.svc_dept_name ?? null,
          clinic.consultation_service_id,
          clinic.svc_name ?? 'رسم كشف',
          consultationFee,
        ]);

        // اربط الفاتورة بالموعد
        await client.query(
          `UPDATE clinic_appointments SET invoice_id = $1 WHERE id = $2`,
          [invoiceId, appointment.id]
        );

        appointment.invoice_id = invoiceId;
        appointment.invoice_number = invoiceNumber;
        appointment.consultation_fee = consultationFee;
        appointment.invoice_status = paymentType === 'CASH' ? 'finalized' : 'draft';
      }

      await client.query('COMMIT');
      return appointment;
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
    if (status === 'done') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const aptRes = await client.query(
          `SELECT a.clinic_id, a.patient_name, a.appointment_date, a.payment_type,
                  a.accounting_posted_advance, a.accounting_posted_revenue, a.invoice_id,
                  c.treasury_id, c.consultation_service_id
           FROM clinic_appointments a
           JOIN clinic_clinics c ON c.id = a.clinic_id
           WHERE a.id = $1 FOR UPDATE`, [id]
        );
        const apt = aptRes.rows[0];

        await client.query(`UPDATE clinic_appointments SET status = 'done' WHERE id = $1`, [id]);

        if (apt && apt.payment_type === 'CASH'
            && apt.accounting_posted_advance === true
            && apt.accounting_posted_revenue === false
            && apt.consultation_service_id) {
          try {
            await client.query('SAVEPOINT gl_revenue');
            const deferredAccountId = await getDeferredAccountId(client);
            const svcRes = await client.query(
              `SELECT revenue_account_id FROM services WHERE id = $1`, [apt.consultation_service_id]
            );
            const revenueAccountId = svcRes.rows[0]?.revenue_account_id;
            if (revenueAccountId) {
              const invRes = await client.query(
                `SELECT net_amount FROM patient_invoice_headers WHERE id = $1`, [apt.invoice_id]
              );
              const amount = invRes.rows.length > 0 ? parseFloat(invRes.rows[0].net_amount || '0') : 0;
              if (amount > 0) {
                await postOpdJournalEntry(client, {
                  appointmentId: id,
                  sourceEntryType: 'OPD_REVENUE_RECOGNITION',
                  debitAccountId: deferredAccountId,
                  creditAccountId: revenueAccountId,
                  amount,
                  description: `اعتراف إيراد كشف: ${apt.patient_name}`,
                  entryDate: apt.appointment_date,
                });
                await client.query(
                  `UPDATE clinic_appointments SET accounting_posted_revenue = TRUE WHERE id = $1`, [id]
                );
              }
            }
            await client.query('RELEASE SAVEPOINT gl_revenue');
          } catch (glErr) {
            await client.query('ROLLBACK TO SAVEPOINT gl_revenue');
            console.error('[GL] OPD_REVENUE_RECOGNITION failed (non-blocking):', glErr);
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      await db.execute(sql`UPDATE clinic_appointments SET status = ${status} WHERE id = ${id}`);
    }
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
          // احضر الحالة الفعلية من clinic_orders (الأمر أُنشئ عند الحجز بـ consultation_id = NULL)
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
        // احضر الحالة الفعلية من أمر الحجز (consultation_id = NULL)
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
    drugs: { lineNo: number; itemId?: string | null; drugName: string; dose?: string; frequency?: string; duration?: string; notes?: string; unitLevel?: string; quantity?: number; unitPrice?: number }[];
    serviceOrders: { serviceId?: string | null; serviceNameManual?: string; targetId?: string; targetName?: string; unitPrice?: number }[];
  }): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // احضر بيانات الموعد والعيادة (للحصول على consultation_service_id لتجاوز خدمة الكشف)
      const apptRes = await client.query(
        `SELECT a.*, d.name AS doctor_name, cl.default_pharmacy_id, cl.consultation_service_id
         FROM clinic_appointments a
         JOIN doctors d ON d.id = a.doctor_id
         JOIN clinic_clinics cl ON cl.id = a.clinic_id
         WHERE a.id = $1`, [data.appointmentId]
      );
      const appt = apptRes.rows[0];
      if (!appt) throw new Error("الموعد غير موجود");

      // أنشئ أو حدّث سجل الكشف (بيانات سريرية فقط — بدون بيانات مالية)
      const consRes = await client.query(`
        INSERT INTO clinic_consultations
          (appointment_id, chief_complaint, diagnosis, notes, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (appointment_id) DO UPDATE
          SET chief_complaint = EXCLUDED.chief_complaint,
              diagnosis       = EXCLUDED.diagnosis,
              notes           = EXCLUDED.notes,
              updated_at      = now()
        RETURNING *
      `, [data.appointmentId, data.chiefComplaint ?? null, data.diagnosis ?? null,
          data.notes ?? null, data.createdBy ?? null]);
      const consultation = consRes.rows[0];

      // احفظ الأدوية (حذف ثم إعادة إدراج — idempotent)
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

      // احذف أوامر الكشف المرتبطة بهذا الكشف (ليس أوامر الحجز التي لها consultation_id = NULL)
      await client.query(`DELETE FROM clinic_orders WHERE consultation_id = $1`, [consultation.id]);

      // أدوات الصيدلية — أنشئ أوامر pharmacy بحالة pending
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

      // خدمات الطبيب (تحاليل/أشعة/غيرها) — تجاوز خدمة الكشف (تم تسجيلها عند الحجز)
      for (const svc of data.serviceOrders) {
        if (!svc.serviceId && !svc.serviceNameManual) continue;
        // تجاوز خدمة الكشف — تم إنشاء أمرها عند حجز الموعد بحالة executed
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

  async cancelAndRefundAppointment(this: DatabaseStorage, aptId: string, refundedBy: string, refundAmount?: number, cancelAppointment?: boolean): Promise<{ refundedAmount: string; patientName: string; isFullCancel: boolean }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── 1. قفل وجلب الموعد والعيادة ────────────────────────────────────────
      const aptRes = await client.query(
        `SELECT a.*, c.treasury_id AS clinic_treasury_id, c.id AS clinic_id_val
         FROM clinic_appointments a
         JOIN clinic_clinics c ON c.id = a.clinic_id
         WHERE a.id = $1 FOR UPDATE`,
        [aptId]
      );
      if (!aptRes.rows.length) throw new Error("الموعد غير موجود");
      const apt = aptRes.rows[0];

      // ── 2. التحقق من حالة الموعد ─────────────────────────────────────────
      if (apt.status === 'cancelled') throw new Error("الموعد ملغى بالفعل");
      if (apt.status === 'done') throw new Error("لا يمكن استرداد موعد منتهٍ");
      if (apt.payment_type !== 'CASH') throw new Error("هذا الموعد لا يحمل دفعة نقدية — لا يوجد مبلغ لإعادته");
      if (!apt.invoice_id) throw new Error("لم يتم ربط فاتورة بهذا الموعد — لا توجد دفعة مسجّلة");

      // ── 3. قفل وجلب الفاتورة ────────────────────────────────────────────
      const invRes = await client.query(
        `SELECT * FROM patient_invoice_headers WHERE id = $1 FOR UPDATE`,
        [apt.invoice_id]
      );
      if (!invRes.rows.length) throw new Error("الفاتورة غير موجودة");
      const inv = invRes.rows[0];
      if (inv.status === 'cancelled') throw new Error("الفاتورة ملغاة بالفعل");

      const paidAmount = parseFloat(inv.paid_amount || '0');
      if (paidAmount <= 0) throw new Error("لا يوجد مبلغ مدفوع في هذه الفاتورة لإعادته");

      // ── 4. تحديد المبلغ الفعلي وقاعدة الإلغاء ────────────────────────────
      // القاعدة الصارمة: إذا طُلب إلغاء الموعد → يُعاد المبلغ كاملاً تلقائياً
      // لا يُسمح بإلغاء الموعد مع الاحتفاظ بجزء من المبلغ
      let actualRefund: number;
      let isFullCancel: boolean;

      if (cancelAppointment === true) {
        // إلغاء الموعد: استرداد كامل المبلغ المتبقي دائماً
        actualRefund = paidAmount;
        isFullCancel = true;
      } else {
        // استرداد جزئي أو كامل بدون إلغاء
        if (refundAmount === undefined) {
          actualRefund = paidAmount; // بدون تحديد = إعادة الكل
          isFullCancel = false;
        } else {
          const req = parseFloat(refundAmount.toFixed(2));
          if (req <= 0) throw new Error("مبلغ الاسترداد يجب أن يكون أكبر من صفر");
          if (req > paidAmount) throw new Error(`مبلغ الاسترداد (${req}) أكبر من المبلغ المدفوع (${paidAmount}) — لا يمكن الاسترداد بأكثر مما دُفع`);
          actualRefund = req;
          isFullCancel = false;
        }
      }

      // ── 5. التحقق من الخزينة ─────────────────────────────────────────────
      let treasuryId: string = apt.clinic_treasury_id;
      if (!treasuryId) throw new Error("العيادة لا تملك خزينة مرتبطة — تعذّر إتمام الاسترداد");

      const tRes = await client.query(`SELECT id FROM treasuries WHERE id = $1 AND is_active = true`, [treasuryId]);
      if (!tRes.rows.length) {
        // Fallback: treasury_id كان GL account قبل الإصلاح
        const byGl = await client.query(
          `SELECT id FROM treasuries WHERE gl_account_id = $1 AND is_active = true LIMIT 1`,
          [treasuryId]
        );
        if (!byGl.rows.length) throw new Error("لم يتم العثور على خزينة نشطة مرتبطة بالعيادة");
        treasuryId = byGl.rows[0].id;
      }

      const today = new Date().toISOString().slice(0, 10);
      const refundLabel = isFullCancel ? 'استرداد كامل — إلغاء موعد' : 'استرداد جزئي';

      // ── 6. تحديث حالة الموعد ─────────────────────────────────────────────
      if (isFullCancel) {
        await client.query(
          `UPDATE clinic_appointments SET status = 'cancelled' WHERE id = $1`,
          [aptId]
        );
      }

      // ── 7. تحديث الفاتورة ────────────────────────────────────────────────
      if (isFullCancel) {
        await client.query(
          `UPDATE patient_invoice_headers
           SET status = 'cancelled', paid_amount = 0
           WHERE id = $1`,
          [apt.invoice_id]
        );
      } else {
        const newPaid = parseFloat((paidAmount - actualRefund).toFixed(2));
        const newStatus = newPaid <= 0 ? 'draft' : 'finalized';
        await client.query(
          `UPDATE patient_invoice_headers SET paid_amount = $1, status = $2 WHERE id = $3`,
          [newPaid, newStatus, apt.invoice_id]
        );
      }

      // ── 8. إدخال صف رد مبلغ سالب في patient_invoice_payments ─────────────
      await client.query(
        `INSERT INTO patient_invoice_payments
           (header_id, payment_date, amount, payment_method, notes, treasury_id)
         VALUES ($1, $2::date, $3, 'cash', $4, $5)`,
        [apt.invoice_id, today, -actualRefund,
         `${refundLabel} — بواسطة: ${refundedBy}`, treasuryId]
      );

      // ── 9. قيد عكسي في الخزينة (source_id فريد لكل استرداد) ─────────────
      await client.query(
        `INSERT INTO treasury_transactions
           (treasury_id, type, amount, description, source_type, source_id, transaction_date)
         VALUES ($1, 'refund', $2, $3, 'clinic_appointment_refund', gen_random_uuid(), $4::date)`,
        [treasuryId, -actualRefund,
         `${refundLabel} — رسم كشف: ${apt.patient_name} (موعد: ${aptId.slice(0,8)})`,
         today]
      );

      // ── 10. سجل تدقيق شامل ───────────────────────────────────────────────
      await client.query(
        `INSERT INTO audit_log (table_name, record_id, action, new_values, user_id)
         VALUES ('clinic_appointments', $1, 'refund', $2, $3)`,
        [aptId, JSON.stringify({
          aptId,
          invoiceId: apt.invoice_id,
          patientName: apt.patient_name,
          refundAmount: actualRefund,
          paidAmountBefore: paidAmount,
          isFullCancel,
          type: isFullCancel ? 'full_refund_with_cancel' : 'partial_refund',
          treasuryId,
          clinicId: apt.clinic_id_val,
          refundedBy,
          timestamp: new Date().toISOString(),
        }), refundedBy]
      );

      // ── 11. GL: عكس قيد المقدم إن كان الإلغاء كاملاً (د. 21163 / ك. خزينة) ──
      if (isFullCancel && apt.accounting_posted_advance === true) {
        try {
          await client.query('SAVEPOINT gl_reversal');
          const deferredAccountId = await getDeferredAccountId(client);
          const treasuryGlAccountId = await getTreasuryGlAccountId(client, treasuryId);
          await postOpdJournalEntry(client, {
            appointmentId: aptId,
            sourceEntryType: 'OPD_ADVANCE_REVERSAL',
            debitAccountId: deferredAccountId,
            creditAccountId: treasuryGlAccountId,
            amount: actualRefund,
            description: `عكس مقدم كشف (إلغاء): ${apt.patient_name}`,
            entryDate: today,
            createdBy: refundedBy,
          });
          await client.query('RELEASE SAVEPOINT gl_reversal');
        } catch (glErr) {
          await client.query('ROLLBACK TO SAVEPOINT gl_reversal');
          console.error('[GL] OPD_ADVANCE_REVERSAL failed (non-blocking):', glErr);
        }
      }

      await client.query('COMMIT');
      return { refundedAmount: actualRefund.toFixed(2), patientName: apt.patient_name, isFullCancel };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

export default methods;
