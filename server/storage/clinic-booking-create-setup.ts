import type { PoolClient } from "pg";

export interface CreateAppointmentData {
  clinicId: string; doctorId: string; patientId?: string; patientName: string;
  patientPhone?: string; appointmentDate: string; appointmentTime?: string;
  notes?: string; createdBy?: string;
  paymentType?: string; insuranceCompany?: string; payerReference?: string;
  companyId?: string; contractId?: string; contractMemberId?: string;
  visitId?: string;
}

export async function resolveClinicAndValidate(
  client: PoolClient,
  data: CreateAppointmentData,
  paymentType: string,
): Promise<any> {
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

  if (paymentType === 'CASH') {
    if (!clinic.treasury_id) throw new Error("العيادة لا تملك خزينة مرتبطة — لا يمكن تحصيل نقداً");
    const treasuryCheck = await client.query(
      `SELECT id FROM treasuries WHERE id = $1`, [clinic.treasury_id]
    );
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
  if (paymentType === 'INSURANCE' && !data.insuranceCompany?.trim() && !data.contractMemberId) {
    throw new Error("اسم شركة التأمين أو بطاقة المنتسب مطلوبة");
  }
  if (paymentType === 'CONTRACT' && !data.contractMemberId) {
    throw new Error("يجب تحديد بطاقة المنتسب لحجوزات التعاقد");
  }

  return clinic;
}

export async function checkDuplicateAppointment(
  client: PoolClient,
  data: CreateAppointmentData,
): Promise<void> {
  if (!data.patientId) return;
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

export async function getNextTurnNumber(
  client: PoolClient,
  clinicId: string,
  appointmentDate: string,
): Promise<number> {
  const turnRes = await client.query(`
    SELECT COALESCE(MAX(turn_number), 0) + 1 AS next_turn
    FROM clinic_appointments
    WHERE clinic_id = $1 AND appointment_date = $2::date
  `, [clinicId, appointmentDate]);
  return turnRes.rows[0].next_turn;
}

export async function insertAppointmentRecord(
  client: PoolClient,
  data: CreateAppointmentData,
  paymentType: string,
  turnNumber: number,
): Promise<any> {
  const ins = await client.query(`
    INSERT INTO clinic_appointments
      (clinic_id, doctor_id, patient_id, patient_name, patient_phone,
       appointment_date, appointment_time, turn_number, notes, created_by,
       payment_type, insurance_company, payer_reference,
       company_id, contract_id, contract_member_id, visit_id)
    VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING *
  `, [
    data.clinicId, data.doctorId, data.patientId ?? null, data.patientName,
    data.patientPhone ?? null, data.appointmentDate, data.appointmentTime ?? null,
    turnNumber, data.notes ?? null, data.createdBy ?? null,
    paymentType,
    paymentType === 'INSURANCE' ? (data.insuranceCompany?.trim() ?? null) : null,
    paymentType === 'CONTRACT'  ? (data.payerReference?.trim()   ?? null) : null,
    data.companyId        ?? null,
    data.contractId       ?? null,
    data.contractMemberId ?? null,
    data.visitId ?? null,
  ]);
  return ins.rows[0];
}
