import { db } from "../db";
import { eq, desc, and, gte, lte, sql, or, ilike, asc, isNull, isNotNull } from "drizzle-orm";
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
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

function convertPriceToMinorUnit(enteredPrice: number, unitLevel: string, item: { majorToMinor?: string | null; mediumToMinor?: string | null }): number {
  if (unitLevel === 'major' && item.majorToMinor && parseFloat(item.majorToMinor) > 0) {
    return enteredPrice / parseFloat(item.majorToMinor);
  }
  if (unitLevel === 'medium' && item.mediumToMinor && parseFloat(item.mediumToMinor) > 0) {
    return enteredPrice / parseFloat(item.mediumToMinor);
  }
  return enteredPrice;
}

const methods = {
  async getSuppliers(this: DatabaseStorage, params: { search?: string; page: number; pageSize: number }): Promise<{ suppliers: Supplier[]; total: number }> {
    const { search, page = 1, pageSize = 50 } = params;
    const offset = (page - 1) * pageSize;
    const conditions: any[] = [eq(suppliers.isActive, true)];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(
        ilike(suppliers.nameAr, pattern),
        ilike(suppliers.code, pattern),
        ilike(suppliers.phone, pattern),
        ilike(suppliers.taxId, pattern)
      ));
    }
    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(suppliers).where(where);
    const results = await db.select().from(suppliers).where(where).orderBy(suppliers.nameAr).limit(pageSize).offset(offset);
    return { suppliers: results, total: Number(countResult.count) };
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
    const [s] = await db.insert(suppliers).values(supplier).returning();
    return s;
  },

  async updateSupplier(this: DatabaseStorage, id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [s] = await db.update(suppliers).set(supplier).where(eq(suppliers.id, id)).returning();
    return s;
  },

  async getReceivings(this: DatabaseStorage, params: { supplierId?: string; warehouseId?: string; status?: string; statusFilter?: string; fromDate?: string; toDate?: string; search?: string; page: number; pageSize: number; includeCancelled?: boolean }): Promise<{ data: ReceivingHeaderWithDetails[]; total: number }> {
    const { supplierId, warehouseId, status, statusFilter, fromDate, toDate, search, page = 1, pageSize = 50, includeCancelled } = params;
    const offset = (page - 1) * pageSize;
    const conditions: any[] = [];
    if (supplierId) conditions.push(eq(receivingHeaders.supplierId, supplierId));
    if (warehouseId) conditions.push(eq(receivingHeaders.warehouseId, warehouseId));
    if (status) {
      conditions.push(eq(receivingHeaders.status, status as any));
    } else if (!includeCancelled) {
      conditions.push(sql`${receivingHeaders.status} != 'cancelled'`);
    }
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'DRAFT') {
        conditions.push(eq(receivingHeaders.status, 'draft' as any));
      } else if (statusFilter === 'POSTED') {
        conditions.push(eq(receivingHeaders.status, 'posted_qty_only' as any));
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
        } as any).returning();
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
          unitLevel: resolvedUnitLevel as any,
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
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${id} FOR UPDATE`);
      const header = lockResult.rows?.[0] as any;
      if (!header) throw new Error('المستند غير موجود');
      if (header.status === 'posted' || header.status === 'posted_qty_only') return header;
      
      if (!header.supplier_id) throw new Error('المورد مطلوب');
      if (!header.supplier_invoice_no?.trim()) throw new Error('رقم فاتورة المورد مطلوب');
      if (!header.warehouse_id) throw new Error('المستودع مطلوب');
      
      const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, header.supplier_id));
      const supplierName = supplier?.nameAr || supplier?.nameEn || null;

      const lines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
      const activeLines = lines.filter(l => !l.isRejected);
      if (activeLines.length === 0) throw new Error('لا توجد أصناف للترحيل');
      
      for (const line of activeLines) {
        const qtyMinor = parseFloat(line.qtyInMinor) + parseFloat(line.bonusQtyInMinor || "0");
        if (qtyMinor <= 0) continue;
        
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) continue;
        
        if (item.hasExpiry && (!line.expiryMonth || !line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
        if (!item.hasExpiry && (line.expiryMonth || line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" لا يدعم تواريخ صلاحية`);
        
        const costPerMinor = convertPriceToMinorUnit(parseFloat(line.purchasePrice), line.unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);
        
        const lotConditions = [
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, header.warehouse_id),
        ];
        if (line.expiryMonth && line.expiryYear) {
          lotConditions.push(eq(inventoryLots.expiryMonth, line.expiryMonth));
          lotConditions.push(eq(inventoryLots.expiryYear, line.expiryYear));
        } else {
          lotConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
        }
        
        const existingLots = await tx.select().from(inventoryLots).where(and(...lotConditions));
        let lotId: string;
        
        const lotSalePrice = line.salePrice || "0";
        
        if (existingLots.length > 0) {
          const lot = existingLots[0];
          const newQty = parseFloat(lot.qtyInMinor) + qtyMinor;
          await tx.update(inventoryLots).set({ 
            qtyInMinor: newQty.toFixed(4),
            purchasePrice: costPerMinorStr,
            salePrice: lotSalePrice,
            updatedAt: new Date(),
          }).where(eq(inventoryLots.id, lot.id));
          lotId = lot.id;
        } else {
          const [newLot] = await tx.insert(inventoryLots).values({
            itemId: line.itemId,
            warehouseId: header.warehouse_id,
            expiryDate: line.expiryDate || null,
            expiryMonth: line.expiryMonth || null,
            expiryYear: line.expiryYear || null,
            receivedDate: header.receive_date,
            purchasePrice: costPerMinorStr,
            salePrice: lotSalePrice,
            qtyInMinor: qtyMinor.toFixed(4),
          }).returning();
          lotId = newLot.id;
        }
        
        await tx.insert(inventoryLotMovements).values({
          lotId,
          warehouseId: header.warehouse_id,
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
          txDate: header.receive_date,
          supplierName,
          qty: line.qtyEntered || line.qtyInMinor,
          unitLevel: line.unitLevel || 'minor',
          purchasePrice: line.purchasePrice,
          salePriceSnapshot: line.salePrice || null,
          total: purchaseTotal,
        });
        
        const updateFields: any = { purchasePriceLast: line.purchasePrice, updatedAt: new Date() };
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
    const recvHeader = recvResult[0] as any;
    if (recvHeader) {
      const recvLines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
      const activeRecvLines = recvLines.filter(l => !l.isRejected);
      const totalCost = activeRecvLines.reduce((sum, l) => sum + parseFloat(l.lineTotal || "0"), 0);
      
      if (totalCost > 0) {
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
        }).catch((err: any) => console.error("Auto journal for receiving failed:", err));
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
    const lastReceivingLine = await db.select({
      purchasePrice: receivingLines.purchasePrice,
      salePrice: receivingLines.salePrice,
      salePriceHint: receivingLines.salePriceHint,
    })
    .from(receivingLines)
    .innerJoin(receivingHeaders, eq(receivingLines.receivingId, receivingHeaders.id))
    .where(and(
      eq(receivingLines.itemId, itemId),
      or(eq(receivingHeaders.status, 'posted'), eq(receivingHeaders.status, 'posted_qty_only')),
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
    
    const lastLine = lastReceivingLine[0];
    return {
      lastPurchasePrice: lastLine?.purchasePrice || item?.purchasePriceLast || null,
      lastSalePrice: lastLine?.salePrice || lastLine?.salePriceHint || null,
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

  async getNextPurchaseInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(purchaseInvoiceHeaders);
    return (result?.max || 0) + 1;
  },

  async getPurchaseInvoices(this: DatabaseStorage, filters: { supplierId?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.supplierId) conditions.push(eq(purchaseInvoiceHeaders.supplierId, filters.supplierId));
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(purchaseInvoiceHeaders.status, filters.status as any));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${purchaseInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(purchaseInvoiceHeaders).where(whereClause);

    const headers = await db.select().from(purchaseInvoiceHeaders)
      .where(whereClause)
      .orderBy(desc(purchaseInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const data = [];
    for (const h of headers) {
      const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
      data.push({ ...h, supplier: sup, warehouse: wh });
    }

    return { data, total: Number(countResult.count) };
  },

  async getPurchaseInvoice(this: DatabaseStorage, id: string): Promise<any> {
    const [h] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!h) return undefined;
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, h.id));
    const linesWithItems = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    let receiving = undefined;
    if (h.receivingId) {
      const [r] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, h.receivingId));
      receiving = r;
    }
    return { ...h, supplier: sup, warehouse: wh, receiving, lines: linesWithItems };
  },

  async savePurchaseInvoice(this: DatabaseStorage, invoiceId: string, lines: any[], headerUpdates?: any): Promise<any> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة معتمدة");

      await tx.delete(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, invoiceId));

      let totalBeforeVat = 0;
      let totalVat = 0;
      let totalLineDiscounts = 0;

      for (const line of lines) {
        const qty = parseFloat(line.qty) || 0;
        const bonusQty = parseFloat(line.bonusQty) || 0;
        const purchasePrice = parseFloat(line.purchasePrice) || 0;
        const lineDiscountPct = parseFloat(line.lineDiscountPct) || 0;
        const vatRate = parseFloat(line.vatRate) || 0;

        const valueBeforeVat = qty * purchasePrice;
        const sellingPrice = parseFloat(line.sellingPrice || "0");
        const lineDiscountValue = line.lineDiscountValue !== undefined
          ? parseFloat(line.lineDiscountValue) || 0
          : (sellingPrice > 0 ? +(sellingPrice * (lineDiscountPct / 100)).toFixed(2) : 0);
        const vatBase = (qty + bonusQty) * purchasePrice;
        const vatAmount = vatBase * (vatRate / 100);
        const valueAfterVat = valueBeforeVat + vatAmount;

        totalBeforeVat += valueBeforeVat;
        totalVat += vatAmount;
        totalLineDiscounts += lineDiscountValue * qty;

        await tx.insert(purchaseInvoiceLines).values({
          invoiceId,
          receivingLineId: line.receivingLineId || null,
          itemId: line.itemId,
          unitLevel: line.unitLevel,
          qty: String(qty),
          bonusQty: String(bonusQty),
          sellingPrice: line.sellingPrice || "0",
          purchasePrice: String(purchasePrice),
          lineDiscountPct: String(lineDiscountPct),
          lineDiscountValue: String(lineDiscountValue.toFixed(2)),
          vatRate: String(vatRate),
          valueBeforeVat: String(valueBeforeVat.toFixed(2)),
          vatAmount: String(vatAmount.toFixed(2)),
          valueAfterVat: String(valueAfterVat.toFixed(2)),
          batchNumber: line.batchNumber || null,
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
        } as any);
      }

      const discountType = headerUpdates?.discountType || invoice.discountType || "percent";
      const discountValue = parseFloat(headerUpdates?.discountValue || invoice.discountValue) || 0;
      let invoiceDiscount = 0;
      if (discountType === "percent") {
        invoiceDiscount = totalBeforeVat * (discountValue / 100);
      } else {
        invoiceDiscount = discountValue;
      }

      const totalAfterVat = totalBeforeVat + totalVat;
      const netPayable = totalAfterVat - invoiceDiscount;

      const updateSet: any = {
        totalBeforeVat: String(totalBeforeVat.toFixed(2)),
        totalVat: String(totalVat.toFixed(2)),
        totalAfterVat: String(totalAfterVat.toFixed(2)),
        totalLineDiscounts: String(totalLineDiscounts.toFixed(2)),
        netPayable: String(netPayable.toFixed(2)),
        updatedAt: new Date(),
      };
      if (headerUpdates?.discountType) updateSet.discountType = headerUpdates.discountType;
      if (headerUpdates?.discountValue !== undefined) updateSet.discountValue = String(headerUpdates.discountValue);
      if (headerUpdates?.notes !== undefined) updateSet.notes = headerUpdates.notes;
      if (headerUpdates?.invoiceDate) updateSet.invoiceDate = headerUpdates.invoiceDate;

      await tx.update(purchaseInvoiceHeaders).set(updateSet).where(eq(purchaseInvoiceHeaders.id, invoiceId));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      return updated;
    });
  },

  async approvePurchaseInvoice(this: DatabaseStorage, id: string): Promise<any> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM purchase_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("الفاتورة غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");

      await tx.update(purchaseInvoiceHeaders).set({
        status: "approved_costed",
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(purchaseInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      return updated;
    });

    if (result) {
      (this as any).generatePurchaseInvoiceJournal(id, result).catch((err: any) => 
        console.error("Auto journal for purchase invoice failed:", err)
      );
    }

    return result;
  },

  async generatePurchaseInvoiceJournal(this: DatabaseStorage, invoiceId: string, invoice: any): Promise<JournalEntry | null> {
    const existingEntries = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "purchase_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ));
    if (existingEntries.length > 0) return existingEntries[0];

    const totalBeforeVat = parseFloat(invoice.totalBeforeVat || "0");
    const totalVat = parseFloat(invoice.totalVat || "0");
    const totalAfterVat = parseFloat(invoice.totalAfterVat || "0");
    const netPayable = parseFloat(invoice.netPayable || "0");
    const headerDiscount = totalAfterVat - netPayable;

    if (totalBeforeVat <= 0 && netPayable <= 0) return null;

    const mappings = await this.getMappingsForTransaction("purchase_invoice");
    if (mappings.length === 0) return null;

    const mappingMap = new Map<string, AccountMapping>();
    for (const m of mappings) {
      mappingMap.set(m.lineType, m);
    }

    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, invoice.supplierId));
    const supplierType = supplier?.supplierType || "drugs";
    const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";

    const journalLineData: InsertJournalLine[] = [];
    const desc = `قيد فاتورة مشتريات رقم ${invoice.invoiceNumber}`;

    const inventoryMapping = mappingMap.get("inventory");
    if (inventoryMapping?.debitAccountId && totalBeforeVat > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: inventoryMapping.debitAccountId,
        debit: String(totalBeforeVat.toFixed(2)),
        credit: "0",
        description: "مخزون - فاتورة مشتريات",
      });
    }

    const vatMapping = mappingMap.get("vat_input");
    if (vatMapping?.debitAccountId && totalVat > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: vatMapping.debitAccountId,
        debit: String(totalVat.toFixed(2)),
        credit: "0",
        description: "ضريبة قيمة مضافة - مدخلات",
      });
    }

    const discountMapping = mappingMap.get("discount_earned");
    if (discountMapping?.creditAccountId && headerDiscount > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: discountMapping.creditAccountId,
        debit: "0",
        credit: String(headerDiscount.toFixed(2)),
        description: "خصم مكتسب",
      });
    }

    const payablesMapping = mappingMap.get(payablesLineType) || mappingMap.get("payables");
    if (payablesMapping?.creditAccountId && netPayable > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: payablesMapping.creditAccountId,
        debit: "0",
        credit: String(netPayable.toFixed(2)),
        description: supplierType === "consumables" ? "موردين مستلزمات" : "موردين أدوية",
      });
    }

    if (journalLineData.length === 0) return null;

    const totalDebits = journalLineData.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
    const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
    const diff = Math.abs(totalDebits - totalCredits);

    if (diff > 0.01) {
      console.error(`Purchase invoice journal unbalanced: debits=${totalDebits}, credits=${totalCredits}, diff=${diff}`);
      return null;
    }

    return db.transaction(async (tx) => {
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
        reference: `PUR-${invoice.invoiceNumber}`,
        description: desc,
        status: "draft",
        periodId: period?.id || null,
        sourceType: "purchase_invoice",
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
    });
  },

  async createReceivingCorrection(this: DatabaseStorage, originalId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const original = lockResult.rows?.[0] as any;
      if (!original) throw new Error('المستند غير موجود');
      if (original.status !== 'posted_qty_only') throw new Error('يمكن تصحيح المستندات المرحّلة فقط');
      if (original.correction_status === 'corrected') throw new Error('تم تصحيح هذا المستند مسبقاً');
      if (original.converted_to_invoice_id) {
        const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, original.converted_to_invoice_id));
        if (invoice && invoice.status !== 'draft') {
          throw new Error('لا يمكن تصحيح إذن استلام محوّل لفاتورة معتمدة');
        }
      }

      const [maxNum] = await tx.select({ max: sql<number>`COALESCE(MAX(receiving_number), 0)` }).from(receivingHeaders);
      const nextNum = (maxNum?.max || 0) + 1;

      const [newHeader] = await tx.insert(receivingHeaders).values({
        receivingNumber: nextNum,
        supplierId: original.supplier_id,
        supplierInvoiceNo: `${original.supplier_invoice_no || 'N/A'}-COR-${nextNum}`,
        warehouseId: original.warehouse_id,
        receiveDate: original.receive_date,
        notes: original.notes ? `تصحيح للإذن رقم ${original.receiving_number} - ${original.notes}` : `تصحيح للإذن رقم ${original.receiving_number}`,
        status: 'draft',
        correctionOfId: originalId,
        correctionStatus: 'correction',
      }).returning();

      const originalLines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, originalId));
      let totalQty = 0;
      let totalCost = 0;

      for (const line of originalLines) {
        await tx.insert(receivingLines).values({
          receivingId: newHeader.id,
          itemId: line.itemId,
          unitLevel: line.unitLevel,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          bonusQty: line.bonusQty,
          bonusQtyInMinor: line.bonusQtyInMinor,
          purchasePrice: line.purchasePrice,
          lineTotal: line.lineTotal,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          expiryMonth: line.expiryMonth,
          expiryYear: line.expiryYear,
          salePrice: line.salePrice,
          salePriceHint: line.salePriceHint,
          notes: line.notes,
          isRejected: line.isRejected,
          rejectionReason: line.rejectionReason,
        });
        if (!line.isRejected) {
          totalQty += parseFloat(line.qtyInMinor as string) || 0;
          totalCost += parseFloat(line.lineTotal as string) || 0;
        }
      }

      await tx.update(receivingHeaders).set({
        totalQty: totalQty.toFixed(4),
        totalCost: roundMoney(totalCost),
      }).where(eq(receivingHeaders.id, newHeader.id));

      await tx.update(receivingHeaders).set({
        correctedById: newHeader.id,
        correctionStatus: 'corrected',
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, originalId));

      const [result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, newHeader.id));
      return result;
    });
  },

  async postReceivingCorrection(this: DatabaseStorage, correctionId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${correctionId} FOR UPDATE`);
      const correction = lockResult.rows?.[0] as any;
      if (!correction) throw new Error('المستند غير موجود');
      if (correction.status !== 'draft') throw new Error('لا يمكن ترحيل مستند غير مسودة');
      if (correction.correction_status !== 'correction') throw new Error('هذا المستند ليس مستند تصحيح');

      const originalId = correction.correction_of_id;
      if (!originalId) throw new Error('لا يوجد مستند أصلي للتصحيح');

      const [corrSupplier] = correction.supplier_id
        ? await tx.select().from(suppliers).where(eq(suppliers.id, correction.supplier_id))
        : [null];
      const corrSupplierName = corrSupplier?.nameAr || corrSupplier?.nameEn || null;

      const origLockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const original = origLockResult.rows?.[0] as any;
      if (!original) throw new Error('المستند الأصلي غير موجود');

      const originalMovements = await tx.select().from(inventoryLotMovements)
        .where(and(
          eq(inventoryLotMovements.referenceType, 'receiving'),
          eq(inventoryLotMovements.referenceId, originalId),
        ));

      for (const mov of originalMovements) {
        const qtyToReverse = parseFloat(mov.qtyChangeInMinor as string);
        if (qtyToReverse <= 0) continue;

        const [lot] = await tx.select().from(inventoryLots).where(eq(inventoryLots.id, mov.lotId));
        if (!lot) continue;

        const currentQty = parseFloat(lot.qtyInMinor as string);
        if (currentQty < qtyToReverse) {
          const [item] = await tx.select().from(items).where(eq(items.id, lot.itemId));
          throw new Error(`لا يمكن التصحيح: الصنف "${item?.nameAr || ''}" سيصبح رصيده سالباً في المستودع (المتاح: ${currentQty.toFixed(2)}, المطلوب عكسه: ${qtyToReverse.toFixed(2)})`);
        }

        const newQty = currentQty - qtyToReverse;
        await tx.update(inventoryLots).set({ 
          qtyInMinor: newQty.toFixed(4),
          updatedAt: new Date(),
        }).where(eq(inventoryLots.id, mov.lotId));

        await tx.insert(inventoryLotMovements).values({
          lotId: mov.lotId,
          warehouseId: mov.warehouseId,
          txType: 'out',
          qtyChangeInMinor: (-qtyToReverse).toFixed(4),
          unitCost: mov.unitCost,
          referenceType: 'receiving_correction_reversal',
          referenceId: correctionId,
        });
      }

      const correctionLines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, correctionId));
      const activeLines = correctionLines.filter(l => !l.isRejected);

      for (const line of activeLines) {
        const qtyMinor = parseFloat(line.qtyInMinor as string) + parseFloat(line.bonusQtyInMinor as string || "0");
        if (qtyMinor <= 0) continue;

        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) continue;

        const costPerMinor = convertPriceToMinorUnit(parseFloat(line.purchasePrice as string), (line as any).unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);

        const lotConditions = [
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, correction.warehouse_id),
        ];
        if (line.expiryMonth && line.expiryYear) {
          lotConditions.push(eq(inventoryLots.expiryMonth, line.expiryMonth));
          lotConditions.push(eq(inventoryLots.expiryYear, line.expiryYear));
        } else {
          lotConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
        }

        const existingLots = await tx.select().from(inventoryLots).where(and(...lotConditions));
        let lotId: string;

        const corrLotSalePrice = line.salePrice || "0";
        
        if (existingLots.length > 0) {
          const lot = existingLots[0];
          const newQty = parseFloat(lot.qtyInMinor as string) + qtyMinor;
          await tx.update(inventoryLots).set({ 
            qtyInMinor: newQty.toFixed(4),
            purchasePrice: costPerMinorStr,
            salePrice: corrLotSalePrice,
            updatedAt: new Date(),
          }).where(eq(inventoryLots.id, lot.id));
          lotId = lot.id;
        } else {
          const [newLot] = await tx.insert(inventoryLots).values({
            itemId: line.itemId,
            warehouseId: correction.warehouse_id,
            expiryDate: line.expiryDate || null,
            expiryMonth: line.expiryMonth || null,
            expiryYear: line.expiryYear || null,
            receivedDate: correction.receive_date,
            purchasePrice: costPerMinorStr,
            salePrice: corrLotSalePrice,
            qtyInMinor: qtyMinor.toFixed(4),
          }).returning();
          lotId = newLot.id;
        }

        await tx.insert(inventoryLotMovements).values({
          lotId,
          warehouseId: correction.warehouse_id,
          txType: 'in',
          qtyChangeInMinor: qtyMinor.toFixed(4),
          unitCost: costPerMinorStr,
          referenceType: 'receiving_correction',
          referenceId: correctionId,
        });

        const corrPurchaseTotal = (parseFloat(line.qtyInMinor as string) * costPerMinor).toFixed(2);
        await tx.insert(purchaseTransactions).values({
          itemId: line.itemId,
          txDate: correction.receive_date,
          supplierName: corrSupplierName,
          qty: (line as any).qtyEntered || line.qtyInMinor as string,
          unitLevel: (line as any).unitLevel || 'minor',
          purchasePrice: line.purchasePrice as string,
          salePriceSnapshot: line.salePrice || null,
          total: corrPurchaseTotal,
        });

        const updateFields: any = { purchasePriceLast: line.purchasePrice, updatedAt: new Date() };
        if (line.salePrice) updateFields.salePriceCurrent = line.salePrice;
        await tx.update(items).set(updateFields).where(eq(items.id, line.itemId));
      }

      const [posted] = await tx.update(receivingHeaders).set({
        status: 'posted_qty_only',
        postedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, correctionId)).returning();

      return posted;
    });
  },

  async deletePurchaseInvoice(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!invoice) return false;
    if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة معتمدة ومُسعّرة");
    await db.update(purchaseInvoiceHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
    }).where(eq(purchaseInvoiceHeaders.id, id));
    return true;
  },
};

export default methods;
