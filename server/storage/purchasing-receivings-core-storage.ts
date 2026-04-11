import { db } from "../db";
import { eq, desc, and, gte, lte, gt, sql, or, ilike, isNull, isNotNull, inArray } from "drizzle-orm";
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
  purchaseTransactions,
  type Supplier,
  type ReceivingHeader,
  type InsertReceivingHeader,
  type ReceivingHeaderWithDetails,
  type ReceivingLineWithItem,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

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
    let resolvedInventoryGlAccountId: string | null = null;
    let resolvedApAccountId: string | null = null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${id} FOR UPDATE`);
      const [header] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
      if (!header) throw new Error('المستند غير موجود');
      if (header.status === 'posted' || header.status === 'posted_qty_only' || header.status === 'posted_costed') return header;
      
      if (!header.supplierId) throw new Error('المورد مطلوب');
      if (!header.supplierInvoiceNo?.trim()) throw new Error('رقم فاتورة المورد مطلوب');
      if (!header.warehouseId) throw new Error('المستودع مطلوب');
      
      const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, header.supplierId));
      const supplierName = supplier?.nameAr || supplier?.nameEn || null;

      const [wh] = await tx.select({ glAccountId: warehouses.glAccountId, nameAr: warehouses.nameAr })
        .from(warehouses).where(eq(warehouses.id, header.warehouseId));
      resolvedInventoryGlAccountId = wh?.glAccountId ?? null;
      if (!resolvedInventoryGlAccountId) {
        throw new Error(
          `المخزن "${wh?.nameAr ?? header.warehouseId}" لا يملك حساب GL محاسبي.\n` +
          `الحل: إدارة المخازن ← تعديل ← حدد "حساب GL" للمخزن ثم أعِد الترحيل.`
        );
      }

      resolvedApAccountId = (supplier as any)?.glAccountId ?? null;
      if (!resolvedApAccountId) {
        const supplierType  = (supplier as any)?.supplierType || "drugs";
        const payablesLT    = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";
        const apMappingRes  = await tx.execute(sql`
          SELECT credit_account_id FROM account_mappings
          WHERE transaction_type = 'purchase_invoice'
            AND line_type        = ${payablesLT}
            AND is_active        = true
            AND warehouse_id IS NULL
          LIMIT 1
        `);
        resolvedApAccountId = (apMappingRes as any).rows[0]?.credit_account_id ?? null;
      }
      if (!resolvedApAccountId) {
        throw new Error(
          `لا يوجد حساب ذمم موردين لإنشاء قيد الاستلام.\n` +
          `الحل: أضف ربط "payables_drugs" لنوع المعاملة purchase_invoice في شاشة إدارة الحسابات.`
        );
      }

      const lines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
      const activeLines = lines.filter(l => !l.isRejected);
      if (activeLines.length === 0) throw new Error('لا توجد أصناف للترحيل');
      
      for (const line of activeLines) {
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) continue;

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

        const qtyMinor = serverQty + serverBonus;
        if (qtyMinor <= 0) continue;
        
        if (item.hasExpiry && (!line.expiryMonth || !line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
        if (!item.hasExpiry && (line.expiryMonth || line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" لا يدعم تواريخ صلاحية`);
        
        const costPerMinor = convertPriceToMinorUnit(parseFloat(line.purchasePrice), line.unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);
        
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
        await db.update(receivingHeaders).set({ journalStatus: "pending", updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
        await logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "pending" });

        this.generateJournalEntry({
          sourceType: "purchase_receiving",
          sourceDocumentId: id,
          reference: `RCV-${recvHeader.receivingNumber}`,
          description: `قيد استلام مورد رقم ${recvHeader.receivingNumber}`,
          entryDate: recvHeader.receiveDate,
          lines: [
            { lineType: "inventory", amount: String(totalCost) },
            { lineType: "payables", amount: String(totalCost) },
          ],
          dynamicAccountOverrides: {
            inventory: { debitAccountId: resolvedInventoryGlAccountId ?? undefined },
            payables:  { creditAccountId: resolvedApAccountId ?? undefined },
          },
        }).then(async (entry) => {
          if (entry) {
            await db.update(receivingHeaders).set({ journalStatus: "posted", journalError: null, updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
            logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "completed", journalEntryId: entry.id }).catch(() => {});
          } else {
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
