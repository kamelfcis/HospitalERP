/**
 * قيد تسوية مستحقات الطبيب
 * عند استلام المبلغ من الطبيب:
 *   مدين : خزنة                     (treasury.glAccountId)
 *   دائن : ذمم مدينة من الأطباء     (doctor.receivableAccountId)
 */
import { db } from "../db";
import { eq, and, lte, gte } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "./logger";
import { roundMoney, parseMoney } from "../finance-helpers";
import { logAcctEvent } from "./accounting-event-logger";
import {
  doctors, treasuries, journalEntries, journalLines, fiscalPeriods, doctorSettlements,
} from "@shared/schema";

export async function generateDoctorSettlementGL(params: {
  settlementId: string;
  doctorName:   string;
  amount:       string;
  paymentDate:  string;
  treasuryId:   string;
}): Promise<void> {
  const { settlementId, doctorName, amount, paymentDate, treasuryId } = params;
  const amtNum = parseMoney(amount);
  if (amtNum <= 0) return;

  // ── ١. خزنة (مدين) ───────────────────────────────────────────────────────
  const [treasury] = await db.select({ glAccountId: treasuries.glAccountId })
    .from(treasuries)
    .where(eq(treasuries.id, treasuryId))
    .limit(1);

  if (!treasury?.glAccountId) {
    logger.warn({ settlementId, treasuryId }, "[DoctorSettlementGL] الخزنة لا تملك حساب GL");
    await logAcctEvent({
      sourceType: "doctor_settlement", sourceId: settlementId,
      eventType: "doctor_settlement_journal", status: "needs_retry",
      errorMessage: "الخزنة المختارة لا تملك حساب GL — راجع إعدادات الخزن",
    }).catch(() => {});
    return;
  }
  const debitAccountId = treasury.glAccountId;

  // ── ٢. ذمم مدينة من الأطباء (دائن) ─────────────────────────────────────
  const [doctor] = await db.select({ receivableAccountId: doctors.receivableAccountId })
    .from(doctors)
    .where(eq(doctors.name, doctorName))
    .limit(1);

  if (!doctor?.receivableAccountId) {
    logger.warn({ settlementId, doctorName }, "[DoctorSettlementGL] الطبيب لا يملك حساب ذمم مدينة");
    await logAcctEvent({
      sourceType: "doctor_settlement", sourceId: settlementId,
      eventType: "doctor_settlement_journal", status: "needs_retry",
      errorMessage: `الطبيب "${doctorName}" لا يملك حساب ذمم مدينة (receivableAccountId) — عرِّفه من صفحة الأطباء`,
    }).catch(() => {});
    return;
  }
  const creditAccountId = doctor.receivableAccountId;

  // ── ٣. القيد ─────────────────────────────────────────────────────────────
  try {
    await db.transaction(async (tx) => {
      // تحقق من عدم التكرار
      const existing = await tx.select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.sourceType, "doctor_settlement"),
          eq(journalEntries.sourceDocumentId, settlementId),
        ))
        .limit(1);
      if (existing.length > 0) return;

      // الفترة المالية
      const [period] = await tx.select({ id: fiscalPeriods.id })
        .from(fiscalPeriods)
        .where(and(
          lte(fiscalPeriods.startDate, paymentDate),
          gte(fiscalPeriods.endDate, paymentDate),
          eq(fiscalPeriods.isClosed, false),
        ))
        .limit(1);

      if (!period) {
        await logAcctEvent({
          sourceType: "doctor_settlement", sourceId: settlementId,
          eventType: "doctor_settlement_journal", status: "needs_retry",
          errorMessage: `لا توجد فترة مالية مفتوحة لتاريخ ${paymentDate}`,
        }).catch(() => {});
        return;
      }

      const amtStr = roundMoney(amtNum);
      const entryNumber = await storage.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate:        paymentDate,
        reference:        `DS-${settlementId.slice(0, 8).toUpperCase()}`,
        description:      `استلام مديونية من الطبيب: ${doctorName}`,
        status:           "posted",
        periodId:         period.id,
        sourceType:       "doctor_settlement",
        sourceDocumentId: settlementId,
        totalDebit:       amtStr,
        totalCredit:      amtStr,
      }).returning();

      await tx.insert(journalLines).values([
        {
          journalEntryId: entry.id,
          lineNumber:     1,
          accountId:      debitAccountId,
          debit:          amtStr,
          credit:         "0.00",
          description:    `استلام من الطبيب ${doctorName}`,
        },
        {
          journalEntryId: entry.id,
          lineNumber:     2,
          accountId:      creditAccountId,
          debit:          "0.00",
          credit:         amtStr,
          description:    `إقفال ذمم مدينة من الطبيب ${doctorName}`,
        },
      ]);

      // تحديث علامة GL على سجل التسوية
      await tx.update(doctorSettlements)
        .set({ glPosted: true })
        .where(eq(doctorSettlements.id, settlementId));

      logger.info({ settlementId, entryNumber, doctorName, amtStr }, "[DoctorSettlementGL] قيد التسوية تم بنجاح");
      await logAcctEvent({
        sourceType: "doctor_settlement", sourceId: settlementId,
        eventType: "doctor_settlement_journal", status: "completed",
        journalEntryId: entry.id,
      }).catch(() => {});
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, settlementId }, "[DoctorSettlementGL] خطأ في إنشاء قيد التسوية");
    await logAcctEvent({
      sourceType: "doctor_settlement", sourceId: settlementId,
      eventType: "doctor_settlement_journal", status: "failed",
      errorMessage: msg,
    }).catch(() => {});
  }
}
