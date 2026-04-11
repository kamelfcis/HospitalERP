import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import {
  salesInvoiceHeaders,
  warehouses,
  fiscalPeriods,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  JournalEntry,
  AccountMapping,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const salesJournalGenerateMethods = {
  async generateSalesInvoiceJournalInTx(
    this: DatabaseStorage,
    tx: DrizzleTransaction, invoiceId: string, invoice: SalesInvoiceHeader,
    cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number
  ): Promise<JournalEntry | null> {
    console.log(`[Journal] Starting generateSalesInvoiceJournalInTx for invoice ${invoiceId}`);
    const result = await this.buildSalesJournalLines(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies, tx);
    if (!result) return null;
    return this.insertJournalEntry(tx, invoiceId, invoice, result.journalLineData, result.totalDebits, result.totalCredits);
  },

  async generateSalesInvoiceJournal(
    this: DatabaseStorage,
    invoiceId: string, invoice: SalesInvoiceHeader, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number
  ): Promise<JournalEntry | null> {
    console.log(`[Journal] Starting generateSalesInvoiceJournal for invoice ${invoiceId}`);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM sales_invoice_headers WHERE id = ${invoiceId} FOR UPDATE`);
      const result = await this.buildSalesJournalLines(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies, tx);
      if (!result) return null;
      return this.insertJournalEntry(tx, invoiceId, invoice, result.journalLineData, result.totalDebits, result.totalCredits);
    });
  },

  async deleteSalesInvoice(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
    await db.update(salesInvoiceHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
    }).where(eq(salesInvoiceHeaders.id, id));
    return true;
  },

  async checkJournalReadiness(
    this: DatabaseStorage,
    invoiceId: string,
  ): Promise<{ ready: boolean; critical: string[]; warnings: string[] }> {
    const [invoice] = await db
      .select({ invoiceDate: salesInvoiceHeaders.invoiceDate, warehouseId: salesInvoiceHeaders.warehouseId, pharmacyId: salesInvoiceHeaders.pharmacyId })
      .from(salesInvoiceHeaders)
      .where(eq(salesInvoiceHeaders.id, invoiceId));

    if (!invoice) return { ready: false, critical: ["الفاتورة غير موجودة"], warnings: [] };

    const critical: string[] = [];
    const warnings: string[] = [];

    const [closedPeriod] = await db
      .select({ name: fiscalPeriods.name })
      .from(fiscalPeriods)
      .where(
        and(
          lte(fiscalPeriods.startDate, invoice.invoiceDate),
          gte(fiscalPeriods.endDate, invoice.invoiceDate),
          eq(fiscalPeriods.isClosed, true),
        ),
      )
      .limit(1);

    if (closedPeriod) {
      critical.push(`الفترة المحاسبية "${closedPeriod.name}" مغلقة — يجب تغيير تاريخ الفاتورة`);
    }

    const mappings: AccountMapping[] = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId, invoice.pharmacyId);
    const map = new Map<string, AccountMapping>(
      mappings.map((m) => [m.lineType, m] as [string, AccountMapping]),
    );

    if (!map.get("receivables")?.debitAccountId) {
      critical.push('حساب المدينون "receivables" غير معرّف — افتح إعدادات الربط المحاسبي');
    }

    const hasRevenue =
      map.get("revenue_drugs")?.creditAccountId ||
      map.get("revenue_consumables")?.creditAccountId ||
      map.get("revenue_general")?.creditAccountId;
    if (!hasRevenue) {
      warnings.push("لم يُعيَّن حساب الإيرادات — لن يُسجَّل إيراد في القيد");
    }

    let whHasGlAccount = false;
    if (invoice.warehouseId) {
      const [wh] = await db
        .select({ glAccountId: warehouses.glAccountId })
        .from(warehouses)
        .where(eq(warehouses.id, invoice.warehouseId));
      whHasGlAccount = !!wh?.glAccountId;
    }
    if (!whHasGlAccount && !map.get("inventory")?.creditAccountId) {
      warnings.push("حساب المخزون غير معرّف — لن تُسجَّل تكلفة البضاعة في القيد");
    }

    return { ready: critical.length === 0, critical, warnings };
  },
};

export default salesJournalGenerateMethods;
