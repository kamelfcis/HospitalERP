/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Journal Generation Storage — توليد القيود المحاسبية
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - buildPatientInvoiceGLLines : بناء سطور GL من فاتورة المريض
 *  - generatePatientInvoiceJournal: قيد فاتورة المريض (one-sided builder)
 *  - generateJournalEntry        : توليد قيد عام بربط الحسابات
 *  - batchPostJournalEntries     : ترحيل جماعي للمسودات
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { roundMoney, parseMoney } from "../finance-helpers";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import {
  journalEntries,
  journalLines,
  fiscalPeriods,
} from "@shared/schema";
import type {
  JournalEntry,
  InsertJournalLine,
  AccountMapping,
  PatientInvoiceHeader,
  PatientInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";

const methods = {

  buildPatientInvoiceGLLines(
    this: DatabaseStorage,
    header: PatientInvoiceHeader,
    lines: PatientInvoiceLine[],
  ): { lineType: string; amount: string; costCenterId?: string | null }[] {
    const lineTypeMap: Record<string, string> = {
      service:    "revenue_services",
      drug:       "revenue_drugs",
      consumable: "revenue_consumables",
      equipment:  "revenue_equipment",
    };
    const bizClassMap: Record<string, string> = {
      gas:            "revenue_gas",
      operating_room: "revenue_surgery",
      surgery:        "revenue_surgery",
      operation:      "revenue_surgery",
      administrative: "revenue_admin",
      admin:          "revenue_admin",
      admin_service:  "revenue_admin",
    };

    const totals: Record<string, number> = {};
    let doctorCostTotal = 0;
    for (const line of lines) {
      if (line.isVoid) continue;
      if (line.lineType === "doctor_cost") {
        doctorCostTotal += parseMoney(line.totalPrice);
        continue;
      }
      const bizClass = line.businessClassification ?? "";
      const mappingType = (bizClass && bizClassMap[bizClass])
        ? bizClassMap[bizClass]
        : (lineTypeMap[line.lineType as string] || "revenue_general");
      totals[mappingType] = (totals[mappingType] || 0) + parseMoney(line.totalPrice);
    }

    const result: { lineType: string; amount: string }[] = [];
    const totalNet = parseMoney(header.netAmount);
    if (totalNet > 0) {
      const paymentType = header.patientType === "cash" ? "cash" : "receivables";
      result.push({ lineType: paymentType, amount: roundMoney(totalNet) });
    }
    for (const [lt, amt] of Object.entries(totals)) {
      if (amt > 0) result.push({ lineType: lt, amount: roundMoney(amt) });
    }
    if (doctorCostTotal > 0) {
      result.push({ lineType: "doctor_cost", amount: roundMoney(doctorCostTotal) });
    }
    return result;
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  generatePatientInvoiceJournal — قيد فاتورة المريض (one-sided builder)
  //
  //  هيكل القيد الناتج:
  //  مدين  النقدية / الذمم    = صافي الفاتورة
  //  دائن  إيراد خدمات/أدوية = مجموع كل نوع
  //  مدين  تكلفة طبيب        ↕  (زوج مستقل)
  //  دائن  مستحقات طبيب      ↕
  // ══════════════════════════════════════════════════════════════════════════
  async generatePatientInvoiceJournal(this: DatabaseStorage, params: {
    sourceDocumentId: string;
    reference: string;
    description: string;
    entryDate: string;
    lines: { lineType: string; amount: string; costCenterId?: string | null; debitAccountId?: string | null }[];
    departmentId?: string | null;
    dynamicAccountOverrides?: Record<string, { debitAccountId?: string | null; creditAccountId?: string | null }>;
  }): Promise<JournalEntry | null> {
    const sourceType = "patient_invoice";
    return await db.transaction(async (tx) => {
      const lockKey = Math.abs(params.sourceDocumentId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const existing = await tx.select().from(journalEntries)
        .where(and(
          eq(journalEntries.sourceType, sourceType),
          eq(journalEntries.sourceDocumentId, params.sourceDocumentId)
        ))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[GL] Idempotent: journal entry already exists for ${sourceType}/${params.sourceDocumentId}`);
        return existing[0];
      }

      const mappings = await this.getMappingsForTransaction(sourceType, null, null, params.departmentId ?? null);
      const mappingMap = new Map<string, AccountMapping>();
      for (const m of mappings) mappingMap.set(m.lineType, m);

      const journalLineData: InsertJournalLine[] = [];
      const unmappedTypes: string[] = [];
      let lineNum = 1;

      const DEBIT_ONLY_TYPES = new Set(["cash", "receivables"]);
      const PAIRED_TYPES     = new Set(["doctor_cost"]);

      for (const line of params.lines) {
        const mapping   = mappingMap.get(line.lineType);
        const overrides = params.dynamicAccountOverrides?.[line.lineType];
        const amount = parseMoney(line.amount);
        if (amount <= 0) continue;

        if (DEBIT_ONLY_TYPES.has(line.lineType)) {
          const debitId = line.debitAccountId || overrides?.debitAccountId || mapping?.debitAccountId || null;
          if (!debitId) { unmappedTypes.push(line.lineType); continue; }
          journalLineData.push({
            journalEntryId: "", lineNumber: lineNum++, accountId: debitId,
            debit: roundMoney(amount), credit: "0.00",
            description: line.lineType === "cash" ? "نقدية مريض" : "ذمم مريض / شركة تعاقد",
            ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
          });
        } else if (PAIRED_TYPES.has(line.lineType)) {
          const debitId  = overrides?.debitAccountId  || mapping?.debitAccountId  || null;
          const creditId = overrides?.creditAccountId || mapping?.creditAccountId || null;
          if (!debitId || !creditId) { unmappedTypes.push(line.lineType); continue; }
          journalLineData.push({
            journalEntryId: "", lineNumber: lineNum++, accountId: debitId,
            debit: roundMoney(amount), credit: "0.00", description: "تكلفة طبيب",
            ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
          });
          journalLineData.push({
            journalEntryId: "", lineNumber: lineNum++, accountId: creditId,
            debit: "0.00", credit: roundMoney(amount), description: "مستحقات طبيب",
            ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
          });
        } else {
          const creditId = overrides?.creditAccountId || mapping?.creditAccountId || null;
          if (!creditId) { unmappedTypes.push(line.lineType); continue; }
          journalLineData.push({
            journalEntryId: "", lineNumber: lineNum++, accountId: creditId,
            debit: "0.00", credit: roundMoney(amount),
            description: mapping?.description || `إيراد ${line.lineType}`,
            ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
          });
        }
      }

      if (unmappedTypes.length > 0) {
        logAcctEvent({
          sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_partial_mappings", status: "needs_retry",
          errorMessage: `أنواع سطور غير مربوطة لـ "${sourceType}": [${unmappedTypes.join(', ')}]. أضف الربط الناقص من /account-mappings.`,
        }).catch(() => {});
      }

      if (journalLineData.length === 0) {
        logAcctEvent({
          sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_all_lines_unmapped", status: "needs_retry",
          errorMessage: `جميع سطور المعاملة "${sourceType}" غير مربوطة — لم يُنشأ أي قيد. عرِّف ربط الحسابات من /account-mappings.`,
        }).catch(() => {});
        return null;
      }

      const totalDebit  = journalLineData.reduce((s, l) => s + parseMoney(l.debit),  0);
      const totalCredit = journalLineData.reduce((s, l) => s + parseMoney(l.credit), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        logAcctEvent({
          sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_unbalanced", status: "failed",
          errorMessage: `رُفض القيد: ميزان غير متوازن (مدين=${totalDebit.toFixed(2)}, دائن=${totalCredit.toFixed(2)}). الربط الناقص: [${unmappedTypes.join(', ')}].`,
        }).catch(() => {});
        return null;
      }

      let periodId: string | undefined;
      const [period] = await tx.select().from(fiscalPeriods)
        .where(and(
          lte(fiscalPeriods.startDate, params.entryDate),
          gte(fiscalPeriods.endDate, params.entryDate),
          eq(fiscalPeriods.isClosed, false)
        ))
        .limit(1);
      periodId = period?.id;

      if (!periodId) {
        logAcctEvent({
          sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_no_fiscal_period", status: "needs_retry",
          errorMessage: `لا توجد فترة مالية مفتوحة تغطي تاريخ ${params.entryDate} — رُفض إنشاء القيد.`,
        }).catch(() => {});
        return null;
      }

      const entryNumber = await this.getNextEntryNumber();
      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: params.entryDate,
        reference: params.reference,
        description: params.description,
        status: "posted",
        periodId: periodId || null,
        sourceType,
        sourceDocumentId: params.sourceDocumentId,
        totalDebit:  roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
      }).returning();

      const linesWithEntryId = await resolveCostCenters(
        journalLineData.map((l, idx) => ({ ...l, journalEntryId: entry.id, lineNumber: idx + 1 }))
      );
      await tx.insert(journalLines).values(linesWithEntryId);
      console.log(`[GL] Created patient invoice journal entry ${entry.entryNumber} for ${params.sourceDocumentId}`);
      return entry;
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  generateJournalEntry — قيد عام بربط الحسابات (للمعاملات غير PI)
  // ══════════════════════════════════════════════════════════════════════════
  async generateJournalEntry(this: DatabaseStorage, params: {
    sourceType: string;
    sourceDocumentId: string;
    reference: string;
    description: string;
    entryDate: string;
    lines: { lineType: string; amount: string; costCenterId?: string | null }[];
    periodId?: string;
    departmentId?: string | null;
    dynamicAccountOverrides?: Record<string, { debitAccountId?: string | null; creditAccountId?: string | null }>;
  }): Promise<JournalEntry | null> {
    return await db.transaction(async (tx) => {
      const lockKey = Math.abs(params.sourceDocumentId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const existing = await tx.select().from(journalEntries)
        .where(and(
          eq(journalEntries.sourceType, params.sourceType),
          eq(journalEntries.sourceDocumentId, params.sourceDocumentId)
        ))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[GL] Idempotent: journal entry already exists for ${params.sourceType}/${params.sourceDocumentId}`);
        return existing[0];
      }

      const mappings = await this.getMappingsForTransaction(params.sourceType, null, null, params.departmentId ?? null);
      const mappingMap = new Map<string, AccountMapping>();
      for (const m of mappings) mappingMap.set(m.lineType, m);

      if (mappings.length === 0 && !params.dynamicAccountOverrides) {
        logAcctEvent({
          sourceType: params.sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_no_mappings", status: "needs_retry",
          errorMessage: `لا يوجد ربط حسابات مُعرَّف لنوع المعاملة "${params.sourceType}". أضف الربط من /account-mappings.`,
        }).catch(() => {});
        return null;
      }

      const journalLineData: InsertJournalLine[] = [];
      const unmappedTypes: string[] = [];

      for (const line of params.lines) {
        const mapping   = mappingMap.get(line.lineType);
        const overrides = params.dynamicAccountOverrides?.[line.lineType];
        const debitId  = overrides?.debitAccountId  || mapping?.debitAccountId  || null;
        const creditId = overrides?.creditAccountId || mapping?.creditAccountId || null;

        if (!debitId || !creditId) { unmappedTypes.push(line.lineType); continue; }
        const amount = parseMoney(line.amount);
        if (amount <= 0) continue;

        journalLineData.push({
          journalEntryId: "", lineNumber: 0, accountId: debitId,
          debit: roundMoney(amount), credit: "0.00",
          description: mapping?.description || params.description,
          ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
        });
        journalLineData.push({
          journalEntryId: "", lineNumber: 0, accountId: creditId,
          debit: "0.00", credit: roundMoney(amount),
          description: mapping?.description || params.description,
          ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
        });
      }

      if (unmappedTypes.length > 0) {
        logAcctEvent({
          sourceType: params.sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_partial_mappings", status: "needs_retry",
          errorMessage: `أنواع سطور غير مربوطة لـ "${params.sourceType}": [${unmappedTypes.join(', ')}].`,
        }).catch(() => {});
      }

      if (journalLineData.length === 0) {
        logAcctEvent({
          sourceType: params.sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_all_lines_unmapped", status: "needs_retry",
          errorMessage: `جميع سطور "${params.sourceType}" غير مربوطة — لم يُنشأ أي قيد.`,
        }).catch(() => {});
        return null;
      }

      const preCheckDebit  = journalLineData.reduce((s, l) => s + parseMoney(l.debit),  0);
      const preCheckCredit = journalLineData.reduce((s, l) => s + parseMoney(l.credit), 0);
      if (Math.abs(preCheckDebit - preCheckCredit) > 0.01) {
        logAcctEvent({
          sourceType: params.sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_unbalanced", status: "failed",
          errorMessage: `رُفض القيد: ميزان غير متوازن (مدين=${preCheckDebit.toFixed(2)}, دائن=${preCheckCredit.toFixed(2)}). الربط الناقص: [${unmappedTypes.join(', ')}].`,
        }).catch(() => {});
        return null;
      }

      let periodId = params.periodId;
      if (!periodId) {
        const [period] = await tx.select().from(fiscalPeriods)
          .where(and(
            lte(fiscalPeriods.startDate, params.entryDate),
            gte(fiscalPeriods.endDate, params.entryDate),
            eq(fiscalPeriods.isClosed, false)
          ))
          .limit(1);
        periodId = period?.id;
      }

      if (!periodId) {
        logAcctEvent({
          sourceType: params.sourceType, sourceId: params.sourceDocumentId,
          eventType: "journal_no_fiscal_period", status: "needs_retry",
          errorMessage: `لا توجد فترة مالية مفتوحة تغطي تاريخ ${params.entryDate} — رُفض إنشاء القيد.`,
        }).catch(() => {});
        return null;
      }

      const totalDebit  = journalLineData.reduce((s, l) => s + parseMoney(l.debit),  0);
      const totalCredit = journalLineData.reduce((s, l) => s + parseMoney(l.credit), 0);
      const entryNumber = await this.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate:        params.entryDate,
        reference:        params.reference,
        description:      params.description,
        status:           "draft",
        periodId:         periodId || null,
        sourceType:       params.sourceType,
        sourceDocumentId: params.sourceDocumentId,
        totalDebit:       roundMoney(totalDebit),
        totalCredit:      roundMoney(totalCredit),
      }).returning();

      const linesWithEntryId = await resolveCostCenters(
        journalLineData.map((l, idx) => ({ ...l, journalEntryId: entry.id, lineNumber: idx + 1 }))
      );
      await tx.insert(journalLines).values(linesWithEntryId);
      console.log(`[GL] Created journal entry ${entry.entryNumber} for ${params.sourceType}/${params.sourceDocumentId}`);
      return entry;
    });
  },

  async batchPostJournalEntries(this: DatabaseStorage, ids: string[], userId: string | null): Promise<{ posted: number; errors: string[] }> {
    let posted = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
        if (!entry || entry.status !== 'draft') {
          errors.push(`القيد ${entry?.entryNumber ?? id}: ليس في حالة مسودة`);
          continue;
        }
        await this.assertPeriodOpen(entry.entryDate);
        const result = await this.postJournalEntry(id, userId);
        if (result) {
          await this.createAuditLog({
            tableName: "journal_entries", recordId: id, action: "post",
            oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }),
          });
          posted++;
        } else {
          errors.push(`القيد ${entry.entryNumber}: فشل الترحيل`);
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { posted, errors };
  },
};

export default methods;
