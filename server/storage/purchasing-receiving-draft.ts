import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  items,
  receivingHeaders,
  receivingLines,
  type ReceivingHeader,
  type InsertReceivingHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

export const purchasingReceivingDraftMethods = {
  async saveDraftReceiving(this: DatabaseStorage, header: InsertReceivingHeader, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; purchasePrice: string; lineTotal: string; batchNumber?: string; expiryDate?: string; expiryMonth?: number; expiryYear?: number; salePrice?: string; salePriceHint?: string; notes?: string; isRejected?: boolean; rejectionReason?: string; bonusQty?: string; bonusQtyInMinor?: string }[], existingId?: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      let header_result: ReceivingHeader;
      if (existingId) {
        const [existing] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, existingId));
        if (!existing || existing.status !== 'draft') throw new Error('لا يمكن تعديل مستند مُرحّل');
        
        await tx.update(receivingHeaders).set({
          ...header,
          updatedAt: new Date(),
        }).where(eq(receivingHeaders.id, existingId));
        
        await tx.delete(receivingLines).where(eq(receivingLines.receivingId, existingId));
        [header_result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, existingId));
      } else {
        const nextNum = await this.getNextReceivingNumber();
        [header_result] = await tx.insert(receivingHeaders).values({
          ...header,
          receivingNumber: nextNum,
        } as Omit<ReceivingHeader, "id" | "createdAt" | "updatedAt">).returning();
      }
      
      let totalQty = 0;
      let totalCost = 0;
      
      for (const line of lines) {
        const lt = parseFloat(line.lineTotal) || 0;
        const qty = parseFloat(line.qtyInMinor) || 0;
        totalQty += qty;
        totalCost += lt;
        
        let resolvedUnitLevel = line.unitLevel;
        if (!resolvedUnitLevel || resolvedUnitLevel.trim() === '') {
          const [lineItem] = await tx.select().from(items).where(eq(items.id, line.itemId));
          resolvedUnitLevel = lineItem?.majorUnitName ? 'major' : 'minor';
        }
        
        await tx.insert(receivingLines).values({
          receivingId: header_result.id,
          itemId: line.itemId,
          unitLevel: resolvedUnitLevel as "major" | "medium" | "minor",
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          purchasePrice: line.purchasePrice,
          lineTotal: line.lineTotal,
          batchNumber: line.batchNumber || null,
          expiryDate: line.expiryDate || null,
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          salePrice: line.salePrice || null,
          salePriceHint: line.salePriceHint || null,
          notes: line.notes || null,
          isRejected: line.isRejected || false,
          rejectionReason: line.rejectionReason || null,
          bonusQty: line.bonusQty || "0",
          bonusQtyInMinor: line.bonusQtyInMinor || "0",
        });
      }
      
      await tx.update(receivingHeaders).set({
        totalQty: totalQty.toFixed(4),
        totalCost: roundMoney(totalCost),
      }).where(eq(receivingHeaders.id, header_result.id));
      
      [header_result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, header_result.id));
      return header_result;
    });
  },
};
