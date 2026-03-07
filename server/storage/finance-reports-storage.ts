/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Finance Reports Storage — طبقة تخزين التقارير المالية وربط الحسابات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - التقارير المالية (Financial Reports): لوحة التحكم، ميزان المراجعة،
 *    قائمة الدخل، الميزانية العمومية، تقرير مركز التكلفة، كشف حساب
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  accounts,
  costCenters,
  journalEntries,
  journalLines,
} from "@shared/schema";
import type {
  CostCenter,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
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
};

export default methods;
