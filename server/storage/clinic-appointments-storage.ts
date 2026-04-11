import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";
import { addLinesToVisitInvoice } from "../services/encounter-routing";
import {
  logAccountingEvent,
  postOpdJournalEntry,
  getAccountIdByCode,
  getDeferredAccountId,
  getTreasuryGlAccountId,
  OPD_DOCTOR_DEDUCTION_CODE,
  OPD_NO_SHOW_REVENUE_CODE,
} from "./clinic-shared-helpers";

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

  async createAppointment(this: DatabaseStorage, data: {
    clinicId: string; doctorId: string; patientId?: string; patientName: string;
    patientPhone?: string; appointmentDate: string; appointmentTime?: string;
    notes?: string; createdBy?: string;
    paymentType?: string; insuranceCompany?: string; payerReference?: string;
    companyId?: string; contractId?: string; contractMemberId?: string;
    visitId?: string;
  }): Promise<any> {
    const paymentType = (data.paymentType || 'CASH').toUpperCase();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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

      const turnRes = await client.query(`
        SELECT COALESCE(MAX(turn_number), 0) + 1 AS next_turn
        FROM clinic_appointments
        WHERE clinic_id = $1 AND appointment_date = $2::date
      `, [data.clinicId, data.appointmentDate]);
      const turnNumber = turnRes.rows[0].next_turn;

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
      const appointment = ins.rows[0];

      if (clinic.consultation_service_id) {
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
            const resolvedTreasuryId = clinic.resolved_treasury_id;

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
            const resolvedTreasuryId = clinic.resolved_treasury_id;

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
              SET status = 'finalized', paid_amount = $2, finalized_at = now(), updated_at = now()
              WHERE id = $1
            `, [invoiceId, consultationFee]);

            const treasuryGlAccountId = await getTreasuryGlAccountId(client, resolvedTreasuryId);
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
    if (status === 'done' || status === 'no_show') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const aptRes = await client.query(
          `SELECT a.clinic_id, a.patient_name, a.appointment_date, a.payment_type,
                  a.accounting_posted_advance, a.accounting_posted_revenue, a.invoice_id,
                  a.gross_amount, a.paid_amount, a.remaining_amount,
                  a.service_delivered,
                  c.treasury_id, c.consultation_service_id
           FROM clinic_appointments a
           JOIN clinic_clinics c ON c.id = a.clinic_id
           WHERE a.id = $1 FOR UPDATE`, [id]
        );
        if (!aptRes.rows.length) throw new Error("الموعد غير موجود");
        const apt = aptRes.rows[0];

        await client.query(
          `UPDATE clinic_appointments SET status = $2 WHERE id = $1`, [id, status]
        );

        const today = new Date().toISOString().slice(0, 10);

        if (status === 'done'
            && apt.payment_type === 'CASH'
            && apt.accounting_posted_advance === true
            && apt.accounting_posted_revenue === false
            && apt.consultation_service_id) {
          if (!apt.service_delivered) {
            // Skip GL silently — service not yet delivered
          } else {
            const svcRes = await client.query(
              `SELECT revenue_account_id FROM services WHERE id = $1`, [apt.consultation_service_id]
            );
            const revenueAccountId = svcRes.rows[0]?.revenue_account_id;
            if (!revenueAccountId) {
              throw new Error("خدمة الكشف ليس لها حساب إيراد مرتبط — يرجى ضبط revenue_account_id في إعدادات الخدمة");
            }

            const grossAmount     = parseFloat(apt.gross_amount     || '0');
            const paidAmount      = parseFloat(apt.paid_amount      || '0');
            const remainingAmount = parseFloat(apt.remaining_amount  || '0');

            if (grossAmount > 0) {
              const deferredAccountId = await getDeferredAccountId(client);

              const debitLines: Array<{ accountId: string; amount: number }> = [];
              if (paidAmount > 0) {
                debitLines.push({ accountId: deferredAccountId, amount: paidAmount });
              }
              if (remainingAmount > 0) {
                const doctorDeductionAccountId = await getAccountIdByCode(client, OPD_DOCTOR_DEDUCTION_CODE);
                debitLines.push({ accountId: doctorDeductionAccountId, amount: remainingAmount });
              }
              if (debitLines.length === 0) {
                debitLines.push({ accountId: deferredAccountId, amount: grossAmount });
              }

              try {
                await postOpdJournalEntry(client, {
                  appointmentId: id,
                  sourceEntryType: 'OPD_REVENUE_RECOGNITION',
                  debitLines,
                  creditAccountId: revenueAccountId,
                  creditAmount: grossAmount,
                  description: `اعتراف إيراد كشف: ${apt.patient_name}`,
                  entryDate: today,
                });
                await logAccountingEvent(client, {
                  eventType: 'OPD_REVENUE_RECOGNITION', sourceId: id,
                  appointmentId: id, status: 'success',
                });
              } catch (glErr) {
                await logAccountingEvent(client, {
                  eventType: 'OPD_REVENUE_RECOGNITION', sourceId: id,
                  appointmentId: id, status: 'failure', errorMessage: String(glErr),
                });
                throw glErr;
              }

              await client.query(
                `UPDATE clinic_appointments
                 SET accounting_posted_revenue  = TRUE,
                     doctor_deduction_amount     = $2
                 WHERE id = $1`,
                [id, remainingAmount]
              );
            } else {
              await client.query(
                `UPDATE clinic_appointments SET accounting_posted_revenue = TRUE WHERE id = $1`, [id]
              );
            }
          }
        }

        if (status === 'no_show'
            && apt.payment_type === 'CASH'
            && apt.accounting_posted_advance === true) {
          const policyRes = await client.query(
            `SELECT value FROM system_settings WHERE key = 'opd_no_show_policy'`
          );
          const policy = policyRes.rows[0]?.value ?? 'FORFEIT';

          const deferredAccountId = await getDeferredAccountId(client);
          const paidAmount = parseFloat(apt.paid_amount || apt.gross_amount || '0');

          if (paidAmount > 0) {
            let creditAccountId: string;
            if (policy === 'REFUND') {
              const treasury = apt.treasury_id;
              if (!treasury) throw new Error("يجب تحديد الخزنة لعملية استرداد الغياب");
              creditAccountId = await getTreasuryGlAccountId(client, treasury);
            } else {
              creditAccountId = await getAccountIdByCode(client, OPD_NO_SHOW_REVENUE_CODE);
            }

            try {
              await postOpdJournalEntry(client, {
                appointmentId: id,
                sourceEntryType: 'OPD_NO_SHOW_REVENUE',
                debitLines: [{ accountId: deferredAccountId, amount: paidAmount }],
                creditAccountId,
                creditAmount: paidAmount,
                description: `غياب — ${policy === 'REFUND' ? 'استرداد' : 'إيراد غياب'}: ${apt.patient_name}`,
                entryDate: today,
              });
              await logAccountingEvent(client, {
                eventType: 'OPD_NO_SHOW_REVENUE', sourceId: id,
                appointmentId: id, status: 'success',
              });
            } catch (glErr) {
              await logAccountingEvent(client, {
                eventType: 'OPD_NO_SHOW_REVENUE', sourceId: id,
                appointmentId: id, status: 'failure', errorMessage: String(glErr),
              });
              throw glErr;
            }
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

  async cancelAndRefundAppointment(this: DatabaseStorage, aptId: string, refundedBy: string, refundAmount?: number, cancelAppointment?: boolean, refundReason?: string): Promise<{ refundedAmount: string; patientName: string; isFullCancel: boolean }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const aptRes = await client.query(
        `SELECT a.*, c.treasury_id AS clinic_treasury_id, c.id AS clinic_id_val,
                c.consultation_service_id AS clinic_consultation_service_id
         FROM clinic_appointments a
         JOIN clinic_clinics c ON c.id = a.clinic_id
         WHERE a.id = $1 FOR UPDATE`,
        [aptId]
      );
      if (!aptRes.rows.length) throw new Error("الموعد غير موجود");
      const apt = aptRes.rows[0];

      if (apt.status === 'cancelled') throw new Error("الموعد ملغى بالفعل");
      if (apt.status === 'done' && !apt.accounting_posted_revenue) {
        throw new Error("لا يمكن استرداد موعد منتهٍ لم يُرحَّل له قيد إيراد");
      }
      if (apt.payment_type !== 'CASH') throw new Error("هذا الموعد لا يحمل دفعة نقدية — لا يوجد مبلغ لإعادته");
      if (!apt.invoice_id) throw new Error("لم يتم ربط فاتورة بهذا الموعد — لا توجد دفعة مسجّلة");

      const invRes = await client.query(
        `SELECT * FROM patient_invoice_headers WHERE id = $1 FOR UPDATE`,
        [apt.invoice_id]
      );
      if (!invRes.rows.length) throw new Error("الفاتورة غير موجودة");
      const inv = invRes.rows[0];
      if (inv.status === 'cancelled') throw new Error("الفاتورة ملغاة بالفعل");

      const paidAmount = parseFloat(inv.paid_amount || '0');
      if (paidAmount <= 0) throw new Error("لا يوجد مبلغ مدفوع في هذه الفاتورة لإعادته");

      let actualRefund: number;
      let isFullCancel: boolean;

      if (cancelAppointment === true) {
        actualRefund = paidAmount;
        isFullCancel = true;
      } else {
        if (refundAmount === undefined) {
          actualRefund = paidAmount;
          isFullCancel = false;
        } else {
          const req = parseFloat(refundAmount.toFixed(2));
          if (req <= 0) throw new Error("مبلغ الاسترداد يجب أن يكون أكبر من صفر");
          if (req > paidAmount) throw new Error(`مبلغ الاسترداد (${req}) أكبر من المبلغ المدفوع (${paidAmount}) — لا يمكن الاسترداد بأكثر مما دُفع`);
          actualRefund = req;
          isFullCancel = false;
        }
      }

      let treasuryId: string = apt.clinic_treasury_id;
      if (!treasuryId) throw new Error("العيادة لا تملك خزينة مرتبطة — تعذّر إتمام الاسترداد");

      const tRes = await client.query(`SELECT id FROM treasuries WHERE id = $1 AND is_active = true`, [treasuryId]);
      if (!tRes.rows.length) {
        const byGl = await client.query(
          `SELECT id FROM treasuries WHERE gl_account_id = $1 AND is_active = true LIMIT 1`,
          [treasuryId]
        );
        if (!byGl.rows.length) throw new Error("لم يتم العثور على خزينة نشطة مرتبطة بالعيادة");
        treasuryId = byGl.rows[0].id;
      }

      const today = new Date().toISOString().slice(0, 10);
      const refundLabel = isFullCancel ? 'استرداد كامل — إلغاء موعد' : 'استرداد جزئي';

      if (isFullCancel) {
        await client.query(
          `UPDATE clinic_appointments SET status = 'cancelled' WHERE id = $1`,
          [aptId]
        );
      }

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

      await client.query(
        `INSERT INTO patient_invoice_payments
           (header_id, payment_date, amount, payment_method, notes, treasury_id)
         VALUES ($1, $2::date, $3, 'cash', $4, $5)`,
        [apt.invoice_id, today, -actualRefund,
         `${refundLabel} — بواسطة: ${refundedBy}`, treasuryId]
      );

      await client.query(
        `INSERT INTO treasury_transactions
           (treasury_id, type, amount, description, source_type, source_id, transaction_date)
         VALUES ($1, 'refund', $2, $3, 'clinic_appointment_refund', gen_random_uuid(), $4::date)`,
        [treasuryId, -actualRefund,
         `${refundLabel} — رسم كشف: ${apt.patient_name} (موعد: ${aptId.slice(0,8)})`,
         today]
      );

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

      const treasuryGlAccountId = await getTreasuryGlAccountId(client, treasuryId);

      if (apt.accounting_posted_revenue === true) {
        const aptPaidAmount = parseFloat(apt.paid_amount || apt.gross_amount || '0');
        if (actualRefund > aptPaidAmount) {
          throw new Error(`قيمة الرد (${actualRefund}) أكبر من المبلغ المدفوع (${aptPaidAmount})`);
        }
        const consultationSvcId = apt.clinic_consultation_service_id;
        const revenueAccountId = consultationSvcId
          ? (await client.query(`SELECT revenue_account_id FROM services WHERE id = $1`, [consultationSvcId])).rows[0]?.revenue_account_id
          : null;
        if (!revenueAccountId) {
          throw new Error("خدمة الكشف ليس لها حساب إيراد مرتبط — لا يمكن ترحيل قيد رد الإيراد");
        }
        try {
          await postOpdJournalEntry(client, {
            appointmentId: aptId,
            sourceEntryType: 'OPD_REVENUE_REFUND',
            debitLines: [{ accountId: revenueAccountId, amount: actualRefund }],
            creditAccountId: treasuryGlAccountId,
            creditAmount: actualRefund,
            description: `رد إيراد كشف: ${apt.patient_name}${refundReason ? ` — ${refundReason}` : ''}`,
            entryDate: today,
            createdBy: refundedBy,
          });
          await logAccountingEvent(client, {
            eventType: 'OPD_REVENUE_REFUND', sourceId: aptId,
            appointmentId: aptId, postedByUser: refundedBy, status: 'success',
          });
        } catch (glErr) {
          await logAccountingEvent(client, {
            eventType: 'OPD_REVENUE_REFUND', sourceId: aptId,
            appointmentId: aptId, postedByUser: refundedBy,
            status: 'failure', errorMessage: String(glErr),
          });
          throw glErr;
        }
      } else if (isFullCancel && apt.accounting_posted_advance === true) {
        const deferredAccountId = await getDeferredAccountId(client);
        try {
          await postOpdJournalEntry(client, {
            appointmentId: aptId,
            sourceEntryType: 'OPD_ADVANCE_REVERSAL',
            debitLines: [{ accountId: deferredAccountId, amount: actualRefund }],
            creditAccountId: treasuryGlAccountId,
            creditAmount: actualRefund,
            description: `عكس مقدم كشف (إلغاء): ${apt.patient_name}`,
            entryDate: today,
            createdBy: refundedBy,
          });
          await logAccountingEvent(client, {
            eventType: 'OPD_ADVANCE_REVERSAL', sourceId: aptId,
            appointmentId: aptId, postedByUser: refundedBy, status: 'success',
          });
        } catch (glErr) {
          await logAccountingEvent(client, {
            eventType: 'OPD_ADVANCE_REVERSAL', sourceId: aptId,
            appointmentId: aptId, postedByUser: refundedBy,
            status: 'failure', errorMessage: String(glErr),
          });
          throw glErr;
        }
      }

      await client.query(
        `UPDATE clinic_appointments SET refund_amount = $2, refund_reason = $3 WHERE id = $1`,
        [aptId, actualRefund, refundReason ?? null]
      );

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
