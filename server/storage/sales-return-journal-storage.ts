import { db } from "../db";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { logger } from "../lib/logger";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import {
  items,
  warehouses,
  salesInvoiceHeaders,
  salesInvoiceLines,
  inventoryLots,
  journalEntries,
  journalLines,
  fiscalPeriods,
} from "@shared/schema";
import type {
  InsertJournalLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const salesReturnJournalMethods = {
  async generateSalesReturnJournal(
    this: DatabaseStorage,
    returnId: string,
  ): Promise<void> {
    const existing = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_return"),
        eq(journalEntries.sourceDocumentId, returnId),
      ));
    if (existing.length > 0) {
      logger.info({ returnId }, "[SALES_RETURN] journal already exists — skipping");
      return;
    }

    const [header] = await db.select().from(salesInvoiceHeaders)
      .where(eq(salesInvoiceHeaders.id, returnId));
    if (!header || !header.isReturn) {
      logger.warn({ returnId }, "[SALES_RETURN] header not found or not a return — skipping");
      return;
    }

    const isCreditReturn = header.customerType === "credit";

    const lines = await db.select().from(salesInvoiceLines)
      .where(eq(salesInvoiceLines.invoiceId, returnId));
    if (lines.length === 0) {
      logger.warn({ returnId }, "[SALES_RETURN] no lines found — skipping");
      return;
    }

    const uniqueItemIds = [...new Set(lines.map(l => l.itemId).filter((id): id is string => !!id))];
    const allItems = uniqueItemIds.length > 0
      ? await db.select().from(items).where(inArray(items.id, uniqueItemIds))
      : [];
    const itemMap = new Map(allItems.map(i => [i.id, i]));

    const uniqueLotIds = [...new Set(lines.map(l => l.lotId).filter((id): id is string => !!id))];
    const allLots = uniqueLotIds.length > 0
      ? await db.select().from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIds))
      : [];
    const lotMap = new Map(allLots.map(l => [l.id, l]));

    let cogsDrugs    = 0;
    let cogsSupplies = 0;
    let revenueDrugs = 0;
    let revenueSupplies = 0;

    for (const ln of lines) {
      const item   = itemMap.get(ln.itemId!);
      const lot    = ln.lotId ? lotMap.get(ln.lotId) : null;
      const lineRev = parseFloat(ln.lineTotal || "0");

      if (item?.category === "service") { revenueDrugs += lineRev; continue; }

      const unitCost = lot ? parseFloat(lot.purchasePrice || "0") : 0;
      const qtyMinor = Math.abs(parseFloat(ln.qtyInMinor || "0"));
      const lineCost = qtyMinor * unitCost;

      if (item?.category === "drug") {
        cogsDrugs    += lineCost;
        revenueDrugs += lineRev;
      } else if (item?.category === "supply") {
        cogsSupplies    += lineCost;
        revenueSupplies += lineRev;
      } else {
        cogsDrugs    += lineCost;
        revenueDrugs += lineRev;
      }
    }

    const netTotal    = parseFloat(header.netTotal || "0");
    const discountVal = parseFloat(header.discountValue?.toString() || "0");
    const totalCogs   = cogsDrugs + cogsSupplies;

    const modeRes = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'returns_mode' LIMIT 1`);
    const returnsMode: string = ((modeRes as any).rows?.[0] as any)?.value ?? "reverse_original";
    const forceReverseOriginal = returnsMode !== "separate_accounts";

    const retMappings = forceReverseOriginal
      ? []
      : await this.getMappingsForTransaction("sales_return", header.warehouseId, header.pharmacyId);
    const retMM = new Map(retMappings.map(m => [m.lineType, m]));

    const siMappings = (forceReverseOriginal || retMappings.length === 0)
      ? await this.getMappingsForTransaction("sales_invoice", header.warehouseId, header.pharmacyId)
      : [];
    const siMM = new Map(siMappings.map(m => [m.lineType, m]));
    const useFallback = forceReverseOriginal || retMappings.length === 0;

    const receivablesCreditId = isCreditReturn
      ? (siMM.get("receivables_credit")?.debitAccountId ||
         retMM.get("receivables")?.creditAccountId ||
         (useFallback ? siMM.get("receivables")?.debitAccountId : null) ||
         null)
      : (retMM.get("receivables")?.creditAccountId ||
         (useFallback ? siMM.get("receivables")?.debitAccountId : null) ||
         null);

    const revDrugsCreditId =
      retMM.get("revenue_drugs")?.debitAccountId ||
      (useFallback ? siMM.get("revenue_drugs")?.creditAccountId : null) ||
      null;

    const revSuppliesDebitId =
      retMM.get("revenue_consumables")?.debitAccountId ||
      (useFallback ? siMM.get("revenue_consumables")?.creditAccountId : null) ||
      null;
    const revGeneralDebitId =
      retMM.get("revenue_general")?.debitAccountId ||
      (useFallback ? siMM.get("revenue_general")?.creditAccountId : null) ||
      null;

    const cogsDrugsDebitId =
      retMM.get("cogs_drugs")?.creditAccountId ||
      (useFallback ? siMM.get("cogs_drugs")?.debitAccountId : null) ||
      null;
    const cogsSuppliesDebitId =
      retMM.get("cogs_supplies")?.creditAccountId ||
      (useFallback ? siMM.get("cogs_supplies")?.debitAccountId : null) ||
      null;

    const discountAllowedCreditId =
      retMM.get("discount_allowed")?.debitAccountId ||
      (useFallback ? siMM.get("discount_allowed")?.debitAccountId : null) ||
      null;

    if (!receivablesCreditId) {
      await logAcctEvent({
        sourceType: "sales_return", sourceId: returnId,
        eventType: "sales_return_journal_blocked",
        status: "blocked",
        errorMessage: "حساب المدينون (receivables) غير مُعرَّف في ربط حسابات فواتير المبيعات — يرجى الضبط من /account-mappings",
      });
      return;
    }

    let inventoryAccountId: string | null = null;
    if (header.warehouseId) {
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, header.warehouseId));
      inventoryAccountId = wh?.glAccountId || null;
    }
    if (!inventoryAccountId) {
      const invM = (useFallback ? siMM : retMM).get("inventory");
      inventoryAccountId = invM?.debitAccountId || null;
    }

    const totalTaxAmount = parseFloat(header.totalTaxAmount || "0");
    const vatOutputDebitId =
      retMM.get("vat_output")?.creditAccountId ||
      (useFallback ? siMM.get("vat_output")?.creditAccountId : null) ||
      null;

    if (totalTaxAmount > 0.001 && vatOutputDebitId) {
      const totalRevenueBefore = revenueDrugs + revenueSupplies;
      if (totalRevenueBefore > 0.001) {
        const netRevTotal = parseFloat((totalRevenueBefore - totalTaxAmount).toFixed(2));
        const taxFraction = totalTaxAmount / totalRevenueBefore;
        const netRevDrugs = parseFloat((revenueDrugs * (1 - taxFraction)).toFixed(2));
        revenueDrugs    = netRevDrugs;
        revenueSupplies = parseFloat((netRevTotal - netRevDrugs).toFixed(2));
      }
    }

    const jLines: InsertJournalLine[] = [];
    let ln = 1;

    const effRevDrugsId = revDrugsCreditId || revGeneralDebitId;
    if (effRevDrugsId && revenueDrugs > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effRevDrugsId,
        debit: revenueDrugs.toFixed(2), credit: "0", description: "عكس إيراد أدوية — مردود مبيعات" });
    }

    const effRevSuppId = revSuppliesDebitId || revGeneralDebitId || revDrugsCreditId;
    if (effRevSuppId && revenueSupplies > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effRevSuppId,
        debit: revenueSupplies.toFixed(2), credit: "0", description: "عكس إيراد مستلزمات — مردود مبيعات" });
    }

    if (vatOutputDebitId && totalTaxAmount > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: vatOutputDebitId,
        debit: totalTaxAmount.toFixed(2), credit: "0", description: "عكس ضريبة القيمة المضافة — مردود مبيعات" });
    }

    if (inventoryAccountId && totalCogs > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: inventoryAccountId,
        debit: totalCogs.toFixed(2), credit: "0", description: "استعادة مخزون — مردود مبيعات" });
    }

    const receivableLineDesc = isCreditReturn
      ? "تخفيض ذمة العميل — مردود مبيعات آجل"
      : "مدينون — في انتظار صرف المرتجع";
    if (netTotal > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: receivablesCreditId,
        debit: "0", credit: netTotal.toFixed(2), description: receivableLineDesc });
    }

    if (discountAllowedCreditId && discountVal > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: discountAllowedCreditId,
        debit: "0", credit: discountVal.toFixed(2), description: "عكس خصم مسموح به — مردود مبيعات" });
    }

    const effCogsDrugsId = cogsDrugsDebitId;
    if (effCogsDrugsId && cogsDrugs > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effCogsDrugsId,
        debit: "0", credit: cogsDrugs.toFixed(2), description: "عكس تكلفة أدوية — مردود مبيعات" });
    }

    const effCogsSupplId = cogsSuppliesDebitId || cogsDrugsDebitId;
    if (effCogsSupplId && cogsSupplies > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effCogsSupplId,
        debit: "0", credit: cogsSupplies.toFixed(2), description: "عكس تكلفة مستلزمات — مردود مبيعات" });
    }

    if (jLines.length === 0) {
      logger.warn({ returnId }, "[SALES_RETURN] no journal lines built — check account mappings");
      return;
    }

    const totalDebits  = jLines.reduce((s, l) => s + parseFloat(l.debit  || "0"), 0);
    const totalCredits = jLines.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);

    const [period] = await db.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, header.invoiceDate),
        gte(fiscalPeriods.endDate,   header.invoiceDate),
        eq(fiscalPeriods.isClosed,   false),
      )).limit(1);

    const entryNumber = await this.getNextEntryNumber();

    const returnJournalStatus = isCreditReturn ? "posted" : "draft";
    const returnDesc = isCreditReturn
      ? `قيد مردود مبيعات آجل رقم ${header.invoiceNumber} (نهائي — مخصوم من ذمة العميل)`
      : `قيد مردود مبيعات رقم ${header.invoiceNumber} (مرحلة 1 — بانتظار الصرف)`;

    const [entry] = await db.insert(journalEntries).values({
      entryNumber,
      entryDate:        header.invoiceDate,
      reference:        `RET-${header.invoiceNumber}`,
      description:      returnDesc,
      status:           returnJournalStatus,
      periodId:         period?.id || null,
      sourceType:       "sales_return",
      sourceDocumentId: returnId,
      totalDebit:       String(totalDebits.toFixed(2)),
      totalCredit:      String(totalCredits.toFixed(2)),
    }).returning();

    const salesReturnLines = await resolveCostCenters(
      jLines.map((l, i) => ({ ...l, journalEntryId: entry.id, lineNumber: i + 1 }))
    );
    await db.insert(journalLines).values(salesReturnLines);

    await db.update(salesInvoiceHeaders)
      .set({ journalStatus: "posted" })
      .where(eq(salesInvoiceHeaders.id, returnId));

    await logAcctEvent({
      sourceType: "sales_return", sourceId: returnId,
      eventType:  "sales_return_journal_created",
      status:     "completed",
      journalEntryId: entry.id,
    });

    logger.info({ returnId, entryId: entry.id, dr: totalDebits, cr: totalCredits },
      "[SALES_RETURN] Phase-1 journal created ✓");
  },
};

export default salesReturnJournalMethods;
