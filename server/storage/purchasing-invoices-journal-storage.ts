import { db } from "../db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  items,
  inventoryLots,
  inventoryLotMovements,
  suppliers,
  receivingHeaders,
  receivingLines,
  purchaseInvoiceHeaders,
  journalEntries,
  journalLines,
  fiscalPeriods,
  type AccountMapping,
  type JournalEntry,
  type InsertJournalLine,
  type PurchaseInvoiceHeader,
  type ReceivingHeader,
} from "@shared/schema";
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

const journalMethods = {
  async generatePurchaseInvoiceJournal(this: any, invoiceId: string, invoice: PurchaseInvoiceHeader): Promise<JournalEntry | null> {
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

    const mappings = await this.getMappingsForTransaction("purchase_invoice", null);
    if (mappings.length === 0) return null;

    const mappingMap = new Map<string, AccountMapping>();
    for (const m of mappings) {
      mappingMap.set(m.lineType, m);
    }

    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, invoice.supplierId));
    const supplierType = supplier?.supplierType || "drugs";
    const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";

    const journalLineData: InsertJournalLine[] = [];
    const descriptionText = `قيد فاتورة مشتريات رقم ${invoice.invoiceNumber}`;

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
        description: descriptionText,
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

  async createReceivingCorrection(this: any, originalId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const original = lockResult.rows?.[0] as ReceivingHeader | undefined;
      if (!original) throw new Error('المستند غير موجود');
      if (original.status !== 'posted_qty_only') throw new Error('يمكن تصحيح المستندات المرحّلة فقط');
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
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${correctionId} FOR UPDATE`);
      const correction = lockResult.rows?.[0] as ReceivingHeader | undefined;
      if (!correction) throw new Error('المستند غير موجود');
      if (correction.status !== 'draft') throw new Error('لا يمكن ترحيل مستند غير مسودة');
      if (correction.correctionStatus !== 'correction') throw new Error('هذا المستند ليس مستند تصحيح');

      const originalId = correction.correctionOfId;
      if (!originalId) throw new Error('لا يوجد مستند أصلي للتصحيح');

      const origLockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const original = origLockResult.rows?.[0] as ReceivingHeader | undefined;
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

        const costPerMinor = convertPriceToMinorUnit(parseFloat(line.purchasePrice as string), line.unitLevel || 'minor', item);
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

export default journalMethods;
