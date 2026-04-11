import { db } from "../db";
import { eq, sql } from "drizzle-orm";
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
  type ReceivingHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

export const purchasingReceivingPostMethods = {
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
};
