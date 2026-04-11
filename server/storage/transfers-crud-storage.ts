import { db } from "../db";
import { eq, desc, sql, inArray, asc } from "drizzle-orm";
import {
  items,
  inventoryLots,
  warehouses,
  storeTransfers,
  transferLines,
  type StoreTransfer,
  type InsertStoreTransfer,
  type StoreTransferWithDetails,
  type TransferLineWithItem,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getTransfers(this: DatabaseStorage): Promise<StoreTransferWithDetails[]> {
    const transfers = await db.select().from(storeTransfers)
      .where(sql`${storeTransfers.status} != 'cancelled'`)
      .orderBy(desc(storeTransfers.createdAt))
      .limit(100);

    const transferIds  = transfers.map(t => t.id);
    const whIds = [...new Set([...transfers.map(t => t.sourceWarehouseId), ...transfers.map(t => t.destinationWarehouseId)])];
    const [allWhs, allLines] = await Promise.all([
      whIds.length       > 0 ? db.select().from(warehouses).where(inArray(warehouses.id, whIds))           : [],
      transferIds.length > 0 ? db.select().from(transferLines).where(inArray(transferLines.transferId, transferIds)) : [],
    ]);
    const itemIds = [...new Set(allLines.map(l => l.itemId))];
    const allItems = itemIds.length > 0 ? await db.select().from(items).where(inArray(items.id, itemIds)) : [];

    const whMap    = new Map(allWhs.map(w => [w.id, w]));
    const itemMap  = new Map(allItems.map(i => [i.id, i]));
    const linesMap = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const bucket = linesMap.get(line.transferId) ?? [];
      bucket.push(line);
      linesMap.set(line.transferId, bucket);
    }
    const result: StoreTransferWithDetails[] = transfers.map(t => ({
      ...t,
      sourceWarehouse:      whMap.get(t.sourceWarehouseId),
      destinationWarehouse: whMap.get(t.destinationWarehouseId),
      lines: (linesMap.get(t.id) ?? []).map(line => ({ ...line, item: itemMap.get(line.itemId) })),
    }));
    return result;
  },

  async getTransfer(this: DatabaseStorage, id: string): Promise<StoreTransferWithDetails | undefined> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return undefined;
    const [[srcWh], [destWh], lines] = await Promise.all([
      db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId)),
      db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId)),
      db.select().from(transferLines).where(eq(transferLines.transferId, t.id)),
    ]);
    const itemIds  = [...new Set(lines.map(l => l.itemId))];
    const allItems = itemIds.length > 0 ? await db.select().from(items).where(inArray(items.id, itemIds)) : [];
    const itemMap  = new Map(allItems.map(i => [i.id, i]));
    const linesWithItems: TransferLineWithItem[] = lines.map(line => ({ ...line, item: itemMap.get(line.itemId) }));
    return { ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems };
  },

  async createDraftTransfer(this: DatabaseStorage, header: InsertStoreTransfer, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }[]): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
      const [maxNum] = await tx.select({ max: sql<number>`COALESCE(MAX(${storeTransfers.transferNumber}), 0)` }).from(storeTransfers);
      const nextNumber = (maxNum?.max || 0) + 1;

      const [transfer] = await tx.insert(storeTransfers).values({
        ...header,
        transferNumber: nextNumber,
        status: "draft" as const,
      }).returning();

      for (const line of lines) {
        await tx.insert(transferLines).values({
          transferId: transfer.id,
          itemId: line.itemId,
          unitLevel: line.unitLevel as any,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.expiryMonth || null,
          selectedExpiryYear: line.expiryYear || null,
          availableAtSaveMinor: line.availableAtSaveMinor || null,
          notes: line.notes || null,
        });
      }

      return transfer;
    });
  },

  async updateDraftTransfer(this: DatabaseStorage, transferId: string, header: Partial<InsertStoreTransfer>, lines: Array<{ itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }>): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
      await tx.update(storeTransfers).set({
        transferDate: header.transferDate,
        sourceWarehouseId: header.sourceWarehouseId,
        destinationWarehouseId: header.destinationWarehouseId,
        notes: header.notes || null,
      }).where(eq(storeTransfers.id, transferId));

      await tx.delete(transferLines).where(eq(transferLines.transferId, transferId));

      for (const line of lines) {
        await tx.insert(transferLines).values({
          transferId,
          itemId: line.itemId,
          unitLevel: line.unitLevel as any,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.expiryMonth || null,
          selectedExpiryYear: line.expiryYear || null,
          availableAtSaveMinor: line.availableAtSaveMinor || null,
          notes: line.notes || null,
        });
      }

      const [updated] = await tx.select().from(storeTransfers).where(eq(storeTransfers.id, transferId));
      return updated;
    });
  },

  async deleteTransfer(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return false;
    if (t.status !== "draft") throw new Error("لا يمكن إلغاء تحويل مُرحّل");
    await db.update(storeTransfers).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (t.notes ? `[ملغي] ${t.notes}` : "[ملغي]"),
    }).where(eq(storeTransfers.id, id));
    return true;
  },
};

export default methods;
