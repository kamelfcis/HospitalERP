import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, and } from "drizzle-orm";
import {
  warehouses,
  journalEntries,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  InsertJournalLine,
  AccountMapping,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";
import { buildSalesDebitLines } from "./sales-journal-lines-debit";
import { buildSalesCreditLines } from "./sales-journal-lines-credit";

const methods = {
  async buildSalesJournalLines(
    this: DatabaseStorage,
    invoiceId: string, invoice: SalesInvoiceHeader, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number,
    queryCtx: typeof db | DrizzleTransaction = db
  ): Promise<{ journalLineData: InsertJournalLine[], totalDebits: number, totalCredits: number } | null> {
    const existingEntries = await queryCtx.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ));
    if (existingEntries.length > 0) return null;

    const mappings = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId, invoice.pharmacyId);
    const mappingMap = new Map<string, AccountMapping>();
    for (const m of mappings) {
      mappingMap.set(m.lineType, m);
    }

    const receivablesMapping = mappingMap.get("receivables");
    let debitAccountId: string | null = receivablesMapping?.debitAccountId || null;

    if (invoice.customerType === "credit") {
      const creditReceivablesMapping = mappingMap.get("receivables_credit");
      if (creditReceivablesMapping?.debitAccountId) {
        debitAccountId = creditReceivablesMapping.debitAccountId;
      }
    }

    if (!debitAccountId) {
      throw new Error("لم يتم تعيين حساب المدينون (receivables) في ربط حسابات فواتير المبيعات");
    }

    let inventoryAccountId: string | null = null;
    if (invoice.warehouseId) {
      const [wh] = await queryCtx.select().from(warehouses)
        .where(eq(warehouses.id, invoice.warehouseId));
      if (wh?.glAccountId) {
        inventoryAccountId = wh.glAccountId;
      }
    }
    if (!inventoryAccountId) {
      const invMapping = mappingMap.get("inventory");
      if (invMapping?.creditAccountId) {
        inventoryAccountId = invMapping.creditAccountId;
      }
    }

    const grossRevenue = parseFloat(roundMoney(revenueDrugs + revenueSupplies));

    const debitResult = buildSalesDebitLines(
      invoiceId, invoice, grossRevenue, debitAccountId, mappingMap, 1
    );

    const creditLines = buildSalesCreditLines(
      invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies,
      inventoryAccountId, mappingMap, debitResult.nextLineNum, debitResult.contractEffectiveVat
    );

    const journalLineData = [...debitResult.lines, ...creditLines];

    if (journalLineData.length === 0) return null;

    const totalDebits = journalLineData.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
    const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
    const diff = Math.abs(totalDebits - totalCredits);

    if (diff > 0.01) {
      throw new Error(`القيد غير متوازن: مدين=${totalDebits.toFixed(2)} دائن=${totalCredits.toFixed(2)}`);
    }

    return { journalLineData, totalDebits, totalCredits };
  },
};

export default methods;
