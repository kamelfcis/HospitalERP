import type { PoolClient } from "pg";

export const OPD_DEFERRED_ACCOUNT_CODE   = '21163';
export const OPD_DOCTOR_DEDUCTION_CODE   = '21850';
export const OPD_NO_SHOW_REVENUE_CODE    = '4172';

export type OpdEntryType =
  | 'OPD_ADVANCE_RECEIPT'
  | 'OPD_REVENUE_RECOGNITION'
  | 'OPD_ADVANCE_REVERSAL'
  | 'OPD_REVENUE_REFUND'
  | 'OPD_NO_SHOW_REVENUE';

export async function logAccountingEvent(client: PoolClient, params: {
  eventType: OpdEntryType;
  sourceId:  string;
  appointmentId: string;
  postedByUser?: string | null;
  status: 'success' | 'failure';
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await client.query(
      `INSERT INTO accounting_event_log
         (event_type, source_id, appointment_id, posted_by_user, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [params.eventType, params.sourceId, params.appointmentId,
       params.postedByUser ?? null, params.status, params.errorMessage ?? null]
    );
  } catch { /* never break the parent transaction over a log failure */ }
}

export async function postOpdJournalEntry(client: PoolClient, params: {
  appointmentId: string;
  sourceEntryType: OpdEntryType;
  debitLines: Array<{ accountId: string; amount: number }>;
  creditAccountId: string;
  creditAmount: number;
  description: string;
  entryDate: string;
  createdBy?: string | null;
}): Promise<string> {
  const existing = await client.query(
    `SELECT id FROM journal_entries
     WHERE source_type = 'clinic_appointment'
       AND source_document_id = $1
       AND source_entry_type  = $2`,
    [params.appointmentId, params.sourceEntryType]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const periodRes = await client.query(
    `SELECT id FROM fiscal_periods
     WHERE is_closed = false AND start_date <= $1::date AND end_date >= $1::date
     LIMIT 1`,
    [params.entryDate]
  );
  let periodId: string | null = null;
  if (periodRes.rows.length > 0) {
    periodId = periodRes.rows[0].id;
  } else {
    const settingRes = await client.query(
      `SELECT value FROM system_settings WHERE key = 'allow_auto_next_period_posting'`
    );
    const allowFallforward = settingRes.rows[0]?.value === 'true';
    if (allowFallforward) {
      const nextPeriodRes = await client.query(
        `SELECT id FROM fiscal_periods WHERE is_closed = false ORDER BY start_date ASC LIMIT 1`
      );
      if (nextPeriodRes.rows.length > 0) {
        periodId = nextPeriodRes.rows[0].id;
      } else {
        throw new Error("الفترة المالية مغلقة — لا يمكن ترحيل قيد محاسبي");
      }
    } else {
      throw new Error("الفترة المالية مغلقة — لا يمكن ترحيل قيد محاسبي");
    }
  }

  const totalDebit  = params.debitLines.reduce((s, l) => s + l.amount, 0);
  const totalCredit = params.creditAmount;

  const seqRes = await client.query(`SELECT nextval('journal_entry_number_seq') AS next_num`);
  const entryNumber = Number(seqRes.rows[0].next_num);

  const jeRes = await client.query(`
    INSERT INTO journal_entries
      (entry_number, entry_date, description, status, period_id,
       total_debit, total_credit, reference,
       source_type, source_document_id, source_entry_type,
       created_by, posted_by, posted_at)
    VALUES ($1, $2::date, $3, 'posted', $4, $5, $6, $7,
            'clinic_appointment', $8, $9, $10, $10, now())
    RETURNING id
  `, [
    entryNumber, params.entryDate, params.description, periodId,
    totalDebit.toFixed(2), totalCredit.toFixed(2),
    `OPD-${params.sourceEntryType}-${params.appointmentId.slice(0, 8)}`,
    params.appointmentId, params.sourceEntryType,
    params.createdBy ?? null,
  ]);
  const journalId = jeRes.rows[0].id;

  for (let i = 0; i < params.debitLines.length; i++) {
    const line = params.debitLines[i];
    await client.query(
      `INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
       VALUES ($1, $2, $3, $4, '0.00', $5)`,
      [journalId, i + 1, line.accountId, line.amount.toFixed(2), params.description]
    );
  }
  await client.query(
    `INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
     VALUES ($1, $2, $3, '0.00', $4, $5)`,
    [journalId, params.debitLines.length + 1, params.creditAccountId,
     totalCredit.toFixed(2), params.description]
  );

  return journalId;
}

export async function getAccountIdByCode(client: PoolClient, code: string): Promise<string> {
  const res = await client.query(
    `SELECT id FROM accounts WHERE code = $1 AND is_active = true LIMIT 1`, [code]
  );
  if (!res.rows.length) throw new Error(`الحساب (${code}) غير موجود أو غير نشط — يرجى إعداده أولاً`);
  return res.rows[0].id;
}

export async function getDeferredAccountId(client: PoolClient): Promise<string> {
  return getAccountIdByCode(client, OPD_DEFERRED_ACCOUNT_CODE);
}

export async function getTreasuryGlAccountId(client: PoolClient, treasuryId: string): Promise<string> {
  const res = await client.query(
    `SELECT gl_account_id FROM treasuries WHERE id = $1`, [treasuryId]
  );
  if (!res.rows.length || !res.rows[0].gl_account_id) {
    throw new Error("الخزينة ليس لها حساب دفتر أستاذ مرتبط — يرجى مراجعة الإعدادات");
  }
  return res.rows[0].gl_account_id;
}
