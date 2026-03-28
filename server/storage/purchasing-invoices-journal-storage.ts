import { db, type DrizzleTransaction } from "../db";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import { convertPriceToMinor } from "../inventory-helpers";
import {
  items,
  inventoryLots,
  inventoryLotMovements,
  suppliers,
  receivingHeaders,
  receivingLines,
  purchaseInvoiceHeaders,
  accountMappings,
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


/**
 * Builds and inserts the purchase invoice journal entry inside an existing transaction.
 *
 * Design principles:
 * - ALL reads and writes go through the supplied `tx` — never touches `db` directly.
 * - Idempotent: if a journal entry already exists for this sourceDocumentId, returns it and skips.
 * - Throws explicit Arabic business errors on missing mappings, closed period, or unbalanced journal.
 *   This ensures the caller's transaction rolls back completely on any failure.
 *
 * Steps:
 *   Step A — Idempotency check via tx
 *   Step B — Load account mappings for "purchase_invoice" via tx
 *   Step C — Load supplier to determine payables line type
 *   Step D — Build journal lines (inventory, VAT, discount, payables)
 *   Step E — Validate balance (throw if diff > 0.01)
 *   Step F — Validate fiscal period is open via tx
 *   Step G — Get next entry number via tx (race-safe inside transaction)
 *   Step H — Insert journal_entries + journal_lines via tx
 */
async function generatePurchaseInvoiceJournalInTx(
  tx: DrizzleTransaction,
  invoiceId: string,
  invoice: PurchaseInvoiceHeader
): Promise<JournalEntry | null> {
  // Step A: Idempotency — skip if journal already exists for this invoice
  const [existingEntry] = await tx.select().from(journalEntries)
    .where(and(
      eq(journalEntries.sourceType, "purchase_invoice"),
      eq(journalEntries.sourceDocumentId, invoiceId)
    ))
    .limit(1);
  if (existingEntry) return existingEntry;

  // Guard: skip zero-value invoices
  const totalBeforeVat = parseFloat(invoice.totalBeforeVat || "0");
  const totalVat       = parseFloat(invoice.totalVat       || "0");
  const totalAfterVat  = parseFloat(invoice.totalAfterVat  || "0");
  const netPayable     = parseFloat(invoice.netPayable      || "0");
  const headerDiscount = totalAfterVat - netPayable;

  if (totalBeforeVat <= 0 && netPayable <= 0) return null;

  // Step B: Load account mappings with warehouse fallback logic
  //   1. If the invoice is linked to a receiving, use that receiving's warehouseId
  //   2. Warehouse-specific mappings override generic for matching line types
  //   3. Generic mappings serve as fallback for any line type not covered by warehouse-specific
  let invoiceWarehouseId: string | null = null;
  if (invoice.receivingId) {
    const [recv] = await tx.select({ warehouseId: receivingHeaders.warehouseId })
      .from(receivingHeaders)
      .where(eq(receivingHeaders.id, invoice.receivingId));
    invoiceWarehouseId = recv?.warehouseId || null;
  }

  const allMappings = await tx.select().from(accountMappings)
    .where(and(
      eq(accountMappings.transactionType, "purchase_invoice"),
      eq(accountMappings.isActive, true)
    ))
    .orderBy(asc(accountMappings.lineType));

  let effectiveMappings: AccountMapping[];
  if (invoiceWarehouseId) {
    const warehouseSpecific = allMappings.filter(m => m.warehouseId === invoiceWarehouseId);
    const generic           = allMappings.filter(m => !m.warehouseId);
    const coveredByWarehouse = new Set(warehouseSpecific.map(m => m.lineType));
    const fallback           = generic.filter(m => !coveredByWarehouse.has(m.lineType));
    effectiveMappings = [...warehouseSpecific, ...fallback];
  } else {
    effectiveMappings = allMappings.filter(m => !m.warehouseId);
  }

  if (effectiveMappings.length === 0) {
    throw new Error("لا توجد ربط حسابات (Account Mappings) مُعرَّفة لنوع المعاملة: فواتير المشتريات. يرجى تعريفها أولاً.");
  }

  const mappingMap = new Map<string, AccountMapping>();
  for (const m of effectiveMappings) {
    mappingMap.set(m.lineType, m);
  }

  // Step C: Load supplier — determine payables line type AND check for optional AP override
  const [supplier] = await tx.select().from(suppliers)
    .where(eq(suppliers.id, invoice.supplierId));
  const supplierType     = supplier?.supplierType || "drugs";
  const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";

  // ===== Supplier Account Linkage Logic =====
  // If the supplier has a dedicated GL account (glAccountId), use it as the AP/payables credit account.
  // This is OPTIONAL and PER-SUPPLIER — it overrides the grouped account_mappings model only when set.
  // If glAccountId is null/undefined, the system falls back to the grouped mapping (payables_drugs /
  // payables_consumables), which remains the permanent default for all suppliers without a specific account.
  const supplierSpecificApAccountId = supplier?.glAccountId || null;

  // Step D: Build journal lines — REQUIRED mappings throw, CONDITIONAL throw when condition exists

  const journalLineData: InsertJournalLine[] = [];
  const descriptionText = `قيد فاتورة مشتريات رقم ${invoice.invoiceNumber}`;

  // ── سياسة خصم الأسطر (موثّقة) ─────────────────────────────────────────
  // totalBeforeVat = SUM(qty × purchasePrice) حيث purchasePrice = السعر النهائي المتفق عليه
  // lineDiscountValue = فرق تسعير (سعر البيع − سعر الشراء) — آلية تسعير فقط، لا تؤثر على القيد
  // الخصم الوحيد الذي يُرحَّل كبند منفصل هو الخصم الرأسي على إجمالي الفاتورة (headerDiscount)
  // القيد المطلوب:
  //   Dr Inventory  = totalBeforeVat   (qty × سعر الشراء النهائي)
  //   Dr VAT Input  = totalVat
  //   Cr Disc.Earned= headerDiscount   (الخصم الرأسي فقط)
  //   Cr Payables   = netPayable

  // inventory — REQUIRED (always present in a purchase)
  const inventoryMapping = mappingMap.get("inventory");
  if (!inventoryMapping?.debitAccountId) {
    throw new Error("حساب المخزون (inventory) غير مُعرَّف في ربط الحسابات. يرجى تحديد حساب المدين له أولاً.");
  }
  if (totalBeforeVat > 0) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber:     0,
      accountId:      inventoryMapping.debitAccountId,
      debit:          String(totalBeforeVat.toFixed(2)),
      credit:         "0",
      description:    "مخزون - فاتورة مشتريات",
    });
  }

  // vat_input — CONDITIONAL: required when the invoice has VAT
  const vatMapping = mappingMap.get("vat_input");
  if (totalVat > 0 && !vatMapping?.debitAccountId) {
    throw new Error("حساب ضريبة القيمة المضافة - المدخلات (vat_input) غير مُعرَّف في ربط الحسابات. الفاتورة تحتوي على ضريبة بقيمة " + totalVat.toFixed(2) + " جنيه.");
  }
  if (vatMapping?.debitAccountId && totalVat > 0) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber:     0,
      accountId:      vatMapping.debitAccountId,
      debit:          String(totalVat.toFixed(2)),
      credit:         "0",
      description:    "ضريبة قيمة مضافة - مدخلات",
    });
  }

  // discount_earned — CONDITIONAL: required when the invoice has a header discount
  const discountMapping = mappingMap.get("discount_earned");
  if (headerDiscount > 0.001 && !discountMapping?.creditAccountId) {
    throw new Error("حساب الخصم المكتسب (discount_earned) غير مُعرَّف في ربط الحسابات. الفاتورة تحتوي على خصم بقيمة " + headerDiscount.toFixed(2) + " جنيه.");
  }
  if (discountMapping?.creditAccountId && headerDiscount > 0.001) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber:     0,
      accountId:      discountMapping.creditAccountId,
      debit:          "0",
      credit:         String(headerDiscount.toFixed(2)),
      description:    "خصم مكتسب",
    });
  }

  // ===== Journal Posting Override: Payables / AP Account =====
  // Resolution order:
  //   1. supplierSpecificApAccountId  — set on the supplier record (optional override)
  //   2. payablesMapping.creditAccountId — from account_mappings (grouped AP, permanent default)
  // The grouped AP model is NEVER removed; it is the fallback for all suppliers without a specific account.
  const payablesMapping = mappingMap.get(payablesLineType) || mappingMap.get("payables");

  // Determine the effective AP credit account
  const effectiveApAccountId = supplierSpecificApAccountId ?? payablesMapping?.creditAccountId ?? null;

  if (!effectiveApAccountId) {
    throw new Error(`حساب ذمم الموردين (${payablesLineType}) غير مُعرَّف في ربط الحسابات. يرجى إضافة حساب الدائن له.`);
  }

  if (netPayable > 0) {
    const apDescription = supplierSpecificApAccountId
      ? `ذمم مورد - ${supplier?.nameAr || "مورد"}`           // supplier-specific AP account
      : supplierType === "consumables"
        ? "موردين مستلزمات"                                    // grouped AP fallback
        : "موردين أدوية";                                      // grouped AP fallback
    journalLineData.push({
      journalEntryId: "",
      lineNumber:     0,
      accountId:      effectiveApAccountId,
      debit:          "0",
      credit:         String(netPayable.toFixed(2)),
      description:    apDescription,
    });
  }

  if (journalLineData.length === 0) return null;

  // Step E: Validate balance — throw on mismatch so the whole tx rolls back
  const totalDebits  = journalLineData.reduce((s, l) => s + parseFloat(l.debit  || "0"), 0);
  const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
  const diff = Math.abs(totalDebits - totalCredits);
  if (diff > 0.01) {
    throw new Error(`القيد المحاسبي غير متوازن: مدين=${totalDebits.toFixed(2)}، دائن=${totalCredits.toFixed(2)}، الفرق=${diff.toFixed(2)}`);
  }

  // Step F: Validate fiscal period is open via tx
  const [period] = await tx.select().from(fiscalPeriods)
    .where(and(
      lte(fiscalPeriods.startDate, invoice.invoiceDate),
      gte(fiscalPeriods.endDate,   invoice.invoiceDate),
      eq(fiscalPeriods.isClosed, false)
    ))
    .limit(1);
  if (!period) {
    throw new Error(`الفترة المحاسبية لتاريخ ${invoice.invoiceDate} مغلقة أو غير موجودة. لا يمكن اعتماد الفاتورة.`);
  }

  // Step G: Next entry number — uses the DB sequence to prevent duplicate-key races
  const seqResult = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
  const entryNumber = Number((seqResult.rows[0] as Record<string, unknown>).next_num);

  // Step H: Insert journal entry header + lines via tx
  // status = "posted" directly — اعتماد الفاتورة هو حدث التفويض، لا معنى لإبقائه مسودة
  const [entry] = await tx.insert(journalEntries).values({
    entryNumber,
    entryDate:        invoice.invoiceDate,
    reference:        `PUR-${invoice.invoiceNumber}`,
    description:      descriptionText,
    status:           "posted",
    postedAt:         new Date(),
    periodId:         period.id,
    sourceType:       "purchase_invoice",
    sourceDocumentId: invoiceId,
    totalDebit:       String(totalDebits.toFixed(2)),
    totalCredit:      String(totalCredits.toFixed(2)),
  }).returning();

  const linesWithEntryId = journalLineData.map((l, idx) => ({
    ...l,
    journalEntryId: entry.id,
    lineNumber:     idx + 1,
  }));
  await tx.insert(journalLines).values(linesWithEntryId);

  return entry;
}

const journalMethods = {
  /**
   * Generates the purchase invoice journal entry inside an existing transaction.
   * Use this during invoice approval so lot recosting + journal are atomic.
   * Throws on missing mappings, closed period, or unbalanced journal.
   */
  async generatePurchaseInvoiceJournalInTx(
    tx: DrizzleTransaction,
    invoiceId: string,
    invoice: PurchaseInvoiceHeader
  ): Promise<JournalEntry | null> {
    return generatePurchaseInvoiceJournalInTx(tx, invoiceId, invoice);
  },

  /**
   * Standalone (non-transactional) journal generation — kept for backward compatibility.
   * Used only for manual retries outside the approval flow.
   * Has its own idempotency check and fires its own db.transaction internally.
   */
  async generatePurchaseInvoiceJournal(this: any, invoiceId: string, invoice: PurchaseInvoiceHeader): Promise<JournalEntry | null> {
    return db.transaction(async (tx) => {
      return generatePurchaseInvoiceJournalInTx(tx, invoiceId, invoice);
    });
  },

  async createReceivingCorrection(this: any, originalId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      // Acquire row lock, then read with ORM for proper camelCase field names
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
      // Acquire row lock, then read with ORM for proper camelCase field names
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${correctionId} FOR UPDATE`);
      const [correction] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, correctionId));
      if (!correction) throw new Error('المستند غير موجود');
      if (correction.status !== 'draft') throw new Error('لا يمكن ترحيل مستند غير مسودة');
      if (correction.correctionStatus !== 'correction') throw new Error('هذا المستند ليس مستند تصحيح');

      const originalId = correction.correctionOfId;
      if (!originalId) throw new Error('لا يوجد مستند أصلي للتصحيح');

      // Lock the original too, then verify it exists
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const [original] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, originalId));
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

export default journalMethods;
