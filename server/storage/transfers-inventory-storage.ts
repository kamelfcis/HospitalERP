import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  items,
  inventoryLots,
  warehouses,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

export const transfersInventoryMethods = {
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
};
