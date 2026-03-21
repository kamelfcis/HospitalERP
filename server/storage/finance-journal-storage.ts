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
import { eq, and, asc, sql, gte, lte, isNull, inArray } from "drizzle-orm";
import { roundMoney, parseMoney } from "../finance-helpers";
import {
  journalEntries,
  journalLines,
  accountMappings,
  accounts as accountsTable,
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
import { logAcctEvent } from "../lib/accounting-event-logger";
import {
  validateAccountCategory,
  REVENUE_FIRST_LINE_TYPES,
} from "../lib/account-category-validator";

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
    if (data.pharmacyId) {
      conditions.push(eq(accountMappings.pharmacyId, data.pharmacyId));
    } else {
      conditions.push(isNull(accountMappings.pharmacyId));
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

  // ── bulkUpsertAccountMappings ─────────────────────────────────────────────
  // Wraps all upserts in a single DB transaction.
  // Pre-validated by route (transactionType, lineType, account existence).
  async bulkUpsertAccountMappings(
    this: DatabaseStorage,
    items: import("@shared/schema").InsertAccountMapping[]
  ): Promise<import("@shared/schema").AccountMapping[]> {
    if (items.length === 0) return [];
    return db.transaction(async (tx) => {
      const results: import("@shared/schema").AccountMapping[] = [];
      for (const data of items) {
        const conditions = [
          eq(accountMappings.transactionType, data.transactionType),
          eq(accountMappings.lineType, data.lineType),
        ];
        if (data.warehouseId) {
          conditions.push(eq(accountMappings.warehouseId, data.warehouseId));
        } else {
          conditions.push(isNull(accountMappings.warehouseId));
        }
        const existing = await tx.select({ id: accountMappings.id })
          .from(accountMappings).where(and(...conditions)).limit(1);

        if (existing.length > 0) {
          const [updated] = await tx.update(accountMappings)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(accountMappings.id, existing[0].id))
            .returning();
          results.push(updated);
        } else {
          const [inserted] = await tx.insert(accountMappings).values(data).returning();
          results.push(inserted);
        }
      }
      return results;
    });
  },

  async getMappingsForTransaction(
    this: DatabaseStorage,
    transactionType: string,
    warehouseId?: string | null,
    pharmacyId?:  string | null,
  ): Promise<AccountMapping[]> {
    // ── 1. Fetch all active mappings for this transaction type ──────────────
    const allMappings = await db.select().from(accountMappings)
      .where(and(
        eq(accountMappings.transactionType, transactionType),
        eq(accountMappings.isActive, true),
      ))
      .orderBy(asc(accountMappings.lineType));

    // ── 2. Load account categories for validation ──────────────────────────
    // Collect all referenced account IDs (debit + credit) across all mappings
    const accountIds = [
      ...new Set(
        allMappings.flatMap(m => [m.debitAccountId, m.creditAccountId].filter(Boolean) as string[])
      ),
    ];
    const accountTypeMap = new Map<string, string>(); // id → account_type
    if (accountIds.length > 0) {
      const rows = await db
        .select({ id: accountsTable.id, accountType: accountsTable.accountType })
        .from(accountsTable)
        .where(inArray(accountsTable.id, accountIds));
      for (const r of rows) {
        accountTypeMap.set(r.id, r.accountType as string);
      }
    }

    // ── 3. Partition by scope ──────────────────────────────────────────────
    const warehouseSpecific: AccountMapping[] = warehouseId
      ? allMappings.filter(m => m.warehouseId === warehouseId && !m.pharmacyId)
      : [];

    const pharmacySpecific: AccountMapping[] = pharmacyId
      ? allMappings.filter(m => m.pharmacyId === pharmacyId && !m.warehouseId)
      : [];

    const generic: AccountMapping[] = allMappings.filter(m => !m.warehouseId && !m.pharmacyId);

    if (!warehouseId && !pharmacyId) {
      return generic;
    }

    // ── 4. Category-aware account validator ───────────────────────────────
    function isMappingValid(m: AccountMapping): boolean {
      if (m.debitAccountId) {
        const aType = accountTypeMap.get(m.debitAccountId) ?? "";
        const result = validateAccountCategory(aType, m.lineType, "debit");
        if (!result.valid) return false;
      }
      if (m.creditAccountId) {
        const aType = accountTypeMap.get(m.creditAccountId) ?? "";
        const result = validateAccountCategory(aType, m.lineType, "credit");
        if (!result.valid) return false;
      }
      return true;
    }

    // ── 5. Per-line-type resolution with semantic priority ─────────────────
    //
    //  Revenue lines (revenue_drugs, revenue_general, …):
    //    pharmacy-specific  →  warehouse-specific  →  generic
    //    (pharmacy drives revenue attribution; warehouse is a physical location)
    //
    //  All other lines (inventory, cogs, receivables, vat, …):
    //    warehouse-specific  →  pharmacy-specific  →  generic
    //    (warehouse drives cost/stock attribution)
    //
    //  Within each tier, the first candidate that passes category validation
    //  wins. If a candidate fails (e.g. revenue_drugs credit = 12312 asset),
    //  it is skipped and the next tier is tried. This prevents a wrong
    //  warehouse-level mapping from overriding a correct pharmacy-level one.

    const allLineTypes = new Set(allMappings.map(m => m.lineType));
    const resultMap = new Map<string, AccountMapping>();

    for (const lineType of allLineTypes) {
      const wh = warehouseSpecific.filter(m => m.lineType === lineType);
      const ph = pharmacySpecific.filter(m => m.lineType === lineType);
      const ge = generic.filter(m => m.lineType === lineType);

      const orderedCandidates: AccountMapping[] = REVENUE_FIRST_LINE_TYPES.has(lineType)
        ? [...ph, ...wh, ...ge]  // revenue: pharmacy first
        : [...wh, ...ph, ...ge]; // others:  warehouse first

      for (const candidate of orderedCandidates) {
        if (isMappingValid(candidate)) {
          resultMap.set(lineType, candidate);
          break;
        }
        // Log skipped invalid mapping so it is visible in audit
        const whyMsg: string[] = [];
        if (candidate.debitAccountId) {
          const aType = accountTypeMap.get(candidate.debitAccountId) ?? "unknown";
          const r = validateAccountCategory(aType, lineType, "debit");
          if (!r.valid) whyMsg.push(r.message);
        }
        if (candidate.creditAccountId) {
          const aType = accountTypeMap.get(candidate.creditAccountId) ?? "unknown";
          const r = validateAccountCategory(aType, lineType, "credit");
          if (!r.valid) whyMsg.push(r.message);
        }
        // Fire-and-forget audit warning; do not await to avoid slowing the call path
        logAcctEvent({
          sourceType:   transactionType,
          sourceId:     candidate.id,
          eventType:    "invalid_mapping_skipped",
          status:       "completed",
          errorMessage: `[تحذير] تم تجاهل ربط حساب غير صالح دلالياً — ${whyMsg.join("; ")} — معرف الربط: ${candidate.id}`,
        }).catch(() => {/* ignore audit log errors */});
      }
    }

    return [...resultMap.values()];
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
    /**
     * Dynamic account overrides — applied BEFORE the static mapping lookup.
     * Used when the system can resolve an account from operational context
     * (e.g. cashier shift treasury GL, warehouse GL) without requiring manual mapping.
     *
     * Example:
     *   { cash: { debitAccountId: shiftGlAccountId } }
     *   → debit side uses the actual shift treasury; credit still comes from mapping
     */
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

      const mappings = await this.getMappingsForTransaction(params.sourceType, null);
      const mappingMap = new Map<string, AccountMapping>();
      for (const m of mappings) {
        mappingMap.set(m.lineType, m);
      }

      // If no mappings AND no dynamic overrides at all: skip (nothing configured)
      if (mappings.length === 0 && !params.dynamicAccountOverrides) {
        logAcctEvent({
          sourceType:   params.sourceType,
          sourceId:     params.sourceDocumentId,
          eventType:    "journal_no_mappings",
          status:       "needs_retry",
          errorMessage: `لا يوجد ربط حسابات مُعرَّف لنوع المعاملة "${params.sourceType}". أضف الربط من /account-mappings وسيُنشأ القيد تلقائياً عند إعادة التشغيل.`,
        }).catch(() => {});
        return null;
      }

      const journalLineData: InsertJournalLine[] = [];
      const unmappedTypes: string[] = [];

      for (const line of params.lines) {
        const mapping    = mappingMap.get(line.lineType);
        const overrides  = params.dynamicAccountOverrides?.[line.lineType];

        // Dynamic overrides take priority; static mapping is the fallback for each side
        const debitId  = overrides?.debitAccountId  || mapping?.debitAccountId  || null;
        const creditId = overrides?.creditAccountId || mapping?.creditAccountId || null;

        if (!debitId || !creditId) {
          unmappedTypes.push(line.lineType);
          continue;
        }
        const amount = parseMoney(line.amount);
        if (amount <= 0) continue;

        journalLineData.push({
          journalEntryId: "",
          lineNumber: 0,
          accountId: debitId,
          debit: roundMoney(amount),
          credit: "0.00",
          description: mapping?.description || params.description,
        });
        journalLineData.push({
          journalEntryId: "",
          lineNumber: 0,
          accountId: creditId,
          debit: "0.00",
          credit: roundMoney(amount),
          description: mapping?.description || params.description,
        });
      }

      if (unmappedTypes.length > 0) {
        logAcctEvent({
          sourceType:   params.sourceType,
          sourceId:     params.sourceDocumentId,
          eventType:    "journal_partial_mappings",
          status:       "needs_retry",
          errorMessage: `أنواع سطور غير مربوطة لـ "${params.sourceType}": [${unmappedTypes.join(', ')}]. هذه السطور ستُحذف من القيد. أضف الربط الناقص من /account-mappings.`,
        }).catch(() => {});
      }

      if (journalLineData.length === 0) {
        logAcctEvent({
          sourceType:   params.sourceType,
          sourceId:     params.sourceDocumentId,
          eventType:    "journal_all_lines_unmapped",
          status:       "needs_retry",
          errorMessage: `جميع سطور المعاملة "${params.sourceType}" غير مربوطة بحسابات — لم يُنشأ أي قيد. عرِّف ربط الحسابات من /account-mappings.`,
        }).catch(() => {});
        return null;
      }

      // Balance check: each mapped line type produces one Dr + one Cr line of equal amounts,
      // so the journal is balanced IFF all expected line types were mapped.
      // If any line type was skipped (unmapped), the totals will diverge — reject the entry
      // entirely rather than inserting an unbalanced draft.
      const preCheckDebit  = journalLineData.reduce((s, l) => s + parseMoney(l.debit),  0);
      const preCheckCredit = journalLineData.reduce((s, l) => s + parseMoney(l.credit), 0);
      if (Math.abs(preCheckDebit - preCheckCredit) > 0.01) {
        logAcctEvent({
          sourceType:   params.sourceType,
          sourceId:     params.sourceDocumentId,
          eventType:    "journal_unbalanced",
          status:       "failed",
          errorMessage: `رُفض القيد: ميزان غير متوازن لـ "${params.sourceType}" (مدين=${preCheckDebit.toFixed(2)}, دائن=${preCheckCredit.toFixed(2)}). الربط الناقص: [${unmappedTypes.join(', ')}]. أضف الربط الناقص من /account-mappings وستنجح إعادة المحاولة.`,
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

      // Log a traceable warning when no fiscal period covers the entry date
      if (!periodId) {
        logAcctEvent({
          sourceType:   params.sourceType,
          sourceId:     params.sourceDocumentId,
          eventType:    "journal_no_fiscal_period",
          status:       "needs_retry",
          errorMessage: `لا توجد فترة مالية مفتوحة تغطي تاريخ ${params.entryDate} — القيد سيُنشأ بدون فترة مالية (period_id = null). افتح فترة مالية تشمل هذا التاريخ ثم أعد الترحيل.`,
        }).catch(() => {});
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
          await this.createAuditLog({ tableName: "journal_entries", recordId: id, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
          posted++;
        } else {
          errors.push(`القيد ${entry.entryNumber}: فشل الترحيل (قد يكون رُحِّل مسبقاً)`);
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { posted, errors };
  },
};

export default methods;
