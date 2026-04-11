import { db } from "../db";
import { eq, desc, and, gte, lte, sql, or, ilike, asc } from "drizzle-orm";
import {
  items,
  itemFormTypes,
  purchaseTransactions,
  salesTransactions,
  type Item,
  type InsertItem,
  type ItemFormType,
  type ItemWithFormType,
  type PurchaseTransaction,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getItems(this: DatabaseStorage, params: { page?: number; limit?: number; search?: string; category?: string; isToxic?: boolean; formTypeId?: string; isActive?: boolean; minPrice?: number; maxPrice?: number }): Promise<{ items: Item[]; total: number }> {
    const { page = 1, limit = 20, search, category, isToxic, formTypeId, isActive, minPrice, maxPrice } = params;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(items.nameAr, searchPattern),
          ilike(items.nameEn, searchPattern),
          ilike(items.itemCode, searchPattern)
        )
      );
    }

    if (category) {
      conditions.push(eq(items.category, category as "drug" | "supply" | "service"));
    }

    if (isToxic !== undefined) {
      conditions.push(eq(items.isToxic, isToxic));
    }

    if (formTypeId) {
      conditions.push(eq(items.formTypeId, formTypeId));
    }

    if (isActive !== undefined) {
      conditions.push(eq(items.isActive, isActive));
    }

    if (minPrice !== undefined) {
      conditions.push(gte(items.salePriceCurrent, String(minPrice)));
    }

    if (maxPrice !== undefined) {
      conditions.push(lte(items.salePriceCurrent, String(maxPrice)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(items)
      .where(whereClause);

    const itemsList = await db.select()
      .from(items)
      .where(whereClause)
      .orderBy(asc(items.itemCode))
      .limit(limit)
      .offset(offset);

    return {
      items: itemsList,
      total: countResult?.count || 0,
    };
  },

  async getItem(this: DatabaseStorage, id: string): Promise<ItemWithFormType | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return undefined;

    let formType: ItemFormType | undefined;
    if (item.formTypeId) {
      const [ft] = await db.select().from(itemFormTypes).where(eq(itemFormTypes.id, item.formTypeId));
      formType = ft;
    }

    return { ...item, formType };
  },

  async getItemsByIds(this: DatabaseStorage, ids: string[]): Promise<Map<string, Item>> {
    const map = new Map<string, Item>();
    if (ids.length === 0) return map;
    const results = await db.select().from(items).where(sql`${items.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
    for (const item of results) {
      map.set(item.id, item);
    }
    return map;
  },

  async createItem(this: DatabaseStorage, item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning();
    return newItem;
  },

  async updateItem(this: DatabaseStorage, id: string, item: Partial<InsertItem>): Promise<Item | undefined> {
    const [updated] = await db.update(items)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    return updated;
  },

  async deleteItem(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.delete(items).where(eq(items.id, id));
    return true;
  },

  async checkItemUniqueness(this: DatabaseStorage, code?: string, nameAr?: string, nameEn?: string, excludeId?: string): Promise<{ codeUnique: boolean; nameArUnique: boolean; nameEnUnique: boolean }> {
    let codeUnique = true;
    let nameArUnique = true;
    let nameEnUnique = true;

    if (code) {
      const trimmed = code.trim();
      const conditions: any[] = [sql`LOWER(TRIM(${items.itemCode})) = LOWER(${trimmed})`];
      if (excludeId) conditions.push(sql`${items.id} != ${excludeId}`);
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(items).where(and(...conditions));
      codeUnique = Number(result.count) === 0;
    }

    if (nameAr) {
      const trimmed = nameAr.trim();
      const conditions: any[] = [sql`LOWER(TRIM(${items.nameAr})) = LOWER(${trimmed})`];
      if (excludeId) conditions.push(sql`${items.id} != ${excludeId}`);
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(items).where(and(...conditions));
      nameArUnique = Number(result.count) === 0;
    }

    if (nameEn) {
      const trimmed = nameEn.trim();
      const conditions: any[] = [sql`LOWER(TRIM(${items.nameEn})) = LOWER(${trimmed})`];
      if (excludeId) conditions.push(sql`${items.id} != ${excludeId}`);
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(items).where(and(...conditions));
      nameEnUnique = Number(result.count) === 0;
    }

    return { codeUnique, nameArUnique, nameEnUnique };
  },

  async getLastPurchases(this: DatabaseStorage, itemId: string, limit: number = 5, fromDate?: string): Promise<PurchaseTransaction[]> {
    const conditions = [eq(purchaseTransactions.itemId, itemId)];
    if (fromDate) conditions.push(gte(purchaseTransactions.txDate, fromDate));
    return db.select()
      .from(purchaseTransactions)
      .where(and(...conditions))
      .orderBy(desc(purchaseTransactions.txDate))
      .limit(limit);
  },

  async getAverageSales(this: DatabaseStorage, itemId: string, startDate: string, endDate: string): Promise<{ avgPrice: string; totalQty: string; invoiceCount: number }> {
    const [result] = await db.select({
      avgPrice: sql<string>`COALESCE(AVG(${salesTransactions.salePrice}::numeric), 0)::text`,
      totalQty: sql<string>`COALESCE(SUM(${salesTransactions.qty}::numeric), 0)::text`,
      invoiceCount: sql<number>`COUNT(*)::int`,
    })
    .from(salesTransactions)
    .where(and(
      eq(salesTransactions.itemId, itemId),
      gte(salesTransactions.txDate, startDate),
      lte(salesTransactions.txDate, endDate)
    ));

    return {
      avgPrice: result?.avgPrice || "0",
      totalQty: result?.totalQty || "0",
      invoiceCount: result?.invoiceCount || 0,
    };
  },
};

export default methods;
