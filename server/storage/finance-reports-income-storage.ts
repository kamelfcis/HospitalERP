import { db } from "../db";
import { eq, sql, inArray } from "drizzle-orm";
import {
  accounts,
  costCenters,
  journalEntries,
  journalLines,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getIncomeStatement(this: DatabaseStorage, startDate: string, endDate: string): Promise<any> {
    const rows = await db.select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      accountType: accounts.accountType,
      netAmount: sql<string>`COALESCE(SUM(
        CASE WHEN ${journalEntries.status} = 'posted'
             AND ${journalEntries.entryDate} >= ${startDate}
             AND ${journalEntries.entryDate} <= ${endDate}
        THEN ${journalLines.credit}::numeric - ${journalLines.debit}::numeric
        ELSE 0 END
      ), 0)::text`,
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .leftJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .where(inArray(accounts.accountType, ['revenue', 'expense']))
    .groupBy(accounts.id);

    const revenues = rows
      .filter(r => r.accountType === 'revenue')
      .map(r => ({
        accountId:   r.id,
        accountCode: r.code,
        accountName: r.name,
        amount:      r.netAmount,
      }))
      .filter(r => parseFloat(r.amount) !== 0);

    const expenses = rows
      .filter(r => r.accountType === 'expense')
      .map(r => ({
        accountId:   r.id,
        accountCode: r.code,
        accountName: r.name,
        amount: (parseFloat(r.netAmount) * -1).toFixed(2),
      }))
      .filter(e => parseFloat(e.amount) !== 0);

    const totalRevenue = revenues.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const netIncome    = totalRevenue - totalExpense;

    return {
      revenues,
      expenses,
      totalRevenue: totalRevenue.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      netIncome:    netIncome.toFixed(2),
      startDate,
      endDate,
    };
  },

  async getCostCenterReport(this: DatabaseStorage, startDate: string, endDate: string, costCenterId?: string): Promise<any> {
    const query = db.select({
      costCenterId: costCenters.id,
      costCenterCode: costCenters.code,
      costCenterName: costCenters.name,
      totalRevenue: sql<string>`COALESCE(SUM(
        CASE WHEN ${accounts.accountType} = 'revenue'
             AND ${journalEntries.status} = 'posted'
             AND ${journalEntries.entryDate} >= ${startDate}
             AND ${journalEntries.entryDate} <= ${endDate}
        THEN ${journalLines.credit}::numeric - ${journalLines.debit}::numeric
        ELSE 0 END
      ), 0)::text`,
      totalExpense: sql<string>`COALESCE(SUM(
        CASE WHEN ${accounts.accountType} = 'expense'
             AND ${journalEntries.status} = 'posted'
             AND ${journalEntries.entryDate} >= ${startDate}
             AND ${journalEntries.entryDate} <= ${endDate}
        THEN ${journalLines.debit}::numeric - ${journalLines.credit}::numeric
        ELSE 0 END
      ), 0)::text`,
    })
    .from(costCenters)
    .leftJoin(journalLines, eq(journalLines.costCenterId, costCenters.id))
    .leftJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .leftJoin(accounts, eq(accounts.id, journalLines.accountId))
    .groupBy(costCenters.id);

    const rows = costCenterId && costCenterId !== 'all'
      ? await query.where(eq(costCenters.id, costCenterId))
      : await query;

    const items = rows.map((row) => {
      const totalRevenue = parseFloat(row.totalRevenue);
      const totalExpense = parseFloat(row.totalExpense);
      return {
        costCenterId:   row.costCenterId,
        costCenterCode: row.costCenterCode,
        costCenterName: row.costCenterName,
        totalRevenue:   totalRevenue.toFixed(2),
        totalExpense:   totalExpense.toFixed(2),
        netResult:      (totalRevenue - totalExpense).toFixed(2),
      };
    });

    const grandTotalRevenue = items.reduce((sum, i) => sum + parseFloat(i.totalRevenue), 0);
    const grandTotalExpense = items.reduce((sum, i) => sum + parseFloat(i.totalExpense), 0);

    return {
      items,
      grandTotalRevenue: grandTotalRevenue.toFixed(2),
      grandTotalExpense: grandTotalExpense.toFixed(2),
      grandNetResult:    (grandTotalRevenue - grandTotalExpense).toFixed(2),
      startDate,
      endDate,
    };
  },
};

export default methods;
