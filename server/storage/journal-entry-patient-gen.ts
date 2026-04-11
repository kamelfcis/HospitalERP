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
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";

const methods = {

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

};

export default methods;
