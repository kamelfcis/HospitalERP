import { pool } from "../db";
import { logger } from "../lib/logger";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";

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

  async generateShiftCloseJournal(
    this: DatabaseStorage,
    params: {
      shiftId:          string;
      cashierGlAccountId: string;
      cashierId:        string;
      cashierName:      string;
      closingCash:      number;
      expectedCash:     number;
      businessDate:     string;
    }
  ): Promise<{ journalId: string }> {
    const { shiftId, cashierGlAccountId, cashierId, cashierName, closingCash, expectedCash, businessDate } = params;
    const variance = closingCash - expectedCash;
    const client = await pool.connect();
    try {
      const existing = await client.query(
        `SELECT id FROM journal_entries
          WHERE source_type = 'cashier_shift_close'
            AND source_document_id = $1
          LIMIT 1`,
        [shiftId]
      );
      if (existing.rows.length > 0) {
        logger.info({ shiftId, journalId: existing.rows[0].id }, "[SHIFT_CLOSE_JOURNAL] idempotent — قيد موجود مسبقاً");
        return { journalId: existing.rows[0].id };
      }

      const amTreasuryRes2 = await client.query(
        `SELECT debit_account_id FROM account_mappings
          WHERE transaction_type = 'cashier_shift_close'
            AND line_type = 'treasury'
            AND is_active = true
          LIMIT 1`
      );
      let custodianAccountId: string;
      if (amTreasuryRes2.rows.length && amTreasuryRes2.rows[0].debit_account_id) {
        const chk = await client.query(
          `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
          [amTreasuryRes2.rows[0].debit_account_id]
        );
        if (!chk.rows.length) {
          throw Object.assign(
            new Error("حساب عهدة الخزنة المُعيَّن في ربط الحسابات (إغلاق وردية) غير موجود أو غير نشط"),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = chk.rows[0].id;
      } else {
        const tSettingRes = await client.query(
          `SELECT value FROM system_settings WHERE key = 'cashier_treasury_account_code' LIMIT 1`
        );
        const tCode = tSettingRes.rows[0]?.value || '12127';
        const custodianRes = await client.query(
          `SELECT id FROM accounts WHERE code = $1 AND is_active = true LIMIT 1`,
          [tCode]
        );
        if (!custodianRes.rows.length) {
          throw Object.assign(
            new Error(`حساب عهدة الخزنة (${tCode}) غير موجود أو غير نشط — يرجى إعداده في ربط الحسابات أو إعدادات النظام`),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = custodianRes.rows[0].id;
      }

      let varianceAccountId: string | null = null;
      if (Math.abs(variance) > 0.001) {
        const userRes = await client.query(
          `SELECT cashier_variance_account_id,
                  cashier_variance_short_account_id,
                  cashier_variance_over_account_id
           FROM users WHERE id = $1 LIMIT 1`,
          [cashierId]
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
              `لا يمكن إنشاء قيد الوردية — يوجد فرق نقدي ` +
              `(${variance > 0 ? "فائض" : "عجز"}: ${Math.abs(variance).toFixed(2)} ج.م) ` +
              `ولم يُعيَّن حساب فروق الجرد لهذا الكاشير`
            ),
            { status: 422, code: "SHIFT_CLOSE_NO_VARIANCE_ACCOUNT" }
          );
        }
      }

      const periodRes = await client.query(
        `SELECT id FROM fiscal_periods
          WHERE start_date <= $1::date AND end_date >= $1::date AND is_closed = false
          LIMIT 1`,
        [businessDate]
      );
      if (!periodRes.rows.length) {
        throw Object.assign(
          new Error(`لا توجد فترة مالية مفتوحة لتاريخ ${businessDate} — يرجى مراجعة الإعدادات المحاسبية`),
          { status: 422, code: "SHIFT_CLOSE_NO_PERIOD" }
        );
      }
      const periodId = periodRes.rows[0].id;

      const closingStr  = closingCash.toFixed(2);
      const expectedStr = expectedCash.toFixed(2);
      const absVariance = Math.abs(variance);
      const description  = `تسوية وردية ${cashierName} — تحويل نقدية إلى عهدة أمين الخزنة`;
      const varianceDesc = `فروق جرد نقدية — ${cashierName}`;

      type Line = { accountId: string; debit: string; credit: string; desc: string };
      const lines: Line[] = [];

      if (absVariance <= 0.001) {
        lines.push({ accountId: custodianAccountId, debit: closingStr,              credit: "0.00",                desc: description });
        lines.push({ accountId: cashierGlAccountId,  debit: "0.00",                credit: closingStr,            desc: description });
      } else if (variance > 0) {
        lines.push({ accountId: custodianAccountId,   debit: closingStr,            credit: "0.00",                desc: description });
        lines.push({ accountId: cashierGlAccountId,   debit: "0.00",               credit: expectedStr,           desc: description });
        lines.push({ accountId: varianceAccountId!,   debit: "0.00",               credit: absVariance.toFixed(2), desc: varianceDesc });
      } else {
        lines.push({ accountId: custodianAccountId,   debit: closingStr,            credit: "0.00",                desc: description });
        lines.push({ accountId: varianceAccountId!,   debit: absVariance.toFixed(2), credit: "0.00",              desc: varianceDesc });
        lines.push({ accountId: cashierGlAccountId,   debit: "0.00",               credit: expectedStr,           desc: description });
      }

      const activeLines2 = lines.filter(
        l => parseFloat(l.debit) > 0.001 || parseFloat(l.credit) > 0.001
      );

      if (activeLines2.length === 0) {
        logger.info({ shiftId }, "[SHIFT_CLOSE_JOURNAL] لا نقدية → تجاوز القيد");
        return { journalId: "" };
      }

      const totalDebit  = activeLines2.reduce((s, l) => s + parseFloat(l.debit),  0);
      const totalCredit = activeLines2.reduce((s, l) => s + parseFloat(l.credit), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new Error(`قيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`);
      }
      if (activeLines2.some(l => !l.accountId)) {
        throw new Error("سطر قيد يحتوي على حساب فارغ — تحقق من الإعدادات");
      }

      const seqRes = await client.query(`SELECT nextval('journal_entry_number_seq') AS next_num`);
      const entryNumber = Number(seqRes.rows[0].next_num);

      await client.query("BEGIN");
      const jeRes = await client.query(`
        INSERT INTO journal_entries
          (entry_number, entry_date, description, status, period_id,
           total_debit, total_credit, reference,
           source_type, source_document_id, source_entry_type,
           posted_at)
        VALUES ($1, $2::date, $3, 'posted', $4,
                $5, $6, $7,
                'cashier_shift_close', $8, 'shift_close',
                now())
        RETURNING id
      `, [
        entryNumber, businessDate, description, periodId,
        totalDebit.toFixed(2), totalCredit.toFixed(2),
        `SHIFT-CLOSE-${shiftId.substring(0, 8).toUpperCase()}`,
        shiftId,
      ]);
      const journalId = jeRes.rows[0].id;

      for (let i = 0; i < activeLines2.length; i++) {
        const l = activeLines2[i];
        await client.query(
          `INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [journalId, i + 1, l.accountId, l.debit, l.credit, l.desc]
        );
      }
      await client.query("COMMIT");

      logger.info(
        { shiftId, journalId, entryNumber, totalDebit, variance },
        "[SHIFT_CLOSE_JOURNAL] قيد إغلاق الوردية أُنشئ بنجاح"
      );
      logAcctEvent({
        sourceType: "cashier_shift_close",
        sourceId:   shiftId,
        eventType:  "journal_posted",
        status:     "completed",
      }).catch(() => {});

      return { journalId };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error({ shiftId, err }, "[SHIFT_CLOSE_JOURNAL] فشل إنشاء قيد إغلاق الوردية");
      throw err;
    } finally {
      client.release();
    }
  },
};

export default methods;
