/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Finance Storage Methods — طبقة تخزين المحاسبة والمالية
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  يحتوي على جميع عمليات قاعدة البيانات المتعلقة بالمحاسبة والمالية:
 *  - دليل الحسابات (Chart of Accounts)
 *  - مراكز التكلفة (Cost Centers)
 *  - الفترات المحاسبية (Fiscal Periods)
 *  - القيود المحاسبية (Journal Entries)
 *  - قوالب القيود (Journal Templates)
 *  - سجل المراجعة (Audit Log)
 *  - التقارير المالية (Financial Reports)
 *  - ربط الحسابات (Account Mappings)
 *  - القيود التلقائية (Auto Journal Entries)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { eq, desc, and, gte, lte, sql, or, ilike, asc, isNull, isNotNull } from "drizzle-orm";
import { roundMoney, parseMoney } from "../finance-helpers";
import {
  accounts,
  costCenters,
  fiscalPeriods,
  journalEntries,
  journalLines,
  journalTemplates,
  templateLines,
  auditLog,
  accountMappings,
  patientInvoiceHeaders,
  patientInvoiceLines,
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
  AccountMapping,
  InsertAccountMapping,
  PatientInvoiceHeader,
  PatientInvoiceLine,
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

    return { ...entry, lines: linesWithAccounts };
  },

  async getNextEntryNumber(this: DatabaseStorage, _queryCtx: any = db): Promise<number> {
    // يستخدم PostgreSQL SEQUENCE — يضمن عدم التكرار تحت التزامن بشكل مدمج في قاعدة البيانات
    // nextval() لا يتأثر بالـ rollback (gaps مقبولة في قيود المحاسبة)
    const result = await db.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
    return Number((result.rows[0] as Record<string, unknown>).next_num);
  },

  async createJournalEntry(this: DatabaseStorage, entry: InsertJournalEntry, lines: InsertJournalLine[]): Promise<JournalEntry> {
    return await db.transaction(async (tx) => {
      // يستخدم getNextEntryNumber مع tx لضمان الـ advisory lock داخل الـ transaction
      const entryNumber = await this.getNextEntryNumber(tx);

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

    const entryNumber = await this.getNextEntryNumber(tx);
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

  // ==================== Reports — التقارير المالية ====================

  async getDashboardStats(this: DatabaseStorage): Promise<any> {
    const [accountCount] = await db.select({ count: sql<number>`count(*)` }).from(accounts);
    const [costCenterCount] = await db.select({ count: sql<number>`count(*)` }).from(costCenters);
    const [entryStats] = await db.select({
      total: sql<number>`count(*)`,
      draft: sql<number>`count(*) filter (where status = 'draft')`,
      posted: sql<number>`count(*) filter (where status = 'posted')`,
    }).from(journalEntries);

    const [totals] = await db.select({
      totalDebit: sql<string>`COALESCE(SUM(total_debit::numeric), 0)::text`,
      totalCredit: sql<string>`COALESCE(SUM(total_credit::numeric), 0)::text`,
    }).from(journalEntries).where(eq(journalEntries.status, 'posted'));

    const currentPeriod = await this.getCurrentPeriod();

    const recentEntries = await db.select().from(journalEntries)
      .orderBy(desc(journalEntries.createdAt))
      .limit(5);

    return {
      totalAccounts: accountCount?.count || 0,
      totalCostCenters: costCenterCount?.count || 0,
      totalJournalEntries: entryStats?.total || 0,
      draftEntries: entryStats?.draft || 0,
      postedEntries: entryStats?.posted || 0,
      totalDebits: totals?.totalDebit || "0",
      totalCredits: totals?.totalCredit || "0",
      currentPeriod,
      recentEntries,
    };
  },

  async getTrialBalance(this: DatabaseStorage, asOfDate: string): Promise<any> {
    const allAccounts = await this.getAccounts();
    
    const items = await Promise.all(allAccounts.map(async (account) => {
      const [balance] = await db.select({
        debit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.debit}::numeric ELSE 0 END), 0)::text`,
        credit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.credit}::numeric ELSE 0 END), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(eq(journalLines.accountId, account.id));

      const debitBalance = parseFloat(balance?.debit || "0") + parseFloat(account.openingBalance || "0");
      const creditBalance = parseFloat(balance?.credit || "0");
      const netBalance = debitBalance - creditBalance;

      return {
        account,
        debitBalance: netBalance > 0 ? netBalance.toFixed(2) : "0",
        creditBalance: netBalance < 0 ? Math.abs(netBalance).toFixed(2) : "0",
      };
    }));

    const nonZeroItems = items.filter(item => 
      parseFloat(item.debitBalance) > 0 || parseFloat(item.creditBalance) > 0
    );

    const totalDebit = nonZeroItems.reduce((sum, item) => sum + parseFloat(item.debitBalance), 0);
    const totalCredit = nonZeroItems.reduce((sum, item) => sum + parseFloat(item.creditBalance), 0);

    return {
      items: nonZeroItems,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  },

  async getIncomeStatement(this: DatabaseStorage, startDate: string, endDate: string): Promise<any> {
    const allAccounts = await this.getAccounts();
    
    const revenueAccounts = allAccounts.filter(a => a.accountType === 'revenue');
    const expenseAccounts = allAccounts.filter(a => a.accountType === 'expense');

    const getAccountAmount = async (accountId: string) => {
      const [result] = await db.select({
        amount: sql<string>`COALESCE(SUM(
          CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} >= ${startDate} AND ${journalEntries.entryDate} <= ${endDate}
          THEN ${journalLines.credit}::numeric - ${journalLines.debit}::numeric ELSE 0 END
        ), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(eq(journalLines.accountId, accountId));
      return result?.amount || "0";
    };

    const revenues = await Promise.all(revenueAccounts.map(async (account) => {
      const amount = await getAccountAmount(account.id);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        amount,
      };
    }));

    const expenses = await Promise.all(expenseAccounts.map(async (account) => {
      const amount = await getAccountAmount(account.id);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        amount: (parseFloat(amount) * -1).toFixed(2),
      };
    }));

    const totalRevenue = revenues.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const netIncome = totalRevenue - totalExpense;

    return {
      revenues: revenues.filter(r => parseFloat(r.amount) !== 0),
      expenses: expenses.filter(e => parseFloat(e.amount) !== 0),
      totalRevenue: totalRevenue.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      netIncome: netIncome.toFixed(2),
      startDate,
      endDate,
    };
  },

  async getBalanceSheet(this: DatabaseStorage, asOfDate: string): Promise<any> {
    const allAccounts = await this.getAccounts();
    
    const assetAccounts = allAccounts.filter(a => a.accountType === 'asset');
    const liabilityAccounts = allAccounts.filter(a => a.accountType === 'liability');
    const equityAccounts = allAccounts.filter(a => a.accountType === 'equity');

    const getAccountBalance = async (accountId: string, isDebitNormal: boolean) => {
      const [result] = await db.select({
        debit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.debit}::numeric ELSE 0 END), 0)::text`,
        credit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.credit}::numeric ELSE 0 END), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(eq(journalLines.accountId, accountId));

      const debit = parseFloat(result?.debit || "0");
      const credit = parseFloat(result?.credit || "0");
      return isDebitNormal ? (debit - credit).toFixed(2) : (credit - debit).toFixed(2);
    };

    const assets = await Promise.all(assetAccounts.map(async (account) => {
      const openingBalance = parseFloat(account.openingBalance || "0");
      const transactionBalance = parseFloat(await getAccountBalance(account.id, true));
      const balance = (openingBalance + transactionBalance).toFixed(2);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balance,
      };
    }));

    const liabilities = await Promise.all(liabilityAccounts.map(async (account) => {
      const balance = await getAccountBalance(account.id, false);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balance,
      };
    }));

    const equity = await Promise.all(equityAccounts.map(async (account) => {
      const balance = await getAccountBalance(account.id, false);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balance,
      };
    }));

    const revenueAccounts = allAccounts.filter(a => a.accountType === 'revenue');
    const expenseAccounts = allAccounts.filter(a => a.accountType === 'expense');

    let totalRevenue = 0;
    for (const acc of revenueAccounts) {
      const openBal = parseFloat(acc.openingBalance || "0");
      const txBal = parseFloat(await getAccountBalance(acc.id, false));
      totalRevenue += openBal + txBal;
    }
    let totalExpenses = 0;
    for (const acc of expenseAccounts) {
      const openBal = parseFloat(acc.openingBalance || "0");
      const txBal = parseFloat(await getAccountBalance(acc.id, true));
      totalExpenses += openBal + txBal;
    }
    const netIncome = totalRevenue - totalExpenses;

    const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + parseFloat(l.balance), 0);
    const totalEquityFromAccounts = equity.reduce((sum, e) => sum + parseFloat(e.balance), 0);
    const totalEquityWithIncome = totalEquityFromAccounts + netIncome;

    const equityItems = equity.filter(e => parseFloat(e.balance) !== 0);
    if (Math.abs(netIncome) >= 0.01) {
      equityItems.push({
        accountId: "net-income",
        accountCode: "",
        accountName: "صافي ربح/خسارة الفترة",
        balance: netIncome.toFixed(2),
      });
    }

    return {
      assets: assets.filter(a => parseFloat(a.balance) !== 0),
      liabilities: liabilities.filter(l => parseFloat(l.balance) !== 0),
      equity: equityItems,
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      totalEquity: totalEquityWithIncome.toFixed(2),
      totalLiabilitiesAndEquity: (totalLiabilities + totalEquityWithIncome).toFixed(2),
      netIncome: netIncome.toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquityWithIncome)) < 0.01,
    };
  },

  async getCostCenterReport(this: DatabaseStorage, startDate: string, endDate: string, costCenterId?: string): Promise<any> {
    const allCostCenters = costCenterId && costCenterId !== 'all'
      ? [await this.getCostCenter(costCenterId)].filter(Boolean) as CostCenter[]
      : await this.getCostCenters();

    const items = await Promise.all(allCostCenters.map(async (cc) => {
      const [result] = await db.select({
        totalRevenue: sql<string>`COALESCE(SUM(
          CASE WHEN ${accounts.accountType} = 'revenue' AND ${journalEntries.status} = 'posted' 
               AND ${journalEntries.entryDate} >= ${startDate} AND ${journalEntries.entryDate} <= ${endDate}
          THEN ${journalLines.credit}::numeric - ${journalLines.debit}::numeric ELSE 0 END
        ), 0)::text`,
        totalExpense: sql<string>`COALESCE(SUM(
          CASE WHEN ${accounts.accountType} = 'expense' AND ${journalEntries.status} = 'posted'
               AND ${journalEntries.entryDate} >= ${startDate} AND ${journalEntries.entryDate} <= ${endDate}
          THEN ${journalLines.debit}::numeric - ${journalLines.credit}::numeric ELSE 0 END
        ), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(eq(journalLines.costCenterId, cc.id));

      const totalRevenue = parseFloat(result?.totalRevenue || "0");
      const totalExpense = parseFloat(result?.totalExpense || "0");

      return {
        costCenterId: cc.id,
        costCenterCode: cc.code,
        costCenterName: cc.name,
        totalRevenue: totalRevenue.toFixed(2),
        totalExpense: totalExpense.toFixed(2),
        netResult: (totalRevenue - totalExpense).toFixed(2),
      };
    }));

    const grandTotalRevenue = items.reduce((sum, i) => sum + parseFloat(i.totalRevenue), 0);
    const grandTotalExpense = items.reduce((sum, i) => sum + parseFloat(i.totalExpense), 0);

    return {
      items,
      grandTotalRevenue: grandTotalRevenue.toFixed(2),
      grandTotalExpense: grandTotalExpense.toFixed(2),
      grandNetResult: (grandTotalRevenue - grandTotalExpense).toFixed(2),
      startDate,
      endDate,
    };
  },

  async getAccountLedger(this: DatabaseStorage, accountId: string, startDate: string, endDate: string): Promise<any> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error("الحساب غير موجود");
    }

    const [openingResult] = await db.select({
      totalDebit: sql<string>`COALESCE(SUM(${journalLines.debit}::numeric), 0)::text`,
      totalCredit: sql<string>`COALESCE(SUM(${journalLines.credit}::numeric), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalLines.accountId, accountId),
      sql`(${journalEntries.status} = 'posted' OR ${journalEntries.status} = 'reversed')`,
      sql`${journalEntries.entryDate} < ${startDate}`
    ));

    const openingDebit = parseFloat(openingResult?.totalDebit || "0");
    const openingCredit = parseFloat(openingResult?.totalCredit || "0");
    
    const isDebitNormal = ['asset', 'expense'].includes(account.accountType);
    const accountOpeningBalance = parseFloat(account.openingBalance || "0");
    let openingBalance = isDebitNormal 
      ? accountOpeningBalance + (openingDebit - openingCredit)
      : accountOpeningBalance + (openingCredit - openingDebit);

    const lines = await db.select({
      id: journalLines.id,
      entryId: journalEntries.id,
      entryNumber: journalEntries.entryNumber,
      entryDate: journalEntries.entryDate,
      description: journalEntries.description,
      lineDescription: journalLines.description,
      debit: journalLines.debit,
      credit: journalLines.credit,
      reference: journalEntries.reference,
      status: journalEntries.status,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalLines.accountId, accountId),
      sql`(${journalEntries.status} = 'posted' OR ${journalEntries.status} = 'reversed')`,
      sql`${journalEntries.entryDate} >= ${startDate}`,
      sql`${journalEntries.entryDate} <= ${endDate}`
    ))
    .orderBy(journalEntries.entryDate, journalEntries.entryNumber);

    let runningBalance = openingBalance;
    const linesWithBalance = lines.map(line => {
      const debit = parseFloat(line.debit || "0");
      const credit = parseFloat(line.credit || "0");
      
      if (isDebitNormal) {
        runningBalance += (debit - credit);
      } else {
        runningBalance += (credit - debit);
      }

      return {
        ...line,
        runningBalance: runningBalance.toFixed(2),
      };
    });

    const totalDebit = lines.reduce((sum, l) => sum + parseFloat(l.debit || "0"), 0);
    const totalCredit = lines.reduce((sum, l) => sum + parseFloat(l.credit || "0"), 0);
    const closingBalance = runningBalance;

    return {
      account,
      openingBalance: openingBalance.toFixed(2),
      lines: linesWithBalance,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      closingBalance: closingBalance.toFixed(2),
    };
  },

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

      const entryNumber = await this.getNextEntryNumber(tx);

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
