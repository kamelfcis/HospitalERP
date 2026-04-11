import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  receivingHeaders,
  receivingLines,
  inventoryLots,
  inventoryLotMovements,
  type PurchaseInvoiceHeader,
  type PurchaseInvoiceLine,
} from "@shared/schema";
import { normalizeClaimNumber } from "./purchasing-invoices-query";

const saveMethods = {
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

        totalBeforeVat    += valueBeforeVat;
        totalVat          += vatAmount;
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
      if (headerUpdates?.claimNumber !== undefined) {
        updateSet.claimNumber = normalizeClaimNumber(headerUpdates.claimNumber);
      }

      await tx.update(purchaseInvoiceHeaders).set(updateSet).where(eq(purchaseInvoiceHeaders.id, invoiceId));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      return updated;
    });
  },

  async approvePurchaseInvoice(this: any, id: string): Promise<PurchaseInvoiceHeader> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM purchase_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders)
        .where(eq(purchaseInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");

      const receivingId = invoice.receivingId;
      if (receivingId) {
        const [alreadyCosted] = await tx.select({ id: inventoryLots.id })
          .from(inventoryLots)
          .where(and(
            eq(inventoryLots.costSourceType, "purchase_invoice"),
            eq(inventoryLots.costSourceId, id)
          ))
          .limit(1);

        if (!alreadyCosted) {
          await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${receivingId} FOR UPDATE`);

          const invLines = await tx.select().from(purchaseInvoiceLines)
            .where(eq(purchaseInvoiceLines.invoiceId, id));

          const totalBeforeVat      = parseFloat(invoice.totalBeforeVat  || "0");
          const totalAfterVat       = parseFloat(invoice.totalAfterVat   || "0");
          const netPayable          = parseFloat(invoice.netPayable       || "0");
          const headerDiscountTotal = totalAfterVat - netPayable;

          const invLineItemIds = [...new Set(invLines.map(l => l.itemId))];
          const allLotRows = invLineItemIds.length > 0
            ? await tx.select({ lot: inventoryLots })
                .from(inventoryLots)
                .innerJoin(
                  inventoryLotMovements,
                  and(
                    eq(inventoryLotMovements.lotId, inventoryLots.id),
                    eq(inventoryLotMovements.referenceType, "receiving"),
                    eq(inventoryLotMovements.referenceId, receivingId!)
                  )
                )
                .where(inArray(inventoryLots.itemId, invLineItemIds))
            : [];
          const lotByItemId = new Map<string, typeof inventoryLots.$inferSelect>();
          for (const row of allLotRows) {
            if (!lotByItemId.has(row.lot.itemId)) lotByItemId.set(row.lot.itemId, row.lot);
          }

          const recvLineIds = invLines.map(l => l.receivingLineId).filter(Boolean) as string[];
          const allRecvLines = recvLineIds.length > 0
            ? await tx.select().from(receivingLines).where(inArray(receivingLines.id, recvLineIds))
            : [];
          const recvLineMap = new Map(allRecvLines.map(r => [r.id, r]));

          for (const line of invLines) {
            if (!line.receivingLineId) continue;

            const lot = lotByItemId.get(line.itemId);
            if (!lot) continue;

            const recvLine = recvLineMap.get(line.receivingLineId);
            if (!recvLine) continue;

            const totalQtyMinor =
              parseFloat(recvLine.qtyInMinor as string || "0") +
              parseFloat(recvLine.bonusQtyInMinor as string || "0");
            if (totalQtyMinor <= 0) continue;

            const lineValueBeforeVat = parseFloat(line.valueBeforeVat as string || "0");
            const allocatedDiscount  = totalBeforeVat > 0
              ? (lineValueBeforeVat / totalBeforeVat) * headerDiscountTotal
              : 0;
            const finalLineCost     = lineValueBeforeVat - allocatedDiscount;
            const finalCostPerMinor = +(finalLineCost / totalQtyMinor).toFixed(4);

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

          await tx.update(receivingHeaders).set({
            status:    "posted_costed",
            updatedAt: new Date(),
          }).where(eq(receivingHeaders.id, receivingId));
        }
      }

      await tx.update(purchaseInvoiceHeaders).set({
        status:     "approved_costed",
        approvedAt: new Date(),
        updatedAt:  new Date(),
      }).where(eq(purchaseInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders)
        .where(eq(purchaseInvoiceHeaders.id, id));

      await this.generatePurchaseInvoiceJournalInTx(tx, id, updated);

      return updated;
    });
  },
};

export default saveMethods;
