import type { PoolClient } from "pg";
import { addLinesToVisitInvoice } from "../services/encounter-routing";
import {
  logAccountingEvent,
  postOpdJournalEntry,
  getAccountIdByCode,
  getDeferredAccountId,
  getTreasuryGlAccountId,
} from "./clinic-shared-helpers";
import type { CreateAppointmentData } from "./clinic-booking-create-setup";

export async function handleConsultationInvoice(
  client: PoolClient,
  clinic: any,
  appointment: any,
  data: CreateAppointmentData,
  paymentType: string,
): Promise<void> {
  if (!clinic.consultation_service_id) return;

  const dpRes = await client.query(
    `SELECT price FROM clinic_service_doctor_prices WHERE service_id = $1 AND doctor_id = $2`,
    [clinic.consultation_service_id, data.doctorId]
  );
  const consultationFee = dpRes.rows.length > 0
    ? parseFloat(String(dpRes.rows[0].price))
    : parseFloat(String(clinic.svc_base_price || 0));

  const invoicePatientType = paymentType === 'CASH' ? 'cash' : 'contract';
  const contractName = paymentType === 'INSURANCE'
    ? (data.insuranceCompany?.trim() ?? null)
    : paymentType === 'CONTRACT'
    ? (data.payerReference?.trim() ?? null)
    : null;

  let invoiceId: string;
  let invoiceNumber: string;

  if (data.visitId) {
    await client.query('COMMIT');

    const routeResult = await addLinesToVisitInvoice({
      visitId: data.visitId,
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientId: data.patientId,
      departmentId: clinic.svc_dept_id ?? null,
      doctorName: null,
      patientType: invoicePatientType as 'cash' | 'contract',
      contractName,
      encounterType: 'clinic',
      encounterDoctorId: data.doctorId,
      createdBy: data.createdBy,
      encounterMetadata: { source: 'consultation', clinicId: data.clinicId },
      lines: [{
        lineType: 'service' as const,
        serviceId: clinic.consultation_service_id,
        description: clinic.svc_name ?? 'رسم كشف',
        quantity: 1,
        unitPrice: consultationFee,
        sourceType: 'clinic_appointment',
        sourceId: appointment.id,
      }],
    });

    invoiceId = routeResult.invoiceId;
    invoiceNumber = routeResult.invoiceNumber;

    await client.query('BEGIN');

    await client.query(
      `UPDATE clinic_appointments SET encounter_id = $1 WHERE id = $2`,
      [routeResult.encounterId, appointment.id]
    );

    if (paymentType === 'CASH' && consultationFee > 0) {
      await recordCashPayment(client, invoiceId, consultationFee, clinic.resolved_treasury_id, appointment, data);
      await client.query(
        `UPDATE clinic_appointments
         SET accounting_posted_advance = TRUE,
             gross_amount     = $2,
             paid_amount      = $2,
             remaining_amount = 0
         WHERE id = $1`,
        [appointment.id, consultationFee]
      );
    }

  } else {
    const numRes = await client.query(
      `SELECT COALESCE(MAX(CASE WHEN invoice_number ~ '^[0-9]+$' THEN invoice_number::int ELSE 0 END), 0) + 1 AS next_num FROM patient_invoice_headers`
    );
    invoiceNumber = String(numRes.rows[0].next_num);

    const headerRes = await client.query(`
      INSERT INTO patient_invoice_headers
        (invoice_number, invoice_date, patient_id, patient_name, patient_phone,
         patient_type, contract_name, doctor_name,
         total_amount, discount_amount, net_amount, paid_amount,
         status, notes)
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, 0, $8, 0, 'draft', $9)
      RETURNING id, invoice_number
    `, [
      invoiceNumber, data.patientId ?? null, data.patientName,
      data.patientPhone ?? null, invoicePatientType, contractName,
      null, consultationFee,
      `رسم كشف عيادة — ${clinic.name_ar ?? ''}`,
    ]);
    invoiceId = headerRes.rows[0].id;

    await client.query(`
      INSERT INTO patient_invoice_lines
        (header_id, line_type, service_id, description, quantity, unit_price, total_price, sort_order)
      VALUES ($1, 'service', $2, $3, 1, $4, $4, 1)
    `, [invoiceId, clinic.consultation_service_id, clinic.svc_name ?? 'رسم كشف', consultationFee]);

    if (paymentType === 'CASH' && consultationFee > 0) {
      await recordCashPayment(client, invoiceId, consultationFee, clinic.resolved_treasury_id, appointment, data);

      await client.query(`
        UPDATE patient_invoice_headers
        SET status = 'finalized', paid_amount = $2, finalized_at = now(), updated_at = now()
        WHERE id = $1
      `, [invoiceId, consultationFee]);

      const treasuryGlAccountId = await getTreasuryGlAccountId(client, clinic.resolved_treasury_id);
      const deferredAccountId   = await getDeferredAccountId(client);
      const bookingDate = new Date().toISOString().slice(0, 10);
      try {
        await postOpdJournalEntry(client, {
          appointmentId: appointment.id,
          sourceEntryType: 'OPD_ADVANCE_RECEIPT',
          debitLines: [{ accountId: treasuryGlAccountId, amount: consultationFee }],
          creditAccountId: deferredAccountId,
          creditAmount: consultationFee,
          description: `مقدم كشف عيادة: ${data.patientName} — ${clinic.name_ar ?? ''}`,
          entryDate: bookingDate,
          createdBy: data.createdBy,
        });
        await logAccountingEvent(client, {
          eventType: 'OPD_ADVANCE_RECEIPT', sourceId: appointment.id,
          appointmentId: appointment.id, postedByUser: data.createdBy,
          status: 'success',
        });
      } catch (glErr) {
        await logAccountingEvent(client, {
          eventType: 'OPD_ADVANCE_RECEIPT', sourceId: appointment.id,
          appointmentId: appointment.id, postedByUser: data.createdBy,
          status: 'failure', errorMessage: String(glErr),
        });
        throw glErr;
      }
      await client.query(
        `UPDATE clinic_appointments
         SET accounting_posted_advance = TRUE,
             gross_amount     = $2,
             paid_amount      = $2,
             remaining_amount = 0
         WHERE id = $1`,
        [appointment.id, consultationFee]
      );
    }
  }

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

  await client.query(
    `UPDATE clinic_appointments SET invoice_id = $1 WHERE id = $2`,
    [invoiceId, appointment.id]
  );

  appointment.invoice_id = invoiceId;
  appointment.invoice_number = invoiceNumber;
  appointment.consultation_fee = consultationFee;
  appointment.invoice_status = (data.visitId || paymentType !== 'CASH') ? 'draft' : 'finalized';
}

async function recordCashPayment(
  client: PoolClient,
  invoiceId: string,
  consultationFee: number,
  resolvedTreasuryId: string,
  appointment: any,
  data: CreateAppointmentData,
): Promise<void> {
  await client.query(`
    INSERT INTO patient_invoice_payments
      (header_id, payment_date, amount, payment_method, treasury_id, notes)
    VALUES ($1, CURRENT_DATE, $2, 'cash', $3, $4)
  `, [invoiceId, consultationFee, resolvedTreasuryId,
      `سداد رسم كشف — موعد #${appointment.id}`]);

  await client.query(`
    INSERT INTO treasury_transactions
      (treasury_id, type, amount, description, source_type, source_id, transaction_date)
    VALUES ($1, 'receipt', $2, $3, 'clinic_appointment', $4, CURRENT_DATE)
    ON CONFLICT (source_type, source_id, treasury_id)
      WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description
  `, [resolvedTreasuryId, consultationFee, `رسم كشف: ${data.patientName}`, invoiceId]);

  await client.query(`
    UPDATE patient_invoice_headers
    SET paid_amount = paid_amount::numeric + $2::numeric, updated_at = now()
    WHERE id = $1
  `, [invoiceId, consultationFee]);
}
