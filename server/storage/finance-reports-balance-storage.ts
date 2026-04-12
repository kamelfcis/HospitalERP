import { db } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  accounts,
  costCenters,
  journalEntries,
  journalLines,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getDashboardStats(this: DatabaseStorage): Promise<any> {
    const [
      [accountCount],
      [costCenterCount],
      [entryStats],
      [totals],
      currentPeriod,
      recentEntries,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(accounts),
      db.select({ count: sql<number>`count(*)` }).from(costCenters),
      db.select({
        total: sql<number>`count(*)`,
        draft: sql<number>`count(*) filter (where status = 'draft')`,
        posted: sql<number>`count(*) filter (where status = 'posted')`,
      }).from(journalEntries),
      db.select({
        totalDebit: sql<string>`COALESCE(SUM(total_debit::numeric), 0)::text`,
        totalCredit: sql<string>`COALESCE(SUM(total_credit::numeric), 0)::text`,
      }).from(journalEntries).where(eq(journalEntries.status, 'posted')),
      this.getCurrentPeriod(),
      db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt)).limit(5),
    ]);

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
    // Optimized: filter posted entries FIRST then join lines (uses idx_je_status_entry_date)
    // Avoids scanning draft/cancelled journal_lines which grow without bound
    const result = await db.execute(sql`
      SELECT
        a.id,
        a.code,
        a.name,
        a.account_type   AS "accountType",
        a.parent_id      AS "parentId",
        a.level,
        a.is_active      AS "isActive",
        a.requires_cost_center AS "requiresCostCenter",
        a.description,
        a.opening_balance AS "openingBalance",
        a.created_at     AS "createdAt",
        COALESCE(agg.tx_debit,  0)::text AS "txDebit",
        COALESCE(agg.tx_credit, 0)::text AS "txCredit"
      FROM accounts a
      LEFT JOIN (
        SELECT
          jl.account_id,
          SUM(jl.debit::numeric)  AS tx_debit,
          SUM(jl.credit::numeric) AS tx_credit
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.status    = 'posted'
          AND je.entry_date <= ${asOfDate}
        GROUP BY jl.account_id
      ) agg ON agg.account_id = a.id
    `);
    const rows = result.rows as Array<{
      id: string; code: string; name: string; accountType: string;
      parentId: string | null; level: number; isActive: boolean;
      requiresCostCenter: boolean; description: string | null;
      openingBalance: string | null; createdAt: Date;
      txDebit: string; txCredit: string;
    }>;

    const items = rows.map((row) => {
      const txDebit    = parseFloat(row.txDebit);
      const txCredit   = parseFloat(row.txCredit);
      const openingBal = parseFloat(row.openingBalance || "0");

      const debitBalance = txDebit + openingBal;
      const creditBalance = txCredit;
      const netBalance = debitBalance - creditBalance;

      const account = {
        id: row.id,
        code: row.code,
        name: row.name,
        accountType: row.accountType,
        parentId: row.parentId,
        level: row.level,
        isActive: row.isActive,
        requiresCostCenter: row.requiresCostCenter,
        description: row.description,
        openingBalance: row.openingBalance,
        createdAt: row.createdAt,
      };

      return {
        account,
        debitBalance: netBalance > 0 ? netBalance.toFixed(2) : "0",
        creditBalance: netBalance < 0 ? Math.abs(netBalance).toFixed(2) : "0",
      };
    });

    const nonZeroItems = items.filter(item =>
      parseFloat(item.debitBalance) > 0 || parseFloat(item.creditBalance) > 0
    );

    const totalDebit  = nonZeroItems.reduce((sum, item) => sum + parseFloat(item.debitBalance), 0);
    const totalCredit = nonZeroItems.reduce((sum, item) => sum + parseFloat(item.creditBalance), 0);

    return {
      items: nonZeroItems,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  },

  async getBalanceSheet(this: DatabaseStorage, asOfDate: string): Promise<any> {
    // Optimized: filter posted entries FIRST (uses idx_je_status_entry_date partial index)
    const result = await db.execute(sql`
      SELECT
        a.id,
        a.code,
        a.name,
        a.account_type   AS "accountType",
        a.opening_balance AS "openingBalance",
        COALESCE(agg.tx_debit,  0)::text AS "txDebit",
        COALESCE(agg.tx_credit, 0)::text AS "txCredit"
      FROM accounts a
      LEFT JOIN (
        SELECT
          jl.account_id,
          SUM(jl.debit::numeric)  AS tx_debit,
          SUM(jl.credit::numeric) AS tx_credit
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.status    = 'posted'
          AND je.entry_date <= ${asOfDate}
        GROUP BY jl.account_id
      ) agg ON agg.account_id = a.id
    `);
    const rows = result.rows as Array<{
      id: string; code: string; name: string;
      accountType: string; openingBalance: string | null;
      txDebit: string; txCredit: string;
    }>;

    const computeBalance = (
      txDebit: string,
      txCredit: string,
      openingBalance: string | null,
      isDebitNormal: boolean,
      includeOpening: boolean,
    ): number => {
      const d   = parseFloat(txDebit);
      const c   = parseFloat(txCredit);
      const ob  = includeOpening ? parseFloat(openingBalance || "0") : 0;
      const txB = isDebitNormal ? (d - c) : (c - d);
      return ob + txB;
    };

    const assets: any[]      = [];
    const liabilities: any[] = [];
    const equity: any[]      = [];
    let totalRevenue  = 0;
    let totalExpenses = 0;

    for (const row of rows) {
      const { id, code, name, accountType, openingBalance, txDebit, txCredit } = row;

      if (accountType === 'asset') {
        const balance = computeBalance(txDebit, txCredit, openingBalance, true, true);
        assets.push({ accountId: id, accountCode: code, accountName: name, balance: balance.toFixed(2) });

      } else if (accountType === 'liability') {
        const balance = computeBalance(txDebit, txCredit, openingBalance, false, false);
        liabilities.push({ accountId: id, accountCode: code, accountName: name, balance: balance.toFixed(2) });

      } else if (accountType === 'equity') {
        const balance = computeBalance(txDebit, txCredit, openingBalance, false, false);
        equity.push({ accountId: id, accountCode: code, accountName: name, balance: balance.toFixed(2) });

      } else if (accountType === 'revenue') {
        totalRevenue += computeBalance(txDebit, txCredit, openingBalance, false, true);

      } else if (accountType === 'expense') {
        totalExpenses += computeBalance(txDebit, txCredit, openingBalance, true, true);
      }
    }

    const netIncome = totalRevenue - totalExpenses;

    const totalAssets              = assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalLiabilities         = liabilities.reduce((sum, l) => sum + parseFloat(l.balance), 0);
    const totalEquityFromAccounts  = equity.reduce((sum, e) => sum + parseFloat(e.balance), 0);
    const totalEquityWithIncome    = totalEquityFromAccounts + netIncome;

    const equityItems = equity.filter(e => parseFloat(e.balance) !== 0);
    if (Math.abs(netIncome) >= 0.01) {
      equityItems.push({
        accountId:   "net-income",
        accountCode: "",
        accountName: "صافي ربح/خسارة الفترة",
        balance:     netIncome.toFixed(2),
      });
    }

    return {
      assets:      assets.filter(a => parseFloat(a.balance) !== 0),
      liabilities: liabilities.filter(l => parseFloat(l.balance) !== 0),
      equity:      equityItems,
      totalAssets:               totalAssets.toFixed(2),
      totalLiabilities:          totalLiabilities.toFixed(2),
      totalEquity:               totalEquityWithIncome.toFixed(2),
      totalLiabilitiesAndEquity: (totalLiabilities + totalEquityWithIncome).toFixed(2),
      netIncome:                 netIncome.toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquityWithIncome)) < 0.01,
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

    const openingDebit  = parseFloat(openingResult?.totalDebit || "0");
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
      const debit  = parseFloat(line.debit || "0");
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

    const totalDebit  = lines.reduce((sum, l) => sum + parseFloat(l.debit || "0"), 0);
    const totalCredit = lines.reduce((sum, l) => sum + parseFloat(l.credit || "0"), 0);
    const closingBalance = runningBalance;

    return {
      account,
      openingBalance: openingBalance.toFixed(2),
      lines: linesWithBalance,
      totalDebit:  totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      closingBalance: closingBalance.toFixed(2),
    };
  },
};

export default methods;
