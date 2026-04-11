import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  items,
  storeTransfers,
  transferLines,
  transferLineAllocations,
  type StoreTransfer,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { computeLineAllocations } from "./transfers-post-allocate";
import { recordLineMovements, createTransferGlJournal } from "./transfers-post-movements";

const methods = {
  async postTransfer(this: DatabaseStorage, transferId: string): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
      const [transfer] = await tx.select().from(storeTransfers).where(eq(storeTransfers.id, transferId)).for("update");
      if (!transfer) throw new Error("التحويل غير موجود");
      if (transfer.status !== "draft") throw new Error("لا يمكن ترحيل تحويل غير مسودة");
      if (transfer.sourceWarehouseId === transfer.destinationWarehouseId) throw new Error("مخزن المصدر والوجهة يجب أن يكونا مختلفين");

      const lines = await tx.select().from(transferLines).where(eq(transferLines.transferId, transferId));
      if (lines.length === 0) throw new Error("لا توجد سطور في التحويل");

      for (const line of lines) {
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) throw new Error(`الصنف غير موجود: ${line.itemId}`);
        if (item.category === "service") throw new Error(`الخدمات لا يمكن تحويلها: ${item.nameAr}`);

        const allocations = await computeLineAllocations(tx, transfer, line, item);
        await recordLineMovements(tx, transfer, line, allocations);
      }

      const allAllocations = await tx.select().from(transferLineAllocations)
        .innerJoin(transferLines, eq(transferLineAllocations.lineId, transferLines.id))
        .where(eq(transferLines.transferId, transferId));

      let totalCost = 0;
      for (const row of allAllocations) {
        const qty = parseFloat(row.transfer_line_allocations.qtyOutInMinor);
        const cost = parseFloat(row.transfer_line_allocations.purchasePrice);
        totalCost += qty * cost;
      }

      const [updated] = await tx.update(storeTransfers)
        .set({ status: "executed" as const, executedAt: new Date() })
        .where(eq(storeTransfers.id, transferId))
        .returning();

      await createTransferGlJournal(tx, this, transfer, transferId, totalCost);

      return updated;
    });
  },
};

export default methods;
