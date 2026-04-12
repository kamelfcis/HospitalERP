/**
 * قيد تحويل مديونية مريض للطبيب
 * عند التحويل:
 *   مدين : ذمم مدينة من الأطباء  (doctor.receivableAccountId)
 *   دائن : ذمم المرضى             (patient_invoice mapping → receivables → debitAccountId)
 */
import { db } from "../db";
import { eq, and, lte, gte } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "./logger";
import { roundMoney, parseMoney } from "../finance-helpers";
import { logAcctEvent } from "./accounting-event-logger";
import {
  doctors, journalEntries, journalLines, fiscalPeriods,
} from "@shared/schema";

export async function generateDoctorTransferGL(params: {
  transferId:    string;
  invoiceId:     string;
  doctorName:    string;
  amount:        string;
  invoiceDate:   string;
  invoiceNumber: string;
  departmentId:  string | null;
}): Promise<void> {
  const { transferId, doctorName, amount, invoiceDate, invoiceNumber, departmentId } = params;
  const amtNum = parseMoney(amount);
  if (amtNum <= 0) return;

  // ── ١. حساب ذمم مدينة من الأطباء (مدين) — من بيانات الطبيب ───────────────
  const [doctor] = await db.select({ receivableAccountId: doctors.receivableAccountId })
    .from(doctors)
    .where(eq(doctors.name, doctorName))
    .limit(1);

  if (!doctor?.receivableAccountId) {
    logger.warn({ transferId, doctorName }, "[DoctorTransferGL] الطبيب لا يملك حساب ذمم مدينة — تم تخطي القيد");
    await logAcctEvent({
      sourceType: "doctor_transfer", sourceId: transferId,
      eventType: "doctor_transfer_journal", status: "needs_retry",
      errorMessage: `الطبيب "${doctorName}" لا يملك حساب ذمم مدينة (receivableAccountId) — عرِّفه من صفحة الأطباء`,
    }).catch(() => {});
    return;
  }
  const debitAccountId = doctor.receivableAccountId;

  // ── ٢. حساب ذمم المرضى (دائن) — من ربط فاتورة المريض ─────────────────────
  // نستخدم debitAccountId من سطر receivables لأنه يمثل ذمة المريض المدينة
  // ونضعه دائناً لتصفية الذمة عند التحويل
  const mappings = await storage.getMappingsForTransaction("patient_invoice", null, null, departmentId ?? null);
  const receivablesMapping = mappings.find(m => m.lineType === "receivables");

  if (!receivablesMapping?.debitAccountId) {
    logger.warn({ transferId }, "[DoctorTransferGL] ربط حساب ذمم المرضى (receivables) غير مكتمل");
    await logAcctEvent({
      sourceType: "doctor_transfer", sourceId: transferId,
      eventType: "doctor_transfer_journal", status: "needs_retry",
      errorMessage: "حساب ذمم المرضى (receivables) غير محدد في ربط حسابات فاتورة المريض",
    }).catch(() => {});
    return;
  }
  const creditAccountId = receivablesMapping.debitAccountId;

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
        description:      `تحويل مديونية مريض للطبيب: ${doctorName} — فاتورة ${invoiceNumber}`,
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
          description:    `ذمم مدينة من الطبيب ${doctorName} — فاتورة ${invoiceNumber}`,
        },
        {
          journalEntryId: entry.id,
          lineNumber:     2,
          accountId:      creditAccountId,
          debit:          "0.00",
          credit:         amtStr,
          description:    `إقفال ذمة مريض — فاتورة ${invoiceNumber}`,
        },
      ]);

      logger.info({ transferId, entryNumber, doctorName, amtStr }, "[DoctorTransferGL] قيد التحويل تم بنجاح");
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
