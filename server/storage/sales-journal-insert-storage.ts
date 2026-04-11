import type { DrizzleTransaction } from "../db";
import { eq, and, gte, lte } from "drizzle-orm";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import {
  journalEntries,
  journalLines,
  fiscalPeriods,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  JournalEntry,
  InsertJournalLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async insertJournalEntry(
    this: DatabaseStorage,
    tx: DrizzleTransaction, invoiceId: string, invoice: SalesInvoiceHeader,
    journalLineData: InsertJournalLine[], totalDebits: number, totalCredits: number
  ): Promise<JournalEntry> {
    const [period] = await tx.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, invoice.invoiceDate),
        gte(fiscalPeriods.endDate, invoice.invoiceDate),
        eq(fiscalPeriods.isClosed, false)
      ))
      .limit(1);

    const entryNumber = await this.getNextEntryNumber();

    const initialStatus =
      invoice.customerType === "delivery" || invoice.customerType === "credit"
        ? "posted"
        : "draft";

    const [entry] = await tx.insert(journalEntries).values({
      entryNumber,
      entryDate: invoice.invoiceDate,
      reference: `SI-${invoice.invoiceNumber}`,
      description: `قيد فاتورة مبيعات رقم ${invoice.invoiceNumber}`,
      status: initialStatus,
      periodId: period?.id || null,
      sourceType: "sales_invoice",
      sourceDocumentId: invoiceId,
      totalDebit: String(totalDebits.toFixed(2)),
      totalCredit: String(totalCredits.toFixed(2)),
    }).returning();

    const linesWithEntryId = await resolveCostCenters(
      journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }))
    );

    await tx.insert(journalLines).values(linesWithEntryId);
    return entry;
  },
};

export default methods;
