import { db } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  items,
  suppliers,
  receivingHeaders,
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  warehouses,
  type PurchaseInvoiceHeader,
  type PurchaseInvoiceLine,
  type PurchaseInvoiceWithDetails,
  type PurchaseInvoiceLineWithItem,
  type ReceivingHeader,
} from "@shared/schema";

const coreMethods = {
  async getNextPurchaseInvoiceNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(purchaseInvoiceHeaders);
    return (result?.max || 0) + 1;
  },

  async getPurchaseInvoices(filters: { supplierId?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: PurchaseInvoiceWithDetails[]; total: number}> {
    const conditions = [];
    if (filters.supplierId) conditions.push(eq(purchaseInvoiceHeaders.supplierId, filters.supplierId));
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(purchaseInvoiceHeaders.status, filters.status as "draft" | "approved_costed" | "cancelled"));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${purchaseInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(purchaseInvoiceHeaders).where(whereClause);

    const headers = await db.select().from(purchaseInvoiceHeaders)
      .where(whereClause)
      .orderBy(desc(purchaseInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const data: PurchaseInvoiceWithDetails[] = [];
    for (const h of headers) {
      const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
      data.push({ ...h, supplier: sup, warehouse: wh });
    }

    return { data, total: Number(countResult.count) };
  },

  async getPurchaseInvoice(id: string): Promise<PurchaseInvoiceWithDetails | undefined> {
    const [h] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!h) return undefined;
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, h.id));
    const linesWithItems: PurchaseInvoiceLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    let receiving: ReceivingHeader | undefined = undefined;
    if (h.receivingId) {
      const [r] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, h.receivingId));
      receiving = r;
    }
    return { ...h, supplier: sup, warehouse: wh, receiving, lines: linesWithItems };
  },

  async savePurchaseInvoice(invoiceId: string, lines: Partial<PurchaseInvoiceLine>[], headerUpdates?: Partial<PurchaseInvoiceHeader>): Promise<PurchaseInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة معتمدة");

      await tx.delete(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, invoiceId));

      let totalBeforeVat = 0;
      let totalVat = 0;
      let totalLineDiscounts = 0;

      for (const line of lines) {
        const qty = parseFloat(line.qty || "0") || 0;
        const bonusQty = parseFloat(line.bonusQty || "0") || 0;
        const purchasePrice = parseFloat(line.purchasePrice || "0") || 0;
        const lineDiscountPct = parseFloat(line.lineDiscountPct || "0") || 0;
        const vatRate = parseFloat(line.vatRate || "0") || 0;

        const valueBeforeVat = qty * purchasePrice;
        const sellingPrice = parseFloat(line.sellingPrice || "0");
        const lineDiscountValue = line.lineDiscountValue !== undefined
          ? parseFloat(line.lineDiscountValue) || 0
          : (sellingPrice > 0 ? +(sellingPrice * (lineDiscountPct / 100)).toFixed(2) : 0);
        const vatBase = (qty + bonusQty) * purchasePrice;
        const vatAmount = vatBase * (vatRate / 100);

        totalBeforeVat += valueBeforeVat;
        totalVat += vatAmount;
        totalLineDiscounts += lineDiscountValue * qty;

        await tx.insert(purchaseInvoiceLines).values({
          ...line,
          invoiceId,
          receivingLineId: line.receivingLineId || null,
          itemId: line.itemId!,
          unitLevel: line.unitLevel || 'major',
          qty: String(qty),
          bonusQty: String(bonusQty),
          sellingPrice: line.sellingPrice || "0",
          purchasePrice: String(purchasePrice),
          lineDiscountPct: String(lineDiscountPct),
          lineDiscountValue: String(lineDiscountValue.toFixed(2)),
          vatRate: String(vatRate),
          valueBeforeVat: String(valueBeforeVat.toFixed(2)),
          vatAmount: String(vatAmount.toFixed(2)),
          valueAfterVat: String((valueBeforeVat + vatAmount).toFixed(2)),
          batchNumber: line.batchNumber || null,
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
        } as PurchaseInvoiceLine);
      }

      const discountType = headerUpdates?.discountType || invoice.discountType || "percent";
      const discountValue = parseFloat(headerUpdates?.discountValue || invoice.discountValue || "0") || 0;
      let invoiceDiscount = 0;
      if (discountType === "percent") {
        invoiceDiscount = totalBeforeVat * (discountValue / 100);
      } else {
        invoiceDiscount = discountValue;
      }

      const totalAfterVat = totalBeforeVat + totalVat;
      const netPayable = totalAfterVat - invoiceDiscount;

      const updateSet: Partial<PurchaseInvoiceHeader> = {
        totalBeforeVat: String(totalBeforeVat.toFixed(2)),
        totalVat: String(totalVat.toFixed(2)),
        totalAfterVat: String(totalAfterVat.toFixed(2)),
        totalLineDiscounts: String(totalLineDiscounts.toFixed(2)),
        netPayable: String(netPayable.toFixed(2)),
        updatedAt: new Date(),
      };
      if (headerUpdates?.discountType) updateSet.discountType = headerUpdates.discountType;
      if (headerUpdates?.discountValue !== undefined) updateSet.discountValue = String(headerUpdates.discountValue);
      if (headerUpdates?.notes !== undefined) updateSet.notes = headerUpdates.notes;
      if (headerUpdates?.invoiceDate) updateSet.invoiceDate = headerUpdates.invoiceDate;

      await tx.update(purchaseInvoiceHeaders).set(updateSet).where(eq(purchaseInvoiceHeaders.id, invoiceId));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      return updated;
    });
  },

  async approvePurchaseInvoice(this: any, id: string): Promise<PurchaseInvoiceHeader> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM purchase_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as PurchaseInvoiceHeader | undefined;
      if (!locked) throw new Error("الفاتورة غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");

      await tx.update(purchaseInvoiceHeaders).set({
        status: "approved_costed",
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(purchaseInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      return updated;
    });

    if (result) {
      this.generatePurchaseInvoiceJournal(id, result).catch((err: unknown) => 
        console.error("Auto journal for purchase invoice failed:", err)
      );
    }

    return result;
  },

  async deletePurchaseInvoice(id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!invoice) return false;
    if (invoice.status !== "draft") throw new Error("لا يمكن حذف فاتورة معتمدة");

    await db.transaction(async (tx) => {
      await tx.update(purchaseInvoiceHeaders).set({
        status: 'cancelled',
        notes: reason ? `Cancelled: ${reason}` : 'Cancelled',
        updatedAt: new Date()
      }).where(eq(purchaseInvoiceHeaders.id, id));
    });
    return true;
  }
};

export default coreMethods;
