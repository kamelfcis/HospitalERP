import { db } from "../db";
import { eq, desc, and, gte, lte, gt, sql, or, ilike, isNull, isNotNull, inArray } from "drizzle-orm";
import {
  items,
  inventoryLots,
  warehouses,
  suppliers,
  receivingHeaders,
  receivingLines,
  type ReceivingHeaderWithDetails,
  type ReceivingLineWithItem,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getReceivings(this: DatabaseStorage, params: { supplierId?: string; warehouseId?: string; status?: string; statusFilter?: string; fromDate?: string; toDate?: string; search?: string; page: number; pageSize: number; includeCancelled?: boolean }): Promise<{ data: ReceivingHeaderWithDetails[]; total: number }> {
    const { supplierId, warehouseId, status, statusFilter, fromDate, toDate, search, page = 1, pageSize = 50, includeCancelled } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (supplierId) conditions.push(eq(receivingHeaders.supplierId, supplierId));
    if (warehouseId) conditions.push(eq(receivingHeaders.warehouseId, warehouseId));
    if (status) {
      conditions.push(eq(receivingHeaders.status, status as "draft" | "posted" | "posted_qty_only" | "cancelled"));
    } else if (!includeCancelled) {
      conditions.push(sql`${receivingHeaders.status} != 'cancelled'`);
    }
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'DRAFT') {
        conditions.push(eq(receivingHeaders.status, 'draft'));
      } else if (statusFilter === 'POSTED') {
        conditions.push(eq(receivingHeaders.status, 'posted_qty_only'));
        conditions.push(isNull(receivingHeaders.convertedToInvoiceId));
      } else if (statusFilter === 'CONVERTED') {
        conditions.push(isNotNull(receivingHeaders.convertedToInvoiceId));
      } else if (statusFilter === 'CORRECTED') {
        conditions.push(eq(receivingHeaders.correctionStatus, 'corrected'));
      }
    }
    if (fromDate) conditions.push(gte(receivingHeaders.receiveDate, fromDate));
    if (toDate) conditions.push(lte(receivingHeaders.receiveDate, toDate));
    if (search) {
      const searchStripped = search.replace(/^RCV-/i, '').trim();
      conditions.push(or(
        ilike(receivingHeaders.supplierInvoiceNo, `%${search}%`),
        sql`${receivingHeaders.receivingNumber}::text ILIKE ${`%${searchStripped}%`}`,
        sql`EXISTS (SELECT 1 FROM suppliers WHERE suppliers.id = ${receivingHeaders.supplierId} AND (suppliers.name_ar ILIKE ${`%${search}%`} OR suppliers.name_en ILIKE ${`%${search}%`}))`
      ));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(receivingHeaders).where(where);
    const [sumResult]   = await db.select({ totalCostSum: sql<string>`COALESCE(SUM(total_cost), 0)` }).from(receivingHeaders).where(where);
    const headers = await db.select().from(receivingHeaders).where(where).orderBy(desc(receivingHeaders.receiveDate), desc(receivingHeaders.receivingNumber)).limit(pageSize).offset(offset);
    
    const headerIds    = headers.map(h => h.id);
    const supplierIds  = [...new Set(headers.map(h => h.supplierId))];
    const warehouseIds = [...new Set(headers.map(h => h.warehouseId))];

    const [allSups, allWhs, allLines] = await Promise.all([
      supplierIds.length  > 0 ? db.select().from(suppliers).where(inArray(suppliers.id, supplierIds))           : [],
      warehouseIds.length > 0 ? db.select().from(warehouses).where(inArray(warehouses.id, warehouseIds))        : [],
      headerIds.length    > 0 ? db.select().from(receivingLines).where(inArray(receivingLines.receivingId, headerIds)) : [],
    ]);

    const itemIds = [...new Set(allLines.map(l => l.itemId))];
    const allItems = itemIds.length > 0
      ? await db.select().from(items).where(inArray(items.id, itemIds))
      : [];

    const supMap   = new Map(allSups.map(s => [s.id, s]));
    const whMap    = new Map(allWhs.map(w => [w.id, w]));
    const itemMap  = new Map(allItems.map(i => [i.id, i]));
    const linesMap = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const bucket = linesMap.get(line.receivingId) ?? [];
      bucket.push(line);
      linesMap.set(line.receivingId, bucket);
    }

    const data: ReceivingHeaderWithDetails[] = headers.map(h => ({
      ...h,
      supplier:  supMap.get(h.supplierId),
      warehouse: whMap.get(h.warehouseId),
      lines: (linesMap.get(h.id) ?? []).map(line => ({ ...line, item: itemMap.get(line.itemId) })),
    }));
    return { data, total: Number(countResult.count), totalCostSum: sumResult?.totalCostSum ?? "0" };
  },

  async getReceiving(this: DatabaseStorage, id: string): Promise<ReceivingHeaderWithDetails | undefined> {
    const [h] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    if (!h) return undefined;
    const [[sup], [wh], lines] = await Promise.all([
      db.select().from(suppliers).where(eq(suppliers.id, h.supplierId)),
      db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId)),
      db.select().from(receivingLines).where(eq(receivingLines.receivingId, h.id)),
    ]);
    const itemIds = [...new Set(lines.map(l => l.itemId))];
    const allItems = itemIds.length > 0 ? await db.select().from(items).where(inArray(items.id, itemIds)) : [];
    const itemMap  = new Map(allItems.map(i => [i.id, i]));
    const linesWithItems: ReceivingLineWithItem[] = lines.map(line => ({ ...line, item: itemMap.get(line.itemId) }));
    return { ...h, supplier: sup, warehouse: wh, lines: linesWithItems };
  },

  async getNextReceivingNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(receiving_number), 0)` }).from(receivingHeaders);
    return (result?.max || 0) + 1;
  },

  async checkSupplierInvoiceUnique(this: DatabaseStorage, supplierId: string, supplierInvoiceNo: string, excludeId?: string): Promise<boolean> {
    const conditions = [eq(receivingHeaders.supplierId, supplierId), eq(receivingHeaders.supplierInvoiceNo, supplierInvoiceNo)];
    if (excludeId) {
      conditions.push(sql`${receivingHeaders.id} != ${excludeId}`);
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(receivingHeaders).where(and(...conditions));
    return Number(result.count) === 0;
  },

  async getItemHints(this: DatabaseStorage, itemId: string, supplierId: string, warehouseId: string): Promise<{ lastPurchasePrice: string | null; lastSalePrice: string | null; currentSalePrice: string; onHandMinor: string }> {
    const isPostedStatus = or(
      eq(receivingHeaders.status, 'posted'),
      eq(receivingHeaders.status, 'posted_qty_only'),
      eq(receivingHeaders.status, 'posted_costed'),
    );

    const [lastPricedLine] = await db.select({
      purchasePrice: receivingLines.purchasePrice,
    })
    .from(receivingLines)
    .innerJoin(receivingHeaders, eq(receivingLines.receivingId, receivingHeaders.id))
    .where(and(
      eq(receivingLines.itemId, itemId),
      isPostedStatus,
      eq(receivingLines.isRejected, false),
      gt(receivingLines.purchasePrice, sql`0`),
    ))
    .orderBy(desc(receivingHeaders.postedAt))
    .limit(1);

    const [lastSaleLine] = await db.select({
      salePrice: receivingLines.salePrice,
      salePriceHint: receivingLines.salePriceHint,
    })
    .from(receivingLines)
    .innerJoin(receivingHeaders, eq(receivingLines.receivingId, receivingHeaders.id))
    .where(and(
      eq(receivingLines.itemId, itemId),
      isPostedStatus,
      eq(receivingLines.isRejected, false),
    ))
    .orderBy(desc(receivingHeaders.postedAt))
    .limit(1);

    const [item] = await db.select().from(items).where(eq(items.id, itemId));

    let onHandMinor = "0";
    if (warehouseId) {
      const [onHandResult] = await db.select({
        total: sql<string>`COALESCE(SUM(${inventoryLots.qtyInMinor}::numeric), 0)::text`
      }).from(inventoryLots).where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
      ));
      onHandMinor = onHandResult?.total || "0";
    }

    const lastPurchasePrice =
      lastPricedLine?.purchasePrice ||
      (item?.purchasePriceLast && parseFloat(item.purchasePriceLast) > 0 ? item.purchasePriceLast : null);

    return {
      lastPurchasePrice: lastPurchasePrice ?? null,
      lastSalePrice: lastSaleLine?.salePrice || lastSaleLine?.salePriceHint || null,
      currentSalePrice: item?.salePriceCurrent || "0",
      onHandMinor,
    };
  },

  async getItemWarehouseStats(this: DatabaseStorage, itemId: string): Promise<{ warehouseId: string; warehouseName: string; warehouseCode: string; qtyMinor: string; expiryBreakdown: { expiryMonth: number | null; expiryYear: number | null; qty: string }[] }[]> {
    const warehouseTotals = await db.select({
      warehouseId: inventoryLots.warehouseId,
      warehouseName: warehouses.nameAr,
      warehouseCode: warehouses.warehouseCode,
      qtyMinor: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
    })
    .from(inventoryLots)
    .innerJoin(warehouses, eq(warehouses.id, inventoryLots.warehouseId))
    .where(and(
      eq(inventoryLots.itemId, itemId),
      eq(inventoryLots.isActive, true),
      sql`${inventoryLots.qtyInMinor}::numeric > 0`,
    ))
    .groupBy(inventoryLots.warehouseId, warehouses.nameAr, warehouses.warehouseCode)
    .orderBy(warehouses.nameAr);

    const expiryBreakdowns = await db.select({
      warehouseId: inventoryLots.warehouseId,
      expiryMonth: inventoryLots.expiryMonth,
      expiryYear: inventoryLots.expiryYear,
      qty: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
    })
    .from(inventoryLots)
    .where(and(
      eq(inventoryLots.itemId, itemId),
      eq(inventoryLots.isActive, true),
      sql`${inventoryLots.qtyInMinor}::numeric > 0`,
    ))
    .groupBy(inventoryLots.warehouseId, inventoryLots.expiryMonth, inventoryLots.expiryYear)
    .orderBy(inventoryLots.expiryYear, inventoryLots.expiryMonth);

    return warehouseTotals.filter(w => w.warehouseId !== null).map(w => ({
      warehouseId: w.warehouseId!,
      warehouseName: w.warehouseName,
      warehouseCode: w.warehouseCode,
      qtyMinor: w.qtyMinor,
      expiryBreakdown: expiryBreakdowns
        .filter(e => e.warehouseId === w.warehouseId)
        .map(e => ({
          expiryMonth: e.expiryMonth,
          expiryYear: e.expiryYear,
          qty: e.qty,
        })),
    }));
  },
};

export default methods;
