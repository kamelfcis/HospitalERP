import { pool } from "../db";
import type { DatabaseStorage } from "./index";
import {
  logAccountingEvent,
  postOpdJournalEntry,
  getDeferredAccountId,
  getTreasuryGlAccountId,
} from "./clinic-shared-helpers";

const methods = {
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
