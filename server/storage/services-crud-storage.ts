import { db } from "../db";
import { eq, and, sql, or, asc, isNotNull, ilike, inArray } from "drizzle-orm";
import {
  services,
  serviceConsumables,
  itemConsumables,
  departments,
  accounts,
  costCenters,
  items,
} from "@shared/schema";
import type {
  Service,
  InsertService,
  ServiceWithDepartment,
  ServiceConsumable,
  ServiceConsumableWithItem,
  ItemConsumable,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";

const servicesCrudMethods = {

  computeInvoiceTotals(this: DatabaseStorage, lines: Record<string, unknown>[], payments: Record<string, unknown>[]): { totalAmount: string; discountAmount: string; netAmount: string; paidAmount: string } {
    let totalAmount = 0;
    let discountAmount = 0;
    for (const line of lines) {
      const qty = parseMoney(line.quantity as string);
      const unitPrice = parseMoney(line.unitPrice as string);
      const lineTotal = qty * unitPrice;
      const lineDiscount = parseMoney(line.discountAmount as string);
      totalAmount += lineTotal;
      discountAmount += lineDiscount;
    }
    const netAmount = totalAmount - discountAmount;
    const paidAmount = payments.reduce((sum: number, p: Record<string, unknown>) => sum + parseMoney(p.amount as string), 0);
    return {
      totalAmount: roundMoney(totalAmount),
      discountAmount: roundMoney(discountAmount),
      netAmount: roundMoney(netAmount),
      paidAmount: roundMoney(paidAmount),
    };
  },

  async getServices(this: DatabaseStorage, params: { search?: string; departmentId?: string; category?: string; active?: string; page?: number; pageSize?: number }): Promise<{ data: ServiceWithDepartment[]; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (params.search) {
      conditions.push(or(ilike(services.code, `%${params.search}%`), ilike(services.nameAr, `%${params.search}%`)));
    }
    if (params.departmentId) {
      conditions.push(eq(services.departmentId, params.departmentId));
    }
    if (params.category) {
      conditions.push(eq(services.category, params.category));
    }
    if (params.active !== undefined && params.active !== '') {
      conditions.push(eq(services.isActive, params.active === 'true'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(services).where(whereClause);
    const total = countResult.count;

    const rows = await db.select({
      service: services,
      department: departments,
      revenueAccount: accounts,
      costCenter: costCenters,
    })
      .from(services)
      .leftJoin(departments, eq(services.departmentId, departments.id))
      .leftJoin(accounts, eq(services.revenueAccountId, accounts.id))
      .leftJoin(costCenters, eq(services.costCenterId, costCenters.id))
      .where(whereClause)
      .orderBy(asc(services.code))
      .limit(pageSize)
      .offset(offset);

    const data: ServiceWithDepartment[] = rows.map((r) => ({
      ...r.service,
      department: r.department || undefined,
      revenueAccount: r.revenueAccount || undefined,
      costCenter: r.costCenter || undefined,
    }));

    return { data, total };
  },

  async getService(this: DatabaseStorage, id: string): Promise<ServiceWithDepartment | null> {
    const [row] = await db.select({
      service: services,
      department: departments,
      revenueAccount: accounts,
      costCenter: costCenters,
    })
      .from(services)
      .leftJoin(departments, eq(services.departmentId, departments.id))
      .leftJoin(accounts, eq(services.revenueAccountId, accounts.id))
      .leftJoin(costCenters, eq(services.costCenterId, costCenters.id))
      .where(eq(services.id, id));
    if (!row) return null;
    return { ...row.service, department: row.department || undefined, revenueAccount: row.revenueAccount || undefined, costCenter: row.costCenter || undefined };
  },

  async getServicesByIds(this: DatabaseStorage, ids: string[]): Promise<Service[]> {
    if (ids.length === 0) return [];
    return db.select().from(services).where(inArray(services.id, ids));
  },

  async createService(this: DatabaseStorage, data: InsertService): Promise<Service> {
    const [row] = await db.insert(services).values(data).returning();
    return row;
  },

  async updateService(this: DatabaseStorage, id: string, data: Partial<InsertService>): Promise<Service | null> {
    const [row] = await db.update(services).set({ ...data, updatedAt: new Date() }).where(eq(services.id, id)).returning();
    return row || null;
  },

  async getServiceCategories(this: DatabaseStorage): Promise<string[]> {
    const rows = await db.selectDistinct({ category: services.category }).from(services).where(isNotNull(services.category));
    return rows.map((r) => r.category).filter(Boolean) as string[];
  },

  async getServiceConsumables(this: DatabaseStorage, serviceId: string): Promise<ServiceConsumableWithItem[]> {
    const rows = await db
      .select({
        id: serviceConsumables.id,
        serviceId: serviceConsumables.serviceId,
        itemId: serviceConsumables.itemId,
        quantity: serviceConsumables.quantity,
        unitLevel: serviceConsumables.unitLevel,
        notes: serviceConsumables.notes,
        itemCode: items.itemCode,
        itemNameAr: items.nameAr,
        itemNameEn: items.nameEn,
        majorUnitName: items.majorUnitName,
        mediumUnitName: items.mediumUnitName,
        minorUnitName: items.minorUnitName,
        majorToMinor: items.majorToMinor,
        mediumToMinor: items.mediumToMinor,
        hasExpiry: items.hasExpiry,
      })
      .from(serviceConsumables)
      .leftJoin(items, eq(serviceConsumables.itemId, items.id))
      .where(eq(serviceConsumables.serviceId, serviceId));

    return rows.map(r => ({
      id: r.id,
      serviceId: r.serviceId,
      itemId: r.itemId,
      quantity: r.quantity,
      unitLevel: r.unitLevel,
      notes: r.notes,
      item: r.itemCode ? {
        id: r.itemId,
        itemCode: r.itemCode,
        nameAr: r.itemNameAr!,
        nameEn: r.itemNameEn,
        majorUnitName: r.majorUnitName,
        mediumUnitName: r.mediumUnitName,
        minorUnitName: r.minorUnitName,
        majorToMinor: r.majorToMinor,
        mediumToMinor: r.mediumToMinor,
        hasExpiry: r.hasExpiry,
        salePriceCurrent: "0",
        availableQtyMinor: "0",
      } as any : undefined,
    }));
  },

  async replaceServiceConsumables(this: DatabaseStorage, serviceId: string, lines: { itemId: string; quantity: string; unitLevel: string; notes?: string | null }[]): Promise<ServiceConsumable[]> {
    await db.delete(serviceConsumables).where(eq(serviceConsumables.serviceId, serviceId));
    if (lines.length === 0) return [];
    const rows = await db.insert(serviceConsumables).values(
      lines.map(l => ({ serviceId, itemId: l.itemId, quantity: l.quantity, unitLevel: l.unitLevel, notes: l.notes || null }))
    ).returning();
    return rows;
  },

  async getItemConsumables(this: DatabaseStorage, itemId: string): Promise<any[]> {
    const consumableItems = items;
    const rows = await db
      .select({
        id: itemConsumables.id,
        itemId: itemConsumables.itemId,
        consumableItemId: itemConsumables.consumableItemId,
        quantity: itemConsumables.quantity,
        unitLevel: itemConsumables.unitLevel,
        notes: itemConsumables.notes,
        nameAr: consumableItems.nameAr,
        nameEn: consumableItems.nameEn,
        itemCode: consumableItems.itemCode,
        majorUnitName: consumableItems.majorUnitName,
        mediumUnitName: consumableItems.mediumUnitName,
        minorUnitName: consumableItems.minorUnitName,
        majorToMinor: consumableItems.majorToMinor,
        mediumToMinor: consumableItems.mediumToMinor,
        hasExpiry: consumableItems.hasExpiry,
      })
      .from(itemConsumables)
      .leftJoin(consumableItems, eq(itemConsumables.consumableItemId, consumableItems.id))
      .where(eq(itemConsumables.itemId, itemId));

    return rows.map(r => ({
      id: r.id,
      itemId: r.itemId,
      consumableItemId: r.consumableItemId,
      quantity: r.quantity,
      unitLevel: r.unitLevel,
      notes: r.notes,
      item: r.itemCode ? {
        id: r.consumableItemId,
        itemCode: r.itemCode,
        nameAr: r.nameAr!,
        nameEn: r.nameEn,
        majorUnitName: r.majorUnitName,
        mediumUnitName: r.mediumUnitName,
        minorUnitName: r.minorUnitName,
        majorToMinor: r.majorToMinor,
        mediumToMinor: r.mediumToMinor,
        hasExpiry: r.hasExpiry,
        salePriceCurrent: "0",
        availableQtyMinor: "0",
      } : undefined,
    }));
  },

  async replaceItemConsumables(
    this: DatabaseStorage,
    itemId: string,
    lines: { consumableItemId: string; quantity: string; unitLevel: string; notes?: string | null }[],
  ): Promise<ItemConsumable[]> {
    await db.delete(itemConsumables).where(eq(itemConsumables.itemId, itemId));
    if (lines.length === 0) return [];
    return db.insert(itemConsumables).values(
      lines.map(l => ({
        itemId,
        consumableItemId: l.consumableItemId,
        quantity: l.quantity,
        unitLevel: l.unitLevel,
        notes: l.notes || null,
      }))
    ).returning();
  },
};

export default servicesCrudMethods;
