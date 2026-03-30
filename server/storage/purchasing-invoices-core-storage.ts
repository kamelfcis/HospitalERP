import { db } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  items,
  suppliers,
  receivingHeaders,
  receivingLines,
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  inventoryLots,
  inventoryLotMovements,
  warehouses,
  type PurchaseInvoiceHeader,
  type PurchaseInvoiceLine,
  type PurchaseInvoiceWithDetails,
  type PurchaseInvoiceLineWithItem,
  type ReceivingHeader,
} from "@shared/schema";

/**
 * normalizeClaimNumber — توحيد صيغة رقم المطالبة قبل الحفظ أو الفلترة
 *   - trim المسافات من الطرفين
 *   - إزالة المسافات حول الشرطة المائلة (  2 / 2026  → 2/2026)
 *   - يُعيد null لو القيمة فارغة بعد التنظيف
 */
export function normalizeClaimNumber(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = v.trim().replace(/\s*\/\s*/g, "/");
  return n || null;
}

const coreMethods = {
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

    const data: PurchaseInvoiceWithDetails[] = [];
    for (const h of headers) {
      const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
      data.push({ ...h, supplier: sup, warehouse: wh });
    }

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

        // سياسة خصم الأسطر:
        //   purchasePrice  = سعر الشراء النهائي المتفق عليه مع المورد — المصدر المحاسبي الوحيد
        //   lineDiscountPct/lineDiscountValue = حقل تسعير وتحليل مزدوج الدور:
        //     (أ) تسعير: اشتقاق purchasePrice من sellingPrice والعكس
        //     (ب) تحليل: مقارنة أسعار الموردين، تاريخ الشراء، معدل خصم المورد للصنف
        //   الحقل يُخزَّن ويُعرض وقابل للبحث والتقرير — لكن لا يُرحَّل كسطر قيد مستقل
        //   valueBeforeVat = qty × purchasePrice هي القيمة المحاسبية المعتمدة دائماً
        const valueBeforeVat = qty * purchasePrice;
        const sellingPrice = parseFloat(line.sellingPrice || "0");
        const lineDiscountValue = line.lineDiscountValue !== undefined
          ? parseFloat(line.lineDiscountValue) || 0
          : (sellingPrice > 0 ? +(sellingPrice * (lineDiscountPct / 100)).toFixed(2) : 0);
        const vatBase = (qty + bonusQty) * purchasePrice;
        const vatAmount = vatBase * (vatRate / 100);

        totalBeforeVat    += valueBeforeVat;
        totalVat          += vatAmount;
        totalLineDiscounts += lineDiscountValue * qty;   // فرق التسعير الإجمالي — للعرض فقط

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
      if (headerUpdates?.claimNumber !== undefined) {
        updateSet.claimNumber = normalizeClaimNumber(headerUpdates.claimNumber);
      }

      await tx.update(purchaseInvoiceHeaders).set(updateSet).where(eq(purchaseInvoiceHeaders.id, invoiceId));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      return updated;
    });
  },

  /**
   * Approves a purchase invoice atomically.
   *
   * All of the following happen inside ONE database transaction — they all succeed or all roll back:
   *   Step 1 — Lock invoice (FOR UPDATE) and validate status = draft
   *   Step 2 — Lot recosting (if linked to a receiving)
   *     2a — Idempotency: skip if lots already costed by this invoice (costSourceId match)
   *     2b — For each invoice line with receivingLineId: compute final cost per minor unit
   *          Formula: finalCost = (valueBeforeVat − allocatedHeaderDiscount) / totalQtyMinor
   *          VAT is excluded from inventory cost (recorded in vat_input account instead)
   *     2c — Update lot: purchasePrice ← final, provisionalPurchasePrice ← original
   *     2d — Mark receiving status → posted_costed
   *   Step 3 — Set invoice status → approved_costed
   *   Step 4 — Generate accounting journal entry via tx (throws on missing mappings / closed period / unbalanced)
   *
   * Idempotency guarantees:
   *   - Lot recosting skipped if costSourceId already = invoiceId
   *   - Journal generation skipped if sourceDocumentId already exists for this invoice
   *   - Invoice status guard prevents double-approval
   */
  async approvePurchaseInvoice(this: any, id: string): Promise<PurchaseInvoiceHeader> {
    return await db.transaction(async (tx) => {
      // Step 1: Lock and validate
      // Rule: raw SQL only for the FOR UPDATE lock. Always reload through ORM for camelCase fields.
      await tx.execute(sql`SELECT id FROM purchase_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders)
        .where(eq(purchaseInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");

      // Step 2: Lot recosting — only when invoice is linked to a receiving
      const receivingId = invoice.receivingId;
      if (receivingId) {
        // Step 2a: Idempotency — if this invoice already costed some lots, skip entirely
        const [alreadyCosted] = await tx.select({ id: inventoryLots.id })
          .from(inventoryLots)
          .where(and(
            eq(inventoryLots.costSourceType, "purchase_invoice"),
            eq(inventoryLots.costSourceId, id)
          ))
          .limit(1);

        if (!alreadyCosted) {
          // Lock receiving to prevent concurrent modifications
          await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${receivingId} FOR UPDATE`);

          // Load all invoice lines for this invoice
          const invLines = await tx.select().from(purchaseInvoiceLines)
            .where(eq(purchaseInvoiceLines.invoiceId, id));

          // Invoice-level totals for header discount weight calculation
          const totalBeforeVat      = parseFloat(invoice.totalBeforeVat  || "0");
          const totalAfterVat       = parseFloat(invoice.totalAfterVat   || "0");
          const netPayable          = parseFloat(invoice.netPayable       || "0");
          const headerDiscountTotal = totalAfterVat - netPayable;

          // Step 2b: Recost each invoice line that has a receiving line reference
          for (const line of invLines) {
            if (!line.receivingLineId) continue;

            // Find the lot created from this receiving for this item
            // (join through inventory_lot_movements to trace the exact receiving origin)
            const [lotRow] = await tx
              .select({ lot: inventoryLots })
              .from(inventoryLots)
              .innerJoin(
                inventoryLotMovements,
                and(
                  eq(inventoryLotMovements.lotId, inventoryLots.id),
                  eq(inventoryLotMovements.referenceType, "receiving"),
                  eq(inventoryLotMovements.referenceId, receivingId)
                )
              )
              .where(eq(inventoryLots.itemId, line.itemId))
              .limit(1);

            const lot = lotRow?.lot;
            if (!lot) continue;

            // Load receiving line for total qty (billable + bonus)
            const [recvLine] = await tx.select().from(receivingLines)
              .where(eq(receivingLines.id, line.receivingLineId));
            if (!recvLine) continue;

            const totalQtyMinor =
              parseFloat(recvLine.qtyInMinor as string || "0") +
              parseFloat(recvLine.bonusQtyInMinor as string || "0");
            if (totalQtyMinor <= 0) continue;

            // Step 2b formula:
            //   allocatedHeaderDiscount = (lineValueBeforeVat / totalBeforeVat) × headerDiscountTotal
            //   finalLineCost           = lineValueBeforeVat − allocatedHeaderDiscount
            //   finalCostPerMinor       = finalLineCost / totalQtyMinor
            const lineValueBeforeVat = parseFloat(line.valueBeforeVat as string || "0");
            const allocatedDiscount  = totalBeforeVat > 0
              ? (lineValueBeforeVat / totalBeforeVat) * headerDiscountTotal
              : 0;
            const finalLineCost     = lineValueBeforeVat - allocatedDiscount;
            const finalCostPerMinor = +(finalLineCost / totalQtyMinor).toFixed(4);

            // Step 2c: Update lot with final cost, preserve original as provisional
            await tx.update(inventoryLots).set({
              provisionalPurchasePrice: lot.purchasePrice,
              purchasePrice:            String(finalCostPerMinor),
              costingStatus:            "costed",
              costedAt:                 new Date(),
              costSourceType:           "purchase_invoice",
              costSourceId:             id,
              updatedAt:                new Date(),
            }).where(eq(inventoryLots.id, lot.id));
          }

          // Step 2d: Mark the receiving as fully costed
          await tx.update(receivingHeaders).set({
            status:    "posted_costed",
            updatedAt: new Date(),
          }).where(eq(receivingHeaders.id, receivingId));
        }
      }

      // Step 3: Approve the invoice
      await tx.update(purchaseInvoiceHeaders).set({
        status:     "approved_costed",
        approvedAt: new Date(),
        updatedAt:  new Date(),
      }).where(eq(purchaseInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders)
        .where(eq(purchaseInvoiceHeaders.id, id));

      // Step 4: Generate journal entry inside the SAME transaction
      // Throws on: missing mappings, closed period, unbalanced journal → rolls back everything
      await this.generatePurchaseInvoiceJournalInTx(tx, id, updated);

      return updated;
    });
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

export default coreMethods;
