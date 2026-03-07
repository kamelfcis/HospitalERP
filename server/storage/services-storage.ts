import { db } from "../db";
import { eq, and, sql, or, asc, isNotNull, ilike } from "drizzle-orm";
import {
  services,
  serviceConsumables,
  priceLists,
  priceListItems,
  priceAdjustmentsLog,
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
  PriceList,
  InsertPriceList,
  PriceListItem,
  PriceListItemWithService,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";

const methods = {

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

  async getPriceLists(this: DatabaseStorage): Promise<PriceList[]> {
    return db.select().from(priceLists).orderBy(asc(priceLists.code));
  },

  async createPriceList(this: DatabaseStorage, data: InsertPriceList): Promise<PriceList> {
    const [row] = await db.insert(priceLists).values(data).returning();
    return row;
  },

  async updatePriceList(this: DatabaseStorage, id: string, data: Partial<InsertPriceList>): Promise<PriceList | null> {
    const [row] = await db.update(priceLists).set({ ...data, updatedAt: new Date() }).where(eq(priceLists.id, id)).returning();
    return row || null;
  },

  async getPriceListItems(this: DatabaseStorage, priceListId: string, params: { search?: string; departmentId?: string; category?: string; page?: number; pageSize?: number }): Promise<{ data: PriceListItemWithService[]; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [eq(priceListItems.priceListId, priceListId)];
    if (params.search) {
      conditions.push(or(ilike(services.code, `%${params.search}%`), ilike(services.nameAr, `%${params.search}%`)));
    }
    if (params.departmentId) {
      conditions.push(eq(services.departmentId, params.departmentId));
    }
    if (params.category) {
      conditions.push(eq(services.category, params.category));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(priceListItems)
      .innerJoin(services, eq(priceListItems.serviceId, services.id))
      .where(whereClause);
    const total = countResult.count;

    const rows = await db.select({
      item: priceListItems,
      service: services,
      department: departments,
    })
      .from(priceListItems)
      .innerJoin(services, eq(priceListItems.serviceId, services.id))
      .leftJoin(departments, eq(services.departmentId, departments.id))
      .where(whereClause)
      .orderBy(asc(services.code))
      .limit(pageSize)
      .offset(offset);

    const data: PriceListItemWithService[] = rows.map((r) => ({
      ...r.item,
      service: { ...r.service, department: r.department || undefined },
    }));

    return { data, total };
  },

  async upsertPriceListItems(this: DatabaseStorage, priceListId: string, itemsData: { serviceId: string; price: string; minDiscountPct?: string; maxDiscountPct?: string }[]): Promise<void> {
    if (itemsData.length === 0) return;

    const values = itemsData.map((item) => ({
      priceListId,
      serviceId: item.serviceId,
      price: item.price,
      minDiscountPct: item.minDiscountPct || null,
      maxDiscountPct: item.maxDiscountPct || null,
    }));

    await db.insert(priceListItems).values(values).onConflictDoUpdate({
      target: [priceListItems.priceListId, priceListItems.serviceId],
      set: {
        price: sql`excluded.price`,
        minDiscountPct: sql`excluded.min_discount_pct`,
        maxDiscountPct: sql`excluded.max_discount_pct`,
        updatedAt: new Date(),
      },
    });
  },

  async copyPriceList(this: DatabaseStorage, targetListId: string, sourceListId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO price_list_items (id, price_list_id, service_id, price, min_discount_pct, max_discount_pct, created_at, updated_at)
      SELECT gen_random_uuid(), ${targetListId}, service_id, price, min_discount_pct, max_discount_pct, now(), now()
      FROM price_list_items
      WHERE price_list_id = ${sourceListId}
      ON CONFLICT (price_list_id, service_id)
      DO UPDATE SET price = excluded.price, min_discount_pct = excluded.min_discount_pct, max_discount_pct = excluded.max_discount_pct, updated_at = now()
    `);
  },

  _buildBulkAdjustQuery(this: DatabaseStorage, priceListId: string, params: { mode: 'PCT' | 'FIXED'; direction: 'INCREASE' | 'DECREASE'; value: number; departmentId?: string; category?: string; createMissingFromBasePrice?: boolean }) {
    const sign = params.direction === 'INCREASE' ? 1 : -1;
    let newPriceExpr: string;
    if (params.mode === 'PCT') {
      newPriceExpr = `ROUND(old_price + old_price * ${sign} * ${params.value} / 100.0, 2)`;
    } else {
      newPriceExpr = `ROUND(old_price + ${sign} * ${params.value}, 2)`;
    }

    const filterParts: string[] = [];
    if (params.departmentId) {
      filterParts.push(`s.department_id = '${params.departmentId}'`);
    }
    if (params.category) {
      filterParts.push(`s.category = '${params.category}'`);
    }
    const filterWhere = filterParts.length > 0 ? `AND ${filterParts.join(' AND ')}` : '';

    return { newPriceExpr, filterWhere };
  },

  async bulkAdjustPreview(this: DatabaseStorage, priceListId: string, params: { mode: 'PCT' | 'FIXED'; direction: 'INCREASE' | 'DECREASE'; value: number; departmentId?: string; category?: string; createMissingFromBasePrice?: boolean }): Promise<{ affectedCount: number; preview: { serviceCode: string; serviceNameAr: string; oldPrice: string; newPrice: string }[] }> {
    const { newPriceExpr, filterWhere } = this._buildBulkAdjustQuery(priceListId, params);

    let unionPart = '';
    if (params.createMissingFromBasePrice) {
      unionPart = `
        UNION ALL
        SELECT s.code AS service_code, s.name_ar AS service_name_ar, s.base_price::numeric AS old_price, (${newPriceExpr.replace(/old_price/g, 's.base_price::numeric')}) AS new_price
        FROM services s
        WHERE s.is_active = true
          AND NOT EXISTS (SELECT 1 FROM price_list_items pli WHERE pli.price_list_id = '${priceListId}' AND pli.service_id = s.id)
          ${filterWhere}
      `;
    }

    const result = await db.execute(sql.raw(`
      WITH adjusted AS (
        SELECT s.code AS service_code, s.name_ar AS service_name_ar, pli.price::numeric AS old_price, (${newPriceExpr.replace(/old_price/g, 'pli.price::numeric')}) AS new_price
        FROM price_list_items pli
        JOIN services s ON s.id = pli.service_id
        WHERE pli.price_list_id = '${priceListId}'
          ${filterWhere}
        ${unionPart}
      )
      SELECT service_code, service_name_ar, old_price::text, new_price::text, count(*) OVER() AS total_count
      FROM adjusted
      ORDER BY service_code
      LIMIT 20
    `));

    const rows = result.rows as Array<Record<string, unknown>>;
    const affectedCount = rows.length > 0 ? parseInt(rows[0].total_count as string) : 0;
    const preview = rows.map((r: Record<string, unknown>) => ({
      serviceCode: r.service_code as string,
      serviceNameAr: r.service_name_ar as string,
      oldPrice: r.old_price as string,
      newPrice: r.new_price as string,
    }));

    return { affectedCount, preview };
  },

  async bulkAdjustApply(this: DatabaseStorage, priceListId: string, params: { mode: 'PCT' | 'FIXED'; direction: 'INCREASE' | 'DECREASE'; value: number; departmentId?: string; category?: string; createMissingFromBasePrice?: boolean }): Promise<{ affectedCount: number }> {
    const { newPriceExpr, filterWhere } = this._buildBulkAdjustQuery(priceListId, params);

    return await db.transaction(async (tx) => {
      const negativeCheck = await tx.execute(sql.raw(`
        SELECT count(*) AS cnt FROM (
          SELECT (${newPriceExpr.replace(/old_price/g, 'pli.price::numeric')}) AS new_price
          FROM price_list_items pli
          JOIN services s ON s.id = pli.service_id
          WHERE pli.price_list_id = '${priceListId}'
            ${filterWhere}
          ${params.createMissingFromBasePrice ? `
          UNION ALL
          SELECT (${newPriceExpr.replace(/old_price/g, 's.base_price::numeric')}) AS new_price
          FROM services s
          WHERE s.is_active = true
            AND NOT EXISTS (SELECT 1 FROM price_list_items pli2 WHERE pli2.price_list_id = '${priceListId}' AND pli2.service_id = s.id)
            ${filterWhere}
          ` : ''}
        ) sub WHERE sub.new_price < 0
      `));

      const negCount = parseInt((negativeCheck.rows as Array<Record<string, unknown>>)[0].cnt as string);
      if (negCount > 0) {
        throw new Error(`التعديل سيؤدي إلى أسعار سالبة لـ ${negCount} خدمة. يُرجى تقليل القيمة.`);
      }

      const updateResult = await tx.execute(sql.raw(`
        UPDATE price_list_items pli
        SET price = GREATEST(0, (${newPriceExpr.replace(/old_price/g, 'pli.price::numeric')})),
            updated_at = now()
        FROM services s
        WHERE s.id = pli.service_id
          AND pli.price_list_id = '${priceListId}'
          ${filterWhere}
      `));

      let updatedCount = (updateResult as any).rowCount || 0;

      if (params.createMissingFromBasePrice) {
        const insertResult = await tx.execute(sql.raw(`
          INSERT INTO price_list_items (id, price_list_id, service_id, price, created_at, updated_at)
          SELECT gen_random_uuid(), '${priceListId}', s.id, GREATEST(0, (${newPriceExpr.replace(/old_price/g, 's.base_price::numeric')})), now(), now()
          FROM services s
          WHERE s.is_active = true
            AND NOT EXISTS (SELECT 1 FROM price_list_items pli WHERE pli.price_list_id = '${priceListId}' AND pli.service_id = s.id)
            ${filterWhere}
        `));
        updatedCount += (insertResult as any).rowCount || 0;
      }

      await tx.insert(priceAdjustmentsLog).values({
        priceListId,
        actionType: params.mode,
        direction: params.direction,
        value: params.value.toString(),
        filterDepartmentId: params.departmentId || null,
        filterCategory: params.category || null,
        affectedCount: updatedCount,
      });

      return { affectedCount: updatedCount };
    });
  },
};

export default methods;
