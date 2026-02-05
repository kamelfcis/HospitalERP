import { db } from "./db";
import { eq, desc, and, gte, lte, sql, or, like, ilike, asc } from "drizzle-orm";
import {
  users,
  accounts,
  costCenters,
  fiscalPeriods,
  journalEntries,
  journalLines,
  journalTemplates,
  templateLines,
  auditLog,
  items,
  itemFormTypes,
  purchaseTransactions,
  salesTransactions,
  departments,
  itemDepartmentPrices,
  type User,
  type InsertUser,
  type Account,
  type InsertAccount,
  type CostCenter,
  type InsertCostCenter,
  type FiscalPeriod,
  type InsertFiscalPeriod,
  type JournalEntry,
  type InsertJournalEntry,
  type JournalLine,
  type InsertJournalLine,
  type JournalTemplate,
  type InsertJournalTemplate,
  type TemplateLine,
  type InsertTemplateLine,
  type AuditLog,
  type InsertAuditLog,
  type JournalEntryWithLines,
  type Item,
  type InsertItem,
  type ItemFormType,
  type InsertItemFormType,
  type ItemWithFormType,
  type PurchaseTransaction,
  type Department,
  type InsertDepartment,
  type ItemDepartmentPrice,
  type InsertItemDepartmentPrice,
  type ItemDepartmentPriceWithDepartment,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Accounts
  getAccounts(): Promise<Account[]>;
  getAccount(id: string): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: string, account: Partial<InsertAccount>): Promise<Account | undefined>;
  deleteAccount(id: string): Promise<boolean>;
  
  // Cost Centers
  getCostCenters(): Promise<CostCenter[]>;
  getCostCenter(id: string): Promise<CostCenter | undefined>;
  createCostCenter(costCenter: InsertCostCenter): Promise<CostCenter>;
  updateCostCenter(id: string, costCenter: Partial<InsertCostCenter>): Promise<CostCenter | undefined>;
  deleteCostCenter(id: string): Promise<boolean>;
  
  // Fiscal Periods
  getFiscalPeriods(): Promise<FiscalPeriod[]>;
  getFiscalPeriod(id: string): Promise<FiscalPeriod | undefined>;
  getCurrentPeriod(): Promise<FiscalPeriod | undefined>;
  createFiscalPeriod(period: InsertFiscalPeriod): Promise<FiscalPeriod>;
  closeFiscalPeriod(id: string, userId: string): Promise<FiscalPeriod | undefined>;
  reopenFiscalPeriod(id: string): Promise<FiscalPeriod | undefined>;
  
  // Journal Entries
  getJournalEntries(): Promise<JournalEntry[]>;
  getJournalEntry(id: string): Promise<JournalEntryWithLines | undefined>;
  getNextEntryNumber(): Promise<number>;
  createJournalEntry(entry: InsertJournalEntry, lines: InsertJournalLine[]): Promise<JournalEntry>;
  updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>, lines?: InsertJournalLine[]): Promise<JournalEntry | undefined>;
  postJournalEntry(id: string, userId: string): Promise<JournalEntry | undefined>;
  reverseJournalEntry(id: string, userId: string): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: string): Promise<boolean>;
  
  // Journal Templates
  getTemplates(): Promise<JournalTemplate[]>;
  getTemplate(id: string): Promise<JournalTemplate | undefined>;
  getTemplateWithLines(id: string): Promise<(JournalTemplate & { lines: TemplateLine[] }) | undefined>;
  createTemplate(template: InsertJournalTemplate): Promise<JournalTemplate>;
  createTemplateWithLines(template: InsertJournalTemplate, lines: InsertTemplateLine[]): Promise<JournalTemplate>;
  updateTemplate(id: string, template: Partial<InsertJournalTemplate>): Promise<JournalTemplate | undefined>;
  updateTemplateWithLines(id: string, template: Partial<InsertJournalTemplate>, lines: InsertTemplateLine[]): Promise<JournalTemplate | undefined>;
  deleteTemplate(id: string): Promise<boolean>;
  getTemplateLines(templateId: string): Promise<TemplateLine[]>;
  
  // Audit Log
  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Reports
  getDashboardStats(): Promise<any>;
  getTrialBalance(asOfDate: string): Promise<any>;
  getIncomeStatement(startDate: string, endDate: string): Promise<any>;
  getBalanceSheet(asOfDate: string): Promise<any>;
  getCostCenterReport(startDate: string, endDate: string, costCenterId?: string): Promise<any>;
  getAccountLedger(accountId: string, startDate: string, endDate: string): Promise<any>;

  // Items
  getItems(params: { page?: number; limit?: number; search?: string; category?: string; isToxic?: boolean; formTypeId?: string; isActive?: boolean; minPrice?: number; maxPrice?: number }): Promise<{ items: Item[]; total: number }>;
  getItem(id: string): Promise<ItemWithFormType | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, item: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: string): Promise<boolean>;

  // Item Form Types
  getItemFormTypes(): Promise<ItemFormType[]>;
  createItemFormType(formType: InsertItemFormType): Promise<ItemFormType>;

  // Purchase & Sales Transactions
  getLastPurchases(itemId: string, limit?: number): Promise<PurchaseTransaction[]>;
  getAverageSales(itemId: string, startDate: string, endDate: string): Promise<{ avgPrice: string; totalQty: string; invoiceCount: number }>;

  // Departments
  getDepartments(): Promise<Department[]>;
  getDepartment(id: string): Promise<Department | undefined>;
  createDepartment(dept: InsertDepartment): Promise<Department>;
  updateDepartment(id: string, dept: Partial<InsertDepartment>): Promise<Department | undefined>;
  deleteDepartment(id: string): Promise<boolean>;

  // Item Department Prices
  getItemDepartmentPrices(itemId: string): Promise<ItemDepartmentPriceWithDepartment[]>;
  createItemDepartmentPrice(price: InsertItemDepartmentPrice): Promise<ItemDepartmentPrice>;
  updateItemDepartmentPrice(id: string, price: Partial<InsertItemDepartmentPrice>): Promise<ItemDepartmentPrice | undefined>;
  deleteItemDepartmentPrice(id: string): Promise<boolean>;
  getItemPriceForDepartment(itemId: string, departmentId: string): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Accounts
  async getAccounts(): Promise<Account[]> {
    return db.select().from(accounts).orderBy(accounts.code);
  }

  async getAccount(id: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account;
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    // Calculate level based on parent
    let level = 1;
    if (account.parentId) {
      const parent = await this.getAccount(account.parentId);
      if (parent) {
        level = parent.level + 1;
      }
    }
    
    const [newAccount] = await db.insert(accounts).values({ ...account, level }).returning();
    return newAccount;
  }

  async updateAccount(id: string, account: Partial<InsertAccount>): Promise<Account | undefined> {
    const [updated] = await db.update(accounts).set(account).where(eq(accounts.id, id)).returning();
    return updated;
  }

  async deleteAccount(id: string): Promise<boolean> {
    const result = await db.delete(accounts).where(eq(accounts.id, id));
    return true;
  }

  // Cost Centers
  async getCostCenters(): Promise<CostCenter[]> {
    return db.select().from(costCenters).orderBy(costCenters.code);
  }

  async getCostCenter(id: string): Promise<CostCenter | undefined> {
    const [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, id));
    return costCenter;
  }

  async createCostCenter(costCenter: InsertCostCenter): Promise<CostCenter> {
    const [newCostCenter] = await db.insert(costCenters).values(costCenter).returning();
    return newCostCenter;
  }

  async updateCostCenter(id: string, costCenter: Partial<InsertCostCenter>): Promise<CostCenter | undefined> {
    const [updated] = await db.update(costCenters).set(costCenter).where(eq(costCenters.id, id)).returning();
    return updated;
  }

  async deleteCostCenter(id: string): Promise<boolean> {
    await db.delete(costCenters).where(eq(costCenters.id, id));
    return true;
  }

  // Fiscal Periods
  async getFiscalPeriods(): Promise<FiscalPeriod[]> {
    return db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startDate));
  }

  async getFiscalPeriod(id: string): Promise<FiscalPeriod | undefined> {
    const [period] = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id));
    return period;
  }

  async getCurrentPeriod(): Promise<FiscalPeriod | undefined> {
    const today = new Date().toISOString().split('T')[0];
    const [period] = await db.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, today),
        gte(fiscalPeriods.endDate, today),
        eq(fiscalPeriods.isClosed, false)
      ));
    return period;
  }

  async createFiscalPeriod(period: InsertFiscalPeriod): Promise<FiscalPeriod> {
    const [newPeriod] = await db.insert(fiscalPeriods).values(period).returning();
    return newPeriod;
  }

  async closeFiscalPeriod(id: string, userId?: string | null): Promise<FiscalPeriod | undefined> {
    const [updated] = await db.update(fiscalPeriods)
      .set({ isClosed: true, closedAt: new Date(), closedBy: userId || null })
      .where(eq(fiscalPeriods.id, id))
      .returning();
    return updated;
  }

  async reopenFiscalPeriod(id: string): Promise<FiscalPeriod | undefined> {
    const [updated] = await db.update(fiscalPeriods)
      .set({ isClosed: false, closedAt: null, closedBy: null })
      .where(eq(fiscalPeriods.id, id))
      .returning();
    return updated;
  }

  // Journal Entries
  async getJournalEntries(): Promise<JournalEntry[]> {
    return db.select().from(journalEntries).orderBy(desc(journalEntries.entryNumber));
  }

  async getJournalEntry(id: string): Promise<JournalEntryWithLines | undefined> {
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!entry) return undefined;

    const lines = await db.select().from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber);

    // Get accounts for lines
    const linesWithAccounts = await Promise.all(lines.map(async (line) => {
      const [account] = await db.select().from(accounts).where(eq(accounts.id, line.accountId));
      let costCenter;
      if (line.costCenterId) {
        [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, line.costCenterId));
      }
      return { ...line, account, costCenter };
    }));

    return { ...entry, lines: linesWithAccounts };
  }

  async getNextEntryNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(${journalEntries.entryNumber}), 0)` })
      .from(journalEntries);
    return (result?.max || 0) + 1;
  }

  async createJournalEntry(entry: InsertJournalEntry, lines: InsertJournalLine[]): Promise<JournalEntry> {
    const entryNumber = await this.getNextEntryNumber();
    const [newEntry] = await db.insert(journalEntries)
      .values({ ...entry, entryNumber })
      .returning();

    // Insert lines
    for (const line of lines) {
      await db.insert(journalLines).values({
        ...line,
        journalEntryId: newEntry.id,
      });
    }

    return newEntry;
  }

  async updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>, lines?: InsertJournalLine[]): Promise<JournalEntry | undefined> {
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!existing || existing.status !== 'draft') {
      return undefined;
    }

    const [updated] = await db.update(journalEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(journalEntries.id, id))
      .returning();

    if (lines && lines.length > 0) {
      // Delete existing lines
      await db.delete(journalLines).where(eq(journalLines.journalEntryId, id));
      
      // Insert new lines
      for (const line of lines) {
        await db.insert(journalLines).values({
          ...line,
          journalEntryId: id,
        });
      }
    }

    return updated;
  }

  async postJournalEntry(id: string, userId?: string | null): Promise<JournalEntry | undefined> {
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!existing || existing.status !== 'draft') {
      return undefined;
    }

    const [updated] = await db.update(journalEntries)
      .set({ status: 'posted', postedBy: userId || null, postedAt: new Date() })
      .where(eq(journalEntries.id, id))
      .returning();

    return updated;
  }

  async reverseJournalEntry(id: string, userId?: string | null): Promise<JournalEntry | undefined> {
    const entry = await this.getJournalEntry(id);
    if (!entry || entry.status !== 'posted') {
      return undefined;
    }

    // Mark original as reversed
    await db.update(journalEntries)
      .set({ status: 'reversed', reversedBy: userId || null, reversedAt: new Date() })
      .where(eq(journalEntries.id, id));

    // Create reversal entry
    const entryNumber = await this.getNextEntryNumber();
    const [reversalEntry] = await db.insert(journalEntries).values({
      entryNumber,
      entryDate: new Date().toISOString().split('T')[0],
      description: `قيد عكسي - ${entry.description}`,
      status: 'posted',
      periodId: entry.periodId,
      totalDebit: entry.totalCredit,
      totalCredit: entry.totalDebit,
      reference: `REV-${entry.entryNumber}`,
      createdBy: userId || null,
      postedBy: userId || null,
      postedAt: new Date(),
      reversalEntryId: id,
    }).returning();

    // Create reversed lines (swap debit and credit)
    for (const line of entry.lines) {
      await db.insert(journalLines).values({
        journalEntryId: reversalEntry.id,
        lineNumber: line.lineNumber,
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        description: line.description,
        debit: line.credit,
        credit: line.debit,
      });
    }

    // Update original with reversal reference
    const [updated] = await db.update(journalEntries)
      .set({ reversalEntryId: reversalEntry.id })
      .where(eq(journalEntries.id, id))
      .returning();

    return updated;
  }

  async deleteJournalEntry(id: string): Promise<boolean> {
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!existing || existing.status !== 'draft') {
      return false;
    }
    await db.delete(journalLines).where(eq(journalLines.journalEntryId, id));
    await db.delete(journalEntries).where(eq(journalEntries.id, id));
    return true;
  }

  // Journal Templates
  async getTemplates(): Promise<JournalTemplate[]> {
    return db.select().from(journalTemplates).orderBy(desc(journalTemplates.createdAt));
  }

  async getTemplate(id: string): Promise<JournalTemplate | undefined> {
    const [template] = await db.select().from(journalTemplates).where(eq(journalTemplates.id, id));
    return template;
  }

  async createTemplate(template: InsertJournalTemplate): Promise<JournalTemplate> {
    const [newTemplate] = await db.insert(journalTemplates).values(template).returning();
    return newTemplate;
  }

  async updateTemplate(id: string, template: Partial<InsertJournalTemplate>): Promise<JournalTemplate | undefined> {
    const [updated] = await db.update(journalTemplates).set(template).where(eq(journalTemplates.id, id)).returning();
    return updated;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    await db.delete(templateLines).where(eq(templateLines.templateId, id));
    await db.delete(journalTemplates).where(eq(journalTemplates.id, id));
    return true;
  }

  async getTemplateLines(templateId: string): Promise<TemplateLine[]> {
    return db.select().from(templateLines).where(eq(templateLines.templateId, templateId)).orderBy(templateLines.lineNumber);
  }

  async getTemplateWithLines(id: string): Promise<(JournalTemplate & { lines: TemplateLine[] }) | undefined> {
    const template = await this.getTemplate(id);
    if (!template) return undefined;
    const lines = await this.getTemplateLines(id);
    return { ...template, lines };
  }

  async createTemplateWithLines(template: InsertJournalTemplate, lines: InsertTemplateLine[]): Promise<JournalTemplate> {
    const [newTemplate] = await db.insert(journalTemplates).values(template).returning();
    if (lines.length > 0) {
      const linesWithTemplateId = lines.map(line => ({ ...line, templateId: newTemplate.id }));
      await db.insert(templateLines).values(linesWithTemplateId);
    }
    return newTemplate;
  }

  async updateTemplateWithLines(id: string, template: Partial<InsertJournalTemplate>, lines: InsertTemplateLine[]): Promise<JournalTemplate | undefined> {
    const [updated] = await db.update(journalTemplates).set(template).where(eq(journalTemplates.id, id)).returning();
    if (!updated) return undefined;
    // Delete old lines and insert new ones
    await db.delete(templateLines).where(eq(templateLines.templateId, id));
    if (lines.length > 0) {
      const linesWithTemplateId = lines.map(line => ({ ...line, templateId: id }));
      await db.insert(templateLines).values(linesWithTemplateId);
    }
    return updated;
  }

  // Audit Log
  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(500);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db.insert(auditLog).values(log).returning();
    return newLog;
  }

  // Reports
  async getDashboardStats(): Promise<any> {
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
  }

  async getTrialBalance(asOfDate: string): Promise<any> {
    // Get all accounts with their balances
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

    // Filter out accounts with zero balance
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
  }

  async getIncomeStatement(startDate: string, endDate: string): Promise<any> {
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
        amount: (parseFloat(amount) * -1).toFixed(2), // Expenses are usually debits
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
  }

  async getBalanceSheet(asOfDate: string): Promise<any> {
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

    const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + parseFloat(l.balance), 0);
    const totalEquity = equity.reduce((sum, e) => sum + parseFloat(e.balance), 0);

    return {
      assets: assets.filter(a => parseFloat(a.balance) !== 0),
      liabilities: liabilities.filter(l => parseFloat(l.balance) !== 0),
      equity: equity.filter(e => parseFloat(e.balance) !== 0),
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      totalEquity: totalEquity.toFixed(2),
      totalLiabilitiesAndEquity: (totalLiabilities + totalEquity).toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  async getCostCenterReport(startDate: string, endDate: string, costCenterId?: string): Promise<any> {
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
  }

  async getAccountLedger(accountId: string, startDate: string, endDate: string): Promise<any> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error("الحساب غير موجود");
    }

    // Get opening balance (all transactions before startDate)
    // Include both 'posted' and 'reversed' entries (reversed entries still have valid transactions)
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
    
    // For asset/expense accounts: positive balance = debit
    // For liability/equity/revenue accounts: positive balance = credit
    const isDebitNormal = ['asset', 'expense'].includes(account.accountType);
    const accountOpeningBalance = parseFloat(account.openingBalance || "0");
    let openingBalance = isDebitNormal 
      ? accountOpeningBalance + (openingDebit - openingCredit)
      : accountOpeningBalance + (openingCredit - openingDebit);

    // Get all transactions within the period
    // Include both 'posted' and 'reversed' entries
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

    // Calculate running balance
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
  }

  // Items
  async getItems(params: { page?: number; limit?: number; search?: string; category?: string; isToxic?: boolean; formTypeId?: string; isActive?: boolean; minPrice?: number; maxPrice?: number }): Promise<{ items: Item[]; total: number }> {
    const { page = 1, limit = 20, search, category, isToxic, formTypeId, isActive, minPrice, maxPrice } = params;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(items.nameAr, searchPattern),
          ilike(items.nameEn, searchPattern),
          ilike(items.itemCode, searchPattern)
        )
      );
    }

    if (category) {
      conditions.push(eq(items.category, category as any));
    }

    if (isToxic !== undefined) {
      conditions.push(eq(items.isToxic, isToxic));
    }

    if (formTypeId) {
      conditions.push(eq(items.formTypeId, formTypeId));
    }

    if (isActive !== undefined) {
      conditions.push(eq(items.isActive, isActive));
    }

    if (minPrice !== undefined) {
      conditions.push(gte(items.salePriceCurrent, String(minPrice)));
    }

    if (maxPrice !== undefined) {
      conditions.push(lte(items.salePriceCurrent, String(maxPrice)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(items)
      .where(whereClause);

    const itemsList = await db.select()
      .from(items)
      .where(whereClause)
      .orderBy(asc(items.itemCode))
      .limit(limit)
      .offset(offset);

    return {
      items: itemsList,
      total: countResult?.count || 0,
    };
  }

  async getItem(id: string): Promise<ItemWithFormType | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return undefined;

    let formType: ItemFormType | undefined;
    if (item.formTypeId) {
      const [ft] = await db.select().from(itemFormTypes).where(eq(itemFormTypes.id, item.formTypeId));
      formType = ft;
    }

    return { ...item, formType };
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning();
    return newItem;
  }

  async updateItem(id: string, item: Partial<InsertItem>): Promise<Item | undefined> {
    const [updated] = await db.update(items)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async deleteItem(id: string): Promise<boolean> {
    await db.delete(items).where(eq(items.id, id));
    return true;
  }

  // Item Form Types
  async getItemFormTypes(): Promise<ItemFormType[]> {
    return db.select().from(itemFormTypes).orderBy(asc(itemFormTypes.sortOrder));
  }

  async createItemFormType(formType: InsertItemFormType): Promise<ItemFormType> {
    const [newFormType] = await db.insert(itemFormTypes).values(formType).returning();
    return newFormType;
  }

  // Purchase & Sales Transactions
  async getLastPurchases(itemId: string, limit: number = 5): Promise<PurchaseTransaction[]> {
    return db.select()
      .from(purchaseTransactions)
      .where(eq(purchaseTransactions.itemId, itemId))
      .orderBy(desc(purchaseTransactions.txDate))
      .limit(limit);
  }

  async getAverageSales(itemId: string, startDate: string, endDate: string): Promise<{ avgPrice: string; totalQty: string; invoiceCount: number }> {
    const [result] = await db.select({
      avgPrice: sql<string>`COALESCE(AVG(${salesTransactions.salePrice}::numeric), 0)::text`,
      totalQty: sql<string>`COALESCE(SUM(${salesTransactions.qty}::numeric), 0)::text`,
      invoiceCount: sql<number>`COUNT(*)::int`,
    })
    .from(salesTransactions)
    .where(and(
      eq(salesTransactions.itemId, itemId),
      gte(salesTransactions.txDate, startDate),
      lte(salesTransactions.txDate, endDate)
    ));

    return {
      avgPrice: result?.avgPrice || "0",
      totalQty: result?.totalQty || "0",
      invoiceCount: result?.invoiceCount || 0,
    };
  }

  // Departments
  async getDepartments(): Promise<Department[]> {
    return db.select().from(departments).orderBy(asc(departments.code));
  }

  async getDepartment(id: string): Promise<Department | undefined> {
    const [dept] = await db.select().from(departments).where(eq(departments.id, id));
    return dept;
  }

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    const [newDept] = await db.insert(departments).values(dept).returning();
    return newDept;
  }

  async updateDepartment(id: string, dept: Partial<InsertDepartment>): Promise<Department | undefined> {
    const [updated] = await db.update(departments)
      .set(dept)
      .where(eq(departments.id, id))
      .returning();
    return updated;
  }

  async deleteDepartment(id: string): Promise<boolean> {
    await db.delete(departments).where(eq(departments.id, id));
    return true;
  }

  // Item Department Prices
  async getItemDepartmentPrices(itemId: string): Promise<ItemDepartmentPriceWithDepartment[]> {
    const prices = await db.select()
      .from(itemDepartmentPrices)
      .where(eq(itemDepartmentPrices.itemId, itemId))
      .orderBy(asc(itemDepartmentPrices.createdAt));

    const result: ItemDepartmentPriceWithDepartment[] = [];
    for (const price of prices) {
      const [dept] = await db.select().from(departments).where(eq(departments.id, price.departmentId));
      result.push({
        ...price,
        department: dept,
      });
    }
    return result;
  }

  async createItemDepartmentPrice(price: InsertItemDepartmentPrice): Promise<ItemDepartmentPrice> {
    const [newPrice] = await db.insert(itemDepartmentPrices).values(price).returning();
    return newPrice;
  }

  async updateItemDepartmentPrice(id: string, price: Partial<InsertItemDepartmentPrice>): Promise<ItemDepartmentPrice | undefined> {
    const [updated] = await db.update(itemDepartmentPrices)
      .set({ ...price, updatedAt: new Date() })
      .where(eq(itemDepartmentPrices.id, id))
      .returning();
    return updated;
  }

  async deleteItemDepartmentPrice(id: string): Promise<boolean> {
    await db.delete(itemDepartmentPrices).where(eq(itemDepartmentPrices.id, id));
    return true;
  }

  async getItemPriceForDepartment(itemId: string, departmentId: string): Promise<string> {
    const [deptPrice] = await db.select()
      .from(itemDepartmentPrices)
      .where(and(
        eq(itemDepartmentPrices.itemId, itemId),
        eq(itemDepartmentPrices.departmentId, departmentId)
      ));

    if (deptPrice) {
      return deptPrice.salePrice;
    }

    const [item] = await db.select({ salePriceCurrent: items.salePriceCurrent })
      .from(items)
      .where(eq(items.id, itemId));

    return item?.salePriceCurrent || "0";
  }
}

export const storage = new DatabaseStorage();
