import { db } from "../db";
import { eq, desc, and, asc, sql, gte, lte } from "drizzle-orm";
import {
  accounts,
  fiscalPeriods,
} from "@shared/schema";
import type {
  Account,
  InsertAccount,
  FiscalPeriod,
  InsertFiscalPeriod,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

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
    const pendingRes = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM pending_stock_allocations
      WHERE status IN ('pending', 'partially_resolved')
    `);
    const pendingCount = parseInt(String((pendingRes.rows[0] as any)?.cnt ?? 0));
    if (pendingCount > 0) {
      throw new Error(
        `لا يمكن إغلاق الفترة المالية: يوجد ${pendingCount} بند(اً) من الصرف بدون رصيد لم يُسوَّ بعد. ` +
        `يُرجى تسوية جميع البنود المعلقة قبل إغلاق الفترة (شاشة: تسوية الصرف بدون رصيد).`
      );
    }

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

};

export default methods;
