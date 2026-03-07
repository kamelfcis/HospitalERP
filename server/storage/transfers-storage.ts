import { db } from "../db";
import { eq, desc, and, gte, lte, sql, or, ilike, asc } from "drizzle-orm";
import {
  items,
  itemBarcodes,
  inventoryLots,
  inventoryLotMovements,
  warehouses,
  storeTransfers,
  transferLines,
  transferLineAllocations,
  journalEntries,
  journalLines,
  fiscalPeriods,
  type StoreTransfer,
  type InsertStoreTransfer,
  type StoreTransferWithDetails,
  type TransferLineWithItem,
  type InsertJournalLine,
  type JournalEntry,
  type Warehouse,
  type TransferLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getTransfers(this: DatabaseStorage): Promise<StoreTransferWithDetails[]> {
    const transfers = await db.select().from(storeTransfers)
      .where(sql`${storeTransfers.status} != 'cancelled'`)
      .orderBy(desc(storeTransfers.createdAt))
      .limit(100);

    const result: StoreTransferWithDetails[] = [];
    for (const t of transfers) {
      const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
      const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
      const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
      const linesWithItems: TransferLineWithItem[] = [];
      for (const line of lines) {
        const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
        linesWithItems.push({ ...line, item });
      }
      result.push({ ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems });
    }
    return result;
  },

  async getTransfer(this: DatabaseStorage, id: string): Promise<StoreTransferWithDetails | undefined> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return undefined;
    const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
    const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
    const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
    const linesWithItems: TransferLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
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

        const requiredQty = parseFloat(line.qtyInMinor);
        if (requiredQty <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر: ${item.nameAr}`);

        let remaining = requiredQty;
        const allocations: { lotId: string; expiryDate: string | null; expiryMonth: number | null; expiryYear: number | null; allocatedQty: number; unitCost: string; lotSalePrice: string }[] = [];

        if (item.hasExpiry && line.selectedExpiryMonth && line.selectedExpiryYear) {
          const selMonth = line.selectedExpiryMonth;
          const selYear = line.selectedExpiryYear;
          const selectedLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
              eq(inventoryLots.isActive, true),
              sql`${inventoryLots.qtyInMinor}::numeric > 0`,
              eq(inventoryLots.expiryMonth, selMonth),
              eq(inventoryLots.expiryYear, selYear)
            ))
            .orderBy(asc(inventoryLots.receivedDate))
            .for("update");

          for (const lot of selectedLots) {
            if (remaining <= 0) break;
            const available = parseFloat(lot.qtyInMinor);
            const allocated = Math.min(available, remaining);
            allocations.push({
              lotId: lot.id,
              expiryDate: lot.expiryDate,
              expiryMonth: lot.expiryMonth,
              expiryYear: lot.expiryYear,
              allocatedQty: allocated,
              unitCost: lot.purchasePrice,
              lotSalePrice: lot.salePrice || "0",
            });
            remaining -= allocated;
          }
        } else if (item.hasExpiry && line.selectedExpiryDate) {
          const selectedLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
              eq(inventoryLots.isActive, true),
              sql`${inventoryLots.qtyInMinor}::numeric > 0`,
              sql`${inventoryLots.expiryDate} = ${line.selectedExpiryDate}`
            ))
            .orderBy(asc(inventoryLots.receivedDate))
            .for("update");

          for (const lot of selectedLots) {
            if (remaining <= 0) break;
            const available = parseFloat(lot.qtyInMinor);
            const allocated = Math.min(available, remaining);
            allocations.push({
              lotId: lot.id,
              expiryDate: lot.expiryDate,
              expiryMonth: lot.expiryMonth,
              expiryYear: lot.expiryYear,
              allocatedQty: allocated,
              unitCost: lot.purchasePrice,
              lotSalePrice: lot.salePrice || "0",
            });
            remaining -= allocated;
          }
        }

        if (remaining > 0) {
          const transferDateParsed = new Date(transfer.transferDate);
          const tMonth = transferDateParsed.getMonth() + 1;
          const tYear = transferDateParsed.getFullYear();

          const expiryCondition = item.hasExpiry
            ? and(
                sql`${inventoryLots.expiryMonth} IS NOT NULL`,
                sql`${inventoryLots.expiryYear} IS NOT NULL`,
                sql`(${inventoryLots.expiryYear} > ${tYear} OR (${inventoryLots.expiryYear} = ${tYear} AND ${inventoryLots.expiryMonth} >= ${tMonth}))`
              )
            : and(
                sql`${inventoryLots.expiryMonth} IS NULL`,
                sql`${inventoryLots.expiryYear} IS NULL`
              );

          const alreadyUsedLotIds = allocations.map(a => a.lotId);

          const fefoLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
              eq(inventoryLots.isActive, true),
              sql`${inventoryLots.qtyInMinor}::numeric > 0`,
              expiryCondition,
              ...(alreadyUsedLotIds.length > 0
                ? [sql`${inventoryLots.id} NOT IN (${sql.join(alreadyUsedLotIds.map(id => sql`${id}`), sql`, `)})`]
                : [])
            ))
            .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth), asc(inventoryLots.receivedDate))
            .for("update");

          for (const lot of fefoLots) {
            if (remaining <= 0) break;
            const available = parseFloat(lot.qtyInMinor);
            const allocated = Math.min(available, remaining);
            allocations.push({
              lotId: lot.id,
              expiryDate: lot.expiryDate,
              expiryMonth: lot.expiryMonth,
              expiryYear: lot.expiryYear,
              allocatedQty: allocated,
              unitCost: lot.purchasePrice,
              lotSalePrice: lot.salePrice || "0",
            });
            remaining -= allocated;
          }
        }

        if (remaining > 0) {
          throw new Error(`الكمية غير متاحة للصنف: ${item.nameAr} - المطلوب: ${requiredQty} - المتاح: ${(requiredQty - remaining).toFixed(0)} (بالوحدة الصغرى)`);
        }

        for (const alloc of allocations) {
          await tx.execute(sql`
            UPDATE inventory_lots 
            SET qty_in_minor = qty_in_minor::numeric - ${alloc.allocatedQty.toFixed(4)}::numeric,
                updated_at = NOW()
            WHERE id = ${alloc.lotId}
          `);

          await tx.insert(inventoryLotMovements).values({
            lotId: alloc.lotId,
            warehouseId: transfer.sourceWarehouseId,
            txType: "out" as const,
            txDate: new Date(),
            qtyChangeInMinor: (-alloc.allocatedQty).toFixed(4),
            unitCost: alloc.unitCost,
            referenceType: "transfer",
            referenceId: transfer.id,
          } as any);

          const expiryMatchConditions = [];
          if (alloc.expiryDate) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryDate} = ${alloc.expiryDate}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryDate} IS NULL`);
          }
          if (alloc.expiryMonth != null) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryMonth} = ${alloc.expiryMonth}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
          }
          if (alloc.expiryYear != null) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryYear} = ${alloc.expiryYear}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryYear} IS NULL`);
          }

          const existingDestLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.destinationWarehouseId),
              eq(inventoryLots.isActive, true),
              ...expiryMatchConditions,
              sql`${inventoryLots.purchasePrice}::numeric = ${alloc.unitCost}::numeric`
            ));

          let destLotId: string;

          if (existingDestLots.length > 0) {
            destLotId = existingDestLots[0].id;
            const allocSalePrice = parseFloat(alloc.lotSalePrice || "0");
            const existingSalePrice = parseFloat(existingDestLots[0].salePrice || "0");
            const destSalePrice = allocSalePrice > 0 ? alloc.lotSalePrice : (existingSalePrice > 0 ? existingDestLots[0].salePrice : "0");
            await tx.execute(sql`
              UPDATE inventory_lots 
              SET qty_in_minor = qty_in_minor::numeric + ${alloc.allocatedQty.toFixed(4)}::numeric,
                  sale_price = ${destSalePrice},
                  updated_at = NOW()
              WHERE id = ${destLotId}
            `);
          } else {
            const [newLot] = await tx.insert(inventoryLots).values({
              itemId: line.itemId,
              warehouseId: transfer.destinationWarehouseId,
              expiryDate: item.hasExpiry ? (alloc.expiryDate || null) : null,
              expiryMonth: item.hasExpiry ? (alloc.expiryMonth || null) : null,
              expiryYear: item.hasExpiry ? (alloc.expiryYear || null) : null,
              receivedDate: transfer.transferDate,
              purchasePrice: alloc.unitCost,
              salePrice: alloc.lotSalePrice || "0",
              qtyInMinor: alloc.allocatedQty.toFixed(4),
              isActive: true,
            }).returning();
            destLotId = newLot.id;
          }

          await tx.insert(inventoryLotMovements).values({
            lotId: destLotId,
            warehouseId: transfer.destinationWarehouseId,
            txType: "in" as const,
            txDate: new Date(),
            qtyChangeInMinor: alloc.allocatedQty.toFixed(4),
            unitCost: alloc.unitCost,
            referenceType: "transfer",
            referenceId: transfer.id,
          } as any);

          await tx.insert(transferLineAllocations).values({
            lineId: line.id,
            sourceLotId: alloc.lotId,
            expiryDate: alloc.expiryDate || null,
            qtyOutInMinor: alloc.allocatedQty.toFixed(4),
            purchasePrice: alloc.unitCost,
            destinationLotId: destLotId,
          });
        }
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

      if (totalCost > 0) {
        (this as any).generateWarehouseTransferJournal(
          transferId, transfer, totalCost
        ).catch((err: any) => console.error("Auto journal for warehouse transfer failed:", err));
      }

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

  async getWarehouseFefoPreview(this: DatabaseStorage, itemId: string, warehouseId: string, requiredQty: number, asOfDate: string): Promise<{ allocations: any[]; fulfilled: boolean; shortfall: string }> {
    const [item] = await db.select().from(items).where(eq(items.id, itemId));

    const asOf = new Date(asOfDate);
    const asOfMonth = asOf.getMonth() + 1;
    const asOfYear = asOf.getFullYear();

    const expiryCondition = item && item.hasExpiry
      ? and(
          sql`${inventoryLots.expiryMonth} IS NOT NULL`,
          sql`${inventoryLots.expiryYear} IS NOT NULL`,
          sql`(${inventoryLots.expiryYear} > ${asOfYear} OR (${inventoryLots.expiryYear} = ${asOfYear} AND ${inventoryLots.expiryMonth} >= ${asOfMonth}))`
        )
      : sql`${inventoryLots.expiryMonth} IS NULL`;

    const lots = await db.select().from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        expiryCondition
      ))
      .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth), asc(inventoryLots.receivedDate));

    const allocations: Array<{
      lotId: string;
      expiryDate: string | null;
      expiryMonth: number | null;
      expiryYear: number | null;
      receivedDate: string;
      availableQty: string;
      allocatedQty: string;
      unitCost: string;
      lotSalePrice: string;
    }> = [];
    let remaining = requiredQty;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = parseFloat(lot.qtyInMinor);
      const allocated = Math.min(available, remaining);
      allocations.push({
        lotId: lot.id,
        expiryDate: lot.expiryDate,
        expiryMonth: lot.expiryMonth,
        expiryYear: lot.expiryYear,
        receivedDate: lot.receivedDate,
        availableQty: available.toFixed(4),
        allocatedQty: allocated.toFixed(4),
        unitCost: lot.purchasePrice,
        lotSalePrice: lot.salePrice || "0",
      });
      remaining -= allocated;
    }

    return {
      allocations,
      fulfilled: remaining <= 0,
      shortfall: remaining > 0 ? remaining.toFixed(4) : "0",
    };
  },

  async getItemAvailability(this: DatabaseStorage, itemId: string, warehouseId: string): Promise<string> {
    const [result] = await db.select({
      total: sql<string>`COALESCE(SUM(${inventoryLots.qtyInMinor}::numeric), 0)::text`
    })
      .from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`
      ));
    return result?.total || "0";
  },

  async getExpiryOptions(this: DatabaseStorage, itemId: string, warehouseId: string, asOfDate: string): Promise<{expiryDate: string; expiryMonth: number | null; expiryYear: number | null; qtyAvailableMinor: string; lotSalePrice?: string}[]> {
    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    if (!item || !item.hasExpiry) return [];
    
    const asOf = new Date(asOfDate);
    const asOfMonth = asOf.getMonth() + 1;
    const asOfYear = asOf.getFullYear();

    const results = await db.select({
      expiryMonth: inventoryLots.expiryMonth,
      expiryYear: inventoryLots.expiryYear,
      qtyAvailableMinor: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
      minSalePrice: sql<string>`MIN(${inventoryLots.salePrice})::text`,
      maxSalePrice: sql<string>`MAX(${inventoryLots.salePrice})::text`,
    })
      .from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        sql`${inventoryLots.expiryMonth} IS NOT NULL`,
        sql`${inventoryLots.expiryYear} IS NOT NULL`,
        sql`(${inventoryLots.expiryYear} > ${asOfYear} OR (${inventoryLots.expiryYear} = ${asOfYear} AND ${inventoryLots.expiryMonth} >= ${asOfMonth}))`
      ))
      .groupBy(inventoryLots.expiryMonth, inventoryLots.expiryYear)
      .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth));

    return results.filter(r => r.expiryMonth !== null && r.expiryYear !== null).map(r => ({
      expiryDate: `${r.expiryYear}-${String(r.expiryMonth).padStart(2, '0')}-01`,
      expiryMonth: r.expiryMonth,
      expiryYear: r.expiryYear,
      qtyAvailableMinor: r.qtyAvailableMinor,
      lotSalePrice: r.minSalePrice || undefined,
    }));
  },

  async getItemAvailabilitySummary(this: DatabaseStorage, itemId: string, asOfDate: string, excludeExpired: boolean): Promise<{warehouseId: string; warehouseNameAr: string; qtyMinor: string; majorUnitName: string | null; majorToMinor: string | null}[]> {
    const [item] = await db.select({ hasExpiry: items.hasExpiry, majorUnitName: items.majorUnitName, majorToMinor: items.majorToMinor }).from(items).where(eq(items.id, itemId));
    if (!item) return [];

    const conditions: any[] = [
      eq(inventoryLots.itemId, itemId),
      eq(inventoryLots.isActive, true),
      sql`${inventoryLots.qtyInMinor}::numeric > 0`,
    ];

    if (excludeExpired && item.hasExpiry) {
      const asOf = new Date(asOfDate);
      const asOfMonth = asOf.getMonth() + 1;
      const asOfYear = asOf.getFullYear();
      conditions.push(
        sql`(${inventoryLots.expiryMonth} IS NULL OR ${inventoryLots.expiryYear} > ${asOfYear} OR (${inventoryLots.expiryYear} = ${asOfYear} AND ${inventoryLots.expiryMonth} >= ${asOfMonth}))`
      );
    }

    const results = await db.select({
      warehouseId: inventoryLots.warehouseId,
      warehouseNameAr: warehouses.nameAr,
      qtyMinor: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
    })
      .from(inventoryLots)
      .innerJoin(warehouses, and(eq(warehouses.id, inventoryLots.warehouseId), eq(warehouses.isActive, true)))
      .where(and(...conditions))
      .groupBy(inventoryLots.warehouseId, warehouses.nameAr)
      .orderBy(warehouses.nameAr);

    return results.filter(r => r.warehouseId !== null).map(r => ({
      warehouseId: r.warehouseId!,
      warehouseNameAr: r.warehouseNameAr,
      qtyMinor: r.qtyMinor,
      majorUnitName: item.majorUnitName,
      majorToMinor: item.majorToMinor,
    }));
  },

  async searchItemsAdvanced(this: DatabaseStorage, params: {
    mode: 'AR' | 'EN' | 'CODE' | 'BARCODE';
    query: string;
    warehouseId: string;
    page: number;
    pageSize: number;
    includeZeroStock: boolean;
    drugsOnly: boolean;
    excludeServices?: boolean;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<{items: Array<any>; total: number}> {
    const { mode, query, warehouseId, page, pageSize, includeZeroStock, drugsOnly, excludeServices, minPrice, maxPrice } = params;
    const offset = (page - 1) * pageSize;

    const buildPattern = (q: string) => {
      if (!q.includes('%')) return `%${q}%`;
      let p = q;
      if (!p.startsWith('%')) p = `%${p}`;
      if (!p.endsWith('%')) p = `${p}%`;
      return p;
    };

    let searchCondition: any;
    let joinBarcode = false;

    switch (mode) {
      case 'AR':
        searchCondition = ilike(items.nameAr, buildPattern(query));
        break;
      case 'EN':
        searchCondition = ilike(sql`COALESCE(${items.nameEn}, '')`, buildPattern(query));
        break;
      case 'CODE':
        searchCondition = ilike(items.itemCode, buildPattern(query));
        break;
      case 'BARCODE':
        joinBarcode = true;
        searchCondition = ilike(itemBarcodes.barcodeValue, buildPattern(query));
        break;
      default:
        searchCondition = ilike(items.nameAr, buildPattern(query));
    }

    const conditions: Array<any> = [eq(items.isActive, true), searchCondition];
    if (drugsOnly) {
      conditions.push(eq(items.category, 'drug'));
    }
    if (excludeServices) {
      conditions.push(sql`${items.category} != 'service'`);
    }
    if (minPrice !== undefined) {
      conditions.push(sql`${items.salePriceCurrent}::numeric >= ${minPrice}`);
    }
    if (maxPrice !== undefined) {
      conditions.push(sql`${items.salePriceCurrent}::numeric <= ${maxPrice}`);
    }

    const itemIdRef = sql.raw(`"items"."id"`);
    const availQtySql = sql<string>`COALESCE((
      SELECT SUM(il.qty_in_minor::numeric)::text
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
    ), '0')`;

    const nearestExpirySql = sql<string>`(
      SELECT MIN(il.expiry_date)::text
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_date IS NOT NULL
        AND il.expiry_date >= CURRENT_DATE
    )`;

    const nearestExpiryMonthSql = sql<number>`(
      SELECT il.expiry_month
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_month IS NOT NULL
        AND il.expiry_year IS NOT NULL
        AND (il.expiry_year > EXTRACT(YEAR FROM CURRENT_DATE)::int OR (il.expiry_year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND il.expiry_month >= EXTRACT(MONTH FROM CURRENT_DATE)::int))
      ORDER BY il.expiry_year ASC, il.expiry_month ASC
      LIMIT 1
    )`;

    const nearestExpiryYearSql = sql<number>`(
      SELECT il.expiry_year
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_month IS NOT NULL
        AND il.expiry_year IS NOT NULL
        AND (il.expiry_year > EXTRACT(YEAR FROM CURRENT_DATE)::int OR (il.expiry_year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND il.expiry_month >= EXTRACT(MONTH FROM CURRENT_DATE)::int))
      ORDER BY il.expiry_year ASC, il.expiry_month ASC
      LIMIT 1
    )`;

    const nearestExpiryQtySql = sql<string>`(
      SELECT SUM(il.qty_in_minor::numeric)::text
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_date = (
          SELECT MIN(il2.expiry_date)
          FROM inventory_lots il2
          WHERE il2.item_id = ${itemIdRef}
            AND il2.warehouse_id = ${warehouseId}
            AND il2.is_active = true
            AND il2.qty_in_minor::numeric > 0
            AND il2.expiry_date IS NOT NULL
            AND il2.expiry_date >= CURRENT_DATE
        )
    )`;

    if (joinBarcode) {
      const baseQuery = db.select({
        id: items.id,
        itemCode: items.itemCode,
        nameAr: items.nameAr,
        nameEn: items.nameEn,
        hasExpiry: items.hasExpiry,
        category: items.category,
        majorUnitName: items.majorUnitName,
        minorUnitName: items.minorUnitName,
        majorToMinor: items.majorToMinor,
        majorToMedium: items.majorToMedium,
        mediumUnitName: items.mediumUnitName,
        mediumToMinor: items.mediumToMinor,
        salePriceCurrent: items.salePriceCurrent,
        availableQtyMinor: availQtySql,
        nearestExpiryDate: nearestExpirySql,
        nearestExpiryMonth: nearestExpiryMonthSql,
        nearestExpiryYear: nearestExpiryYearSql,
        nearestExpiryQtyMinor: nearestExpiryQtySql,
      })
        .from(items)
        .innerJoin(itemBarcodes, and(eq(itemBarcodes.itemId, items.id), eq(itemBarcodes.isActive, true)))
        .where(and(...conditions))
        .groupBy(items.id);

      if (!includeZeroStock) {
        const allResults = await baseQuery.orderBy(asc(items.itemCode));
        const filtered = allResults.filter(r => parseFloat(r.availableQtyMinor) > 0);
        const total = filtered.length;
        const paged = filtered.slice(offset, offset + pageSize);
        return { items: paged, total };
      }

      const countResult = await db.select({ count: sql<number>`COUNT(DISTINCT ${items.id})` })
        .from(items)
        .innerJoin(itemBarcodes, and(eq(itemBarcodes.itemId, items.id), eq(itemBarcodes.isActive, true)))
        .where(and(...conditions));

      const total = countResult[0]?.count || 0;
      const results = await baseQuery.orderBy(asc(items.itemCode)).limit(pageSize).offset(offset);
      return { items: results, total };
    }

    if (!includeZeroStock) {
      const allResults = await db.select({
        id: items.id,
        itemCode: items.itemCode,
        nameAr: items.nameAr,
        nameEn: items.nameEn,
        hasExpiry: items.hasExpiry,
        category: items.category,
        majorUnitName: items.majorUnitName,
        minorUnitName: items.minorUnitName,
        majorToMinor: items.majorToMinor,
        majorToMedium: items.majorToMedium,
        mediumUnitName: items.mediumUnitName,
        mediumToMinor: items.mediumToMinor,
        salePriceCurrent: items.salePriceCurrent,
        availableQtyMinor: availQtySql,
        nearestExpiryDate: nearestExpirySql,
        nearestExpiryMonth: nearestExpiryMonthSql,
        nearestExpiryYear: nearestExpiryYearSql,
        nearestExpiryQtyMinor: nearestExpiryQtySql,
      })
        .from(items)
        .where(and(...conditions))
        .orderBy(asc(items.itemCode));

      const filtered = allResults.filter(r => parseFloat(r.availableQtyMinor) > 0);
      const total = filtered.length;
      const paged = filtered.slice(offset, offset + pageSize);
      return { items: paged, total };
    }

    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(items)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    const results = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      nameAr: items.nameAr,
      nameEn: items.nameEn,
      hasExpiry: items.hasExpiry,
      category: items.category,
      majorUnitName: items.majorUnitName,
      minorUnitName: items.minorUnitName,
      majorToMinor: items.majorToMinor,
      majorToMedium: items.majorToMedium,
      mediumUnitName: items.mediumUnitName,
      mediumToMinor: items.mediumToMinor,
      salePriceCurrent: items.salePriceCurrent,
      availableQtyMinor: availQtySql,
      nearestExpiryDate: nearestExpirySql,
      nearestExpiryMonth: nearestExpiryMonthSql,
      nearestExpiryYear: nearestExpiryYearSql,
      nearestExpiryQtyMinor: nearestExpiryQtySql,
    })
      .from(items)
      .where(and(...conditions))
      .orderBy(asc(items.itemCode))
      .limit(pageSize)
      .offset(offset);

    return { items: results, total };
  },

  async searchItemsByPattern(this: DatabaseStorage, query: string, limit: number): Promise<any[]> {
    const buildPattern = (q: string) => {
      if (!q.includes('%')) return `%${q}%`;
      let p = q;
      if (!p.startsWith('%')) p = `%${p}`;
      if (!p.endsWith('%')) p = `${p}%`;
      return p;
    };

    const pattern = buildPattern(query);
    const searchCondition = or(
      ilike(items.nameAr, pattern),
      ilike(sql`COALESCE(${items.nameEn}, '')`, pattern),
      ilike(items.itemCode, pattern)
    );

    const results = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      nameAr: items.nameAr,
      nameEn: items.nameEn,
      hasExpiry: items.hasExpiry,
      category: items.category,
      majorUnitName: items.majorUnitName,
      minorUnitName: items.minorUnitName,
      majorToMinor: items.majorToMinor,
      majorToMedium: items.majorToMedium,
      mediumUnitName: items.mediumUnitName,
      mediumToMinor: items.mediumToMinor,
      salePriceCurrent: items.salePriceCurrent,
      purchasePriceLast: items.purchasePriceLast,
    })
      .from(items)
      .where(and(eq(items.isActive, true), searchCondition))
      .orderBy(asc(items.itemCode))
      .limit(limit);

    return results;
  },

  async getTransfersFiltered(this: DatabaseStorage, params: {
    fromDate?: string;
    toDate?: string;
    sourceWarehouseId?: string;
    destWarehouseId?: string;
    status?: string;
    search?: string;
    page: number;
    pageSize: number;
    includeCancelled?: boolean;
  }): Promise<{data: StoreTransferWithDetails[]; total: number}> {
    const { fromDate, toDate, sourceWarehouseId, destWarehouseId, status, search, page, pageSize, includeCancelled } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<any> = [];

    if (fromDate) {
      conditions.push(gte(storeTransfers.transferDate, fromDate));
    }
    if (toDate) {
      conditions.push(lte(storeTransfers.transferDate, toDate));
    }
    if (sourceWarehouseId) {
      conditions.push(eq(storeTransfers.sourceWarehouseId, sourceWarehouseId));
    }
    if (destWarehouseId) {
      conditions.push(eq(storeTransfers.destinationWarehouseId, destWarehouseId));
    }
    if (status) {
      conditions.push(eq(storeTransfers.status, status as any));
    } else if (!includeCancelled) {
      conditions.push(sql`${storeTransfers.status} != 'cancelled'`);
    }
    if (search && search.trim()) {
      const searchTerm = search.trim().replace(/^TRF-/i, '');
      const numericSearch = parseInt(searchTerm, 10);
      if (!isNaN(numericSearch)) {
        conditions.push(eq(storeTransfers.transferNumber, numericSearch));
      } else {
        const matchingItemIds = await db.select({ id: items.id })
          .from(items)
          .where(or(
            ilike(items.nameAr, `%${searchTerm}%`),
            ilike(items.itemCode, `%${searchTerm}%`)
          ));

        if (matchingItemIds.length > 0) {
          const transferIdsWithItem = await db.selectDistinct({ transferId: transferLines.transferId })
            .from(transferLines)
            .where(sql`${transferLines.itemId} IN (${sql.join(matchingItemIds.map(i => sql`${i.id}`), sql`, `)})`);

          if (transferIdsWithItem.length > 0) {
            conditions.push(sql`${storeTransfers.id} IN (${sql.join(transferIdsWithItem.map(t => sql`${t.transferId}`), sql`, `)})`);
          } else {
            return { data: [], total: 0 };
          }
        } else {
          return { data: [], total: 0 };
        }
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(storeTransfers)
      .where(whereClause);

    const total = countResult?.count || 0;

    const transfers = await db.select().from(storeTransfers)
      .where(whereClause)
      .orderBy(desc(storeTransfers.createdAt))
      .limit(pageSize)
      .offset(offset);

    const result: StoreTransferWithDetails[] = [];
    for (const t of transfers) {
      const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
      const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
      const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
      const linesWithItems: TransferLineWithItem[] = [];
      for (const line of lines) {
        const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
        linesWithItems.push({ ...line, item });
      }
      result.push({ ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems });
    }

    return { data: result, total };
  },

  async searchItemsForTransfer(this: DatabaseStorage, query: string, warehouseId: string, limit: number = 10): Promise<any[]> {
    const searchTerms = query.trim().split('%').filter(Boolean);

    const conditions: Array<any> = [eq(items.isActive, true)];

    if (searchTerms.length > 1) {
      const nameConditions = searchTerms.map(term =>
        ilike(items.nameAr, `%${term}%`)
      );
      conditions.push(and(...nameConditions));
    } else if (searchTerms.length === 1) {
      const term = searchTerms[0];
      conditions.push(
        or(
          ilike(items.itemCode, `%${term}%`),
          ilike(items.nameAr, `%${term}%`),
          ilike(items.nameEn || '', `%${term}%`)
        )
      );
    }

    const results = await db.select().from(items)
      .where(and(...conditions))
      .orderBy(asc(items.itemCode))
      .limit(limit);

    const enriched = [];
    for (const item of results) {
      const avail = await this.getItemAvailability(item.id, warehouseId);
      enriched.push({
        ...item,
        availableQtyMinor: avail,
      });
    }
    return enriched;
  },

  async seedPilotTest(this: DatabaseStorage): Promise<{ warehouses: { id: string; warehouseCode: string; nameAr: string }[]; items: Record<string, unknown>[]; lots: Record<string, unknown>[] }> {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

    return await db.transaction(async (tx) => {
      const warehouseDefs = [
        { warehouseCode: "WH-PH-IN", nameAr: "صيدلية داخلية" },
        { warehouseCode: "WH-OR", nameAr: "مخزن العمليات" },
      ];

      const createdWarehouses: Warehouse[] = [];
      for (const whDef of warehouseDefs) {
        const [existing] = await tx.select().from(warehouses).where(eq(warehouses.warehouseCode, whDef.warehouseCode));
        if (existing) {
          createdWarehouses.push(existing);
        } else {
          const [inserted] = await tx.insert(warehouses).values(whDef).returning();
          createdWarehouses.push(inserted);
        }
      }

      const whPhIn = createdWarehouses.find(w => w.warehouseCode === "WH-PH-IN")!;

      const itemDefs = [
        {
          itemCode: "TEST-DRUG-1",
          category: "drug" as const,
          hasExpiry: true,
          nameAr: "باراسيتامول 500mg تجريبي",
          majorUnitName: "علبة",
          minorUnitName: "شريط",
          majorToMinor: "10",
          purchasePriceLast: "100",
          salePriceCurrent: "150",
        },
        {
          itemCode: "TEST-DRUG-2",
          category: "drug" as const,
          hasExpiry: true,
          nameAr: "أموكسيسيلين 250mg تجريبي",
          majorUnitName: "علبة",
          minorUnitName: "قرص",
          majorToMinor: "20",
          purchasePriceLast: "200",
          salePriceCurrent: "300",
        },
        {
          itemCode: "TEST-SUP-1",
          category: "supply" as const,
          hasExpiry: false,
          nameAr: "قفازات طبية تجريبي",
          majorUnitName: "علبة",
          minorUnitName: "قطعة",
          majorToMinor: "50",
          purchasePriceLast: "30",
          salePriceCurrent: "45",
        },
      ];

      const createdItems: any[] = [];
      for (const itemDef of itemDefs) {
        const [existing] = await tx.select().from(items).where(eq(items.itemCode, itemDef.itemCode));
        if (existing) {
          createdItems.push(existing);
        } else {
          const [inserted] = await tx.insert(items).values(itemDef).returning();
          createdItems.push(inserted);
        }
      }

      const drug1 = createdItems.find(i => i.itemCode === "TEST-DRUG-1")!;
      const drug2 = createdItems.find(i => i.itemCode === "TEST-DRUG-2")!;
      const sup1 = createdItems.find(i => i.itemCode === "TEST-SUP-1")!;

      const lotDefs = [
        {
          itemId: drug1.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, 30)),
          receivedDate: formatDate(addDays(today, -5)),
          purchasePrice: "100.0000",
          qtyInMinor: "50.0000",
          label: "TEST-DRUG-1 LotA",
        },
        {
          itemId: drug1.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, 90)),
          receivedDate: formatDate(addDays(today, -3)),
          purchasePrice: "105.0000",
          qtyInMinor: "100.0000",
          label: "TEST-DRUG-1 LotB",
        },
        {
          itemId: drug1.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, -10)),
          receivedDate: formatDate(addDays(today, -60)),
          purchasePrice: "95.0000",
          qtyInMinor: "200.0000",
          label: "TEST-DRUG-1 LotExpired",
        },
        {
          itemId: drug2.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, 60)),
          receivedDate: formatDate(addDays(today, -7)),
          purchasePrice: "200.0000",
          qtyInMinor: "40.0000",
          label: "TEST-DRUG-2 Lot1",
        },
        {
          itemId: sup1.id,
          warehouseId: whPhIn.id,
          expiryDate: null as string | null,
          receivedDate: formatDate(addDays(today, -10)),
          purchasePrice: "30.0000",
          qtyInMinor: "500.0000",
          label: "TEST-SUP-1 Lot1",
        },
      ];

      const createdLots: any[] = [];
      for (const lotDef of lotDefs) {
        const { label, ...lotData } = lotDef;

        const expiryCondition = lotData.expiryDate === null
          ? sql`${inventoryLots.expiryDate} IS NULL`
          : eq(inventoryLots.expiryDate, lotData.expiryDate);

        const [existing] = await tx.select().from(inventoryLots).where(
          and(
            eq(inventoryLots.itemId, lotData.itemId),
            eq(inventoryLots.warehouseId, lotData.warehouseId),
            expiryCondition,
            eq(inventoryLots.purchasePrice, lotData.purchasePrice),
          )
        );

        if (existing) {
          const [updated] = await tx.update(inventoryLots)
            .set({ qtyInMinor: lotData.qtyInMinor })
            .where(eq(inventoryLots.id, existing.id))
            .returning();
          createdLots.push({ ...updated, label });
        } else {
          const [inserted] = await tx.insert(inventoryLots).values(lotData).returning();
          createdLots.push({ ...inserted, label });
        }
      }

      return {
        warehouses: createdWarehouses.map(w => ({ id: w.id, warehouseCode: w.warehouseCode, nameAr: w.nameAr })),
        items: createdItems.map(i => ({ id: i.id, itemCode: i.itemCode, nameAr: i.nameAr })),
        lots: createdLots.map(l => ({ id: l.id, label: l.label, itemId: l.itemId, warehouseId: l.warehouseId, expiryDate: l.expiryDate, qtyInMinor: l.qtyInMinor })),
      };
    });
  },

  async generateWarehouseTransferJournal(
    this: DatabaseStorage, transferId: string, transfer: StoreTransfer, totalCost: number
  ): Promise<JournalEntry | null> {
    const existingEntries = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "warehouse_transfer"),
        eq(journalEntries.sourceDocumentId, transferId)
      ));
    if (existingEntries.length > 0) return existingEntries[0];

    const [sourceWh] = await db.select().from(warehouses)
      .where(eq(warehouses.id, transfer.sourceWarehouseId));
    const [destWh] = await db.select().from(warehouses)
      .where(eq(warehouses.id, transfer.destinationWarehouseId));

    if (!sourceWh?.glAccountId || !destWh?.glAccountId) {
      console.error("Warehouse transfer journal skipped: warehouses missing GL accounts");
      return null;
    }

    if (sourceWh.glAccountId === destWh.glAccountId) {
      console.log("Warehouse transfer journal skipped: same GL account for both warehouses");
      return null;
    }

    const journalLineData: InsertJournalLine[] = [
      {
        journalEntryId: "",
        lineNumber: 1,
        accountId: destWh.glAccountId,
        debit: String(totalCost.toFixed(2)),
        credit: "0",
        description: `تحويل إلى ${destWh.nameAr}`,
      },
      {
        journalEntryId: "",
        lineNumber: 2,
        accountId: sourceWh.glAccountId,
        debit: "0",
        credit: String(totalCost.toFixed(2)),
        description: `تحويل من ${sourceWh.nameAr}`,
      },
    ];

    return db.transaction(async (tx) => {
      const [period] = await tx.select().from(fiscalPeriods)
        .where(and(
          lte(fiscalPeriods.startDate, transfer.transferDate),
          gte(fiscalPeriods.endDate, transfer.transferDate),
          eq(fiscalPeriods.isClosed, false)
        ))
        .limit(1);

      const entryNumber = await this.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: transfer.transferDate,
        reference: `TRF-${transfer.transferNumber}`,
        description: `قيد تحويل مخزني رقم ${transfer.transferNumber} من ${sourceWh.nameAr} إلى ${destWh.nameAr}`,
        status: "draft",
        periodId: period?.id || null,
        sourceType: "warehouse_transfer",
        sourceDocumentId: transferId,
        totalDebit: String(totalCost.toFixed(2)),
        totalCredit: String(totalCost.toFixed(2)),
      }).returning();

      const linesWithEntryId = journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }));

      await tx.insert(journalLines).values(linesWithEntryId);
      return entry;
    });
  },
};

export default methods;
