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
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  purchaseTransactions,
  type ReceivingHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

const methods = {
  async editPostedReceiving(
    this: DatabaseStorage,
    id: string,
    newLines: {
      itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string;
      purchasePrice: string; lineTotal: string; batchNumber?: string;
      expiryDate?: string; expiryMonth?: number; expiryYear?: number;
      salePrice?: string; salePriceHint?: string; notes?: string;
      isRejected?: boolean; rejectionReason?: string;
      bonusQty?: string; bonusQtyInMinor?: string;
    }[],
  ): Promise<ReceivingHeader> {

    let oldJournalEntryId: string | null = null;
    let resolvedInventoryGlAccountId: string | null = null;
    let resolvedApAccountId: string | null = null;

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${id} FOR UPDATE`);
      const [header] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
      if (!header) throw new Error('المستند غير موجود');
      if (header.status === 'posted_costed')
        throw new Error('لا يمكن تعديل مستند مُحوَّل لفاتورة شراء — يجب تعديل الفاتورة مباشرة');
      if (header.status !== 'posted_qty_only')
        throw new Error('يمكن تعديل أذونات الاستلام المُرحَّلة فقط (حالة: مرحّل)');
      if (!header.warehouseId) throw new Error('المستودع مطلوب');

      const oldMovementsRes = await tx.execute(
        sql`SELECT lot_id, qty_change_in_minor FROM inventory_lot_movements
            WHERE reference_type = 'receiving' AND reference_id = ${id}
            FOR UPDATE`
      );
      const oldMovements = (oldMovementsRes as any).rows as { lot_id: string; qty_change_in_minor: string }[];

      const lotReverseMap = new Map<string, number>();
      for (const mv of oldMovements) {
        const prev = lotReverseMap.get(mv.lot_id) || 0;
        lotReverseMap.set(mv.lot_id, prev + parseFloat(mv.qty_change_in_minor));
      }

      for (const [lotId, qtyToReverse] of lotReverseMap) {
        const lotRows = await tx.execute(
          sql`SELECT id, qty_in_minor, item_id FROM inventory_lots WHERE id = ${lotId} FOR UPDATE`
        );
        const lot = (lotRows as any).rows[0] as { id: string; qty_in_minor: string; item_id: string } | undefined;
        if (!lot) continue;
        const currentQty = parseFloat(lot.qty_in_minor);
        if (currentQty - qtyToReverse < -QTY_MINOR_TOLERANCE) {
          const [item] = await tx.select({ nameAr: items.nameAr }).from(items).where(eq(items.id, lot.item_id));
          throw new Error(
            `لا يمكن التعديل: الصنف "${item?.nameAr || lot.item_id}" تم بيع أو صرف جزء من كميته.\n` +
            `الرصيد الحالي: ${currentQty.toFixed(2)} | الكمية المستلمة أصلاً: ${qtyToReverse.toFixed(2)}`
          );
        }
        const newQty = Math.max(0, currentQty - qtyToReverse);
        await tx.execute(
          sql`UPDATE inventory_lots SET qty_in_minor = ${newQty.toFixed(4)}, updated_at = NOW() WHERE id = ${lotId}`
        );
      }

      await tx.execute(
        sql`DELETE FROM inventory_lot_movements WHERE reference_type = 'receiving' AND reference_id = ${id}`
      );

      await tx.delete(receivingLines).where(eq(receivingLines.receivingId, id));

      let totalQty = 0;
      let totalCost = 0;
      for (const line of newLines) {
        const lt  = parseFloat(line.lineTotal) || 0;
        const qty = parseFloat(line.qtyInMinor) || 0;
        totalQty += qty;
        totalCost += lt;
        let resolvedUnitLevel = line.unitLevel;
        if (!resolvedUnitLevel || resolvedUnitLevel.trim() === '') {
          const [li] = await tx.select().from(items).where(eq(items.id, line.itemId));
          resolvedUnitLevel = li?.majorUnitName ? 'major' : 'minor';
        }
        await tx.insert(receivingLines).values({
          receivingId: id,
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

      const [wh] = await tx.select({ glAccountId: warehouses.glAccountId, nameAr: warehouses.nameAr })
        .from(warehouses).where(eq(warehouses.id, header.warehouseId!));
      resolvedInventoryGlAccountId = wh?.glAccountId ?? null;

      const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, header.supplierId!));
      resolvedApAccountId = (sup as any)?.glAccountId ?? null;
      if (!resolvedApAccountId && sup) {
        const supplierType = (sup as any)?.supplierType || "drugs";
        const payablesLT   = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";
        const apMappingRes = await tx.execute(sql`
          SELECT credit_account_id FROM account_mappings
          WHERE transaction_type = 'purchase_invoice'
            AND line_type = ${payablesLT}
            AND is_active = true
            AND warehouse_id IS NULL
          LIMIT 1
        `);
        resolvedApAccountId = (apMappingRes as any).rows[0]?.credit_account_id ?? null;
      }

      const supplierName = sup?.nameAr || sup?.nameEn || null;
      const activeLines = newLines.filter(l => !l.isRejected);

      for (const line of activeLines) {
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) continue;

        const serverQty   = convertQtyToMinor(parseFloat(line.qtyEntered), line.unitLevel || 'minor', item);
        const storedQty   = parseFloat(line.qtyInMinor);
        if (Math.abs(serverQty - storedQty) > QTY_MINOR_TOLERANCE) {
          throw new Error(`الصنف "${item.nameAr}" — الكمية المحسوبة (${serverQty.toFixed(4)}) تختلف عن المخزّنة (${storedQty.toFixed(4)})`);
        }
        const serverBonus = convertQtyToMinor(parseFloat(line.bonusQty || "0"), line.unitLevel || 'minor', item);
        const storedBonus = parseFloat(line.bonusQtyInMinor || "0");
        if (Math.abs(serverBonus - storedBonus) > QTY_MINOR_TOLERANCE) {
          throw new Error(`الصنف "${item.nameAr}" — كمية المجانية (${serverBonus.toFixed(4)}) تختلف عن المخزّنة (${storedBonus.toFixed(4)})`);
        }
        const qtyMinor = serverQty + serverBonus;
        if (qtyMinor <= 0) continue;

        if (item.hasExpiry && (!line.expiryMonth || !line.expiryYear))
          throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);

        const costPerMinor    = convertPriceToMinorUnit(parseFloat(line.purchasePrice), line.unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);
        const lotSalePrice    = line.salePrice || "0";

        let existingLots: any[] = [];
        if (line.expiryMonth && line.expiryYear) {
          const rawLots = await tx.execute(
            sql`SELECT * FROM inventory_lots
                WHERE item_id = ${line.itemId} AND warehouse_id = ${header.warehouseId}
                  AND expiry_month = ${line.expiryMonth} AND expiry_year = ${line.expiryYear}
                FOR UPDATE`
          );
          existingLots = (rawLots as any).rows ?? [];
        } else {
          const rawLots = await tx.execute(
            sql`SELECT * FROM inventory_lots
                WHERE item_id = ${line.itemId} AND warehouse_id = ${header.warehouseId}
                  AND expiry_month IS NULL
                FOR UPDATE`
          );
          existingLots = (rawLots as any).rows ?? [];
        }

        let lotId: string;
        if (existingLots.length > 0) {
          const lot    = existingLots[0] as any;
          const newQty = parseFloat(lot.qty_in_minor) + qtyMinor;
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
            warehouseId: header.warehouseId!,
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
          warehouseId: header.warehouseId!,
          txType: 'in',
          qtyChangeInMinor: qtyMinor.toFixed(4),
          unitCost: costPerMinorStr,
          referenceType: 'receiving',
          referenceId: id,
        });

        await tx.insert(purchaseTransactions).values({
          itemId: line.itemId,
          txDate: header.receiveDate,
          supplierName,
          qty: line.qtyEntered || line.qtyInMinor,
          unitLevel: (line.unitLevel || 'minor') as "major" | "medium" | "minor",
          purchasePrice: line.purchasePrice,
          salePriceSnapshot: line.salePrice || null,
          total: (parseFloat(line.qtyInMinor) * costPerMinor).toFixed(2),
          bonusQty: line.bonusQty || '0',
          supplierInvoiceNo: header.supplierInvoiceNo || null,
        });

        const updateFields: Partial<typeof items.$inferSelect> = { purchasePriceLast: line.purchasePrice, updatedAt: new Date() };
        if (line.salePrice) updateFields.salePriceCurrent = line.salePrice;
        await tx.update(items).set(updateFields).where(eq(items.id, line.itemId));
      }

      await tx.update(receivingHeaders).set({
        totalQty: totalQty.toFixed(4),
        totalCost: roundMoney(totalCost),
        journalStatus: 'none',
        journalError: null,
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, id));

      const oldJournalRes = await tx.execute(
        sql`SELECT id FROM journal_entries
            WHERE source_type = 'purchase_receiving' AND source_document_id = ${id}
              AND status = 'posted'
            ORDER BY created_at DESC LIMIT 1`
      );
      oldJournalEntryId = (oldJournalRes as any).rows[0]?.id ?? null;

      return (await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, id)))[0];
    });

    if (oldJournalEntryId) {
      try {
        await this.reverseJournalEntry(oldJournalEntryId, null);
      } catch (err) {
        logger.warn({ err, receivingId: id }, "[EDIT_POSTED_RCV] Failed to reverse old GL journal — continuing");
      }
    }

    const recvLines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
    const activeForGL = recvLines.filter(l => !l.isRejected);
    const totalCostForGL = activeForGL.reduce((sum, l) => sum + parseFloat(l.lineTotal || "0"), 0);
    if (totalCostForGL > 0 && resolvedInventoryGlAccountId && resolvedApAccountId) {
      await db.update(receivingHeaders).set({ journalStatus: "pending", updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
      await logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "pending" });

      this.generateJournalEntry({
        sourceType: "purchase_receiving",
        sourceDocumentId: id,
        reference: `RCV-${result.receivingNumber}`,
        description: `قيد استلام مورد رقم ${result.receivingNumber} (معدَّل)`,
        entryDate: result.receiveDate,
        lines: [
          { lineType: "inventory", amount: String(totalCostForGL) },
          { lineType: "payables",  amount: String(totalCostForGL) },
        ],
        dynamicAccountOverrides: {
          inventory: { debitAccountId:  resolvedInventoryGlAccountId ?? undefined },
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
        logger.error({ err: msg, receivingId: id }, "[EDIT_POSTED_RCV] Auto journal failed — needs_retry");
        await db.update(receivingHeaders).set({ journalStatus: "needs_retry", journalError: msg, updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
      });
    }

    return result;
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
