import { db } from "../db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import {
  items,
  suppliers,
  receivingHeaders,
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  warehouses,
  type PurchaseInvoiceHeader,
  type PurchaseInvoiceWithDetails,
  type PurchaseInvoiceLineWithItem,
  type ReceivingHeader,
} from "@shared/schema";

export function normalizeClaimNumber(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = v.trim().replace(/\s*\/\s*/g, "/");
  return n || null;
}

const queryMethods = {
  async getNextPurchaseInvoiceNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(purchaseInvoiceHeaders);
    return (result?.max || 0) + 1;
  },

  async getPurchaseInvoices(filters: { supplierId?: string; status?: string; dateFrom?: string; dateTo?: string; invoiceNumber?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: PurchaseInvoiceWithDetails[]; total: number; sumTotalAfterVat: number; sumNetPayable: number}> {
    const conditions = [];
    if (filters.supplierId) conditions.push(eq(purchaseInvoiceHeaders.supplierId, filters.supplierId));
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(purchaseInvoiceHeaders.status, filters.status as "draft" | "approved_costed" | "cancelled"));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${purchaseInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);
    if (filters.invoiceNumber?.trim()) conditions.push(sql`${purchaseInvoiceHeaders.invoiceNumber}::text LIKE ${'%' + filters.invoiceNumber.trim() + '%'}`);

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [aggResult] = await db.select({
      count: sql<number>`count(*)`,
      sumTotalAfterVat: sql<number>`coalesce(sum(${purchaseInvoiceHeaders.totalAfterVat}), 0)`,
      sumNetPayable:    sql<number>`coalesce(sum(${purchaseInvoiceHeaders.netPayable}), 0)`,
    }).from(purchaseInvoiceHeaders).where(whereClause);

    const headers = await db.select().from(purchaseInvoiceHeaders)
      .where(whereClause)
      .orderBy(desc(purchaseInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const supplierIds = [...new Set(headers.map(h => h.supplierId))];
    const warehouseIds = [...new Set(headers.map(h => h.warehouseId))];
    const [allSups, allWhs] = await Promise.all([
      supplierIds.length > 0 ? db.select().from(suppliers).where(inArray(suppliers.id, supplierIds)) : [],
      warehouseIds.length > 0 ? db.select().from(warehouses).where(inArray(warehouses.id, warehouseIds)) : [],
    ]);
    const supMap  = new Map(allSups.map(s => [s.id, s]));
    const whMap   = new Map(allWhs.map(w => [w.id, w]));
    const data: PurchaseInvoiceWithDetails[] = headers.map(h => ({
      ...h, supplier: supMap.get(h.supplierId), warehouse: whMap.get(h.warehouseId),
    }));

    return {
      data,
      total: Number(aggResult.count),
      sumTotalAfterVat: Number(aggResult.sumTotalAfterVat),
      sumNetPayable:    Number(aggResult.sumNetPayable),
    };
  },

  async getPurchaseInvoice(id: string): Promise<PurchaseInvoiceWithDetails | undefined> {
    const [h] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!h) return undefined;
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, h.id));
    const itemIds = [...new Set(lines.map(l => l.itemId))];
    const allItems = itemIds.length > 0
      ? await db.select().from(items).where(inArray(items.id, itemIds))
      : [];
    const itemMap = new Map(allItems.map(i => [i.id, i]));
    const linesWithItems: PurchaseInvoiceLineWithItem[] = lines.map(line => ({
      ...line, item: itemMap.get(line.itemId),
    }));
    let receiving: ReceivingHeader | undefined = undefined;
    if (h.receivingId) {
      const [r] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, h.receivingId));
      receiving = r;
    }
    return { ...h, supplier: sup, warehouse: wh, receiving, lines: linesWithItems };
  },

  async deletePurchaseInvoice(id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!invoice) return false;
    if (invoice.status !== "draft") throw new Error("لا يمكن حذف فاتورة معتمدة");

    await db.transaction(async (tx) => {
      await tx.update(purchaseInvoiceHeaders).set({
        status:    'cancelled',
        notes:     reason ? `Cancelled: ${reason}` : 'Cancelled',
        updatedAt: new Date()
      }).where(eq(purchaseInvoiceHeaders.id, id));
    });
    return true;
  }
};

export default queryMethods;
