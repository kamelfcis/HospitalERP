import { db } from "../db";
import { eq, and, sql, or, ilike, asc } from "drizzle-orm";
import {
  items,
  itemBarcodes,
  inventoryLots,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

export const transfersSearchMethods = {
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
};
