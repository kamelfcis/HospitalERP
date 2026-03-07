import { db } from "../db";
import { eq, desc, and, gte, lte, sql, or, ilike, asc } from "drizzle-orm";
import {
  items,
  itemFormTypes,
  itemUoms,
  purchaseTransactions,
  salesTransactions,
  departments,
  itemDepartmentPrices,
  inventoryLots,
  inventoryLotMovements,
  itemBarcodes,
  warehouses,
  type Item,
  type InsertItem,
  type ItemFormType,
  type InsertItemFormType,
  type ItemUom,
  type InsertItemUom,
  type ItemWithFormType,
  type PurchaseTransaction,
  type Department,
  type InsertDepartment,
  type ItemDepartmentPrice,
  type InsertItemDepartmentPrice,
  type ItemDepartmentPriceWithDepartment,
  type InventoryLot,
  type InsertInventoryLot,
  type ItemBarcode,
  type InsertItemBarcode,
  type Warehouse,
  type InsertWarehouse,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  // Items
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
      conditions.push(eq(items.category, category as any));
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

  async getItemFormTypes(this: DatabaseStorage): Promise<ItemFormType[]> {
    return db.select().from(itemFormTypes).orderBy(asc(itemFormTypes.sortOrder));
  },

  async createItemFormType(this: DatabaseStorage, formType: InsertItemFormType): Promise<ItemFormType> {
    const [newFormType] = await db.insert(itemFormTypes).values(formType).returning();
    return newFormType;
  },

  async getItemUoms(this: DatabaseStorage): Promise<ItemUom[]> {
    return await db.select().from(itemUoms).where(eq(itemUoms.isActive, true)).orderBy(asc(itemUoms.nameAr));
  },

  async createItemUom(this: DatabaseStorage, data: InsertItemUom): Promise<ItemUom> {
    const [uom] = await db.insert(itemUoms).values(data).returning();
    return uom;
  },

  async getLastPurchases(this: DatabaseStorage, itemId: string, limit: number = 5): Promise<PurchaseTransaction[]> {
    return db.select()
      .from(purchaseTransactions)
      .where(eq(purchaseTransactions.itemId, itemId))
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

  async getDepartments(this: DatabaseStorage): Promise<Department[]> {
    return db.select().from(departments).orderBy(asc(departments.code));
  },

  async getDepartment(this: DatabaseStorage, id: string): Promise<Department | undefined> {
    const [dept] = await db.select().from(departments).where(eq(departments.id, id));
    return dept;
  },

  async createDepartment(this: DatabaseStorage, dept: InsertDepartment): Promise<Department> {
    const [newDept] = await db.insert(departments).values(dept).returning();
    return newDept;
  },

  async updateDepartment(this: DatabaseStorage, id: string, dept: Partial<InsertDepartment>): Promise<Department | undefined> {
    const [updated] = await db.update(departments)
      .set(dept)
      .where(eq(departments.id, id))
      .returning();
    return updated;
  },

  async deleteDepartment(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.delete(departments).where(eq(departments.id, id));
    return true;
  },

  async getItemDepartmentPrices(this: DatabaseStorage, itemId: string): Promise<ItemDepartmentPriceWithDepartment[]> {
    const prices = await db.select()
      .from(itemDepartmentPrices)
      .where(eq(itemDepartmentPrices.itemId, itemId))
      .orderBy(asc(itemDepartmentPrices.createdAt));

    const result: ItemDepartmentPriceWithDepartment[] = [];
    for (const price of prices) {
      const [dept] = await db.select().from(departments).where(eq(departments.id, price.departmentId));
      result.push({
        ...price,
        department: dept,
      });
    }
    return result;
  },

  async createItemDepartmentPrice(this: DatabaseStorage, price: InsertItemDepartmentPrice): Promise<ItemDepartmentPrice> {
    const [newPrice] = await db.insert(itemDepartmentPrices).values(price).returning();
    return newPrice;
  },

  async updateItemDepartmentPrice(this: DatabaseStorage, id: string, price: Partial<InsertItemDepartmentPrice>): Promise<ItemDepartmentPrice | undefined> {
    const [updated] = await db.update(itemDepartmentPrices)
      .set({ ...price, updatedAt: new Date() })
      .where(eq(itemDepartmentPrices.id, id))
      .returning();
    return updated;
  },

  async deleteItemDepartmentPrice(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.delete(itemDepartmentPrices).where(eq(itemDepartmentPrices.id, id));
    return true;
  },

  async getItemPriceForDepartment(this: DatabaseStorage, itemId: string, departmentId: string): Promise<string | null> {
    const [deptPrice] = await db.select()
      .from(itemDepartmentPrices)
      .where(and(
        eq(itemDepartmentPrices.itemId, itemId),
        eq(itemDepartmentPrices.departmentId, departmentId)
      ));

    if (deptPrice && parseFloat(deptPrice.salePrice) > 0) {
      return deptPrice.salePrice;
    }

    return null;
  },

  async getLots(this: DatabaseStorage, itemId: string): Promise<InventoryLot[]> {
    return db.select().from(inventoryLots)
      .where(and(eq(inventoryLots.itemId, itemId), eq(inventoryLots.isActive, true)))
      .orderBy(asc(inventoryLots.expiryDate));
  },

  async getLot(this: DatabaseStorage, lotId: string): Promise<InventoryLot | undefined> {
    const [lot] = await db.select().from(inventoryLots).where(eq(inventoryLots.id, lotId));
    return lot;
  },

  async createLot(this: DatabaseStorage, lot: InsertInventoryLot): Promise<InventoryLot> {
    const [newLot] = await db.insert(inventoryLots).values(lot).returning();
    await db.insert(inventoryLotMovements).values({
      lotId: newLot.id,
      txType: "in" as const,
      qtyChangeInMinor: lot.qtyInMinor || "0",
      unitCost: lot.purchasePrice || "0",
      referenceType: "initial",
      txDate: new Date(),
    } as any);
    return newLot;
  },

  async getFefoPreview(this: DatabaseStorage, itemId: string, requiredQty: number, asOfDate: string): Promise<any> {
    const lots = await db.select().from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        or(
          sql`${inventoryLots.expiryDate} IS NULL`,
          sql`${inventoryLots.expiryDate} >= ${asOfDate}`
        )
      ))
      .orderBy(asc(inventoryLots.expiryDate));

    const allocations: any[] = [];
    let remaining = requiredQty;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = parseFloat(lot.qtyInMinor);
      const allocated = Math.min(available, remaining);
      allocations.push({
        lotId: lot.id,
        expiryDate: lot.expiryDate,
        availableQty: available.toFixed(4),
        allocatedQty: allocated.toFixed(4),
      });
      remaining -= allocated;
    }

    return {
      allocations,
      fulfilled: remaining <= 0,
      shortfall: remaining > 0 ? remaining.toFixed(4) : "0",
    };
  },

  async getItemBarcodes(this: DatabaseStorage, itemId: string): Promise<ItemBarcode[]> {
    return db.select().from(itemBarcodes)
      .where(eq(itemBarcodes.itemId, itemId))
      .orderBy(desc(itemBarcodes.createdAt));
  },

  async createItemBarcode(this: DatabaseStorage, barcode: InsertItemBarcode): Promise<ItemBarcode> {
    const normalized = { ...barcode, barcodeValue: barcode.barcodeValue.trim() };
    const [newBarcode] = await db.insert(itemBarcodes).values(normalized).returning();
    return newBarcode;
  },

  async deactivateBarcode(this: DatabaseStorage, barcodeId: string): Promise<ItemBarcode | undefined> {
    const [updated] = await db.update(itemBarcodes)
      .set({ isActive: false })
      .where(eq(itemBarcodes.id, barcodeId))
      .returning();
    return updated;
  },

  async resolveBarcode(this: DatabaseStorage, barcodeValue: string): Promise<{ found: boolean; itemId?: string; itemCode?: string; nameAr?: string }> {
    const normalized = barcodeValue.trim();
    const [barcode] = await db.select().from(itemBarcodes)
      .where(and(eq(itemBarcodes.barcodeValue, normalized), eq(itemBarcodes.isActive, true)));
    
    if (barcode) {
      const [item] = await db.select({ id: items.id, itemCode: items.itemCode, nameAr: items.nameAr })
        .from(items).where(eq(items.id, barcode.itemId));
      if (item) {
        return { found: true, itemId: item.id, itemCode: item.itemCode, nameAr: item.nameAr };
      }
    }

    const [item] = await db.select({ id: items.id, itemCode: items.itemCode, nameAr: items.nameAr })
      .from(items).where(eq(items.itemCode, normalized));
    if (item) {
      return { found: true, itemId: item.id, itemCode: item.itemCode, nameAr: item.nameAr };
    }

    return { found: false };
  },

  async getWarehouses(this: DatabaseStorage): Promise<Warehouse[]> {
    return db.select().from(warehouses)
      .orderBy(asc(warehouses.warehouseCode));
  },

  async getWarehouse(this: DatabaseStorage, id: string): Promise<Warehouse | undefined> {
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return wh;
  },

  async createWarehouse(this: DatabaseStorage, wh: InsertWarehouse): Promise<Warehouse> {
    const [newWh] = await db.insert(warehouses).values(wh).returning();
    return newWh;
  },

  async updateWarehouse(this: DatabaseStorage, id: string, wh: Partial<InsertWarehouse>): Promise<Warehouse | undefined> {
    const [updated] = await db.update(warehouses)
      .set(wh)
      .where(eq(warehouses.id, id))
      .returning();
    return updated;
  },

  async deleteWarehouse(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.delete(warehouses).where(eq(warehouses.id, id));
    return true;
  },
};

export default methods;
