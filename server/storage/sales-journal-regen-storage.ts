import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  items,
  salesInvoiceHeaders,
  salesInvoiceLines,
  inventoryLots,
  inventoryLotMovements,
  journalEntries,
} from "@shared/schema";
import type { JournalEntry } from "@shared/schema";
import type { DatabaseStorage } from "./index";

const salesJournalRegenMethods = {
  async regenerateJournalForInvoice(this: DatabaseStorage, invoiceId: string): Promise<JournalEntry | null> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!invoice || !["finalized", "collected"].includes(invoice.status)) return null;

    const lines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, invoiceId));
    let cogsDrugs = 0, cogsSupplies = 0, revenueDrugs = 0, revenueSupplies = 0;

    if (lines.length > 0) {
      const uniqueItemIds = Array.from(new Set(lines.map(l => l.itemId).filter((id): id is string => !!id)));
      const allItems = uniqueItemIds.length > 0
        ? await db.select().from(items).where(inArray(items.id, uniqueItemIds))
        : [];
      const itemMap = new Map(allItems.map(i => [i.id, i]));

      const allMovements = await db.select().from(inventoryLotMovements)
        .where(and(
          eq(inventoryLotMovements.referenceType, "sales_invoice"),
          eq(inventoryLotMovements.referenceId, invoiceId)
        ));

      const uniqueLotIds = Array.from(new Set(allMovements.map(m => m.lotId).filter((id): id is string => !!id)));
      const allLots = uniqueLotIds.length > 0
        ? await db.select().from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIds))
        : [];
      const lotMap = new Map(allLots.map(l => [l.id, l]));

      for (const line of lines) {
        const item = itemMap.get(line.itemId!);
        if (!item) continue;
        const lineRevenue = parseFloat(line.lineTotal);
        if (item.category === "service") {
          revenueDrugs += lineRevenue;
          continue;
        }

        let lineCost = 0;
        for (const mov of allMovements) {
          const lot = lotMap.get(mov.lotId);
          if (lot && lot.itemId === line.itemId) {
            lineCost += Math.abs(parseFloat(mov.qtyChangeInMinor || "0")) * parseFloat(mov.unitCost || "0");
          }
        }

        if (item.category === "drug") {
          cogsDrugs += lineCost;
          revenueDrugs += lineRevenue;
        } else if (item.category === "supply") {
          cogsSupplies += lineCost;
          revenueSupplies += lineRevenue;
        } else {
          cogsDrugs += lineCost;
          revenueDrugs += lineRevenue;
        }
      }
    }

    try {
      const entry = await this.generateSalesInvoiceJournal(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies);
      if (entry) {
        await db.update(salesInvoiceHeaders).set({
          journalStatus: "posted",
          journalError: null,
          journalRetries: sql`COALESCE(journal_retries, 0) + 1`,
        }).where(eq(salesInvoiceHeaders.id, invoiceId));
      }
      return entry;
    } catch (err: unknown) {
      await db.update(salesInvoiceHeaders).set({
        journalStatus: "failed",
        journalError: err instanceof Error ? err.message : String(err),
        journalRetries: sql`COALESCE(journal_retries, 0) + 1`,
      }).where(eq(salesInvoiceHeaders.id, invoiceId));
      throw err;
    }
  },

  async syncInvoiceHeaderJournalStatus(this: DatabaseStorage, invoiceId: string): Promise<string> {
    const [entry] = await db.select({
      status: journalEntries.status,
    }).from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ))
      .limit(1);

    const actualStatus = entry?.status ?? "missing";

    if (actualStatus === "posted") {
      await db.update(salesInvoiceHeaders).set({
        journalStatus: "posted",
        journalError: null,
      }).where(and(
        eq(salesInvoiceHeaders.id, invoiceId),
        sql`journal_status != 'posted'`
      ));
    } else if (actualStatus === "missing") {
      await db.update(salesInvoiceHeaders).set({
        journalStatus: "failed",
        journalError: "قيد مالي مفقود — أعد توليد القيد من شاشة أحداث المحاسبة",
      }).where(and(
        eq(salesInvoiceHeaders.id, invoiceId),
        eq(salesInvoiceHeaders.journalStatus, "posted")
      ));
    }
    return actualStatus;
  },

  async retryFailedJournals(this: DatabaseStorage): Promise<{ attempted: number, succeeded: number, failed: number }> {
    const MAX_JOURNAL_RETRIES = 10;
    const failedInvoices = await db.select({
      id: salesInvoiceHeaders.id,
      invoiceNumber: salesInvoiceHeaders.invoiceNumber,
      journalRetries: salesInvoiceHeaders.journalRetries,
    }).from(salesInvoiceHeaders)
      .where(and(
        eq(salesInvoiceHeaders.status, "finalized"),
        eq(salesInvoiceHeaders.journalStatus, "failed"),
        sql`COALESCE(journal_retries, 0) < ${MAX_JOURNAL_RETRIES}`
      ))
      .limit(20);

    let succeeded = 0, failed = 0;

    for (const inv of failedInvoices) {
      try {
        const entry = await this.regenerateJournalForInvoice(inv.id);
        if (entry) {
          succeeded++;
          console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal posted successfully (attempt ${(inv.journalRetries || 0) + 1})`);
        } else {
          const existing = await db.select().from(journalEntries)
            .where(and(
              eq(journalEntries.sourceType, "sales_invoice"),
              eq(journalEntries.sourceDocumentId, inv.id)
            )).limit(1);
          if (existing.length > 0 && existing[0].status === "posted") {
            await db.update(salesInvoiceHeaders).set({
              journalStatus: "posted",
              journalError: null,
            }).where(eq(salesInvoiceHeaders.id, inv.id));
            succeeded++;
            console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal already posted, header synced`);
          } else if (existing.length > 0) {
            console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal exists but status=${existing[0].status}, skipping header update`);
          } else {
            failed++;
            console.error(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - could not generate journal (null result)`);
          }
        }
      } catch (err: unknown) {
        failed++;
        const errTxt = err instanceof Error ? err.message : String(err);
        console.error(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - still failing: ${errTxt}`);
        // Increment retries so we stop trying after MAX_JOURNAL_RETRIES
        await db.execute(sql`
          UPDATE sales_invoice_headers
          SET journal_retries = COALESCE(journal_retries, 0) + 1
          WHERE id = ${inv.id}
        `);
      }
    }

    return { attempted: failedInvoices.length, succeeded, failed };
  },
};

export default salesJournalRegenMethods;
