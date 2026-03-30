/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchasing Receivings Storage — المورّدون وأذونات الاستلام
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - الموردون (Suppliers)
 *  - أذونات الاستلام (Receivings: draft, post, delete)
 *  - تلميحات الأسعار (Item Hints & Warehouse Stats)
 *  - تحويل الاستلام لفاتورة (Convert Receiving to Invoice)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, and, gte, lte, gt, sql, or, ilike, asc, isNull, isNotNull } from "drizzle-orm";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { logger } from "../lib/logger";
import {
  convertPriceToMinor as convertPriceToMinorUnit,
  convertQtyToMinor,
  QTY_MINOR_TOLERANCE,
} from "../inventory-helpers";
import {
  items,
  inventoryLots,
  inventoryLotMovements,
  warehouses,
  suppliers,
  receivingHeaders,
  receivingLines,
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  purchaseTransactions,
  journalEntries,
  journalLines,
  fiscalPeriods,
  accountMappings,
  type Supplier,
  type InsertSupplier,
  type ReceivingHeader,
  type InsertReceivingHeader,
  type ReceivingHeaderWithDetails,
  type ReceivingLineWithItem,
  type AccountMapping,
  type JournalEntry,
  type InsertJournalLine,
  type PurchaseInvoiceHeader,
  type PurchaseInvoiceLine,
  type PurchaseInvoiceWithDetails,
  type PurchaseInvoiceLineWithItem,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

// ===== Supplier Financial Fields — DB Payload Helper =====
// Converts numeric financial fields from the Zod schema (number | null) to
// the string form that Drizzle expects for decimal/integer DB columns.
function toSupplierDbPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  if (typeof out.creditLimit === "number") out.creditLimit = String(out.creditLimit);
  else if (out.creditLimit === undefined) delete out.creditLimit;
  if (typeof out.openingBalance === "number") out.openingBalance = String(out.openingBalance);
  else if (out.openingBalance === undefined) delete out.openingBalance;
  if (typeof out.defaultPaymentTerms === "number") out.defaultPaymentTerms = out.defaultPaymentTerms;
  else if (out.defaultPaymentTerms === undefined) delete out.defaultPaymentTerms;
  return out;
}

const methods = {
  // ===== Suppliers List =====
  // Supports optional filters: supplierType, isActive (default: active only), search
  async getSuppliers(this: DatabaseStorage, params: {
    search?: string;
    page: number;
    pageSize: number;
    supplierType?: string;
    isActive?: boolean | null;   // null = all, true = active only (default), false = inactive only
    sortBy?: "nameAr" | "currentBalance";
    sortDir?: "asc" | "desc";
  }): Promise<{ suppliers: (Supplier & { currentBalance: string })[]; total: number }> {
    const { search, page = 1, pageSize = 50, supplierType, isActive, sortBy = "currentBalance", sortDir = "desc" } = params;
    const offset = (page - 1) * pageSize;

    // ── ORDER BY ──────────────────────────────────────────────────────────────
    const orderExpr = sortBy === "currentBalance"
      ? (sortDir === "asc" ? sql`current_balance ASC`  : sql`current_balance DESC`)
      : (sortDir === "asc" ? sql`s.name_ar ASC`        : sql`s.name_ar DESC`);

    // ── Raw SQL with CTE for balance ──────────────────────────────────────────
    //
    // currentBalance formula:
    //   opening_balance (master data from suppliers table)
    //   + SUM(net_payable) from approved purchase invoices (status = 'approved_costed')
    //
    // Rationale:
    //   - purchase_invoice_headers.net_payable is the final AP amount per invoice
    //   - 'approved_costed' is the only terminal approved status in this system
    //   - There is no AP payments table, so payments are NOT deducted here
    //   - This balance represents TOTAL AP LIABILITY (total owed), not net outstanding
    //   - opening_balance captures legacy/import balances from before the system go-live
    //
    // N+1 prevention: single LEFT JOIN to a grouped subquery — O(suppliers) total work
    //
    const searchClause  = search ? sql`AND (s.name_ar ILIKE ${`%${search}%`} OR s.code ILIKE ${`%${search}%`} OR s.phone ILIKE ${`%${search}%`} OR s.tax_id ILIKE ${`%${search}%`})` : sql``;
    const typeClause    = supplierType ? sql`AND s.supplier_type = ${supplierType}` : sql``;

    const rawRows = await db.execute(sql`
      WITH supplier_invoice_totals AS (
        SELECT   supplier_id,
                 COALESCE(SUM(net_payable::numeric), 0) AS invoices_total
        FROM     purchase_invoice_headers
        WHERE    status = 'approved_costed'
        GROUP BY supplier_id
      )
      SELECT
        s.id, s.code, s.name_ar, s.name_en, s.phone, s.tax_id, s.address,
        s.supplier_type, s.is_active, s.created_at,
        s.payment_mode, s.credit_limit, s.default_payment_terms,
        s.contact_person, s.opening_balance, s.gl_account_id,
        ROUND(
          COALESCE(s.opening_balance::numeric, 0) + COALESCE(sit.invoices_total, 0),
          2
        )::text AS current_balance
      FROM   suppliers s
      LEFT   JOIN supplier_invoice_totals sit ON sit.supplier_id = s.id
      WHERE  s.is_active = ${isActive === null || isActive === undefined ? true : isActive}
        ${typeClause}
        ${searchClause}
      ORDER BY ${orderExpr}
      LIMIT  ${pageSize}
      OFFSET ${offset}
    `);

    const countRaw = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM   suppliers s
      WHERE  s.is_active = ${isActive === null || isActive === undefined ? true : isActive}
        ${typeClause}
        ${searchClause}
    `);

    const rows = (rawRows as any).rows as any[];
    const total = Number(((countRaw as any).rows[0])?.total ?? 0);

    const result = rows.map(r => ({
      id:                  r.id,
      code:                r.code,
      nameAr:              r.name_ar,
      nameEn:              r.name_en ?? null,
      phone:               r.phone ?? null,
      taxId:               r.tax_id ?? null,
      address:             r.address ?? null,
      supplierType:        r.supplier_type,
      isActive:            r.is_active,
      createdAt:           r.created_at,
      paymentMode:         r.payment_mode,
      creditLimit:         r.credit_limit ?? null,
      defaultPaymentTerms: r.default_payment_terms ?? null,
      contactPerson:       r.contact_person ?? null,
      openingBalance:      r.opening_balance ?? null,
      glAccountId:         r.gl_account_id ?? null,
      currentBalance:      r.current_balance ?? "0.00",
    })) as (Supplier & { currentBalance: string })[];

    return { suppliers: result, total };
  },

  async searchSuppliers(this: DatabaseStorage, q: string, limit: number = 20): Promise<Pick<Supplier, 'id' | 'code' | 'nameAr' | 'nameEn' | 'phone'>[]> {
    const trimmed = q.trim();
    if (!trimmed) return [];
    const isNumericLike = /^\d+$/.test(trimmed);
    let results;
    if (isNumericLike) {
      results = await db.select({
        id: suppliers.id, code: suppliers.code, nameAr: suppliers.nameAr, nameEn: suppliers.nameEn, phone: suppliers.phone,
      }).from(suppliers).where(and(eq(suppliers.isActive, true), or(
        ilike(suppliers.code, `${trimmed}%`),
        ilike(suppliers.phone, `%${trimmed}%`),
      ))).orderBy(sql`CASE WHEN ${suppliers.code} = ${trimmed} THEN 0 ELSE 1 END`, suppliers.code).limit(limit);
    } else {
      const pattern = `%${trimmed}%`;
      results = await db.select({
        id: suppliers.id, code: suppliers.code, nameAr: suppliers.nameAr, nameEn: suppliers.nameEn, phone: suppliers.phone,
      }).from(suppliers).where(and(eq(suppliers.isActive, true), or(
        ilike(suppliers.nameAr, pattern),
        ilike(suppliers.nameEn, pattern),
        ilike(suppliers.code, pattern),
        ilike(suppliers.phone, pattern),
        ilike(suppliers.taxId, pattern),
      ))).orderBy(suppliers.nameAr).limit(limit);
    }
    return results;
  },

  async getSupplier(this: DatabaseStorage, id: string): Promise<Supplier | undefined> {
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return s;
  },

  async createSupplier(this: DatabaseStorage, supplier: InsertSupplier): Promise<Supplier> {
    // Convert numeric financial fields to strings for Drizzle decimal columns
    const dbPayload = toSupplierDbPayload(supplier);
    const [s] = await db.insert(suppliers).values(dbPayload as any).returning();
    return s;
  },

  async updateSupplier(this: DatabaseStorage, id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    // Convert numeric financial fields to strings for Drizzle decimal columns
    const dbPayload = toSupplierDbPayload(supplier);
    const [s] = await db.update(suppliers).set(dbPayload as any).where(eq(suppliers.id, id)).returning();
    return s;
  },

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
    const headers = await db.select().from(receivingHeaders).where(where).orderBy(desc(receivingHeaders.receiveDate), desc(receivingHeaders.receivingNumber)).limit(pageSize).offset(offset);
    
    const data: ReceivingHeaderWithDetails[] = [];
    for (const h of headers) {
      const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
      const lines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, h.id));
      const linesWithItems: ReceivingLineWithItem[] = [];
      for (const line of lines) {
        const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
        linesWithItems.push({ ...line, item });
      }
      data.push({ ...h, supplier: sup, warehouse: wh, lines: linesWithItems });
    }
    return { data, total: Number(countResult.count) };
  },

  async getReceiving(this: DatabaseStorage, id: string): Promise<ReceivingHeaderWithDetails | undefined> {
    const [h] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    if (!h) return undefined;
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, h.id));
    const linesWithItems: ReceivingLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
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

  async saveDraftReceiving(this: DatabaseStorage, header: InsertReceivingHeader, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; purchasePrice: string; lineTotal: string; batchNumber?: string; expiryDate?: string; expiryMonth?: number; expiryYear?: number; salePrice?: string; salePriceHint?: string; notes?: string; isRejected?: boolean; rejectionReason?: string; bonusQty?: string; bonusQtyInMinor?: string }[], existingId?: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      let header_result: ReceivingHeader;
      if (existingId) {
        const [existing] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, existingId));
        if (!existing || existing.status !== 'draft') throw new Error('لا يمكن تعديل مستند مُرحّل');
        
        await tx.update(receivingHeaders).set({
          ...header,
          updatedAt: new Date(),
        }).where(eq(receivingHeaders.id, existingId));
        
        await tx.delete(receivingLines).where(eq(receivingLines.receivingId, existingId));
        [header_result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, existingId));
      } else {
        const nextNum = await this.getNextReceivingNumber();
        [header_result] = await tx.insert(receivingHeaders).values({
          ...header,
          receivingNumber: nextNum,
        } as Omit<ReceivingHeader, "id" | "createdAt" | "updatedAt">).returning();
      }
      
      let totalQty = 0;
      let totalCost = 0;
      
      for (const line of lines) {
        const lt = parseFloat(line.lineTotal) || 0;
        const qty = parseFloat(line.qtyInMinor) || 0;
        totalQty += qty;
        totalCost += lt;
        
        let resolvedUnitLevel = line.unitLevel;
        if (!resolvedUnitLevel || resolvedUnitLevel.trim() === '') {
          const [lineItem] = await tx.select().from(items).where(eq(items.id, line.itemId));
          resolvedUnitLevel = lineItem?.majorUnitName ? 'major' : 'minor';
        }
        
        await tx.insert(receivingLines).values({
          receivingId: header_result.id,
          itemId: line.itemId,
          unitLevel: resolvedUnitLevel as "major" | "medium" | "minor",
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          purchasePrice: line.purchasePrice,
          lineTotal: line.lineTotal,
          batchNumber: line.batchNumber || null,
          expiryDate: line.expiryDate || null,
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          salePrice: line.salePrice || null,
          salePriceHint: line.salePriceHint || null,
          notes: line.notes || null,
          isRejected: line.isRejected || false,
          rejectionReason: line.rejectionReason || null,
          bonusQty: line.bonusQty || "0",
          bonusQtyInMinor: line.bonusQtyInMinor || "0",
        });
      }
      
      await tx.update(receivingHeaders).set({
        totalQty: totalQty.toFixed(4),
        totalCost: roundMoney(totalCost),
      }).where(eq(receivingHeaders.id, header_result.id));
      
      [header_result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, header_result.id));
      return header_result;
    });
  },

  async postReceiving(this: DatabaseStorage, id: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      // Acquire row lock first (FOR UPDATE not natively supported in Drizzle query builder)
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${id} FOR UPDATE`);
      // Read with ORM inside the same transaction so fields are properly camelCased
      const [header] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
      if (!header) throw new Error('المستند غير موجود');
      if (header.status === 'posted' || header.status === 'posted_qty_only' || header.status === 'posted_costed') return header;
      
      if (!header.supplierId) throw new Error('المورد مطلوب');
      if (!header.supplierInvoiceNo?.trim()) throw new Error('رقم فاتورة المورد مطلوب');
      if (!header.warehouseId) throw new Error('المستودع مطلوب');
      
      const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, header.supplierId));
      const supplierName = supplier?.nameAr || supplier?.nameEn || null;

      const lines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
      const activeLines = lines.filter(l => !l.isRejected);
      if (activeLines.length === 0) throw new Error('لا توجد أصناف للترحيل');
      
      for (const line of activeLines) {
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) continue;

        // ── T04: إعادة التحقق من الكميات على الخادم ──────────────────────────
        const serverQty = convertQtyToMinor(parseFloat(line.qtyEntered), line.unitLevel || 'minor', item);
        const storedQty = parseFloat(line.qtyInMinor);
        if (Math.abs(serverQty - storedQty) > QTY_MINOR_TOLERANCE) {
          throw new Error(`الصنف "${item.nameAr}" — الكمية المحسوبة على الخادم (${serverQty.toFixed(4)}) تختلف عن الكمية المخزّنة (${storedQty.toFixed(4)}) بفارق يتجاوز التسامح (${QTY_MINOR_TOLERANCE}). يرجى مراجعة إذن الاستلام.`);
        }

        const serverBonus = convertQtyToMinor(parseFloat(line.bonusQty || "0"), line.unitLevel || 'minor', item);
        const storedBonus = parseFloat(line.bonusQtyInMinor || "0");
        if (Math.abs(serverBonus - storedBonus) > QTY_MINOR_TOLERANCE) {
          throw new Error(`الصنف "${item.nameAr}" — كمية المجانية المحسوبة على الخادم (${serverBonus.toFixed(4)}) تختلف عن المخزّنة (${storedBonus.toFixed(4)}) بفارق يتجاوز التسامح (${QTY_MINOR_TOLERANCE}).`);
        }

        // استخدام القيم المحسوبة على الخادم بدلاً من المخزّنة (تصحيح صامت ضمن التسامح)
        const qtyMinor = serverQty + serverBonus;
        if (qtyMinor <= 0) continue;
        
        if (item.hasExpiry && (!line.expiryMonth || !line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
        if (!item.hasExpiry && (line.expiryMonth || line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" لا يدعم تواريخ صلاحية`);
        
        const costPerMinor = convertPriceToMinorUnit(parseFloat(line.purchasePrice), line.unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);
        
        // SELECT ... FOR UPDATE: يُقفل سطر الـ lot داخل الـ transaction
        // يمنع lost-update عند استلامين متوازيين يستهدفان نفس الصنف/المستودع/الصلاحية
        let existingLots: typeof inventoryLots.$inferSelect[] = [];
        if (line.expiryMonth && line.expiryYear) {
          const rawLots = await tx.execute(
            sql`SELECT * FROM inventory_lots
                WHERE item_id = ${line.itemId}
                  AND warehouse_id = ${header.warehouseId}
                  AND expiry_month  = ${line.expiryMonth}
                  AND expiry_year   = ${line.expiryYear}
                FOR UPDATE`
          );
          existingLots = (rawLots as any).rows ?? [];
        } else {
          const rawLots = await tx.execute(
            sql`SELECT * FROM inventory_lots
                WHERE item_id = ${line.itemId}
                  AND warehouse_id = ${header.warehouseId}
                  AND expiry_month IS NULL
                FOR UPDATE`
          );
          existingLots = (rawLots as any).rows ?? [];
        }
        let lotId: string;
        
        const lotSalePrice = line.salePrice || "0";
        
        if (existingLots.length > 0) {
          // raw SQL rows use snake_case — نقرأ qty_in_minor مباشرة
          const lot = existingLots[0] as any;
          const lotIdRaw: string = lot.id;
          const newQty = parseFloat(lot.qty_in_minor) + qtyMinor;
          await tx.update(inventoryLots).set({ 
            qtyInMinor: newQty.toFixed(4),
            purchasePrice: costPerMinorStr,
            salePrice: lotSalePrice,
            updatedAt: new Date(),
          }).where(eq(inventoryLots.id, lotIdRaw));
          lotId = lotIdRaw;
        } else {
          const [newLot] = await tx.insert(inventoryLots).values({
            itemId: line.itemId,
            warehouseId: header.warehouseId,
            expiryDate: line.expiryDate || null,
            expiryMonth: line.expiryMonth || null,
            expiryYear: line.expiryYear || null,
            receivedDate: header.receiveDate,
            purchasePrice: costPerMinorStr,
            salePrice: lotSalePrice,
            qtyInMinor: qtyMinor.toFixed(4),
          }).returning();
          lotId = newLot.id;
        }
        
        await tx.insert(inventoryLotMovements).values({
          lotId,
          warehouseId: header.warehouseId,
          txType: 'in',
          qtyChangeInMinor: qtyMinor.toFixed(4),
          unitCost: costPerMinorStr,
          referenceType: 'receiving',
          referenceId: header.id,
        });

        const purchaseQty = parseFloat(line.qtyEntered || line.qtyInMinor);
        const purchaseTotal = (parseFloat(line.qtyInMinor) * costPerMinor).toFixed(2);
        await tx.insert(purchaseTransactions).values({
          itemId: line.itemId,
          txDate: header.receiveDate,
          supplierName,
          qty: line.qtyEntered || line.qtyInMinor,
          unitLevel: line.unitLevel || 'minor',
          purchasePrice: line.purchasePrice,
          salePriceSnapshot: line.salePrice || null,
          total: purchaseTotal,
          bonusQty: line.bonusQty || '0',
          supplierInvoiceNo: header.supplierInvoiceNo || null,
        });
        
        const updateFields: Partial<typeof items.$inferSelect> = { purchasePriceLast: line.purchasePrice, updatedAt: new Date() };
        if (line.salePrice) updateFields.salePriceCurrent = line.salePrice;
        await tx.update(items).set(updateFields).where(eq(items.id, line.itemId));
      }
      
      const [posted] = await tx.update(receivingHeaders).set({
        status: 'posted_qty_only',
        postedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, id)).returning();
      
      return posted;
    });

    const recvResult = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    const recvHeader = recvResult[0];
    if (recvHeader) {
      const recvLines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
      const activeRecvLines = recvLines.filter(l => !l.isRejected);
      const totalCost = activeRecvLines.reduce((sum, l) => sum + parseFloat(l.lineTotal || "0"), 0);
      
      if (totalCost > 0) {
        // Set source doc to "pending" BEFORE the fire-and-forget so a crash leaves a queryable record
        await db.update(receivingHeaders).set({ journalStatus: "pending", updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
        await logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "pending" });

        this.generateJournalEntry({
          sourceType: "receiving",
          sourceDocumentId: id,
          reference: `RCV-${recvHeader.receivingNumber}`,
          description: `قيد استلام مورد رقم ${recvHeader.receivingNumber}`,
          entryDate: recvHeader.receiveDate,
          lines: [
            { lineType: "inventory", amount: String(totalCost) },
            { lineType: "payables", amount: String(totalCost) },
          ],
        }).then(async (entry) => {
          if (entry) {
            // Journal created — mark posted on both source doc and event log
            await db.update(receivingHeaders).set({ journalStatus: "posted", journalError: null, updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
            logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "completed", journalEntryId: entry.id }).catch(() => {});
          } else {
            // generateJournalEntry returned null → mappings missing/skipped (already logged inside generateJournalEntry)
            await db.update(receivingHeaders).set({ journalStatus: "needs_retry", journalError: "ربط الحسابات غير مكتمل — راجع /account-mappings", updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
          }
        }).catch(async (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error({ err: msg, receivingId: id }, "[RECEIVING] Auto journal failed — needs_retry");
          await db.update(receivingHeaders).set({ journalStatus: "needs_retry", journalError: msg, updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
          logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "needs_retry", errorMessage: msg }).catch(() => {});
        });
      }
    }

    return (await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id)))[0];
  },

  async deleteReceiving(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    const [header] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    if (!header) return false;
    if (header.status === 'posted' || header.status === 'posted_qty_only') throw new Error('لا يمكن إلغاء مستند مُرحّل');
    await db.update(receivingHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (header.notes ? `[ملغي] ${header.notes}` : "[ملغي]"),
    }).where(eq(receivingHeaders.id, id));
    return true;
  },

  async getItemHints(this: DatabaseStorage, itemId: string, supplierId: string, warehouseId: string): Promise<{ lastPurchasePrice: string | null; lastSalePrice: string | null; currentSalePrice: string; onHandMinor: string }> {
    // ─── آخر سعر شراء حقيقي (غير صفري) من آخر استلام ───────────────────────
    // نبحث عن آخر سطر استلام به سعر شراء > 0 لتجنب إرجاع سعر أصناف الهدايا/البونص
    // posted_costed = استلام مرحّل ومحوّل لفاتورة شراء (الحالة النهائية)
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

    // ─── آخر سعر بيع من آخر استلام (بصرف النظر عن سعر الشراء) ──────────────
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

    // آخر سعر شراء: من آخر استلام غير صفري → ثم من حقل الصنف كاحتياط
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

  async convertReceivingToInvoice(this: DatabaseStorage, receivingId: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [receiving] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, receivingId));
      if (!receiving) throw new Error("إذن الاستلام غير موجود");
      if (receiving.status === "draft") throw new Error("يجب ترحيل إذن الاستلام أولاً");
      if (receiving.convertedToInvoiceId) {
        const existingInvoice = await this.getPurchaseInvoice(receiving.convertedToInvoiceId);
        if (existingInvoice) return existingInvoice;
      }

      const lines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, receivingId));
      const nextNum = await this.getNextPurchaseInvoiceNumber();

      const [invoice] = await tx.insert(purchaseInvoiceHeaders).values({
        invoiceNumber: nextNum,
        supplierId: receiving.supplierId,
        supplierInvoiceNo: receiving.supplierInvoiceNo,
        warehouseId: receiving.warehouseId,
        receivingId: receiving.id,
        invoiceDate: receiving.receiveDate,
        notes: null,
      } as any).returning();

      for (const line of lines) {
        if (line.isRejected) continue;

        const salePrice     = parseFloat(String(line.salePrice     || "0")) || 0;
        const purchasePrice = parseFloat(String(line.purchasePrice  || "0")) || 0;
        const qty           = parseFloat(String(line.qtyEntered     || "0")) || 0;

        const discountVal = salePrice > 0 ? Math.max(0, salePrice - purchasePrice) : 0;
        const discountPct = salePrice > 0 ? +((discountVal / salePrice) * 100).toFixed(4) : 0;

        const valueBeforeVat = +(qty * purchasePrice).toFixed(2);

        await tx.insert(purchaseInvoiceLines).values({
          invoiceId:        invoice.id,
          receivingLineId:  line.id,
          itemId:           line.itemId,
          unitLevel:        line.unitLevel,
          qty:              line.qtyEntered,
          bonusQty:         line.bonusQty || "0",
          sellingPrice:     line.salePrice || "0",
          purchasePrice:    line.purchasePrice || "0",
          lineDiscountPct:  String(discountPct),
          lineDiscountValue:String(discountVal.toFixed(2)),
          vatRate:          "0",
          valueBeforeVat:   String(valueBeforeVat),
          vatAmount:        "0",
          valueAfterVat:    String(valueBeforeVat),
          batchNumber:      line.batchNumber,
          expiryMonth:      line.expiryMonth,
          expiryYear:       line.expiryYear,
        } as any);
      }

      await tx.update(receivingHeaders).set({
        convertedToInvoiceId: invoice.id,
        convertedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, receivingId));

      return invoice;
    });
  },

};

export default methods;
