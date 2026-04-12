import { db } from "../db";
import { eq, desc, and, sql, gte, lte, or, ilike, isNull } from "drizzle-orm";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import {
  accounts,
  costCenters,
  fiscalPeriods,
  journalEntries,
  journalLines,
} from "@shared/schema";
import type {
  JournalEntry,
  InsertJournalEntry,
  InsertJournalLine,
  JournalEntryWithLines,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

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

    const [linesResult, period] = await Promise.all([
      db.select({
        line: journalLines,
        account: accounts,
        costCenter: costCenters,
      })
        .from(journalLines)
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
        .where(eq(journalLines.journalEntryId, id))
        .orderBy(journalLines.lineNumber),
      entry.periodId
        ? db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, entry.periodId)).then(r => r[0])
        : Promise.resolve(undefined),
    ]);

    const linesWithAccounts = linesResult.map(({ line, account, costCenter }) => ({
      ...line,
      account,
      costCenter: costCenter?.id ? costCenter : undefined,
    }));

    return { ...entry, lines: linesWithAccounts, period };
  },

  async getNextEntryNumber(this: DatabaseStorage): Promise<number> {
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
        const resolvedLines = await resolveCostCenters(
          lines.map((line) => ({ ...line, journalEntryId: newEntry.id }))
        );
        await tx.insert(journalLines).values(resolvedLines);
      }

      return newEntry;
    });
  },

  async updateJournalEntry(this: DatabaseStorage, id: string, entry: Partial<InsertJournalEntry>, lines?: InsertJournalLine[]): Promise<JournalEntry | undefined> {
    return await db.transaction(async (tx) => {
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
        await tx.delete(journalLines).where(eq(journalLines.journalEntryId, id));
        const resolvedUpdateLines = await resolveCostCenters(
          lines.map((line) => ({ ...line, journalEntryId: id }))
        );
        await tx.insert(journalLines).values(resolvedUpdateLines);
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

};

export default methods;
