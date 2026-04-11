import { db, type DrizzleTransaction } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { convertPriceToMinor } from "../inventory-helpers";
import {
  items,
  inventoryLots,
  inventoryLotMovements,
  receivingHeaders,
  receivingLines,
  purchaseInvoiceHeaders,
  type JournalEntry,
  type PurchaseInvoiceHeader,
  type ReceivingHeader,
} from "@shared/schema";
import { roundMoney } from "../finance-helpers";
import { generatePurchaseInvoiceJournalInTx } from "./purchasing-journal-build-storage";

const methods = {
  async generatePurchaseInvoiceJournalInTx(
    tx: DrizzleTransaction,
    invoiceId: string,
    invoice: PurchaseInvoiceHeader
  ): Promise<JournalEntry | null> {
    return generatePurchaseInvoiceJournalInTx(tx, invoiceId, invoice);
  },

  async generatePurchaseInvoiceJournal(this: any, invoiceId: string, invoice: PurchaseInvoiceHeader): Promise<JournalEntry | null> {
    return db.transaction(async (tx) => {
      return generatePurchaseInvoiceJournalInTx(tx, invoiceId, invoice);
    });
  },

  async createReceivingCorrection(this: any, originalId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const [original] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, originalId));
      if (!original) throw new Error('المستند غير موجود');
      if (original.status !== 'posted_qty_only' && original.status !== 'posted_costed') throw new Error('يمكن تصحيح المستندات المرحّلة فقط');
      if (original.correctionStatus === 'corrected') throw new Error('تم تصحيح هذا المستند مسبقاً');
      if (original.convertedToInvoiceId) {
        const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, original.convertedToInvoiceId));
        if (invoice && invoice.status !== 'draft') {
          throw new Error('لا يمكن تصحيح إذن استلام محوّل لفاتورة معتمدة');
        }
      }

      const [maxNum] = await tx.select({ max: sql<number>`COALESCE(MAX(receiving_number), 0)` }).from(receivingHeaders);
      const nextNum = (maxNum?.max || 0) + 1;

      const [newHeader] = await tx.insert(receivingHeaders).values({
        receivingNumber: nextNum,
        supplierId: original.supplierId,
        supplierInvoiceNo: `${original.supplierInvoiceNo || 'N/A'}-COR-${nextNum}`,
        warehouseId: original.warehouseId,
        receiveDate: original.receiveDate,
        notes: original.notes ? `تصحيح للإذن رقم ${original.receivingNumber} - ${original.notes}` : `تصحيح للإذن رقم ${original.receivingNumber}`,
        status: 'draft',
        correctionOfId: originalId,
        correctionStatus: 'correction',
      } as ReceivingHeader).returning();

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

  async postReceivingCorrection(this: any, correctionId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${correctionId} FOR UPDATE`);
      const [correction] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, correctionId));
      if (!correction) throw new Error('المستند غير موجود');
      if (correction.status !== 'draft') throw new Error('لا يمكن ترحيل مستند غير مسودة');
      if (correction.correctionStatus !== 'correction') throw new Error('هذا المستند ليس مستند تصحيح');

      const originalId = correction.correctionOfId;
      if (!originalId) throw new Error('لا يوجد مستند أصلي للتصحيح');

      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const [original] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, originalId));
      if (!original) throw new Error('المستند الأصلي غير موجود');

      const originalMovements = await tx.select().from(inventoryLotMovements)
        .where(and(
          eq(inventoryLotMovements.referenceType, 'receiving'),
          eq(inventoryLotMovements.referenceId, originalId),
        ));

      const movLotIds  = [...new Set(originalMovements.map(m => m.lotId).filter(Boolean) as string[])];
      const movLotRows = movLotIds.length > 0
        ? await tx.select().from(inventoryLots).where(inArray(inventoryLots.id, movLotIds))
        : [];
      const movItemIds  = [...new Set(movLotRows.map(l => l.itemId))];
      const movItemRows = movItemIds.length > 0
        ? await tx.select().from(items).where(inArray(items.id, movItemIds))
        : [];
      const movLotMap  = new Map(movLotRows.map(l => [l.id, l]));
      const movItemMap = new Map(movItemRows.map(i => [i.id, i]));

      for (const mov of originalMovements) {
        const qtyToReverse = parseFloat(mov.qtyChangeInMinor as string);
        if (qtyToReverse <= 0) continue;

        const lot = movLotMap.get(mov.lotId);
        if (!lot) continue;

        const currentQty = parseFloat(lot.qtyInMinor as string);
        if (currentQty < qtyToReverse) {
          const item = movItemMap.get(lot.itemId);
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

      const corrItemIds  = [...new Set(activeLines.map(l => l.itemId))];
      const corrItemRows = corrItemIds.length > 0
        ? await tx.select().from(items).where(inArray(items.id, corrItemIds))
        : [];
      const corrItemMap = new Map(corrItemRows.map(i => [i.id, i]));

      for (const line of activeLines) {
        const qtyMinor = parseFloat(line.qtyInMinor as string) + parseFloat(line.bonusQtyInMinor as string || "0");
        if (qtyMinor <= 0) continue;

        const item = corrItemMap.get(line.itemId);
        if (!item) continue;

        const costPerMinor = convertPriceToMinor(parseFloat(line.purchasePrice as string), line.unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);

        const lotConditions = [
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, correction.warehouseId),
        ];
        if (line.expiryMonth && line.expiryYear) {
          lotConditions.push(eq(inventoryLots.expiryMonth, line.expiryMonth));
          lotConditions.push(eq(inventoryLots.expiryYear, line.expiryYear));
        } else {
          lotConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
          lotConditions.push(sql`${inventoryLots.expiryYear} IS NULL`);
        }
        const [existingLot] = await tx.select().from(inventoryLots).where(and(...lotConditions));

        let lotId: string;
        if (existingLot) {
          lotId = existingLot.id;
          const newLotQty = parseFloat(existingLot.qtyInMinor as string) + qtyMinor;
          await tx.update(inventoryLots).set({
            qtyInMinor: newLotQty.toFixed(4),
            updatedAt: new Date(),
          }).where(eq(inventoryLots.id, lotId));
        } else {
          const [newLot] = await tx.insert(inventoryLots).values({
            itemId: line.itemId,
            warehouseId: correction.warehouseId,
            expiryDate: line.expiryDate || null,
            expiryMonth: line.expiryMonth || null,
            expiryYear: line.expiryYear || null,
            receivedDate: correction.receiveDate,
            purchasePrice: line.purchasePrice,
            salePrice: line.salePrice || "0",
            qtyInMinor: qtyMinor.toFixed(4),
          }).returning();
          lotId = newLot.id;
        }

        await tx.insert(inventoryLotMovements).values({
          lotId,
          warehouseId: correction.warehouseId,
          txType: 'in',
          qtyChangeInMinor: qtyMinor.toFixed(4),
          unitCost: costPerMinorStr,
          referenceType: 'receiving',
          referenceId: correctionId,
        });
      }

      await tx.update(receivingHeaders).set({
        status: 'posted_qty_only',
        postedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, correctionId));

      const [result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, correctionId));
      return result;
    });
  }
};

export default methods;
