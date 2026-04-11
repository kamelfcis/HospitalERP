import { pool } from "../db";
import type { DatabaseStorage } from "./index";

const methods = {

  async preflightShiftClose(
    this: DatabaseStorage,
    shiftId: string,
    closingCash: string | number,
  ): Promise<{
    cashierGlAccountId:   string;
    cashierId:            string;
    cashierName:          string;
    businessDate:         string;
    expectedCash:         number;
    variance:             number;
    periodId:             string;
    custodianAccountId:   string;
    varianceAccountId:    string | null;
  }> {
    const client = await pool.connect();
    try {
      const shiftRes = await client.query(
        `SELECT id, cashier_id, cashier_name, gl_account_id, opening_cash,
                business_date
         FROM cashier_shifts
         WHERE id = $1 AND status IN ('open', 'stale')
         LIMIT 1`,
        [shiftId]
      );
      if (!shiftRes.rows.length) {
        throw Object.assign(new Error("الوردية غير موجودة أو مغلقة بالفعل"), { status: 404 });
      }
      const sr = shiftRes.rows[0];
      const businessDate: string = sr.business_date instanceof Date
        ? sr.business_date.toISOString().slice(0, 10)
        : String(sr.business_date);

      const [collectRes, refundRes] = await Promise.all([
        client.query(
          `SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM cashier_receipts WHERE shift_id = $1`,
          [shiftId]
        ),
        client.query(
          `SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM cashier_refund_receipts WHERE shift_id = $1`,
          [shiftId]
        ),
      ]);
      const openingCash    = parseFloat(sr.opening_cash || "0");
      const totalCollected = parseFloat(collectRes.rows[0].total || "0");
      const totalRefunded  = parseFloat(refundRes.rows[0].total || "0");
      const expectedCash   = openingCash + totalCollected - totalRefunded;
      const variance       = parseFloat(String(closingCash)) - expectedCash;

      const periodRes = await client.query(
        `SELECT id FROM fiscal_periods
          WHERE start_date <= $1::date
            AND end_date   >= $1::date
            AND is_closed = false
          LIMIT 1`,
        [businessDate]
      );
      if (!periodRes.rows.length) {
        throw Object.assign(
          new Error(`لا يمكن إغلاق الوردية لعدم وجود فترة مالية مفتوحة للتاريخ ${businessDate} — يرجى مراجعة الإعدادات المحاسبية`),
          { status: 422, code: "SHIFT_CLOSE_NO_PERIOD" }
        );
      }
      const periodId = periodRes.rows[0].id;

      const amTreasuryRes = await client.query(
        `SELECT debit_account_id FROM account_mappings
          WHERE transaction_type = 'cashier_shift_close'
            AND line_type = 'treasury'
            AND is_active = true
          LIMIT 1`
      );
      let custodianAccountId: string;
      if (amTreasuryRes.rows.length && amTreasuryRes.rows[0].debit_account_id) {
        const chk = await client.query(
          `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
          [amTreasuryRes.rows[0].debit_account_id]
        );
        if (!chk.rows.length) {
          throw Object.assign(
            new Error("حساب عهدة الخزنة المُعيَّن في ربط الحسابات (إغلاق وردية) غير موجود أو غير نشط"),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = chk.rows[0].id;
      } else {
        const settingRes = await client.query(
          `SELECT value FROM system_settings WHERE key = 'cashier_treasury_account_code' LIMIT 1`
        );
        const treasuryCode = settingRes.rows[0]?.value || '12127';
        const custRes = await client.query(
          `SELECT id FROM accounts WHERE code = $1 AND is_active = true LIMIT 1`,
          [treasuryCode]
        );
        if (!custRes.rows.length) {
          throw Object.assign(
            new Error(`لا يمكن إغلاق الوردية لعدم وجود حساب عهدة الخزنة (${treasuryCode}) أو إنه غير نشط — يرجى إعداده في ربط الحسابات أو إعدادات النظام`),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = custRes.rows[0].id;
      }

      if (!sr.gl_account_id) {
        throw Object.assign(
          new Error("لا يمكن إغلاق الوردية لعدم ربط حساب خزنة بها — يرجى فتح وردية جديدة بعد إعداد الحساب"),
          { status: 422, code: "SHIFT_CLOSE_NO_CASHIER_ACCOUNT" }
        );
      }
      const glRes = await client.query(
        `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
        [sr.gl_account_id]
      );
      if (!glRes.rows.length) {
        throw Object.assign(
          new Error("حساب الخزنة المرتبط بالوردية غير موجود أو غير نشط — يرجى مراجعة الإعدادات"),
          { status: 422, code: "SHIFT_CLOSE_NO_CASHIER_ACCOUNT" }
        );
      }

      let varianceAccountId: string | null = null;
      if (Math.abs(variance) > 0.001) {
        const userRes = await client.query(
          `SELECT cashier_variance_account_id,
                  cashier_variance_short_account_id,
                  cashier_variance_over_account_id
           FROM users WHERE id = $1 LIMIT 1`,
          [sr.cashier_id]
        );
        const ur = userRes.rows[0];
        if (variance < 0) {
          varianceAccountId = ur?.cashier_variance_short_account_id || ur?.cashier_variance_account_id || null;
        } else {
          varianceAccountId = ur?.cashier_variance_over_account_id || ur?.cashier_variance_account_id || null;
        }
        if (!varianceAccountId) {
          throw Object.assign(
            new Error(
              `لا يمكن إغلاق الوردية — يوجد فرق نقدي ` +
              `(${variance > 0 ? "فائض" : "عجز"}: ${Math.abs(variance).toFixed(2)} ج.م) ` +
              `ولم يُعيَّن حساب فروق الجرد لهذا الكاشير — يرجى إعداده من إدارة المستخدمين`
            ),
            { status: 422, code: "SHIFT_CLOSE_NO_VARIANCE_ACCOUNT" }
          );
        }
        const varActiveRes = await client.query(
          `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
          [varianceAccountId]
        );
        if (!varActiveRes.rows.length) {
          throw Object.assign(
            new Error("حساب فروق الجرد المرتبط بالكاشير غير موجود أو غير نشط — يرجى مراجعة الإعدادات"),
            { status: 422, code: "SHIFT_CLOSE_NO_VARIANCE_ACCOUNT" }
          );
        }
      }

      return {
        cashierGlAccountId:  sr.gl_account_id,
        cashierId:           sr.cashier_id,
        cashierName:         sr.cashier_name,
        businessDate,
        expectedCash,
        variance,
        periodId,
        custodianAccountId,
        varianceAccountId,
      };
    } finally {
      client.release();
    }
  },
};

export default methods;
