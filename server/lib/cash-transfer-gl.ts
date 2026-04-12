/**
 * قيد تحويل النقدية بين الخزن
 *   مدين : خزنة الوجهة   (toTreasury.glAccountId)
 *   دائن : خزنة المصدر   (fromTreasury.glAccountId)
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { journalEntries, journalLines, fiscalPeriods } from "@shared/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "@shared/schema";
import { logger } from "./logger";
import { logAcctEvent } from "./accounting-event-logger";

type Tx = PgTransaction<any, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export async function generateCashTransferGL(
  tx: Tx,
  params: {
    transferId:        string;
    serialNumber:      number;
    fromTreasuryId:    string;
    fromTreasuryName:  string;
    fromGlAccountId:   string | null;
    toTreasuryId:      string;
    toTreasuryName:    string;
    toGlAccountId:     string | null;
    amount:            number;
    transferDate:      string;
  },
): Promise<void> {
  const {
    transferId, serialNumber,
    fromTreasuryName, fromGlAccountId,
    toTreasuryName,   toGlAccountId,
    amount, transferDate,
  } = params;

  if (!fromGlAccountId || !toGlAccountId) {
    logger.warn({ transferId }, "[CashTransferGL] إحدى الخزنتين لا تملك حساب GL — القيد مُعلَّق");
    await logAcctEvent({
      sourceType: "cash_transfer", sourceId: transferId,
      eventType: "cash_transfer_journal", status: "needs_retry",
      errorMessage: "إحدى الخزنتين لا تملك حساب GL — راجع إعدادات الخزن",
    }).catch(() => {});
    return;
  }

  const existing = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.sourceType, "cash_transfer"),
      eq(journalEntries.sourceDocumentId, transferId),
    ))
    .limit(1);
  if (existing.length > 0) return;

  const [period] = await tx
    .select({ id: fiscalPeriods.id })
    .from(fiscalPeriods)
    .where(and(
      lte(fiscalPeriods.startDate, transferDate),
      gte(fiscalPeriods.endDate, transferDate),
      eq(fiscalPeriods.isClosed, false),
    ))
    .limit(1);

  const periodId = period?.id ?? null;

  const description = `تحويل نقدية إيصال #${serialNumber} — من ${fromTreasuryName} إلى ${toTreasuryName}`;

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      description,
      entryDate:        transferDate,
      sourceType:       "cash_transfer",
      sourceDocumentId: transferId,
      fiscalPeriodId:   periodId,
      totalDebit:       String(amount),
      totalCredit:      String(amount),
      status:           "posted",
    })
    .returning();

  await tx.insert(journalLines).values([
    {
      journalEntryId: entry.id,
      accountId:      toGlAccountId,
      type:           "debit",
      amount:         String(amount),
      description:    `تحويل إلى ${toTreasuryName}`,
    },
    {
      journalEntryId: entry.id,
      accountId:      fromGlAccountId,
      type:           "credit",
      amount:         String(amount),
      description:    `تحويل من ${fromTreasuryName}`,
    },
  ]);

  await logAcctEvent({
    sourceType: "cash_transfer", sourceId: transferId,
    eventType: "cash_transfer_journal", status: "posted",
  }).catch(() => {});
}
