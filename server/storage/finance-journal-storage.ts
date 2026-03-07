/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Finance Journal Storage — طبقة تخزين القيود اليومية وربط الحسابات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - ربط الحسابات (Account Mappings)
 *  - القيود التلقائية (Auto Journal Entries)
 *  - الترحيل الجماعي (Batch Post)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, and, asc, sql, gte, lte, isNull } from "drizzle-orm";
import { roundMoney, parseMoney } from "../finance-helpers";
import {
  journalEntries,
  journalLines,
  accountMappings,
  fiscalPeriods,
} from "@shared/schema";
import type {
  JournalEntry,
  InsertJournalLine,
  AccountMapping,
  InsertAccountMapping,
  PatientInvoiceHeader,
  PatientInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  // ==================== Account Mappings — ربط الحسابات ====================

  async getAccountMappings(this: DatabaseStorage, transactionType?: string): Promise<AccountMapping[]> {
    if (transactionType) {
      return db.select().from(accountMappings)
        .where(eq(accountMappings.transactionType, transactionType))
        .orderBy(asc(accountMappings.lineType));
    }
    return db.select().from(accountMappings).orderBy(asc(accountMappings.transactionType), asc(accountMappings.lineType));
  },

  async getAccountMapping(this: DatabaseStorage, id: string): Promise<AccountMapping | undefined> {
    const [mapping] = await db.select().from(accountMappings).where(eq(accountMappings.id, id));
    return mapping;
  },

  async upsertAccountMapping(this: DatabaseStorage, data: InsertAccountMapping): Promise<AccountMapping> {
    const conditions = [
      eq(accountMappings.transactionType, data.transactionType),
      eq(accountMappings.lineType, data.lineType),
    ];
    if (data.warehouseId) {
      conditions.push(eq(accountMappings.warehouseId, data.warehouseId));
    } else {
      conditions.push(isNull(accountMappings.warehouseId));
    }

    const existing = await db.select().from(accountMappings)
      .where(and(...conditions));
    
    if (existing.length > 0) {
      const [updated] = await db.update(accountMappings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(accountMappings.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(accountMappings).values(data).returning();
    return created;
  },

  async deleteAccountMapping(this: DatabaseStorage, id: string): Promise<boolean> {
    const result = await db.delete(accountMappings).where(eq(accountMappings.id, id));
    return (result as any).rowCount > 0;
  },

  async getMappingsForTransaction(this: DatabaseStorage, transactionType: string, warehouseId?: string | null): Promise<AccountMapping[]> {
    const allMappings = await db.select().from(accountMappings)
      .where(and(
        eq(accountMappings.transactionType, transactionType),
        eq(accountMappings.isActive, true)
      ))
      .orderBy(asc(accountMappings.lineType));

    if (!warehouseId) {
      return allMappings.filter(m => !m.warehouseId);
    }

    const warehouseSpecific = allMappings.filter(m => m.warehouseId === warehouseId);
    const generic = allMappings.filter(m => !m.warehouseId);

    const warehouseLineTypes = new Set(warehouseSpecific.map(m => m.lineType));
    const fallbackGeneric = generic.filter(m => !warehouseLineTypes.has(m.lineType));

    return [...warehouseSpecific, ...fallbackGeneric];
  },

  buildPatientInvoiceGLLines(this: DatabaseStorage, header: PatientInvoiceHeader, lines: PatientInvoiceLine[]): { lineType: string; amount: string }[] {
    const lineTypeMap: Record<string, string> = {
      service: "revenue_services",
      drug: "revenue_drugs",
      consumable: "revenue_consumables",
      equipment: "revenue_equipment",
    };
    const totals: Record<string, number> = {};
    for (const line of lines) {
      if (line.isVoid) continue;
      const mappingType = lineTypeMap[line.lineType] || "revenue_general";
      totals[mappingType] = (totals[mappingType] || 0) + parseMoney(line.totalPrice);
    }

    const journalLines: { lineType: string; amount: string }[] = [];
    const totalNet = parseMoney(header.netAmount);
    if (totalNet > 0) {
      const paymentType = header.patientType === "cash" ? "cash" : "receivables";
      journalLines.push({ lineType: paymentType, amount: roundMoney(totalNet) });
    }
    for (const [lt, amt] of Object.entries(totals)) {
      if (amt > 0) journalLines.push({ lineType: lt, amount: roundMoney(amt) });
    }
    return journalLines;
  },

  // ==================== Auto Journal Entry — القيود التلقائية ====================

  async generateJournalEntry(this: DatabaseStorage, params: {
    sourceType: string;
    sourceDocumentId: string;
    reference: string;
    description: string;
    entryDate: string;
    lines: { lineType: string; amount: string }[];
    periodId?: string;
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

      const mappings = await this.getMappingsForTransaction(params.sourceType, null);
      if (mappings.length === 0) {
        console.log(`[GL] SKIPPED: No account mappings configured for transaction type "${params.sourceType}". Configure mappings at /account-mappings to enable automatic GL posting.`);
        return null;
      }

      const mappingMap = new Map<string, AccountMapping>();
      for (const m of mappings) {
        mappingMap.set(m.lineType, m);
      }

      const journalLineData: InsertJournalLine[] = [];
      const unmappedTypes: string[] = [];

      for (const line of params.lines) {
        const mapping = mappingMap.get(line.lineType);
        if (!mapping || !mapping.debitAccountId || !mapping.creditAccountId) {
          unmappedTypes.push(line.lineType);
          continue;
        }
        const amount = parseMoney(line.amount);
        if (amount <= 0) continue;

        journalLineData.push({
          journalEntryId: "",
          lineNumber: 0,
          accountId: mapping.debitAccountId,
          debit: roundMoney(amount),
          credit: "0.00",
          description: mapping.description || params.description,
        });
        journalLineData.push({
          journalEntryId: "",
          lineNumber: 0,
          accountId: mapping.creditAccountId,
          debit: "0.00",
          credit: roundMoney(amount),
          description: mapping.description || params.description,
        });
      }

      if (unmappedTypes.length > 0) {
        console.log(`[GL] WARNING: Unmapped line types for ${params.sourceType}: ${unmappedTypes.join(', ')}. These lines will be skipped. Configure at /account-mappings.`);
      }

      if (journalLineData.length === 0) {
        console.log(`[GL] SKIPPED: All lines unmapped for ${params.sourceType}/${params.sourceDocumentId}. No journal entry created.`);
        return null;
      }

      // Balance check: each mapped line type produces one Dr + one Cr line of equal amounts,
      // so the journal is balanced IFF all expected line types were mapped.
      // If any line type was skipped (unmapped), the totals will diverge — reject the entry
      // entirely rather than inserting an unbalanced draft.
      const preCheckDebit  = journalLineData.reduce((s, l) => s + parseMoney(l.debit),  0);
      const preCheckCredit = journalLineData.reduce((s, l) => s + parseMoney(l.credit), 0);
      if (Math.abs(preCheckDebit - preCheckCredit) > 0.01) {
        console.log(`[GL] REJECTED: Unbalanced journal for ${params.sourceType}/${params.sourceDocumentId} (Dr=${preCheckDebit.toFixed(2)}, Cr=${preCheckCredit.toFixed(2)}). Missing mappings: [${unmappedTypes.join(', ')}]. Configure at /account-mappings and the next retry will succeed.`);
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

      const totalDebit = journalLineData.reduce((s, l) => s + parseMoney(l.debit), 0);
      const totalCredit = journalLineData.reduce((s, l) => s + parseMoney(l.credit), 0);

      const entryNumber = await this.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: params.entryDate,
        reference: params.reference,
        description: params.description,
        status: "draft",
        periodId: periodId || null,
        sourceType: params.sourceType,
        sourceDocumentId: params.sourceDocumentId,
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
      }).returning();

      const linesWithEntryId = journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }));

      await tx.insert(journalLines).values(linesWithEntryId);
      console.log(`[GL] Created journal entry ${entry.entryNumber} for ${params.sourceType}/${params.sourceDocumentId}`);
      return entry;
    });
  },

  async batchPostJournalEntries(this: DatabaseStorage, ids: string[], userId: string): Promise<number> {
    let posted = 0;
    for (const id of ids) {
      try {
        const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
        if (!entry || entry.status !== 'draft') continue;
        await this.assertPeriodOpen(entry.entryDate);
        const result = await this.postJournalEntry(id, userId);
        if (result) {
          await this.createAuditLog({ tableName: "journal_entries", recordId: id, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
          posted++;
        }
      } catch (e) {
      }
    }
    return posted;
  },
};

export default methods;
