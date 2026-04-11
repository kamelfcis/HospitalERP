import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface ShiftJournalContext {
  periodId:           string;
  custodianAccountId: string;
  varianceAccountId:  string | null;
}

export async function buildAndPostShiftJournal(
  tx: any,
  shiftId: string,
  closingCash: string,
  expectedCashVal: string,
  closedByUserId: string,
  closedByName: string,
  glAccountId: string | null,
  journalContext: ShiftJournalContext,
  businessDate: string,
): Promise<void> {
  const closingNum  = parseFloat(closingCash);
  const expectedNum = parseFloat(expectedCashVal);
  const varianceNum = closingNum - expectedNum;
  const absVar      = Math.abs(varianceNum);
  const jDesc       = `تسوية وردية ${closedByName} — تحويل نقدية إلى عهدة أمين الخزنة`;
  const vDesc       = `فروق جرد نقدية — ${closedByName}`;

  type JLine = { accountId: string; debit: string; credit: string; desc: string };
  const lines: JLine[] = [];
  const closStr = closingNum.toFixed(2);
  const expStr  = expectedNum.toFixed(2);
  const absStr  = absVar.toFixed(2);

  if (absVar <= 0.001) {
    lines.push({ accountId: journalContext.custodianAccountId, debit: closStr, credit: "0.00", desc: jDesc });
    lines.push({ accountId: glAccountId!,                      debit: "0.00", credit: closStr, desc: jDesc });
  } else if (varianceNum > 0) {
    if (!journalContext.varianceAccountId) throw new Error("INTERNAL: حساب الفروق مطلوب — يجب أن يُحدَّد بواسطة preflight");
    lines.push({ accountId: journalContext.custodianAccountId,    debit: closStr, credit: "0.00",   desc: jDesc });
    lines.push({ accountId: glAccountId!,                          debit: "0.00", credit: expStr,   desc: jDesc });
    lines.push({ accountId: journalContext.varianceAccountId,      debit: "0.00", credit: absStr,   desc: vDesc });
  } else {
    if (!journalContext.varianceAccountId) throw new Error("INTERNAL: حساب الفروق مطلوب — يجب أن يُحدَّد بواسطة preflight");
    lines.push({ accountId: journalContext.custodianAccountId,    debit: closStr, credit: "0.00",   desc: jDesc });
    lines.push({ accountId: journalContext.varianceAccountId,     debit: absStr,  credit: "0.00",   desc: vDesc });
    lines.push({ accountId: glAccountId!,                          debit: "0.00", credit: expStr,   desc: jDesc });
  }

  const activeLines = lines.filter(
    l => parseFloat(l.debit) > 0.001 || parseFloat(l.credit) > 0.001
  );

  if (activeLines.length === 0) {
    logger.info({ event: "SHIFT_CLOSE_JOURNAL_SKIPPED_ZERO", shiftId }, "[SHIFT_CLOSE] لا نقدية → تجاوز القيد");
    return;
  }

  if (activeLines.some(l => !l.accountId)) {
    throw Object.assign(
      new Error("سطر قيد يحتوي على حساب فارغ — تحقق من الإعدادات"),
      { code: "SHIFT_CLOSE_NO_CASHIER_ACCOUNT" }
    );
  }
  const drTotal = activeLines.reduce((s, l) => s + parseFloat(l.debit),  0);
  const crTotal = activeLines.reduce((s, l) => s + parseFloat(l.credit), 0);
  if (Math.abs(drTotal - crTotal) > 0.001) {
    throw Object.assign(
      new Error(`قيد غير متوازن: مدين ${drTotal.toFixed(2)} ≠ دائن ${crTotal.toFixed(2)}`),
      { code: "SHIFT_CLOSE_JOURNAL_IMBALANCED" }
    );
  }

  const seqRes    = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
  const entryNum  = Number((seqRes as any).rows[0].next_num);
  const reference = `SHIFT-CLOSE-${shiftId.substring(0, 8).toUpperCase()}`;

  const jeRes = await tx.execute(sql`
    INSERT INTO journal_entries
      (entry_number, entry_date, description, status, period_id,
       total_debit, total_credit, reference,
       source_type, source_document_id, source_entry_type, posted_at)
    VALUES (
      ${entryNum}, ${businessDate}::date, ${jDesc}, 'posted', ${journalContext.periodId},
      ${drTotal.toFixed(2)}, ${crTotal.toFixed(2)}, ${reference},
      'cashier_shift_close', ${shiftId}, 'shift_close', now()
    )
    RETURNING id
  `);
  const journalId = (jeRes as any).rows[0].id;

  for (let i = 0; i < activeLines.length; i++) {
    const l = activeLines[i];
    await tx.execute(sql`
      INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
      VALUES (${journalId}, ${i + 1}, ${l.accountId}, ${l.debit}, ${l.credit}, ${l.desc})
    `);
  }

  logger.info({
    event:              "SHIFT_CLOSE_JOURNAL_CREATED",
    shiftId,
    cashierId:          closedByUserId,
    expectedCash:       expectedNum,
    actualCash:         closingNum,
    variance:           varianceNum,
    cashierGlAccountId: glAccountId,
    varianceAccountId:  journalContext.varianceAccountId,
    treasuryAccountId:  journalContext.custodianAccountId,
    journalEntryId:     journalId,
    createdBy:          closedByUserId,
    timestamp:          new Date().toISOString(),
  }, "[SHIFT_CLOSE] قيد GL أُنشئ بنجاح");
}
