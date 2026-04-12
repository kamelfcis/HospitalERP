/**
 * قيد تحويل مستحقات الطبيب
 * يُنشأ تلقائياً عند تنفيذ تحويل مديونية لطبيب من فاتورة مريض:
 *   مدين : حساب مصروف أتعاب الطبيب  (من ربط الحسابات: patient_invoice / doctor_cost)
 *   دائن : حساب مستحقات الطبيب      (من بيانات الطبيب: payableAccountId)
 */
import { db } from "../db";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "./logger";
import { roundMoney, parseMoney } from "../finance-helpers";
import { logAcctEvent } from "./accounting-event-logger";
import {
  doctors, journalEntries, journalLines, fiscalPeriods,
} from "@shared/schema";

export async function generateDoctorTransferGL(params: {
  transferId:   string;
  invoiceId:    string;
  doctorName:   string;
  amount:       string;
  invoiceDate:  string;
  invoiceNumber: string;
  departmentId:  string | null;
}): Promise<void> {
  const { transferId, invoiceId, doctorName, amount, invoiceDate, invoiceNumber, departmentId } = params;
  const amtNum = parseMoney(amount);
  if (amtNum <= 0) return;

  // ── ١. حساب مستحقات الطبيب (دائن) ─────────────────────────────────────────
  const [doctor] = await db.select({ payableAccountId: doctors.payableAccountId })
    .from(doctors)
    .where(eq(doctors.name, doctorName))
    .limit(1);

  if (!doctor?.payableAccountId) {
    logger.warn({ transferId, doctorName }, "[DoctorTransferGL] لا يوجد حساب مستحقات مُعرَّف للطبيب — تم تخطي القيد");
    await logAcctEvent({
      sourceType: "doctor_transfer", sourceId: transferId,
      eventType: "doctor_transfer_journal", status: "needs_retry",
      errorMessage: `الطبيب "${doctorName}" لا يملك حساب مستحقات (payableAccountId) — عرِّفه من صفحة الأطباء`,
    }).catch(() => {});
    return;
  }
  const creditAccountId = doctor.payableAccountId;

  // ── ٢. حساب تحويل الذمة (مدين) من ربط حسابات "تحويل مديونية لطبيب" ────────
  // هذا الحساب يمثل ذمة المريض المحوَّلة للطبيب (أصول أو إيرادات — ليس مصروفاً)
  // يُضبط من صفحة ربط الحسابات ← "تحويل مديونية لطبيب" ← "تحويل ذمة مريض لطبيب"
  const mappings = await storage.getMappingsForTransaction("doctor_transfer", null, null, null);
  const transferMapping = mappings.find(m => m.lineType === "payable_transfer");

  if (!transferMapping?.debitAccountId) {
    logger.warn({ transferId }, "[DoctorTransferGL] ربط payable_transfer غير موجود — تم تخطي القيد");
    await logAcctEvent({
      sourceType: "doctor_transfer", sourceId: transferId,
      eventType: "doctor_transfer_journal", status: "needs_retry",
      errorMessage: "ربط حساب تحويل ذمة مريض لطبيب (payable_transfer) غير مكتمل — أضفه من صفحة ربط الحسابات ← تحويل مديونية لطبيب",
    }).catch(() => {});
    return;
  }
  const debitAccountId = transferMapping.debitAccountId;

  // ── ٣. إنشاء القيد ─────────────────────────────────────────────────────────
  try {
    await db.transaction(async (tx) => {
      // تحقق من عدم التكرار
      const existing = await tx.select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.sourceType, "doctor_transfer"),
          eq(journalEntries.sourceDocumentId, transferId),
        ))
        .limit(1);
      if (existing.length > 0) return;

      // الفترة المالية
      const [period] = await tx.select({ id: fiscalPeriods.id })
        .from(fiscalPeriods)
        .where(and(
          lte(fiscalPeriods.startDate, invoiceDate),
          gte(fiscalPeriods.endDate, invoiceDate),
          eq(fiscalPeriods.isClosed, false),
        ))
        .limit(1);

      if (!period) {
        await logAcctEvent({
          sourceType: "doctor_transfer", sourceId: transferId,
          eventType: "doctor_transfer_journal", status: "needs_retry",
          errorMessage: `لا توجد فترة مالية مفتوحة لتاريخ ${invoiceDate}`,
        }).catch(() => {});
        return;
      }

      const amtStr = roundMoney(amtNum);
      const entryNumber = await storage.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate:        invoiceDate,
        reference:        `DT-PI-${invoiceNumber}`,
        description:      `تحويل مستحقات طبيب: ${doctorName} — فاتورة ${invoiceNumber}`,
        status:           "posted",
        periodId:         period.id,
        sourceType:       "doctor_transfer",
        sourceDocumentId: transferId,
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
          description:    `ذمة مريض محوَّلة للطبيب: ${doctorName} — فاتورة ${invoiceNumber}`,
        },
        {
          journalEntryId: entry.id,
          lineNumber:     2,
          accountId:      creditAccountId,
          debit:          "0.00",
          credit:         amtStr,
          description:    `مستحقات طبيب: ${doctorName} — فاتورة ${invoiceNumber}`,
        },
      ]);

      logger.info({ transferId, entryNumber, doctorName, amtStr }, "[DoctorTransferGL] قيد تحويل مستحقات طبيب تم بنجاح");
      await logAcctEvent({
        sourceType: "doctor_transfer", sourceId: transferId,
        eventType: "doctor_transfer_journal", status: "completed",
        journalEntryId: entry.id,
      }).catch(() => {});
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, transferId }, "[DoctorTransferGL] خطأ في إنشاء قيد التحويل");
    await logAcctEvent({
      sourceType: "doctor_transfer", sourceId: transferId,
      eventType: "doctor_transfer_journal", status: "failed",
      errorMessage: msg,
    }).catch(() => {});
  }
}
