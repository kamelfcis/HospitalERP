/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Invoicing Storage — طبقة تخزين الفوترة
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  This module contains all database operations related to invoicing:
 *  Services, Service Consumables, Price Lists, Price List Items,
 *  Bulk Price Adjustments, Sales Invoices (with FEFO stock, journal generation),
 *  Patient Invoices (with distribution), Sales Returns, and computeInvoiceTotals.
 *
 *  يحتوي هذا الملف على جميع عمليات قاعدة البيانات المتعلقة بالفوترة:
 *  الخدمات، مستهلكات الخدمات، قوائم الأسعار، بنود قوائم الأسعار،
 *  تعديل الأسعار الجماعي، فواتير المبيعات (مع FEFO والقيود المحاسبية)،
 *  فواتير المرضى (مع التوزيع)، مرتجعات المبيعات، وحساب إجماليات الفواتير.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { eq, desc, and, sql, or, asc, gte, lte, isNull, isNotNull, ilike } from "drizzle-orm";
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
  warehouses,
  users,
  salesInvoiceHeaders,
  salesInvoiceLines,
  salesTransactions,
  inventoryLots,
  inventoryLotMovements,
  stockMovementHeaders,
  stockMovementAllocations,
  journalEntries,
  journalLines,
  fiscalPeriods,
  accountMappings,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  auditLog,
  itemBarcodes,
  purchaseTransactions,
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
  SalesInvoiceHeader,
  SalesInvoiceLine,
  SalesInvoiceWithDetails,
  SalesInvoiceLineWithItem,
  PatientInvoiceHeader,
  PatientInvoiceLine,
  PatientInvoicePayment,
  PatientInvoiceWithDetails,
  JournalEntry,
  InsertJournalLine,
  AccountMapping,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, roundQty, parseMoney } from "../finance-helpers";

const methods = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  computeInvoiceTotals — حساب إجماليات الفاتورة
  // ═══════════════════════════════════════════════════════════════════════════

  computeInvoiceTotals(this: DatabaseStorage, lines: any[], payments: any[]): { totalAmount: string; discountAmount: string; netAmount: string; paidAmount: string } {
    let totalAmount = 0;
    let discountAmount = 0;
    for (const line of lines) {
      const qty = parseMoney(line.quantity);
      const unitPrice = parseMoney(line.unitPrice);
      const lineTotal = qty * unitPrice;
      const lineDiscount = parseMoney(line.discountAmount);
      totalAmount += lineTotal;
      discountAmount += lineDiscount;
    }
    const netAmount = totalAmount - discountAmount;
    const paidAmount = payments.reduce((sum: number, p: any) => sum + parseMoney(p.amount), 0);
    return {
      totalAmount: roundMoney(totalAmount),
      discountAmount: roundMoney(discountAmount),
      netAmount: roundMoney(netAmount),
      paidAmount: roundMoney(paidAmount),
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Services — الخدمات
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  Service Consumables — مستهلكات الخدمات
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  Price Lists — قوائم الأسعار
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  Price List Items — بنود قوائم الأسعار
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  Bulk Adjustment — تعديل الأسعار الجماعي
  // ═══════════════════════════════════════════════════════════════════════════

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

    const rows = result.rows as any[];
    const affectedCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const preview = rows.map((r: any) => ({
      serviceCode: r.service_code,
      serviceNameAr: r.service_name_ar,
      oldPrice: r.old_price,
      newPrice: r.new_price,
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

      const negCount = parseInt((negativeCheck.rows as any[])[0].cnt);
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  Sales Invoices — فواتير المبيعات
  // ═══════════════════════════════════════════════════════════════════════════

  async getNextSalesInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(salesInvoiceHeaders);
    return (result?.max || 0) + 1;
  },

  async getSalesInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; search?: string; pharmacistId?: string; warehouseId?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number; totals: { subtotal: number; discountValue: number; netTotal: number }}> {
    const conditions: any[] = [];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(salesInvoiceHeaders.status, filters.status as any));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${salesInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);
    if (filters.customerType && filters.customerType !== "all") conditions.push(eq(salesInvoiceHeaders.customerType, filters.customerType as any));
    if (filters.pharmacistId && filters.pharmacistId !== "all") conditions.push(eq(salesInvoiceHeaders.createdBy, filters.pharmacistId));
    if (filters.warehouseId && filters.warehouseId !== "all") conditions.push(eq(salesInvoiceHeaders.warehouseId, filters.warehouseId));
    if (filters.search) {
      const searchTerm = filters.search.replace(/^SI-/i, '').trim();
      conditions.push(or(
        ilike(salesInvoiceHeaders.customerName, `%${filters.search}%`),
        sql`${salesInvoiceHeaders.invoiceNumber}::text LIKE ${`%${searchTerm}%`}`
      ));
    }

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // count + totals in one query
    const [agg] = await db.select({
      count: sql<number>`count(*)`,
      subtotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.subtotal}::numeric), 0)`,
      discountValue: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.discountValue}::numeric), 0)`,
      netTotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.netTotal}::numeric), 0)`,
    }).from(salesInvoiceHeaders).where(whereClause);

    // main query: JOIN warehouse + user + line count
    const rows = await db.select({
      h: salesInvoiceHeaders,
      warehouseNameAr: warehouses.nameAr,
      pharmacistName: users.fullName,
      itemCount: sql<number>`COUNT(DISTINCT ${salesInvoiceLines.id})`,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .leftJoin(users, eq(salesInvoiceHeaders.createdBy, users.id))
    .leftJoin(salesInvoiceLines, eq(salesInvoiceLines.invoiceId, salesInvoiceHeaders.id))
    .where(whereClause)
    .groupBy(salesInvoiceHeaders.id, warehouses.nameAr, users.fullName)
    .orderBy(desc(salesInvoiceHeaders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

    const data = rows.map(r => ({
      ...r.h,
      warehouse: r.warehouseNameAr ? { nameAr: r.warehouseNameAr } : undefined,
      pharmacistName: r.pharmacistName || null,
      itemCount: Number(r.itemCount) || 0,
    }));

    return {
      data,
      total: Number(agg.count),
      totals: {
        subtotal: Number(agg.subtotal),
        discountValue: Number(agg.discountValue),
        netTotal: Number(agg.netTotal),
      },
    };
  },

  async getSalesInvoice(this: DatabaseStorage, id: string): Promise<SalesInvoiceWithDetails | undefined> {
    const [h] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    if (!h) return undefined;
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(salesInvoiceLines)
      .where(eq(salesInvoiceLines.invoiceId, h.id))
      .orderBy(asc(salesInvoiceLines.lineNo));
    const linesWithItems: SalesInvoiceLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    return { ...h, warehouse: wh, lines: linesWithItems };
  },

  async expandLinesFEFO(this: DatabaseStorage, tx: any, warehouseId: string, rawLines: any[]): Promise<any[]> {
    const expanded: any[] = [];
    for (const line of rawLines) {
      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
      if (!item || !item.hasExpiry || line.expiryMonth || line.expiryYear) {
        expanded.push(line);
        continue;
      }

      let totalMinor = parseFloat(line.qty) || 0;
      if (line.unitLevel === "major" || !line.unitLevel) {
        totalMinor *= parseFloat(item.majorToMinor || "1") || 1;
      } else if (line.unitLevel === "medium") {
        const m2m = parseFloat(item.mediumToMinor || "0");
        const effectiveMediumToMinor = m2m > 0 ? m2m : (parseFloat(item.majorToMinor || "1") || 1) / (parseFloat(item.majorToMedium || "1") || 1);
        totalMinor *= effectiveMediumToMinor;
      }

      const lots = await tx.select().from(inventoryLots)
        .where(and(
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, warehouseId),
          eq(inventoryLots.isActive, true),
          sql`${inventoryLots.qtyInMinor}::numeric > 0`
        ))
        .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth));

      let remaining = totalMinor;
      const beforeLen = expanded.length;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const available = parseFloat(lot.qtyInMinor);
        const take = Math.min(available, remaining);

        expanded.push({
          ...line,
          unitLevel: "minor",
          qty: String(take),
          salePrice: line.salePrice,
          expiryMonth: lot.expiryMonth,
          expiryYear: lot.expiryYear,
          lotId: lot.id,
        });
        remaining -= take;
      }

      if (expanded.length === beforeLen || remaining > 0) {
        if (remaining === totalMinor) {
          expanded.push(line);
        }
      }
    }
    return expanded;
  },

  async createSalesInvoice(this: DatabaseStorage, header: any, lines: any[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const nextNum = await this.getNextSalesInvoiceNumber();

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId, lines);

      let subtotal = 0;
      const processedLines: { line: any; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty) || 0;
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));

        let salePrice = parseFloat(line.salePrice) || 0;
        if (item) {
          const masterPrice = parseFloat(item.salePriceCurrent || "0") || 0;
          const majorToMedium = parseFloat(item.majorToMedium || "0") || 0;
          const majorToMinor  = parseFloat(item.majorToMinor  || "0") || 0;
          const mediumToMinor = parseFloat(item.mediumToMinor || "0") || 0;
          if (line.unitLevel === "medium") {
            if (majorToMedium > 0) {
              salePrice = masterPrice / majorToMedium;
            } else if (majorToMinor > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMinor / mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else if (line.unitLevel === "minor") {
            if (majorToMinor > 0) {
              salePrice = masterPrice / majorToMinor;
            } else if (majorToMedium > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMedium * mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else {
            salePrice = masterPrice;
          }
        }

        let qtyInMinor = qty;
        if (line.unitLevel !== "minor") {
          if (item) {
            if (line.unitLevel === "medium") {
              const m2m = parseFloat(item.mediumToMinor || "0");
              const conv = m2m > 0 ? m2m : (parseFloat(item.majorToMinor || "1") || 1) / (parseFloat(item.majorToMedium || "1") || 1);
              qtyInMinor = qty * conv;
            } else {
              const conv = parseFloat(item.majorToMinor || "1") || 1;
              qtyInMinor = qty * conv;
            }
          }
        }

        const lineTotal = qty * salePrice;
        subtotal += lineTotal;
        processedLines.push({ line, qty, salePrice, qtyInMinor, lineTotal });
      }

      const discountPercent = parseFloat(header.discountPercent) || 0;
      const discountValue = parseFloat(header.discountValue) || 0;
      const discountType = header.discountType || "percent";
      let actualDiscount = 0;
      if (discountType === "percent") {
        actualDiscount = subtotal * (discountPercent / 100);
      } else {
        actualDiscount = discountValue;
      }
      const netTotal = subtotal - actualDiscount;

      let pharmacyId = header.pharmacyId || null;
      if (!pharmacyId && header.warehouseId) {
        const [wh] = await tx.select({ pharmacyId: warehouses.pharmacyId }).from(warehouses).where(eq(warehouses.id, header.warehouseId));
        if (wh?.pharmacyId) pharmacyId = wh.pharmacyId;
      }

      const [invoice] = await tx.insert(salesInvoiceHeaders).values({
        invoiceNumber: nextNum,
        invoiceDate: header.invoiceDate,
        warehouseId: header.warehouseId,
        pharmacyId,
        customerType: header.customerType || "cash",
        customerName: header.customerName || null,
        contractCompany: header.contractCompany || null,
        status: "draft",
        subtotal: roundMoney(subtotal),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: roundMoney(netTotal),
        notes: header.notes || null,
        clinicOrderId: header.clinicOrderId || null,
      }).returning();

      for (let i = 0; i < processedLines.length; i++) {
        const { line, qty, salePrice, qtyInMinor, lineTotal } = processedLines[i];

        await tx.insert(salesInvoiceLines).values({
          invoiceId: invoice.id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null,
        });
      }

      return invoice;
    });
  },

  async updateSalesInvoice(this: DatabaseStorage, id: string, header: any, lines: any[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      await tx.delete(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId || invoice.warehouseId, lines);

      let subtotal = 0;
      const processedLines: { line: any; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty) || 0;
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));

        let salePrice = parseFloat(line.salePrice) || 0;
        if (item) {
          const masterPrice = parseFloat(item.salePriceCurrent || "0") || 0;
          const majorToMedium = parseFloat(item.majorToMedium || "0") || 0;
          const majorToMinor  = parseFloat(item.majorToMinor  || "0") || 0;
          const mediumToMinor = parseFloat(item.mediumToMinor || "0") || 0;
          if (line.unitLevel === "medium") {
            if (majorToMedium > 0) {
              salePrice = masterPrice / majorToMedium;
            } else if (majorToMinor > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMinor / mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else if (line.unitLevel === "minor") {
            if (majorToMinor > 0) {
              salePrice = masterPrice / majorToMinor;
            } else if (majorToMedium > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMedium * mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else {
            salePrice = masterPrice;
          }
        }

        let qtyInMinor = qty;
        if (line.unitLevel !== "minor") {
          if (item) {
            if (line.unitLevel === "medium") {
              const m2m = parseFloat(item.mediumToMinor || "0");
              const conv = m2m > 0 ? m2m : (parseFloat(item.majorToMinor || "1") || 1) / (parseFloat(item.majorToMedium || "1") || 1);
              qtyInMinor = qty * conv;
            } else {
              const conv = parseFloat(item.majorToMinor || "1") || 1;
              qtyInMinor = qty * conv;
            }
          }
        }

        const lineTotal = qty * salePrice;
        subtotal += lineTotal;
        processedLines.push({ line, qty, salePrice, qtyInMinor, lineTotal });
      }

      for (let i = 0; i < processedLines.length; i++) {
        const { line, qty, salePrice, qtyInMinor, lineTotal } = processedLines[i];

        await tx.insert(salesInvoiceLines).values({
          invoiceId: id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null,
        });
      }

      const discountPercent = parseFloat(header.discountPercent) || 0;
      const discountValue = parseFloat(header.discountValue) || 0;
      const discountType = header.discountType || invoice.discountType || "percent";
      let actualDiscount = 0;
      if (discountType === "percent") {
        actualDiscount = subtotal * (discountPercent / 100);
      } else {
        actualDiscount = discountValue;
      }
      const netTotal = subtotal - actualDiscount;

      let pharmacyId = header.pharmacyId || invoice.pharmacyId || null;
      const effectiveWarehouseId = header.warehouseId || invoice.warehouseId;
      if (header.warehouseId && header.warehouseId !== invoice.warehouseId) {
        const [wh] = await tx.select({ pharmacyId: warehouses.pharmacyId }).from(warehouses).where(eq(warehouses.id, header.warehouseId));
        if (wh?.pharmacyId) pharmacyId = wh.pharmacyId;
      }

      await tx.update(salesInvoiceHeaders).set({
        invoiceDate: header.invoiceDate || invoice.invoiceDate,
        warehouseId: effectiveWarehouseId,
        pharmacyId,
        customerType: header.customerType || invoice.customerType,
        customerName: header.customerName !== undefined ? header.customerName : invoice.customerName,
        contractCompany: header.contractCompany !== undefined ? header.contractCompany : invoice.contractCompany,
        subtotal: roundMoney(subtotal),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: roundMoney(netTotal),
        notes: header.notes !== undefined ? header.notes : invoice.notes,
        updatedAt: new Date(),
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });
  },

  async allocateStockInTx(
    this: DatabaseStorage,
    tx: any,
    params: {
      operationType: string;
      referenceType: string;
      referenceId: string;
      warehouseId: string;
      lines: Array<{
        lineIdx: number;
        itemId: string;
        qtyMinor: number;
        hasExpiry: boolean;
        expiryMonth?: number | null;
        expiryYear?: number | null;
      }>;
      createdBy?: string;
    }
  ): Promise<{ movementHeaderId: string; lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> }> {
    const { operationType, referenceType, referenceId, warehouseId, lines, createdBy } = params;

    // Idempotency: if a movement header already exists for this reference, return it
    const existingResult = await tx.execute(
      sql`SELECT id FROM stock_movement_headers WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} LIMIT 1`
    );
    if (existingResult.rows?.length > 0) {
      const movementHeaderId = (existingResult.rows[0] as any).id as string;
      const allocRows = await tx.execute(
        sql`SELECT alloc_key, cost_allocated FROM stock_movement_allocations WHERE movement_header_id = ${movementHeaderId}`
      );
      const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = lines.map(l => ({
        lineIdx: l.lineIdx,
        itemId: l.itemId,
        totalCost: allocRows.rows
          .filter((r: any) => r.alloc_key.startsWith(`line:${l.lineIdx}:`))
          .reduce((s: number, r: any) => s + parseFloat(r.cost_allocated), 0),
      }));
      return { movementHeaderId, lineResults };
    }

    // Insert movement header
    const [movHeader] = await tx.insert(stockMovementHeaders).values({
      operationType,
      referenceType,
      referenceId,
      warehouseId,
      totalCost: "0",
      status: "posted",
      createdBy: createdBy || null,
    }).returning();
    const movementHeaderId = movHeader.id;

    const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = [];
    let movementTotalCost = 0;

    for (const line of lines) {
      const { lineIdx, itemId, qtyMinor, hasExpiry, expiryMonth, expiryYear } = line;
      if (qtyMinor <= 0) {
        lineResults.push({ lineIdx, itemId, totalCost: 0 });
        continue;
      }

      // Build FOR UPDATE lot query — FEFO if has expiry, FIFO (receivedDate ASC) otherwise
      const specificExpiry = hasExpiry && expiryMonth && expiryYear;
      const lotsResult = await tx.execute(
        specificExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                  AND expiry_month = ${expiryMonth}
                  AND expiry_year = ${expiryYear}
                ORDER BY expiry_year ASC, expiry_month ASC, received_date ASC
                FOR UPDATE`
          : hasExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
                FOR UPDATE`
          : sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY received_date ASC, created_at ASC
                FOR UPDATE`
      );
      const lots = lotsResult.rows as any[];

      let remaining = qtyMinor;
      let lotSeq = 0;
      const rawAllocs: Array<{ lotId: string; allocKey: string; qty: number; unitCost: number; rawCost: number }> = [];

      for (const lot of lots) {
        if (remaining <= 0.00005) break;
        const available = parseFloat(lot.qty_in_minor);
        const deduct = Math.min(available, remaining);
        const unitCostNum = parseFloat(lot.purchase_price);

        rawAllocs.push({
          lotId: lot.id,
          allocKey: `line:${lineIdx}:lot:${lot.id}:seq:${lotSeq}`,
          qty: deduct,
          unitCost: unitCostNum,
          rawCost: deduct * unitCostNum,
        });

        // Deduct from lot (raw SQL avoids floating-point string conversion issues)
        await tx.execute(
          sql`UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - ${deduct}, updated_at = NOW() WHERE id = ${lot.id}`
        );

        // Record lot movement
        await tx.insert(inventoryLotMovements).values({
          lotId: lot.id,
          warehouseId,
          txType: "out",
          qtyChangeInMinor: String(-deduct),
          unitCost: String(unitCostNum),
          referenceType,
          referenceId,
        });

        remaining -= deduct;
        lotSeq++;
      }

      // Prevent negative stock
      if (remaining > 0.00005) {
        const itemRow = await tx.execute(sql`SELECT name_ar FROM items WHERE id = ${itemId} LIMIT 1`);
        const nameAr = (itemRow.rows[0] as any)?.name_ar || itemId;
        throw new Error(`رصيد غير كاف للصنف "${nameAr}" - النقص: ${remaining.toFixed(4)}`);
      }

      // HALF_UP cost allocation — last absorbs delta so sum == totalCostRounded exactly
      const totalRawCost = rawAllocs.reduce((s, a) => s + a.rawCost, 0);
      const totalCostRounded = parseFloat(roundMoney(totalRawCost));
      let allocatedSoFar = 0;

      for (let i = 0; i < rawAllocs.length; i++) {
        const a = rawAllocs[i];
        const isLast = i === rawAllocs.length - 1;
        const costAllocated = isLast
          ? parseFloat((totalCostRounded - allocatedSoFar).toFixed(2))
          : parseFloat(roundMoney(a.rawCost));

        const sourceId = `${movementHeaderId}:${referenceId}:${a.allocKey}`;

        await tx.insert(stockMovementAllocations).values({
          movementHeaderId,
          lotId: a.lotId,
          allocKey: a.allocKey,
          qtyAllocatedMinor: String(a.qty),
          unitCost: String(a.unitCost),
          costAllocated: String(costAllocated),
          sourceType: "STOCK_MOVEMENT_ALLOC",
          sourceId,
        });

        allocatedSoFar += costAllocated;
      }

      lineResults.push({ lineIdx, itemId, totalCost: totalCostRounded });
      movementTotalCost += totalCostRounded;
    }

    // Stamp total cost on movement header
    await tx.update(stockMovementHeaders).set({
      totalCost: roundMoney(movementTotalCost),
    }).where(eq(stockMovementHeaders.id, movementHeaderId));

    return { movementHeaderId, lineResults };
  },

  /*
   * finalizeSalesInvoice — اعتماد فاتورة المبيعات
   * ─────────────────────────────────────────────
   * عملية معقدة تتم داخل transaction واحدة لضمان تكامل البيانات:
   *
   * المراحل (Phases):
   * 1. قفل الفاتورة (FOR UPDATE) ومنع التعديل المتزامن
   * 2. جمع بيانات الأصناف والتحقق من الصلاحية (لا يمكن بيع صنف منتهي)
   * 3. خصم الكميات من المخزون بنظام FEFO (الأقرب انتهاءً يُصرف أولاً)
   *    - يتم قفل سجلات المخزون (FOR UPDATE) لمنع التعارض
   *    - إذا الكمية المطلوبة أكبر من المتاح → خطأ ولن تُعتمد الفاتورة
   * 4. حساب تكلفة المبيعات (COGS) بالتكلفة المرجحة من الدفعات
   * 5. إعادة حساب الإجمالي والخصم والضريبة server-side (لا نثق بالعميل)
   * 6. تسجيل كل حركة مخزون في sales_transactions
   * 7. تحديث حالة الفاتورة إلى "finalized"
   *
   * بعد نجاح الـ transaction:
   * - يتم محاولة إنشاء قيد محاسبي (journal entry) تلقائي
   * - لو فشل القيد (بسبب عدم ربط الحسابات) → الفاتورة تبقى معتمدة
   *   لكن journal_status = 'failed' وسيُعاد المحاولة كل 5 دقائق
   */
  async finalizeSalesInvoice(this: DatabaseStorage, id: string): Promise<SalesInvoiceHeader> {
    let cogsDrugs = 0;
    let cogsSupplies = 0;
    let revenueDrugs = 0;
    let revenueSupplies = 0;

    const finalResult = await db.transaction(async (tx) => {
      // خطوة 1: قفل الفاتورة — FOR UPDATE يمنع أي عملية أخرى من تعديلها
      const lockResult = await tx.execute(sql`SELECT * FROM sales_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("الفاتورة غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");

      const lines = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
      if (lines.length === 0) throw new Error("لا يمكن اعتماد فاتورة بدون أصناف");

      // خطوة 2: جمع بيانات الأصناف والتحقق من الصلاحية
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const itemMap: Record<string, any> = {};
      const stockLines: Array<{
        lineIdx: number; itemId: string; qtyMinor: number;
        hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
      }> = [];

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        let item = itemMap[line.itemId];
        if (!item) {
          const [fetched] = await tx.select().from(items).where(eq(items.id, line.itemId));
          if (!fetched) throw new Error(`الصنف غير موجود: ${line.itemId}`);
          item = fetched;
          itemMap[line.itemId] = item;
        }

        if (item.category === "service") {
          revenueDrugs += parseFloat(line.lineTotal);
          continue;
        }

        if (item.hasExpiry && !line.expiryMonth) {
          throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية`);
        }
        if (item.hasExpiry && line.expiryMonth && line.expiryYear) {
          if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
            throw new Error(`الصنف "${item.nameAr}" - لا يمكن بيع دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
          }
        }

        stockLines.push({
          lineIdx: li,
          itemId: line.itemId,
          qtyMinor: parseFloat(line.qtyInMinor),
          hasExpiry: !!item.hasExpiry,
          expiryMonth: line.expiryMonth,
          expiryYear: line.expiryYear,
        });
      }

      // Phase 2: allocate stock with engine (FOR UPDATE locks, FEFO/FIFO, idempotent allocs)
      const { lineResults } = await this.allocateStockInTx(tx, {
        operationType: "sales_finalize",
        referenceType: "sales_invoice",
        referenceId: id,
        warehouseId: invoice.warehouseId,
        lines: stockLines,
      });

      // Phase 3: accumulate COGS by category + insert sales transactions
      for (const lr of lineResults) {
        const item = itemMap[lr.itemId];
        const line = lines[lr.lineIdx];
        const lineRevenue = parseFloat(line.lineTotal);

        if (item.category === "drug") {
          cogsDrugs += lr.totalCost;
          revenueDrugs += lineRevenue;
        } else if (item.category === "supply") {
          cogsSupplies += lr.totalCost;
          revenueSupplies += lineRevenue;
        } else {
          cogsDrugs += lr.totalCost;
          revenueDrugs += lineRevenue;
        }

        await tx.insert(salesTransactions).values({
          itemId: line.itemId,
          txDate: invoice.invoiceDate,
          qty: line.qtyInMinor,
          unitLevel: "minor",
          salePrice: line.salePrice,
          total: line.lineTotal,
        });
      }

      let journalStatus: string = "pending";
      let journalError: string | null = null;

      try {
        await tx.execute(sql`SAVEPOINT journal_attempt`);
        const journalResult = await this.generateSalesInvoiceJournalInTx(tx, id, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies);
        if (journalResult) {
          await tx.execute(sql`RELEASE SAVEPOINT journal_attempt`);
          journalStatus = "posted";
        } else {
          await tx.execute(sql`RELEASE SAVEPOINT journal_attempt`);
          journalStatus = "posted";
        }
      } catch (journalErr: any) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT journal_attempt`);
        journalStatus = "failed";
        journalError = journalErr.message || "خطأ غير معروف في إنشاء القيد المحاسبي";
        console.error(`[JOURNAL_SAFETY] Sales invoice ${id} finalized but journal failed:`, journalErr.message);
      }

      await tx.update(salesInvoiceHeaders).set({
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
        journalStatus,
        journalError,
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });

    return finalResult;
  },

  async regenerateJournalForInvoice(this: DatabaseStorage, invoiceId: string): Promise<JournalEntry | null> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!invoice || invoice.status !== "finalized") return null;
    
    const lines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, invoiceId));
    let cogsDrugs = 0, cogsSupplies = 0, revenueDrugs = 0, revenueSupplies = 0;
    
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      if (!item) continue;
      const lineRevenue = parseFloat(line.lineTotal);
      if (item.category === "service") {
        revenueDrugs += lineRevenue;
        continue;
      }
      
      const movements = await db.select().from(inventoryLotMovements)
        .where(and(
          eq(inventoryLotMovements.referenceType, "sales_invoice"),
          eq(inventoryLotMovements.referenceId, invoiceId)
        ));
      
      let lineCost = 0;
      for (const mov of movements) {
        const [lot] = await db.select().from(inventoryLots).where(eq(inventoryLots.id, mov.lotId));
        if (lot && lot.itemId === line.itemId) {
          lineCost += Math.abs(parseFloat(mov.qtyChangeInMinor)) * parseFloat(mov.unitCost);
        }
      }
      
      if (item.category === "drug") {
        cogsDrugs += lineCost;
        revenueDrugs += lineRevenue;
      } else if (item.category === "supply") {
        cogsSupplies += lineCost;
        revenueSupplies += lineRevenue;
      } else {
        cogsDrugs += lineCost;
        revenueDrugs += lineRevenue;
      }
    }
    
    try {
      const entry = await this.generateSalesInvoiceJournal(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies);
      if (entry) {
        await db.update(salesInvoiceHeaders).set({
          journalStatus: "posted",
          journalError: null,
          journalRetries: sql`COALESCE(journal_retries, 0) + 1`,
        }).where(eq(salesInvoiceHeaders.id, invoiceId));
      }
      return entry;
    } catch (err: any) {
      await db.update(salesInvoiceHeaders).set({
        journalStatus: "failed",
        journalError: err.message,
        journalRetries: sql`COALESCE(journal_retries, 0) + 1`,
      }).where(eq(salesInvoiceHeaders.id, invoiceId));
      throw err;
    }
  },

  async retryFailedJournals(this: DatabaseStorage): Promise<{ attempted: number, succeeded: number, failed: number }> {
    const failedInvoices = await db.select({
      id: salesInvoiceHeaders.id,
      invoiceNumber: salesInvoiceHeaders.invoiceNumber,
      journalRetries: salesInvoiceHeaders.journalRetries,
    }).from(salesInvoiceHeaders)
      .where(and(
        eq(salesInvoiceHeaders.status, "finalized"),
        eq(salesInvoiceHeaders.journalStatus, "failed")
      ))
      .limit(20);

    let succeeded = 0, failed = 0;

    for (const inv of failedInvoices) {
      try {
        const entry = await this.regenerateJournalForInvoice(inv.id);
        if (entry) {
          succeeded++;
          console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal posted successfully (attempt ${(inv.journalRetries || 0) + 1})`);
        } else {
          const existing = await db.select().from(journalEntries)
            .where(and(
              eq(journalEntries.sourceType, "sales_invoice"),
              eq(journalEntries.sourceDocumentId, inv.id)
            )).limit(1);
          if (existing.length > 0) {
            await db.update(salesInvoiceHeaders).set({
              journalStatus: "posted",
              journalError: null,
            }).where(eq(salesInvoiceHeaders.id, inv.id));
            succeeded++;
            console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal already exists, marked as posted`);
          } else {
            failed++;
            console.error(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - could not generate journal (null result)`);
          }
        }
      } catch (err: any) {
        failed++;
        console.error(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - still failing: ${err.message}`);
      }
    }

    return { attempted: failedInvoices.length, succeeded, failed };
  },

  async buildSalesJournalLines(
    this: DatabaseStorage,
    invoiceId: string, invoice: any, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number,
    queryCtx: any = db
  ): Promise<{ journalLineData: InsertJournalLine[], totalDebits: number, totalCredits: number } | null> {
    const existingEntries = await queryCtx.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ));
    if (existingEntries.length > 0) return null;

    const mappings = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId);
    const mappingMap = new Map<string, AccountMapping>();
    for (const m of mappings) {
      mappingMap.set(m.lineType, m);
    }

    const discountValue = parseFloat(invoice.discountValue || "0");
    const netTotal = parseFloat(invoice.netTotal || "0");

    const receivablesMapping = mappingMap.get("receivables");
    let debitAccountId: string | null = receivablesMapping?.debitAccountId || null;

    if (!debitAccountId) {
      throw new Error("لم يتم تعيين حساب المدينون (receivables) في ربط حسابات فواتير المبيعات");
    }

    let inventoryAccountId: string | null = null;
    if (invoice.warehouseId) {
      const [wh] = await queryCtx.select().from(warehouses)
        .where(eq(warehouses.id, invoice.warehouseId));
      if (wh?.glAccountId) {
        inventoryAccountId = wh.glAccountId;
      }
    }
    if (!inventoryAccountId) {
      const invMapping = mappingMap.get("inventory");
      if (invMapping?.creditAccountId) {
        inventoryAccountId = invMapping.creditAccountId;
      }
    }

    const journalLineData: InsertJournalLine[] = [];
    let lineNum = 1;

    if (debitAccountId && netTotal > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: debitAccountId,
        debit: String(netTotal.toFixed(2)),
        credit: "0",
        description: "مدينون - في انتظار التحصيل",
      });
    }

    const discountMapping = mappingMap.get("discount_allowed");
    if (discountMapping?.debitAccountId && discountValue > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: discountMapping.debitAccountId,
        debit: String(discountValue.toFixed(2)),
        credit: "0",
        description: "خصم مسموح به",
      });
    }

    const totalCogs = cogsDrugs + cogsSupplies;
    const hasInventoryAccount = !!inventoryAccountId;

    if (hasInventoryAccount) {
      const cogsDrugsMapping = mappingMap.get("cogs_drugs");
      if (cogsDrugsMapping?.debitAccountId && cogsDrugs > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsDrugsMapping.debitAccountId,
          debit: String(cogsDrugs.toFixed(2)),
          credit: "0",
          description: "تكلفة أدوية مباعة",
        });
      }

      const cogsSuppliesMapping = mappingMap.get("cogs_supplies");
      const cogsGeneralMapping = mappingMap.get("cogs");
      if (cogsSuppliesMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsSuppliesMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      } else if (cogsGeneralMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsGeneralMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      } else if (cogsDrugsMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsDrugsMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      }
    }

    const revenueDrugsMapping = mappingMap.get("revenue_drugs");
    const revenueSuppliesMapping = mappingMap.get("revenue_consumables");
    const revenueGeneralMapping = mappingMap.get("revenue_general");

    if (revenueDrugsMapping?.creditAccountId && revenueDrugs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueDrugsMapping.creditAccountId,
        debit: "0",
        credit: String(revenueDrugs.toFixed(2)),
        description: "إيراد مبيعات أدوية",
      });
    } else if (revenueGeneralMapping?.creditAccountId && revenueDrugs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueGeneralMapping.creditAccountId,
        debit: "0",
        credit: String(revenueDrugs.toFixed(2)),
        description: "إيراد مبيعات أدوية",
      });
    }

    if (revenueSuppliesMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueSuppliesMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    } else if (revenueGeneralMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueGeneralMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    } else if (revenueDrugsMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueDrugsMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    }

    const vatMapping = mappingMap.get("vat_output");
    const vatAmount = parseFloat(invoice.vatAmount || invoice.totalVat || "0");
    if (vatMapping?.creditAccountId && vatAmount > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: vatMapping.creditAccountId,
        debit: "0",
        credit: String(vatAmount.toFixed(2)),
        description: "ضريبة قيمة مضافة مخرجات",
      });
    }

    if (hasInventoryAccount && totalCogs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: inventoryAccountId!,
        debit: "0",
        credit: String(totalCogs.toFixed(2)),
        description: "مخزون مباع",
      });
    }

    if (journalLineData.length === 0) return null;

    const totalDebits = journalLineData.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
    const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
    const diff = Math.abs(totalDebits - totalCredits);

    if (diff > 0.01) {
      throw new Error(`القيد غير متوازن: مدين=${totalDebits.toFixed(2)} دائن=${totalCredits.toFixed(2)}`);
    }

    return { journalLineData, totalDebits, totalCredits };
  },

  async insertJournalEntry(
    this: DatabaseStorage,
    tx: any, invoiceId: string, invoice: any,
    journalLineData: InsertJournalLine[], totalDebits: number, totalCredits: number
  ): Promise<JournalEntry> {
    const [period] = await tx.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, invoice.invoiceDate),
        gte(fiscalPeriods.endDate, invoice.invoiceDate),
        eq(fiscalPeriods.isClosed, false)
      ))
      .limit(1);

    const entryNumber = await this.getNextEntryNumber();

    const [entry] = await tx.insert(journalEntries).values({
      entryNumber,
      entryDate: invoice.invoiceDate,
      reference: `SI-${invoice.invoiceNumber}`,
      description: `قيد فاتورة مبيعات رقم ${invoice.invoiceNumber}`,
      status: "draft",
      periodId: period?.id || null,
      sourceType: "sales_invoice",
      sourceDocumentId: invoiceId,
      totalDebit: String(totalDebits.toFixed(2)),
      totalCredit: String(totalCredits.toFixed(2)),
    }).returning();

    const linesWithEntryId = journalLineData.map((l, idx) => ({
      ...l,
      journalEntryId: entry.id,
      lineNumber: idx + 1,
    }));

    await tx.insert(journalLines).values(linesWithEntryId);
    return entry;
  },

  async generateSalesInvoiceJournalInTx(
    this: DatabaseStorage,
    tx: any, invoiceId: string, invoice: any,
    cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number
  ): Promise<JournalEntry | null> {
    console.log(`[Journal] Starting generateSalesInvoiceJournalInTx for invoice ${invoiceId}`);
    const result = await this.buildSalesJournalLines(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies, tx);
    if (!result) return null;
    return this.insertJournalEntry(tx, invoiceId, invoice, result.journalLineData, result.totalDebits, result.totalCredits);
  },

  async generateSalesInvoiceJournal(
    this: DatabaseStorage,
    invoiceId: string, invoice: any, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number
  ): Promise<JournalEntry | null> {
    console.log(`[Journal] Starting generateSalesInvoiceJournal for invoice ${invoiceId}`);
    const result = await this.buildSalesJournalLines(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies);
    if (!result) return null;
    return db.transaction(async (tx) => {
      return this.insertJournalEntry(tx, invoiceId, invoice, result.journalLineData, result.totalDebits, result.totalCredits);
    });
  },

  async completeSalesJournalsWithCash(
    this: DatabaseStorage,
    invoiceIds: string[], cashGlAccountId: string | null, _pharmacyId: string
  ): Promise<void> {
    let cashAccountId = cashGlAccountId;
    if (!cashAccountId) {
      const cashMappings = await this.getMappingsForTransaction("cashier_collection");
      const cashMapping = cashMappings.find(m => m.lineType === "cash");
      if (cashMapping?.debitAccountId) {
        cashAccountId = cashMapping.debitAccountId;
      }
    }
    if (!cashAccountId) {
      console.error("completeSalesJournalsWithCash: no cash GL account found");
      return;
    }

    for (const invoiceId of invoiceIds) {
      const [invoice] = await db.select({
        warehouseId: salesInvoiceHeaders.warehouseId,
        isReturn: salesInvoiceHeaders.isReturn,
      }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

      const invoiceReceivableIds = new Set<string>();
      const mappings = await this.getMappingsForTransaction("sales_invoice", invoice?.warehouseId || undefined);
      for (const m of mappings) {
        if (m.lineType === "receivables" && m.debitAccountId) {
          invoiceReceivableIds.add(m.debitAccountId);
        }
      }

      if (invoiceReceivableIds.size === 0) continue;

      const [existingEntry] = await db.select().from(journalEntries)
        .where(and(
          eq(journalEntries.sourceType, "sales_invoice"),
          eq(journalEntries.sourceDocumentId, invoiceId)
        ));

      if (!existingEntry) continue;
      if (existingEntry.status === "posted") continue;

      const existingLines = await db.select().from(journalLines)
        .where(eq(journalLines.journalEntryId, existingEntry.id))
        .orderBy(asc(journalLines.lineNumber));

      const receivablesLine = existingLines.find(l =>
        invoiceReceivableIds.has(l.accountId) &&
        (parseFloat(l.debit || "0") > 0 || parseFloat(l.credit || "0") > 0)
      );

      if (receivablesLine) {
        const isReturn = invoice?.isReturn || false;
        const hasDebit = parseFloat(receivablesLine.debit || "0") > 0;
        const desc = isReturn ? "نقدية مرتجع - تم الصرف" : "نقدية مبيعات - تم التحصيل";
        const entryDesc = isReturn ? "(تم صرف المرتجع)" : "(تم التحصيل)";

        await db.update(journalLines).set({
          accountId: cashAccountId,
          description: desc,
        }).where(eq(journalLines.id, receivablesLine.id));

        await db.update(journalEntries).set({
          description: `${existingEntry.description} ${entryDesc}`,
        }).where(eq(journalEntries.id, existingEntry.id));
      }
    }
  },

  async deleteSalesInvoice(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
    await db.update(salesInvoiceHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
    }).where(eq(salesInvoiceHeaders.id, id));
    return true;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Patient Invoices — فواتير المرضى
  // ═══════════════════════════════════════════════════════════════════════════

  async getNextPatientInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const result = await db.select({ max: sql<string>`COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)` }).from(patientInvoiceHeaders);
    return (parseInt(result[0]?.max || "0") || 0) + 1;
  },

  async getNextPaymentRefNumber(this: DatabaseStorage, offset: number = 0): Promise<string> {
    const result = await db.execute(sql`
      SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(reference_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
      FROM patient_invoice_payments
      WHERE reference_number LIKE 'RCP-%'
    `);
    const maxNum = parseInt((result.rows[0] as any).max_num || "0") || 0;
    return `RCP-${String(maxNum + 1 + offset).padStart(6, "0")}`;
  },

  async getPatientInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(patientInvoiceHeaders.status, filters.status as any));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${patientInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(gte(patientInvoiceHeaders.invoiceDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(patientInvoiceHeaders.invoiceDate, filters.dateTo));
    if (filters.patientName) conditions.push(ilike(patientInvoiceHeaders.patientName, `%${filters.patientName}%`));
    if (filters.doctorName) conditions.push(ilike(patientInvoiceHeaders.doctorName, `%${filters.doctorName}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(patientInvoiceHeaders).where(where);
    const total = Number(countResult?.count || 0);

    const data = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .where(where)
      .orderBy(desc(patientInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      data: data.map(r => ({ ...r.header, department: r.department })),
      total,
    };
  },

  async getPatientInvoice(this: DatabaseStorage, id: string): Promise<PatientInvoiceWithDetails | undefined> {
    const [headerRow] = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .where(eq(patientInvoiceHeaders.id, id));

    if (!headerRow) return undefined;

    const lines = await db.select({
      line: patientInvoiceLines,
      service: services,
      item: items,
    })
      .from(patientInvoiceLines)
      .leftJoin(services, eq(patientInvoiceLines.serviceId, services.id))
      .leftJoin(items, eq(patientInvoiceLines.itemId, items.id))
      .where(eq(patientInvoiceLines.headerId, id))
      .orderBy(asc(patientInvoiceLines.sortOrder));

    const payments = await db.select()
      .from(patientInvoicePayments)
      .where(eq(patientInvoicePayments.headerId, id))
      .orderBy(asc(patientInvoicePayments.createdAt));

    return {
      ...headerRow.header,
      department: headerRow.department || undefined,
      lines: lines.map(l => ({ ...l.line, service: l.service || undefined, item: l.item || undefined })),
      payments,
    };
  },

  async createPatientInvoice(this: DatabaseStorage, header: any, lines: any[], payments: any[]): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(patientInvoiceHeaders).values({ ...header, version: 1 }).returning();

      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l: any, i: number) => ({ ...l, headerId: created.id, sortOrder: i }))
        );
      }

      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p: any) => ({ ...p, headerId: created.id }))
        );
      }

      const totals = this.computeInvoiceTotals(lines, payments);
      await tx.update(patientInvoiceHeaders).set(totals).where(eq(patientInvoiceHeaders.id, created.id));

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, created.id));
      return result;
    });
  },

  async updatePatientInvoice(this: DatabaseStorage, id: string, header: any, lines: any[], payments: any[], expectedVersion?: number): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as any;
      if (!existing) throw new Error("فاتورة المريض غير موجودة");
      if (existing.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      if (expectedVersion != null && existing.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const newVersion = (existing.version || 1) + 1;

      const oldLines = await tx.select().from(patientInvoiceLines)
        .where(eq(patientInvoiceLines.headerId, id));

      await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, id));
      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l: any, i: number) => ({ ...l, headerId: id, sortOrder: i }))
        );
      }

      await tx.delete(patientInvoicePayments).where(eq(patientInvoicePayments.headerId, id));
      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p: any) => ({ ...p, headerId: id }))
        );
      }

      const totals = this.computeInvoiceTotals(lines, payments);
      // Preserve existing header-level discount when recomputing line totals
      const existingHeaderDiscount = parseMoney(existing.header_discount_amount || "0");
      const adjustedNetAmount = roundMoney(parseMoney(totals.netAmount) - existingHeaderDiscount);
      await tx.update(patientInvoiceHeaders).set({
        ...header,
        ...totals,
        netAmount: adjustedNetAmount,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(patientInvoiceHeaders.id, id));

      const oldStayLines = oldLines.filter((l: any) => l.sourceType === "STAY_ENGINE");
      const newStayLines = lines.filter((l: any) => l.sourceType === "STAY_ENGINE");
      for (const ns of newStayLines) {
        const match = oldStayLines.find((os: any) => os.sourceId === ns.sourceId);
        if (match && (String(match.quantity) !== String(ns.quantity) || String(match.unitPrice) !== String(ns.unitPrice) || String(match.totalPrice) !== String(ns.totalPrice))) {
          await tx.insert(auditLog).values({
            tableName: "patient_invoice_lines",
            recordId: id,
            action: "stay_edit",
            oldValues: JSON.stringify({ sourceId: match.sourceId, quantity: match.quantity, unitPrice: match.unitPrice, totalPrice: match.totalPrice }),
            newValues: JSON.stringify({ sourceId: ns.sourceId, quantity: ns.quantity, unitPrice: ns.unitPrice, totalPrice: ns.totalPrice }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${ns.sourceId} qty ${match.quantity} → ${ns.quantity}`);
        }
      }
      for (const os of oldStayLines) {
        if (!newStayLines.find((ns: any) => ns.sourceId === os.sourceId)) {
          await tx.insert(auditLog).values({
            tableName: "patient_invoice_lines",
            recordId: id,
            action: "stay_void",
            oldValues: JSON.stringify({ sourceId: os.sourceId, quantity: os.quantity, totalPrice: os.totalPrice }),
            newValues: JSON.stringify({ removed: true }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${os.sourceId} REMOVED`);
        }
      }

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
      return result;
    });
  },

  /*
   * finalizePatientInvoice — اعتماد فاتورة مريض
   * ──────────────────────────────────────────────
   * 1. قفل الفاتورة (FOR UPDATE) + فحص التزامن (optimistic concurrency via version)
   * 2. إعادة حساب الإجمالي من السطور server-side
   * 3. التحقق من السداد الكامل (يجب أن يكون المدفوع ≥ الصافي)
   * 4. تحديث الحالة إلى "finalized" مع رفع رقم الإصدار (version)
   *
   * ⚠️ يتم استدعاء generateJournalEntry بعد هذه الدالة في الـ route
   */
  async finalizePatientInvoice(this: DatabaseStorage, id: string, expectedVersion?: number): Promise<PatientInvoiceHeader> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("فاتورة المريض غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");

      if (expectedVersion != null && locked.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const dbLines = await tx.select().from(patientInvoiceLines)
        .where(and(eq(patientInvoiceLines.headerId, id), eq(patientInvoiceLines.isVoid, false)));
      const dbPayments = await tx.select().from(patientInvoicePayments)
        .where(eq(patientInvoicePayments.headerId, id));

      // Stock deduction for drug/consumable lines (only when warehouseId is set)
      const warehouseId = locked.warehouse_id as string | null;
      if (warehouseId) {
        const inventoryLineTypes = new Set(["drug", "consumable"]);
        const invLines = dbLines.filter(l => inventoryLineTypes.has(l.lineType) && l.itemId);

        if (invLines.length > 0) {
          // Fetch item data for unit conversion
          const invItemIds = Array.from(new Set(invLines.map(l => l.itemId!)));
          const invItemRows = await tx.execute(
            sql`SELECT id, name_ar, has_expiry, major_to_medium, major_to_minor, medium_to_minor FROM items WHERE id IN (${sql.join(invItemIds.map(i => sql`${i}`), sql`, `)})`
          );
          const invItemMap: Record<string, any> = {};
          for (const row of invItemRows.rows as any[]) invItemMap[row.id] = row;

          const now = new Date();
          const currentMonth = now.getMonth() + 1;
          const currentYear = now.getFullYear();

          const stockLines: Array<{
            lineIdx: number; itemId: string; qtyMinor: number;
            hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
          }> = [];

          for (let li = 0; li < invLines.length; li++) {
            const line = invLines[li];
            const item = invItemMap[line.itemId!];
            if (!item) continue;

            // Expired lot guard
            if (item.has_expiry && line.expiryMonth && line.expiryYear) {
              if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
                throw new Error(`الصنف "${item.name_ar}" - لا يمكن صرف دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
              }
            }

            // Convert quantity to minor units
            const qty = parseFloat(line.quantity);
            const unitLevel = line.unitLevel || "minor";
            let qtyMinor = qty;
            if (unitLevel === "major") {
              let majorToMinor = parseFloat(String(item.major_to_minor)) || 0;
              if (majorToMinor <= 0) {
                const majorToMedium = parseFloat(String(item.major_to_medium)) || 1;
                const mediumToMinor = parseFloat(String(item.medium_to_minor)) || 1;
                majorToMinor = majorToMedium * mediumToMinor;
              }
              qtyMinor = qty * (majorToMinor || 1);
            } else if (unitLevel === "medium") {
              const mediumToMinor = parseFloat(String(item.medium_to_minor)) || 1;
              qtyMinor = qty * mediumToMinor;
            }

            stockLines.push({
              lineIdx: li,
              itemId: line.itemId!,
              qtyMinor,
              hasExpiry: !!item.has_expiry,
              expiryMonth: line.expiryMonth,
              expiryYear: line.expiryYear,
            });
          }

          if (stockLines.length > 0) {
            await this.allocateStockInTx(tx, {
              operationType: "patient_finalize",
              referenceType: "patient_invoice",
              referenceId: id,
              warehouseId,
              lines: stockLines,
            });
          }
        }
      }

      const recomputedTotals = this.computeInvoiceTotals(dbLines, dbPayments);
      const newVersion = (locked.version || 1) + 1;

      const [updated] = await tx.update(patientInvoiceHeaders).set({
        ...recomputedTotals,
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
        version: newVersion,
      }).where(and(
        eq(patientInvoiceHeaders.id, id),
        eq(patientInvoiceHeaders.status, 'draft')
      )).returning();

      if (!updated) throw new Error("الفاتورة ليست مسودة");
      return updated;
    });

    return result;
  },

  async deletePatientInvoice(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const invoice = lockResult.rows?.[0] as any;
      if (!invoice) throw new Error("فاتورة المريض غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled" as any,
        version: (invoice.version || 1) + 1,
        notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
      }).where(eq(patientInvoiceHeaders.id, id));
      return true;
    });
  },

  async distributePatientInvoice(this: DatabaseStorage, sourceId: string, patients: { name: string; phone?: string }[]): Promise<PatientInvoiceHeader[]> {
    return await db.transaction(async (tx) => {
      // Lock source FOR UPDATE to prevent concurrent distribution
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${sourceId} FOR UPDATE`);
      const source = lockResult.rows?.[0] as any;
      if (!source) throw new Error("فاتورة المصدر غير موجودة");
      if (source.status !== "draft") throw new Error("لا يمكن توزيع فاتورة نهائية");

      const sourceLines = await tx.select().from(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, sourceId)).orderBy(asc(patientInvoiceLines.sortOrder));
      if (sourceLines.length === 0) throw new Error("الفاتورة لا تحتوي على بنود");

      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter(l => l.itemId).map(l => l.itemId!)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: source.invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: source.patientType,
          departmentId: source.departmentId,
          warehouseId: source.warehouseId,
          doctorName: source.doctorName,
          contractName: source.contractName,
          notes: source.notes,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        }).returning();

        const newLines: any[] = [];

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li];
          const totalQty = cl.distQty;

          if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
          let share: number;
          if (pi === numPatients - 1) {
            share = +(totalQty - allocatedSoFar[li]).toFixed(4);
          } else {
            const intQty = Math.round(totalQty);
            const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
            if (isInt && intQty >= numPatients) {
              const baseShare = Math.floor(intQty / numPatients);
              const remainder = intQty - baseShare * numPatients;
              share = pi < remainder ? baseShare + 1 : baseShare;
            } else {
              share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
            }
          }
          allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId,
            itemId: cl.itemId,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId,
            expiryMonth: cl.expiryMonth,
            expiryYear: cl.expiryYear,
            priceSource: cl.priceSource,
            doctorName: cl.doctorName,
            nurseName: cl.nurseName,
            notes: cl.notes,
            sortOrder: cl.sortOrder,
            sourceType: "dist_from_invoice",
            sourceId: `${sourceId}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          // Recompute totals server-side with roundMoney
          const totals = this.computeInvoiceTotals(newLines, []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      // Soft-cancel source instead of hard delete — enables retry detection
      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled",
        notes: `[توزيع على ${numPatients} مرضى]`,
        version: (parseInt(String(source.version)) || 1) + 1,
      }).where(eq(patientInvoiceHeaders.id, sourceId));

      return createdInvoices;
    });
  },

  async distributePatientInvoiceDirect(this: DatabaseStorage, data: {
    patients: { name: string; phone?: string }[];
    lines: any[];
    invoiceDate: string;
    departmentId?: string | null;
    warehouseId?: string | null;
    doctorName?: string | null;
    patientType?: string;
    contractName?: string | null;
    notes?: string | null;
  }): Promise<PatientInvoiceHeader[]> {
    const { patients, lines: sourceLines, invoiceDate, departmentId, warehouseId, doctorName, patientType, contractName, notes } = data;
    if (sourceLines.length === 0) throw new Error("لا توجد بنود للتوزيع");

    return await db.transaction(async (tx) => {
      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter((l: any) => l.itemId).map((l: any) => l.itemId)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line: any) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: patientType || "cash",
          departmentId: departmentId || null,
          warehouseId: warehouseId || null,
          doctorName: doctorName || null,
          contractName: contractName || null,
          notes: notes || null,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        }).returning();

        const newLines: any[] = [];

        // خطوط "مباشرة": تذهب كاملةً لكل مريض بغض النظر عن العدد
        // 1. sourceType: STAY_ENGINE أو OR_ROOM (مضاف من محرك الإقامة)
        // 2. serviceType: ACCOMMODATION أو OPERATING_ROOM (مضاف يدوياً)
        const DIRECT_SOURCE_TYPES = new Set(["STAY_ENGINE", "OR_ROOM"]);
        const DIRECT_SERVICE_TYPES = new Set(["ACCOMMODATION", "OPERATING_ROOM"]);
        const isDirectLine = (cl: any) =>
          DIRECT_SOURCE_TYPES.has(cl.sourceType) || DIRECT_SERVICE_TYPES.has(cl.serviceType);

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li];
          const totalQty = cl.distQty;

          // Determine share: direct lines go fully to each patient; others are divided
          let share: number;
          if (isDirectLine(cl)) {
            // Full amount for every patient — إقامة وفتح غرفة عمليات
            share = totalQty;
          } else {
            if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
            if (pi === numPatients - 1) {
              share = +(totalQty - allocatedSoFar[li]).toFixed(4);
            } else {
              const intQty = Math.round(totalQty);
              const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
              if (isInt && intQty >= numPatients) {
                const baseShare = Math.floor(intQty / numPatients);
                const remainder = intQty - baseShare * numPatients;
                share = pi < remainder ? baseShare + 1 : baseShare;
              } else {
                share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
              }
            }
            allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);
          }

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId || null,
            itemId: cl.itemId || null,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId || null,
            expiryMonth: cl.expiryMonth || null,
            expiryYear: cl.expiryYear || null,
            priceSource: cl.priceSource || null,
            doctorName: cl.doctorName || null,
            nurseName: cl.nurseName || null,
            notes: cl.notes || null,
            sortOrder: cl.sortOrder || 0,
            sourceType: isDirectLine(cl) ? (cl.sourceType || cl.serviceType) : "dist_direct",
            sourceId: isDirectLine(cl) && cl.sourceId
              ? `${cl.sourceId}:p${pi}`
              : `${invoiceDate}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          // Recompute totals server-side with roundMoney
          const totals = this.computeInvoiceTotals(newLines, []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      return createdInvoices;
    });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Sales Returns — مرتجعات المبيعات
  // ═══════════════════════════════════════════════════════════════════════════

  async searchSaleInvoicesForReturn(this: DatabaseStorage, params: { invoiceNumber?: string; receiptBarcode?: string; itemBarcode?: string; itemCode?: string; itemId?: string; dateFrom?: string; dateTo?: string; warehouseId?: string }): Promise<any[]> {
    let resolvedItemId: string | null = null;

    if (params.itemBarcode) {
      const item = await db.execute(sql`SELECT item_id FROM item_barcodes WHERE barcode_value = ${params.itemBarcode} AND is_active = true LIMIT 1`);
      if (!item.rows.length) return [];
      resolvedItemId = (item.rows[0] as any).item_id;
    } else if (params.itemCode) {
      const item = await db.execute(sql`SELECT id FROM items WHERE item_code = ${params.itemCode} LIMIT 1`);
      if (!item.rows.length) return [];
      resolvedItemId = (item.rows[0] as any).id;
    } else if (params.itemId) {
      resolvedItemId = params.itemId;
    }

    let whereExtra = "";
    const vals: any[] = [];
    let idx = 1;

    if (params.invoiceNumber) {
      whereExtra += ` AND h.invoice_number = $${idx++}`;
      vals.push(parseInt(params.invoiceNumber));
    }
    if (params.receiptBarcode) {
      whereExtra += ` AND EXISTS (SELECT 1 FROM cashier_receipts cr WHERE cr.invoice_id = h.id AND cr.receipt_number = $${idx++})`;
      vals.push(parseInt(params.receiptBarcode));
    }
    if (resolvedItemId) {
      whereExtra += ` AND EXISTS (SELECT 1 FROM sales_invoice_lines sl WHERE sl.invoice_id = h.id AND sl.item_id = $${idx++})`;
      vals.push(resolvedItemId);
    }
    if (params.dateFrom) {
      whereExtra += ` AND h.invoice_date >= $${idx++}::date`;
      vals.push(params.dateFrom);
    }
    if (params.dateTo) {
      whereExtra += ` AND h.invoice_date <= $${idx++}::date`;
      vals.push(params.dateTo);
    }
    if (params.warehouseId) {
      whereExtra += ` AND h.warehouse_id = $${idx++}`;
      vals.push(params.warehouseId);
    }

    const q = `
      SELECT h.id, h.invoice_number AS "invoiceNumber", h.invoice_date AS "invoiceDate",
             h.warehouse_id AS "warehouseId", w.name_ar AS "warehouseName",
             h.customer_name AS "customerName", h.net_total AS "netTotal",
             (SELECT COUNT(*)::int FROM sales_invoice_lines sl WHERE sl.invoice_id = h.id) AS "itemCount"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.is_return = false AND h.status = 'finalized'${whereExtra}
      ORDER BY h.invoice_date DESC, h.invoice_number DESC
      LIMIT 50
    `;
    const result = await pool.query(q, vals);
    return result.rows;
  },

  async getSaleInvoiceForReturn(this: DatabaseStorage, invoiceId: string): Promise<any | null> {
    const hdr = await db.execute(sql`
      SELECT h.id, h.invoice_number AS "invoiceNumber", h.invoice_date AS "invoiceDate",
             h.warehouse_id AS "warehouseId", w.name_ar AS "warehouseName",
             h.customer_type AS "customerType", h.customer_name AS "customerName",
             h.subtotal, h.discount_percent AS "discountPercent",
             h.discount_value AS "discountValue", h.net_total AS "netTotal"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.id = ${invoiceId} AND h.is_return = false AND h.status = 'finalized'
    `);
    if (!hdr.rows.length) return null;
    const header = hdr.rows[0] as any;

    const lines = await db.execute(sql`
      SELECT l.id, l.line_no AS "lineNo", l.item_id AS "itemId",
             i.item_code AS "itemCode", i.name_ar AS "itemNameAr",
             l.unit_level AS "unitLevel", l.qty, l.qty_in_minor AS "qtyInMinor",
             l.sale_price AS "salePrice", l.line_total AS "lineTotal",
             l.expiry_month AS "expiryMonth", l.expiry_year AS "expiryYear", l.lot_id AS "lotId",
             i.major_unit_name AS "majorUnitName", i.medium_unit_name AS "mediumUnitName",
             i.minor_unit_name AS "minorUnitName",
             i.major_to_minor AS "majorToMinor", i.medium_to_minor AS "mediumToMinor",
             COALESCE((
               SELECT SUM(ABS(rl.qty_in_minor::numeric))
               FROM sales_invoice_lines rl
               JOIN sales_invoice_headers rh ON rh.id = rl.invoice_id
               WHERE rh.original_invoice_id = ${invoiceId}
                 AND rh.is_return = true
                 AND rh.status IN ('finalized', 'collected')
                 AND rl.item_id = l.item_id
                 AND COALESCE(rl.lot_id,'') = COALESCE(l.lot_id,'')
             ), 0)::numeric AS "previouslyReturnedMinor"
      FROM sales_invoice_lines l
      JOIN items i ON i.id = l.item_id
      WHERE l.invoice_id = ${invoiceId}
      ORDER BY l.line_no
    `);
    header.lines = lines.rows;
    return header;
  },

  async createSalesReturn(this: DatabaseStorage, data: {
    originalInvoiceId: string; warehouseId: string;
    returnLines: { originalLineId: string; itemId: string; unitLevel: string; qty: string; qtyInMinor: string; salePrice: string; lineTotal: string; expiryMonth: number | null; expiryYear: number | null; lotId: string | null }[];
    discountType: string; discountPercent: string; discountValue: string; notes: string; createdBy: string;
  }): Promise<any> {
    return await db.transaction(async (tx) => {
      const origHeader = await tx.execute(sql`
        SELECT id, invoice_date, warehouse_id, customer_type, customer_name, contract_company, pharmacy_id, status, is_return
        FROM sales_invoice_headers WHERE id = ${data.originalInvoiceId} FOR UPDATE
      `);
      const orig = origHeader.rows[0] as any;
      if (!orig) throw new Error("الفاتورة الأصلية غير موجودة");
      if (orig.is_return) throw new Error("لا يمكن إرجاع فاتورة مرتجع");
      if (orig.status !== "finalized") throw new Error("الفاتورة الأصلية غير مرحّلة");
      if (orig.warehouse_id !== data.warehouseId) throw new Error("المخزن لا يتطابق مع فاتورة البيع الأصلية");

      const origLines = await tx.execute(sql`
        SELECT l.id, l.item_id, l.unit_level, l.qty_in_minor, l.sale_price, l.line_total, l.lot_id,
               COALESCE((
                 SELECT SUM(ABS(rl2.qty_in_minor::numeric))
                 FROM sales_invoice_lines rl2
                 JOIN sales_invoice_headers rh2 ON rh2.id = rl2.invoice_id
                 WHERE rh2.original_invoice_id = ${data.originalInvoiceId}
                   AND rh2.is_return = true AND rh2.status IN ('finalized', 'collected')
                   AND rl2.item_id = l.item_id AND COALESCE(rl2.lot_id,'') = COALESCE(l.lot_id,'')
               ), 0)::numeric AS "previouslyReturnedMinor"
        FROM sales_invoice_lines l WHERE l.invoice_id = ${data.originalInvoiceId}
      `);
      const origLineMap = new Map<string, any>();
      for (const ol of origLines.rows as any[]) {
        origLineMap.set(ol.id, ol);
      }

      const validatedLines: typeof data.returnLines = [];
      for (const rl of data.returnLines) {
        const origLine = origLineMap.get(rl.originalLineId);
        if (!origLine) throw new Error(`السطر ${rl.originalLineId} لا ينتمي للفاتورة الأصلية`);
        if (origLine.item_id !== rl.itemId) throw new Error(`الصنف لا يتطابق مع السطر الأصلي`);

        const availMinor = parseFloat(origLine.qty_in_minor) - parseFloat(origLine.previouslyReturnedMinor);
        let returnMinor = parseFloat(rl.qtyInMinor);
        if (returnMinor <= 0) continue;
        if (returnMinor > availMinor) returnMinor = availMinor;
        if (returnMinor <= 0) continue;

        const pricePerMinor = parseFloat(origLine.line_total) / (parseFloat(origLine.qty_in_minor) || 1);
        const lineTotal = Math.round(returnMinor * pricePerMinor * 100) / 100;

        validatedLines.push({
          ...rl,
          qtyInMinor: String(returnMinor),
          salePrice: origLine.sale_price,
          lineTotal: lineTotal.toFixed(2),
          lotId: origLine.lot_id,
        });
      }

      if (!validatedLines.length) throw new Error("لا توجد كميات صالحة للإرجاع");

      const subtotal = validatedLines.reduce((s, l) => s + parseFloat(l.lineTotal), 0);
      const discountValue = data.discountType === "percent"
        ? subtotal * (parseFloat(data.discountPercent) || 0) / 100
        : Math.min(parseFloat(data.discountValue) || 0, subtotal);
      const netTotal = Math.max(0, subtotal - discountValue);

      const nextNumResult = await tx.execute(sql`
        SELECT COALESCE(MAX(invoice_number), 0) + 1 AS "nextNum" FROM sales_invoice_headers
      `);
      const nextInvoiceNumber = (nextNumResult.rows[0] as any).nextNum;

      const hdr = await tx.execute(sql`
        INSERT INTO sales_invoice_headers
          (invoice_number, invoice_date, warehouse_id, pharmacy_id, customer_type, customer_name, contract_company,
           status, subtotal, discount_type, discount_percent, discount_value, net_total,
           notes, created_by, is_return, original_invoice_id, finalized_at, finalized_by)
        VALUES
          (${nextInvoiceNumber}, now()::date, ${orig.warehouse_id}, ${orig.pharmacy_id ?? null},
           ${orig.customer_type ?? 'cash'}, ${orig.customer_name ?? null}, ${orig.contract_company ?? null},
           'finalized', ${subtotal.toFixed(2)}, ${data.discountType},
           ${data.discountType === 'percent' ? data.discountPercent : '0'},
           ${discountValue.toFixed(2)}, ${netTotal.toFixed(2)},
           ${data.notes || null}, ${data.createdBy}, true, ${data.originalInvoiceId}, now(), ${data.createdBy})
        RETURNING id, invoice_number AS "invoiceNumber"
      `);
      const returnId = (hdr.rows[0] as any).id;
      const returnNumber = (hdr.rows[0] as any).invoiceNumber;

      for (let i = 0; i < validatedLines.length; i++) {
        const rl = validatedLines[i];
        await tx.execute(sql`
          INSERT INTO sales_invoice_lines
            (invoice_id, line_no, item_id, unit_level, qty, qty_in_minor, sale_price, line_total, expiry_month, expiry_year, lot_id)
          VALUES
            (${returnId}, ${i + 1}, ${rl.itemId}, ${rl.unitLevel}, ${rl.qty}, ${rl.qtyInMinor},
             ${rl.salePrice}, ${rl.lineTotal}, ${rl.expiryMonth ?? null}, ${rl.expiryYear ?? null}, ${rl.lotId ?? null})
        `);

        if (rl.lotId) {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${parseFloat(rl.qtyInMinor)}, updated_at = NOW()
            WHERE id = ${rl.lotId}
          `);
        } else {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${parseFloat(rl.qtyInMinor)}, updated_at = NOW()
            WHERE id = (
              SELECT id FROM inventory_lots
              WHERE item_id = ${rl.itemId} AND warehouse_id = ${orig.warehouse_id}
                AND COALESCE(expiry_month, 0) = COALESCE(${rl.expiryMonth ?? null}, 0)
                AND COALESCE(expiry_year, 0) = COALESCE(${rl.expiryYear ?? null}, 0)
              ORDER BY expiry_year NULLS LAST, expiry_month NULLS LAST
              LIMIT 1
            )
          `);
        }
      }

      return { id: returnId, invoiceNumber: returnNumber, netTotal: netTotal.toFixed(2) };
    });
  },
};

export default methods;
