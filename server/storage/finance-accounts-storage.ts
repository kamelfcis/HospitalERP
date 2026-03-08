/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Finance Accounts Storage — طبقة تخزين الحسابات والقيود والتدقيق
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - دليل الحسابات (Chart of Accounts)
 *  - مراكز التكلفة (Cost Centers)
 *  - الفترات المحاسبية (Fiscal Periods)
 *  - القيود المحاسبية (Journal Entries)
 *  - قوالب القيود (Journal Templates)
 *  - سجل المراجعة (Audit Log)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, and, asc, sql, gte, lte, or, ilike, isNull } from "drizzle-orm";
import {
  accounts,
  costCenters,
  fiscalPeriods,
  journalEntries,
  journalLines,
  journalTemplates,
  templateLines,
  auditLog,
} from "@shared/schema";
import type {
  Account,
  InsertAccount,
  CostCenter,
  InsertCostCenter,
  FiscalPeriod,
  InsertFiscalPeriod,
  JournalEntry,
  InsertJournalEntry,
  JournalLine,
  InsertJournalLine,
  JournalEntryWithLines,
  JournalTemplate,
  InsertJournalTemplate,
  TemplateLine,
  InsertTemplateLine,
  AuditLog,
  InsertAuditLog,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  // ==================== Accounts — دليل الحسابات ====================

  async getAccounts(this: DatabaseStorage): Promise<Account[]> {
    return db.select().from(accounts).orderBy(accounts.code);
  },

  async getAccount(this: DatabaseStorage, id: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account;
  },

  async createAccount(this: DatabaseStorage, account: InsertAccount): Promise<Account> {
    let level = 1;
    if (account.parentId) {
      const parent = await this.getAccount(account.parentId);
      if (parent) {
        level = parent.level + 1;
      }
    }
    
    const [newAccount] = await db.insert(accounts).values({ ...account, level }).returning();
    return newAccount;
  },

  async updateAccount(this: DatabaseStorage, id: string, account: Partial<InsertAccount>): Promise<Account | undefined> {
    const [updated] = await db.update(accounts).set(account).where(eq(accounts.id, id)).returning();
    return updated;
  },

  async deleteAccount(this: DatabaseStorage, id: string): Promise<boolean> {
    const result = await db.delete(accounts).where(eq(accounts.id, id));
    return true;
  },

  // ==================== Cost Centers — مراكز التكلفة ====================

  async getCostCenters(this: DatabaseStorage): Promise<CostCenter[]> {
    return db.select().from(costCenters).orderBy(costCenters.code);
  },

  async getCostCenter(this: DatabaseStorage, id: string): Promise<CostCenter | undefined> {
    const [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, id));
    return costCenter;
  },

  async createCostCenter(this: DatabaseStorage, costCenter: InsertCostCenter): Promise<CostCenter> {
    const [newCostCenter] = await db.insert(costCenters).values(costCenter).returning();
    return newCostCenter;
  },

  async updateCostCenter(this: DatabaseStorage, id: string, costCenter: Partial<InsertCostCenter>): Promise<CostCenter | undefined> {
    const [updated] = await db.update(costCenters).set(costCenter).where(eq(costCenters.id, id)).returning();
    return updated;
  },

  async deleteCostCenter(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.delete(costCenters).where(eq(costCenters.id, id));
    return true;
  },

  // ==================== Fiscal Periods — الفترات المحاسبية ====================

  async getFiscalPeriods(this: DatabaseStorage): Promise<FiscalPeriod[]> {
    return db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startDate));
  },

  async getFiscalPeriod(this: DatabaseStorage, id: string): Promise<FiscalPeriod | undefined> {
    const [period] = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id));
    return period;
  },

  async getCurrentPeriod(this: DatabaseStorage): Promise<FiscalPeriod | undefined> {
    const today = new Date().toISOString().split('T')[0];
    const [period] = await db.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, today),
        gte(fiscalPeriods.endDate, today),
        eq(fiscalPeriods.isClosed, false)
      ));
    return period;
  },

  async assertPeriodOpen(this: DatabaseStorage, dateStr: string): Promise<void> {
    const [period] = await db.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, dateStr),
        gte(fiscalPeriods.endDate, dateStr),
        eq(fiscalPeriods.isClosed, true)
      ));
    if (period) {
      throw new Error(`لا يمكن تنفيذ العملية: الفترة المحاسبية "${period.name}" مغلقة`);
    }
  },

  async createFiscalPeriod(this: DatabaseStorage, period: InsertFiscalPeriod): Promise<FiscalPeriod> {
    const [newPeriod] = await db.insert(fiscalPeriods).values(period).returning();
    return newPeriod;
  },

  async closeFiscalPeriod(this: DatabaseStorage, id: string, userId?: string | null): Promise<FiscalPeriod | undefined> {
    const [updated] = await db.update(fiscalPeriods)
      .set({ isClosed: true, closedAt: new Date(), closedBy: userId || null })
      .where(eq(fiscalPeriods.id, id))
      .returning();
    return updated;
  },

  async reopenFiscalPeriod(this: DatabaseStorage, id: string): Promise<FiscalPeriod | undefined> {
    const [updated] = await db.update(fiscalPeriods)
      .set({ isClosed: false, closedAt: null, closedBy: null })
      .where(eq(fiscalPeriods.id, id))
      .returning();
    return updated;
  },

  // ==================== Journal Entries — القيود المحاسبية ====================

  async getJournalEntries(this: DatabaseStorage): Promise<JournalEntry[]> {
    return db.select().from(journalEntries).orderBy(desc(journalEntries.entryNumber));
  },

  async getJournalEntriesPaginated(this: DatabaseStorage, filters: {
    page?: number;
    pageSize?: number;
    status?: string;
    sourceType?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }): Promise<{ data: JournalEntry[]; total: number }> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];

    if (filters.status && filters.status !== "all") {
      conditions.push(eq(journalEntries.status, filters.status as any));
    }

    if (filters.sourceType && filters.sourceType !== "all") {
      if (filters.sourceType === "manual") {
        conditions.push(isNull(journalEntries.sourceType));
      } else {
        conditions.push(eq(journalEntries.sourceType, filters.sourceType));
      }
    }

    if (filters.dateFrom) {
      conditions.push(gte(journalEntries.entryDate, filters.dateFrom));
    }

    if (filters.dateTo) {
      conditions.push(lte(journalEntries.entryDate, filters.dateTo));
    }

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          sql`CAST(${journalEntries.entryNumber} AS TEXT) LIKE ${searchPattern}`,
          ilike(journalEntries.description, searchPattern),
          ilike(journalEntries.reference, searchPattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(journalEntries)
      .where(whereClause);

    const data = await db
      .select()
      .from(journalEntries)
      .where(whereClause)
      .orderBy(desc(journalEntries.entryNumber))
      .limit(pageSize)
      .offset(offset);

    return { data, total: countResult?.count || 0 };
  },

  async getJournalEntry(this: DatabaseStorage, id: string): Promise<JournalEntryWithLines | undefined> {
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!entry) return undefined;

    const lines = await db.select().from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber);

    const linesWithAccounts = await Promise.all(lines.map(async (line) => {
      const [account] = await db.select().from(accounts).where(eq(accounts.id, line.accountId));
      let costCenter;
      if (line.costCenterId) {
        [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, line.costCenterId));
      }
      return { ...line, account, costCenter };
    }));

    let period;
    if (entry.periodId) {
      [period] = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, entry.periodId));
    }

    return { ...entry, lines: linesWithAccounts, period };
  },

  async getNextEntryNumber(this: DatabaseStorage): Promise<number> {
    // يستخدم PostgreSQL SEQUENCE — يضمن عدم التكرار تحت التزامن بشكل مدمج في قاعدة البيانات
    // nextval() لا يتأثر بالـ rollback (gaps مقبولة في قيود المحاسبة)
    const result = await db.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
    return Number((result.rows[0] as Record<string, unknown>).next_num);
  },

  async createJournalEntry(this: DatabaseStorage, entry: InsertJournalEntry, lines: InsertJournalLine[]): Promise<JournalEntry> {
    return await db.transaction(async (tx) => {
      const entryNumber = await this.getNextEntryNumber();

      const [newEntry] = await tx.insert(journalEntries)
        .values({ ...entry, entryNumber })
        .returning();

      if (lines.length > 0) {
        await tx.insert(journalLines).values(
          lines.map((line) => ({ ...line, journalEntryId: newEntry.id }))
        );
      }

      return newEntry;
    });
  },

  async updateJournalEntry(this: DatabaseStorage, id: string, entry: Partial<InsertJournalEntry>, lines?: InsertJournalLine[]): Promise<JournalEntry | undefined> {
    return await db.transaction(async (tx) => {
      // قفل الصف لمنع التعديل المتزامن
      const lockResult = await tx.execute(sql`SELECT id, status FROM journal_entries WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as { id: string; status: string } | undefined;
      if (!existing || existing.status !== 'draft') {
        return undefined;
      }

      const [updated] = await tx.update(journalEntries)
        .set({ ...entry, updatedAt: new Date() })
        .where(and(eq(journalEntries.id, id), eq(journalEntries.status, 'draft')))
        .returning();

      if (lines && lines.length > 0) {
        // حذف السطور القديمة وإدراج الجديدة في نفس الـ transaction
        // لو فشل الإدراج: الحذف يُلغى تلقائياً ويرجع القيد لحالته
        await tx.delete(journalLines).where(eq(journalLines.journalEntryId, id));
        await tx.insert(journalLines).values(
          lines.map((line) => ({ ...line, journalEntryId: id }))
        );
      }

      return updated;
    });
  },

  async postJournalEntry(this: DatabaseStorage, id: string, userId?: string | null): Promise<JournalEntry | undefined> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM journal_entries WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as any;
      if (!existing || existing.status !== 'draft') {
        return undefined;
      }

      const [updated] = await tx.update(journalEntries)
        .set({ status: 'posted', postedBy: userId || null, postedAt: new Date() })
        .where(and(eq(journalEntries.id, id), eq(journalEntries.status, 'draft')))
        .returning();

      return updated;
    });
  },

  async reverseJournalEntry(this: DatabaseStorage, id: string, userId?: string | null): Promise<JournalEntry | undefined> {
    const todayStr = new Date().toISOString().split('T')[0];

    return await db.transaction(async (tx) => {
    const closedPeriod = await tx.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, todayStr),
        gte(fiscalPeriods.endDate, todayStr),
        eq(fiscalPeriods.isClosed, true)
      ))
      .for("update");
    if (closedPeriod.length > 0) {
      throw new Error(`لا يمكن تنفيذ العملية: الفترة المحاسبية "${closedPeriod[0].name}" مغلقة`);
    }

    const openPeriod = await tx.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, todayStr),
        gte(fiscalPeriods.endDate, todayStr),
        eq(fiscalPeriods.isClosed, false)
      ));
    const reversalPeriodId = openPeriod.length > 0 ? openPeriod[0].id : null;

    const lockResult = await tx.execute(sql`SELECT * FROM journal_entries WHERE id = ${id} FOR UPDATE`);
    const locked = lockResult.rows?.[0] as any;
    if (!locked || locked.status !== 'posted') {
      return undefined;
    }

    const entry = await this.getJournalEntry(id);
    if (!entry) return undefined;

    await tx.update(journalEntries)
      .set({ status: 'reversed', reversedBy: userId || null, reversedAt: new Date() })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.status, 'posted')));

    const entryNumber = await this.getNextEntryNumber();
    const [reversalEntry] = await tx.insert(journalEntries).values({
      entryNumber,
      entryDate: todayStr,
      description: `قيد عكسي - ${entry.description}`,
      status: 'posted',
      periodId: reversalPeriodId,
      totalDebit: entry.totalCredit,
      totalCredit: entry.totalDebit,
      reference: `REV-${entry.entryNumber}`,
      createdBy: userId || null,
      postedBy: userId || null,
      postedAt: new Date(),
      reversalEntryId: id,
    }).returning();

    for (const line of entry.lines) {
      await tx.insert(journalLines).values({
        journalEntryId: reversalEntry.id,
        lineNumber: line.lineNumber,
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        description: line.description,
        debit: line.credit,
        credit: line.debit,
      });
    }

    const [updated] = await tx.update(journalEntries)
      .set({ reversalEntryId: reversalEntry.id })
      .where(eq(journalEntries.id, id))
      .returning();

    return updated;
    });
  },

  async deleteJournalEntry(this: DatabaseStorage, id: string): Promise<boolean> {
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!existing || existing.status !== 'draft') {
      return false;
    }
    await db.delete(journalLines).where(eq(journalLines.journalEntryId, id));
    await db.delete(journalEntries).where(eq(journalEntries.id, id));
    return true;
  },

  // ==================== Journal Templates — قوالب القيود ====================

  async getTemplates(this: DatabaseStorage): Promise<JournalTemplate[]> {
    return db.select().from(journalTemplates).orderBy(desc(journalTemplates.createdAt));
  },

  async getTemplate(this: DatabaseStorage, id: string): Promise<JournalTemplate | undefined> {
    const [template] = await db.select().from(journalTemplates).where(eq(journalTemplates.id, id));
    return template;
  },

  async createTemplate(this: DatabaseStorage, template: InsertJournalTemplate): Promise<JournalTemplate> {
    const [newTemplate] = await db.insert(journalTemplates).values(template).returning();
    return newTemplate;
  },

  async updateTemplate(this: DatabaseStorage, id: string, template: Partial<InsertJournalTemplate>): Promise<JournalTemplate | undefined> {
    const [updated] = await db.update(journalTemplates).set(template).where(eq(journalTemplates.id, id)).returning();
    return updated;
  },

  async deleteTemplate(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.delete(templateLines).where(eq(templateLines.templateId, id));
    await db.delete(journalTemplates).where(eq(journalTemplates.id, id));
    return true;
  },

  async getTemplateLines(this: DatabaseStorage, templateId: string): Promise<TemplateLine[]> {
    return db.select().from(templateLines).where(eq(templateLines.templateId, templateId)).orderBy(templateLines.lineNumber);
  },

  async getTemplateWithLines(this: DatabaseStorage, id: string): Promise<(JournalTemplate & { lines: TemplateLine[] }) | undefined> {
    const template = await this.getTemplate(id);
    if (!template) return undefined;
    const lines = await this.getTemplateLines(id);
    return { ...template, lines };
  },

  async createTemplateWithLines(this: DatabaseStorage, template: InsertJournalTemplate, lines: InsertTemplateLine[]): Promise<JournalTemplate> {
    const [newTemplate] = await db.insert(journalTemplates).values(template).returning();
    if (lines.length > 0) {
      const linesWithTemplateId = lines.map(line => ({ ...line, templateId: newTemplate.id }));
      await db.insert(templateLines).values(linesWithTemplateId);
    }
    return newTemplate;
  },

  async updateTemplateWithLines(this: DatabaseStorage, id: string, template: Partial<InsertJournalTemplate>, lines: InsertTemplateLine[]): Promise<JournalTemplate | undefined> {
    const [updated] = await db.update(journalTemplates).set(template).where(eq(journalTemplates.id, id)).returning();
    if (!updated) return undefined;
    await db.delete(templateLines).where(eq(templateLines.templateId, id));
    if (lines.length > 0) {
      const linesWithTemplateId = lines.map(line => ({ ...line, templateId: id }));
      await db.insert(templateLines).values(linesWithTemplateId);
    }
    return updated;
  },

  // ==================== Audit Log — سجل المراجعة ====================

  async getAuditLogs(this: DatabaseStorage): Promise<AuditLog[]> {
    return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(500);
  },

  async getAuditLogsPaginated(this: DatabaseStorage, filters: { page: number; pageSize: number; tableName?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<{ data: AuditLog[]; total: number }> {
    const { page, pageSize, tableName, action, dateFrom, dateTo } = filters;
    const conditions: any[] = [];

    if (tableName) {
      conditions.push(eq(auditLog.tableName, tableName));
    }
    if (action) {
      conditions.push(eq(auditLog.action, action));
    }
    if (dateFrom) {
      conditions.push(gte(auditLog.createdAt, new Date(dateFrom)));
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(auditLog.createdAt, endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLog)
      .where(whereClause);

    const data = await db
      .select()
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total: Number(countResult.count) };
  },

  async createAuditLog(this: DatabaseStorage, log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db.insert(auditLog).values(log).returning();
    return newLog;
  },

};

export default methods;
