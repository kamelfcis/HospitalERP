import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";
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
};

export default methods;
