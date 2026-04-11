import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  receivingHeaders,
  receivingLines,
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async convertReceivingToInvoice(this: DatabaseStorage, receivingId: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [receiving] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, receivingId));
      if (!receiving) throw new Error("إذن الاستلام غير موجود");
      if (receiving.status === "draft") throw new Error("يجب ترحيل إذن الاستلام أولاً");
      if (receiving.convertedToInvoiceId) {
        const existingInvoice = await this.getPurchaseInvoice(receiving.convertedToInvoiceId);
        if (existingInvoice) return existingInvoice;
      }

      const lines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, receivingId));
      const nextNum = await this.getNextPurchaseInvoiceNumber();

      const [invoice] = await tx.insert(purchaseInvoiceHeaders).values({
        invoiceNumber: nextNum,
        supplierId: receiving.supplierId,
        supplierInvoiceNo: receiving.supplierInvoiceNo,
        warehouseId: receiving.warehouseId,
        receivingId: receiving.id,
        invoiceDate: receiving.receiveDate,
        notes: null,
      } as any).returning();

      for (const line of lines) {
        if (line.isRejected) continue;

        const salePrice     = parseFloat(String(line.salePrice     || "0")) || 0;
        const purchasePrice = parseFloat(String(line.purchasePrice  || "0")) || 0;
        const qty           = parseFloat(String(line.qtyEntered     || "0")) || 0;

        const discountVal = salePrice > 0 ? Math.max(0, salePrice - purchasePrice) : 0;
        const discountPct = salePrice > 0 ? +((discountVal / salePrice) * 100).toFixed(4) : 0;

        const valueBeforeVat = +(qty * purchasePrice).toFixed(2);

        await tx.insert(purchaseInvoiceLines).values({
          invoiceId:        invoice.id,
          receivingLineId:  line.id,
          itemId:           line.itemId,
          unitLevel:        line.unitLevel,
          qty:              line.qtyEntered,
          bonusQty:         line.bonusQty || "0",
          sellingPrice:     line.salePrice || "0",
          purchasePrice:    line.purchasePrice || "0",
          lineDiscountPct:  String(discountPct),
          lineDiscountValue:String(discountVal.toFixed(2)),
          vatRate:          "0",
          valueBeforeVat:   String(valueBeforeVat),
          vatAmount:        "0",
          valueAfterVat:    String(valueBeforeVat),
          batchNumber:      line.batchNumber,
          expiryMonth:      line.expiryMonth,
          expiryYear:       line.expiryYear,
        } as any);
      }

      await tx.update(receivingHeaders).set({
        convertedToInvoiceId: invoice.id,
        convertedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, receivingId));

      return invoice;
    });
  },
};

export default methods;
