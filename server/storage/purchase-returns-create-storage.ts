import { db } from "../db";
import { eq, and, sql, lte, gte, asc } from "drizzle-orm";
import {
  purchaseReturnHeaders,
  purchaseReturnLines,
  purchaseInvoiceHeaders,
  suppliers,
  type PurchaseReturnHeader,
} from "@shared/schema/purchasing";
import {
  inventoryLotMovements,
} from "@shared/schema/inventory";
import {
  accountMappings,
  journalEntries,
  journalLines,
  fiscalPeriods,
  type InsertJournalLine,
} from "@shared/schema/finance";
import { roundMoney, parseMoney } from "../finance-helpers";
import type { DrizzleTransaction } from "../db";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import type { CreatePurchaseReturnInput } from "./purchase-returns-types-storage";
import { getPurchaseInvoiceLinesForReturn } from "./purchase-returns-types-storage";
import { validateAndEnrichLines } from "./purchase-returns-validate-storage";

export async function generatePurchaseReturnJournalInTx(
  tx: DrizzleTransaction,
  returnId: string,
  returnDoc: PurchaseReturnHeader,
  invoiceWarehouseId: string
): Promise<string | null> {
  const [existing] = await tx.select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.sourceType, "purchase_return"),
      eq(journalEntries.sourceDocumentId, returnId)
    ))
    .limit(1);
  if (existing) return existing.id;

  const subtotal   = parseMoney(returnDoc.subtotal as string);
  const taxTotal   = parseMoney(returnDoc.taxTotal as string);
  const grandTotal = parseMoney(returnDoc.grandTotal as string);
  if (grandTotal <= 0 && subtotal <= 0) return null;

  const allMappings = await tx.select().from(accountMappings)
    .where(and(
      eq(accountMappings.transactionType, "purchase_invoice"),
      eq(accountMappings.isActive, true)
    ))
    .orderBy(asc(accountMappings.lineType));

  let effectiveMappings;
  const warehouseSpecific = allMappings.filter(m => m.warehouseId === invoiceWarehouseId);
  const generic           = allMappings.filter(m => !m.warehouseId);
  if (warehouseSpecific.length > 0) {
    const covered  = new Set(warehouseSpecific.map(m => m.lineType));
    effectiveMappings = [...warehouseSpecific, ...generic.filter(m => !covered.has(m.lineType))];
  } else {
    effectiveMappings = generic;
  }

  if (effectiveMappings.length === 0) {
    throw new Error("لا توجد ربط حسابات (Account Mappings) لفواتير المشتريات. يرجى تعريفها أولاً.");
  }
  const mappingMap = new Map(effectiveMappings.map(m => [m.lineType, m]));

  const [supplier] = await tx.select().from(suppliers)
    .where(eq(suppliers.id, returnDoc.supplierId));
  const supplierType     = supplier?.supplierType || "drugs";
  const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";
  const apAccountId      = supplier?.glAccountId
    ?? mappingMap.get(payablesLineType)?.creditAccountId
    ?? mappingMap.get("payables")?.creditAccountId
    ?? null;

  const inventoryMapping = mappingMap.get("inventory");
  const vatMapping       = mappingMap.get("vat_input");

  if (!inventoryMapping?.debitAccountId) {
    throw new Error("حساب المخزون غير مُعرَّف في ربط الحسابات. يرجى تحديده أولاً.");
  }
  if (!apAccountId) {
    throw new Error(`حساب ذمم الموردين (${payablesLineType}) غير مُعرَّف في ربط الحسابات.`);
  }
  if (taxTotal > 0 && !vatMapping?.debitAccountId) {
    throw new Error("حساب ضريبة القيمة المضافة - المدخلات (vat_input) غير مُعرَّف ومطلوب لهذا المرتجع.");
  }

  const lines: InsertJournalLine[] = [];

  if (grandTotal > 0) {
    lines.push({
      journalEntryId: "",
      lineNumber:     0,
      accountId:      apAccountId,
      debit:          roundMoney(grandTotal),
      credit:         "0",
      description:    `مرتجع مشتريات رقم RT-${String(returnDoc.returnNumber).padStart(4, "0")}`,
    });
  }

  if (subtotal > 0) {
    lines.push({
      journalEntryId: "",
      lineNumber:     0,
      accountId:      inventoryMapping.debitAccountId!,
      debit:          "0",
      credit:         roundMoney(subtotal),
      description:    "مخزون - مرتجع مشتريات",
    });
  }

  if (taxTotal > 0 && vatMapping?.debitAccountId) {
    lines.push({
      journalEntryId: "",
      lineNumber:     0,
      accountId:      vatMapping.debitAccountId,
      debit:          "0",
      credit:         roundMoney(taxTotal),
      description:    "ضريبة قيمة مضافة - مرتجع مشتريات",
    });
  }

  if (lines.length === 0) return null;

  const totalDr = lines.reduce((s, l) => s + parseMoney(l.debit ?? "0"), 0);
  const totalCr = lines.reduce((s, l) => s + parseMoney(l.credit ?? "0"), 0);
  const diff    = Math.abs(totalDr - totalCr);
  if (diff > 0.01) {
    throw new Error(`القيد غير متوازن: مدين=${totalDr.toFixed(2)} دائن=${totalCr.toFixed(2)} فرق=${diff.toFixed(2)}`);
  }

  const [period] = await tx.select().from(fiscalPeriods)
    .where(and(
      lte(fiscalPeriods.startDate, returnDoc.returnDate),
      gte(fiscalPeriods.endDate,   returnDoc.returnDate),
      eq(fiscalPeriods.isClosed, false)
    ))
    .limit(1);
  if (!period) {
    throw new Error(`الفترة المحاسبية لتاريخ ${returnDoc.returnDate} مغلقة أو غير موجودة.`);
  }

  const seqResult = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
  const entryNumber = Number((seqResult.rows[0] as Record<string, unknown>).next_num);

  const [entry] = await tx.insert(journalEntries).values({
    entryNumber,
    entryDate:        returnDoc.returnDate,
    reference:        `PRT-${String(returnDoc.returnNumber).padStart(4, "0")}`,
    description:      `قيد مرتجع مشتريات رقم RT-${String(returnDoc.returnNumber).padStart(4, "0")}`,
    status:           "posted",
    postedAt:         new Date(),
    periodId:         period.id,
    sourceType:       "purchase_return",
    sourceDocumentId: returnId,
    totalDebit:       roundMoney(totalDr),
    totalCredit:      roundMoney(totalCr),
  }).returning();

  const linesWithId = await resolveCostCenters(
    lines.map((l, idx) => ({
      ...l,
      journalEntryId: entry.id,
      lineNumber:     idx + 1,
    }))
  );
  await tx.insert(journalLines).values(linesWithId);

  return entry.id;
}

export async function createPurchaseReturn(
  input: CreatePurchaseReturnInput
): Promise<PurchaseReturnHeader> {
  if (!input.lines || input.lines.length === 0) {
    throw new Error("يجب إضافة سطر واحد على الأقل في المرتجع.");
  }

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM purchase_invoice_headers WHERE id = ${input.purchaseInvoiceId} FOR UPDATE`);
    const [invoice] = await tx.select().from(purchaseInvoiceHeaders)
      .where(eq(purchaseInvoiceHeaders.id, input.purchaseInvoiceId));

    if (!invoice) throw new Error("فاتورة الشراء غير موجودة.");
    if (invoice.status !== "approved_costed") throw new Error("يمكن إرجاع فواتير المشتريات المعتمدة فقط.");
    if (invoice.supplierId !== input.supplierId) {
      throw new Error("المورد المحدد لا يطابق مورد الفاتورة الأصلية.");
    }

    const invLines = await getPurchaseInvoiceLinesForReturn(input.purchaseInvoiceId);
    if (invLines.length === 0) throw new Error("فاتورة الشراء لا تحتوي على أصناف.");

    const enriched = await validateAndEnrichLines(tx, input, invLines);

    let headerSubtotal  = 0;
    let headerTaxTotal  = 0;
    for (const l of enriched) {
      headerSubtotal += parseMoney(l.subtotal);
      headerTaxTotal += parseMoney(l.vatAmount);
    }
    const headerGrandTotal = headerSubtotal + headerTaxTotal;

    const [numRow] = await tx
      .select({ max: sql<number>`COALESCE(MAX(return_number), 0)` })
      .from(purchaseReturnHeaders);
    const returnNumber = (numRow?.max || 0) + 1;

    const [header] = await tx.insert(purchaseReturnHeaders).values({
      returnNumber,
      purchaseInvoiceId: input.purchaseInvoiceId,
      supplierId:        input.supplierId,
      warehouseId:       input.warehouseId,
      returnDate:        input.returnDate,
      subtotal:          roundMoney(headerSubtotal),
      taxTotal:          roundMoney(headerTaxTotal),
      grandTotal:        roundMoney(headerGrandTotal),
      notes:             input.notes ?? null,
      createdBy:         input.createdBy ?? null,
    }).returning();

    await tx.insert(purchaseReturnLines).values(
      enriched.map(l => ({
        returnId:              header.id,
        purchaseInvoiceLineId: l.purchaseInvoiceLineId,
        itemId:                l.itemId,
        lotId:                 l.lotId,
        qtyReturned:           l.qtyReturned,
        bonusQtyReturned:      l.bonusQtyReturned,
        unitCost:              l.unitCost,
        isFreeItem:            l.isFreeItem,
        vatRate:               l.vatRate,
        vatAmount:             l.vatAmount,
        subtotal:              l.subtotal,
        lineTotal:             l.lineTotal,
      }))
    );

    for (const l of enriched) {
      const qty = parseMoney(l.qtyReturned);
      await tx.execute(sql`
        UPDATE inventory_lots
        SET qty_in_minor = qty_in_minor - ${qty}, updated_at = NOW()
        WHERE id = ${l.lotId}
      `);

      await tx.insert(inventoryLotMovements).values({
        lotId:            l.lotId,
        warehouseId:      input.warehouseId,
        txType:           "out",
        qtyChangeInMinor: String(-qty),
        unitCost:         l.unitCost,
        referenceType:    "purchase_return",
        referenceId:      header.id,
      });
    }

    let journalEntryId: string | null = null;
    let journalStatus  = "posted";
    let journalError: string | null = null;

    try {
      journalEntryId = await generatePurchaseReturnJournalInTx(
        tx, header.id, header, invoice.warehouseId
      );
    } catch (err: any) {
      throw new Error(`فشل إنشاء القيد المحاسبي: ${err.message}`);
    }

    const [finalHeader] = await tx.update(purchaseReturnHeaders).set({
      journalEntryId: journalEntryId ?? undefined,
      journalStatus,
      journalError,
      finalizedAt:    new Date(),
    }).where(eq(purchaseReturnHeaders.id, header.id)).returning();

    return finalHeader;
  });
}
