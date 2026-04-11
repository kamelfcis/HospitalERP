import { db } from "../db";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import {
  fiscalPeriods,
  journalEntries,
  journalLines,
  journalTemplates,
  templateLines,
  auditLog,
} from "@shared/schema";
import type {
  JournalEntry,
  JournalTemplate,
  InsertJournalTemplate,
  TemplateLine,
  InsertTemplateLine,
  AuditLog,
  InsertAuditLog,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

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
