import { db, pool } from "../db";
import { eq, and, sql, inArray, lte, gte, asc } from "drizzle-orm";
import {
  resolvePurchaseLotKind,
  lotKindMatchesLine,
  lotKindMismatchMessage,
} from "../lib/purchase-lot-kind";
import {
  purchaseReturnHeaders,
  purchaseReturnLines,
  purchaseInvoiceHeaders,
  suppliers,
  type PurchaseReturnHeader,
} from "@shared/schema/purchasing";
import {
  inventoryLots,
  inventoryLotMovements,
} from "@shared/schema/inventory";
import {
  accountMappings,
  journalEntries,
  journalLines,
  fiscalPeriods,
  type InsertJournalLine,
} from "@shared/schema/finance";
import { roundMoney, roundQty, parseMoney } from "../finance-helpers";
import type { DrizzleTransaction } from "../db";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import type { CreatePurchaseReturnInput } from "./purchase-returns-crud-storage";
import { getPurchaseInvoiceLinesForReturn } from "./purchase-returns-crud-storage";

function computeReturnLineTotals(
  qtyReturned:      number,
  unitCost:         number,
  vatRate:          number,
  isFreeItem:       boolean,
  bonusQtyReturned: number = 0
): { subtotal: string; vatAmount: string; lineTotal: string } {
  const cost     = isFreeItem ? 0 : unitCost;
  const subtotal = roundMoney(qtyReturned * cost);
  const vatBase  = (qtyReturned + bonusQtyReturned) * cost;
  const vatAmount = roundMoney(vatBase * vatRate / 100);
  const lineTotal = roundMoney(parseFloat(subtotal) + parseFloat(vatAmount));
  return { subtotal, vatAmount, lineTotal };
}

async function validateAndEnrichLines(
  tx: DrizzleTransaction,
  input: CreatePurchaseReturnInput,
  invoiceLines: Awaited<ReturnType<typeof getPurchaseInvoiceLinesForReturn>>
): Promise<Array<{
  purchaseInvoiceLineId: string;
  itemId:                string;
  lotId:                 string;
  qtyReturned:           string;
  bonusQtyReturned:      string;
  unitCost:              string;
  isFreeItem:            boolean;
  vatRate:               string;
  vatAmount:             string;
  subtotal:              string;
  lineTotal:             string;
}>> {
  const invoiceLineMap = new Map(invoiceLines.map(l => [l.id, l]));
  const itemIds = input.lines.map(l => {
    const inv = invoiceLineMap.get(l.purchaseInvoiceLineId);
    return inv?.itemId ?? "";
  });

  const withinReturnTotals = new Map<string, number>();
  for (const line of input.lines) {
    withinReturnTotals.set(
      line.purchaseInvoiceLineId,
      (withinReturnTotals.get(line.purchaseInvoiceLineId) ?? 0) + line.qtyReturned
    );
  }

  const alreadyReturnedRes = await pool.query<{ inv_line_id: string; returned: string }>(
    `SELECT prl.purchase_invoice_line_id AS inv_line_id,
            COALESCE(SUM(prl.qty_returned::numeric), 0)::text AS returned
     FROM purchase_return_lines prl
     JOIN purchase_return_headers prh ON prh.id = prl.return_id
     WHERE prl.purchase_invoice_line_id = ANY($1)
       AND prh.finalized_at IS NOT NULL
     GROUP BY prl.purchase_invoice_line_id`,
    [input.lines.map(l => l.purchaseInvoiceLineId)]
  );
  const alreadyReturnedMap = new Map(
    alreadyReturnedRes.rows.map(r => [r.inv_line_id, parseMoney(r.returned)])
  );

  const allLotIds = Array.from(new Set(input.lines.map(l => l.lotId).filter(Boolean)));
  if (allLotIds.length > 0) {
    const lockSql = sql.join(allLotIds.map(id => sql`${id}`), sql`, `);
    await tx.execute(sql`SELECT id FROM inventory_lots WHERE id IN (${lockSql}) FOR UPDATE`);
  }
  const allLotRows = allLotIds.length > 0
    ? await tx.select().from(inventoryLots).where(inArray(inventoryLots.id, allLotIds))
    : [];
  const lotMap = new Map(allLotRows.map(l => [l.id, l]));

  const enriched = [];

  for (const line of input.lines) {
    const invLine = invoiceLineMap.get(line.purchaseInvoiceLineId);
    if (!invLine) {
      throw new Error(`سطر الفاتورة ${line.purchaseInvoiceLineId} غير موجود في هذه الفاتورة.`);
    }

    if (line.qtyReturned <= 0) {
      throw new Error(`الكمية المرتجعة للصنف "${invLine.itemNameAr}" يجب أن تكون أكبر من صفر.`);
    }

    const invoiceQtyMinor    = parseMoney(invLine.qty);
    const alreadyReturned    = alreadyReturnedMap.get(invLine.id) ?? 0;
    const remainingQty       = invoiceQtyMinor - alreadyReturned;
    const withinReturnTotal  = withinReturnTotals.get(invLine.id) ?? 0;

    if (withinReturnTotal > remainingQty + 0.0001) {
      throw new Error(
        `الصنف "${invLine.itemNameAr}": إجمالي الكمية المرتجعة في هذه الوثيقة ` +
        `(${withinReturnTotal.toFixed(4)}) يتجاوز الكمية القابلة للإرجاع ` +
        `(${remainingQty.toFixed(4)}).`
      );
    }

    const lot = lotMap.get(line.lotId);
    if (!lot) throw new Error(`اللوت ${line.lotId} غير موجود.`);
    if (lot.warehouseId !== input.warehouseId) {
      throw new Error(`اللوت "${line.lotId}" لا ينتمي للمخزن المحدد.`);
    }
    if (lot.itemId !== invLine.itemId) {
      throw new Error(`اللوت "${line.lotId}" لا يخص الصنف "${invLine.itemNameAr}".`);
    }
    const lotQty = parseMoney(lot.qtyInMinor as string);
    if (line.qtyReturned > lotQty + 0.0001) {
      throw new Error(
        `اللوت للصنف "${invLine.itemNameAr}": الكمية المتاحة (${lotQty.toFixed(4)}) ` +
        `أقل من الكمية المطلوبة (${line.qtyReturned.toFixed(4)}).`
      );
    }

    const lotKind    = resolvePurchaseLotKind(lot.purchasePrice);
    const isFreeItem = parseMoney(invLine.purchasePrice) === 0;
    const kindErr    = lotKindMismatchMessage(invLine.itemNameAr, lotKind, isFreeItem);
    if (kindErr) throw new Error(kindErr);

    const unitCost          = isFreeItem ? 0 : parseMoney(invLine.effectiveUnitCost);
    const bonusQtyReturned  = line.bonusQtyReturned != null && !isNaN(line.bonusQtyReturned)
      ? Math.max(0, line.bonusQtyReturned)
      : 0;
    const vatRate           = line.vatRateOverride != null && !isNaN(line.vatRateOverride)
      ? line.vatRateOverride
      : parseMoney(invLine.vatRate);

    const { subtotal, vatAmount, lineTotal } = computeReturnLineTotals(
      line.qtyReturned, unitCost, vatRate, isFreeItem, bonusQtyReturned
    );

    enriched.push({
      purchaseInvoiceLineId: invLine.id,
      itemId:           invLine.itemId,
      lotId:            line.lotId,
      qtyReturned:      roundQty(line.qtyReturned),
      bonusQtyReturned: roundQty(bonusQtyReturned),
      unitCost:         String(unitCost.toFixed(4)),
      isFreeItem,
      vatRate:          String(vatRate.toFixed(4)),
      vatAmount,
      subtotal,
      lineTotal,
    });
  }

  return enriched;
}

async function generatePurchaseReturnJournalInTx(
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
