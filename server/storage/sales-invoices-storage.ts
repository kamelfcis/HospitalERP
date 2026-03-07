import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, desc, and, sql, or, asc, gte, lte, ilike, inArray } from "drizzle-orm";
import {
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
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  SalesInvoiceWithDetails,
  SalesInvoiceLineWithItem,
  JournalEntry,
  InsertJournalLine,
  AccountMapping,
  InsertSalesInvoiceHeader,
  InsertSalesInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

const methods = {

  async getNextSalesInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(salesInvoiceHeaders);
    return (result?.max || 0) + 1;
  },

  async getSalesInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; search?: string; pharmacistId?: string; warehouseId?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: (SalesInvoiceHeader & { warehouse?: { nameAr: string }, pharmacistName: string | null, itemCount: number })[]; total: number; totals: { subtotal: number; discountValue: number; netTotal: number }}> {
    const conditions: Array<any> = [];
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

    const [agg] = await db.select({
      count: sql<number>`count(*)`,
      subtotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.subtotal}::numeric), 0)`,
      discountValue: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.discountValue}::numeric), 0)`,
      netTotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.netTotal}::numeric), 0)`,
    }).from(salesInvoiceHeaders).where(whereClause);

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
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId!));
      linesWithItems.push({ ...line, item });
    }
    return { ...h, warehouse: wh, lines: linesWithItems };
  },

  /**
   * ══════════════════════════════════════════════════════════════════
   *  expandLinesFEFO — توسيع سطور الفاتورة باستخدام قاعدة FEFO
   *  First-Expired First-Out — الأقدم انتهاءً يُصرف أولاً
   * ══════════════════════════════════════════════════════════════════
   *
   *  ماذا تفعل؟
   *   كل سطر فاتورة يحتوي على صنف + كمية + وحدة.
   *   إذا كان الصنف له تواريخ انتهاء (hasExpiry=true) ولم يُحدَّد
   *   الـ lot يدوياً، تقوم هذه الدالة بـ:
   *     1. تحويل الكمية لأصغر وحدة (minor units)
   *     2. جلب الـ lots المتاحة مرتبة من الأقرب للانتهاء للأبعد
   *     3. تقسيم الكمية المطلوبة على الـ lots بالترتيب (FEFO)
   *     4. إرجاع سطور متعددة — سطر لكل lot تم استخدامه
   *
   *  مثال:
   *   طلب 10 أقراص دواء → lot A فيه 6 (انتهاء يناير) + lot B فيه 8 (انتهاء مارس)
   *   النتيجة: سطرين: 6 من lot A + 4 من lot B
   *
   *  حالات خاصة:
   *   - الصنف بدون hasExpiry → يُمرَّر كما هو بدون تقسيم
   *   - الـ lot محدد يدوياً → لا تقسيم (bypass)
   *   - الكمية المتاحة لا تكفي → يُحتفظ بالسطر الأصلي كاحتياطي
   *     (المرحلة التالية ستفشل بسبب نقص المخزون — عمداً)
   *
   *  تحذيرات:
   *   - تُنفَّذ داخل transaction فقط
   *   - تستخدم FOR UPDATE ضمنياً لأن التحديث يأتي لاحقاً في نفس الـ tx
   * ══════════════════════════════════════════════════════════════════
   */
  async expandLinesFEFO(this: DatabaseStorage, tx: DrizzleTransaction, warehouseId: string, rawLines: Partial<InsertSalesInvoiceLine>[]): Promise<Partial<InsertSalesInvoiceLine>[]> {
    const expanded: Partial<InsertSalesInvoiceLine>[] = [];
    for (const line of rawLines) {
      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId!));
      if (!item || !item.hasExpiry || line.expiryMonth || line.expiryYear) {
        expanded.push(line);
        continue;
      }

      let totalMinor = parseFloat(line.qty || "0") || 0;
      if (line.unitLevel === "major" || !line.unitLevel) {
        totalMinor *= parseFloat(item.majorToMinor || "1") || 1;
      } else if (line.unitLevel === "medium") {
        const m2m = parseFloat(item.mediumToMinor || "0");
        const effectiveMediumToMinor = m2m > 0 ? m2m : (parseFloat(item.majorToMinor || "1") || 1) / (parseFloat(item.majorToMedium || "1") || 1);
        totalMinor *= effectiveMediumToMinor;
      }

      const lots = await tx.select().from(inventoryLots)
        .where(and(
          eq(inventoryLots.itemId, line.itemId!),
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

  async createSalesInvoice(this: DatabaseStorage, header: InsertSalesInvoiceHeader, lines: Partial<InsertSalesInvoiceLine>[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const nextNum = await this.getNextSalesInvoiceNumber();

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId!, lines);

      let subtotal = 0;
      const processedLines: { line: Partial<InsertSalesInvoiceLine>; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty || "0") || 0;
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId!));

        let salePrice = parseFloat(line.salePrice || "0") || 0;
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

      const discountPercent = parseFloat(header.discountPercent || "0") || 0;
      const discountValue = parseFloat(header.discountValue || "0") || 0;
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

        await tx.insert(salesInvoiceLines).values({ invoiceId: invoice.id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null, } as unknown as import("@shared/schema").InsertSalesInvoiceLine);
      }

      return invoice;
    });
  },

  async updateSalesInvoice(this: DatabaseStorage, id: string, header: Partial<InsertSalesInvoiceHeader>, lines: Partial<InsertSalesInvoiceLine>[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      await tx.delete(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId ?? invoice.warehouseId, lines);

      let subtotal = 0;
      const processedLines: { line: Partial<InsertSalesInvoiceLine>; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty || "0") || 0;
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId!));

        let salePrice = parseFloat(line.salePrice || "0") || 0;
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

        await tx.insert(salesInvoiceLines).values({ invoiceId: id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null, } as unknown as import("@shared/schema").InsertSalesInvoiceLine);
      }

      const discountPercent = parseFloat(header.discountPercent || "0") || 0;
      const discountValue = parseFloat(header.discountValue || "0") || 0;
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
    tx: DrizzleTransaction,
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

    const existingResult = await tx.execute(
      sql`SELECT id FROM stock_movement_headers WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} LIMIT 1`
    );
    if (existingResult.rows?.length > 0) {
      const movementHeaderId = (existingResult.rows[0] as Record<string, unknown>).id as string;
      const allocRows = await tx.execute(
        sql`SELECT alloc_key, cost_allocated FROM stock_movement_allocations WHERE movement_header_id = ${movementHeaderId}`
      );
      const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = lines.map(l => ({
        lineIdx: l.lineIdx,
        itemId: l.itemId,
        totalCost: (allocRows.rows as Array<Record<string, unknown>>)
          .filter((r) => (r.alloc_key as string).startsWith(`line:${l.lineIdx}:`))
          .reduce((s, r) => s + parseFloat(r.cost_allocated as string), 0),
      }));
      return { movementHeaderId, lineResults };
    }

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

        await tx.execute(
          sql`UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - ${deduct}, updated_at = NOW() WHERE id = ${lot.id}`
        );

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

      if (remaining > 0.00005) {
        const itemRow = await tx.execute(sql`SELECT name_ar FROM items WHERE id = ${itemId} LIMIT 1`);
        const nameAr = (itemRow.rows[0] as any)?.name_ar || itemId;
        throw new Error(`رصيد غير كاف للصنف "${nameAr}" - النقص: ${remaining.toFixed(4)}`);
      }

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

    await tx.update(stockMovementHeaders).set({
      totalCost: roundMoney(movementTotalCost),
    }).where(eq(stockMovementHeaders.id, movementHeaderId));

    return { movementHeaderId, lineResults };
  },

  async finalizeSalesInvoice(this: DatabaseStorage, id: string): Promise<SalesInvoiceHeader> {
    let cogsDrugs = 0;
    let cogsSupplies = 0;
    let revenueDrugs = 0;
    let revenueSupplies = 0;

    const finalResult = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM sales_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("الفاتورة غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");

      const lines = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
      if (lines.length === 0) throw new Error("لا يمكن اعتماد فاتورة بدون أصناف");

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
          const [fetched] = await tx.select().from(items).where(eq(items.id, line.itemId!));
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

      const { lineResults } = await this.allocateStockInTx(tx, {
        operationType: "sales_finalize",
        referenceType: "sales_invoice",
        referenceId: id,
        warehouseId: invoice.warehouseId,
        lines: stockLines,
      });

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
};

export default methods;
