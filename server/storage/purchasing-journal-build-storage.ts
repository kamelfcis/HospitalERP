import { type DrizzleTransaction } from "../db";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import { resolveCostCenters } from "../lib/cost-center-resolver";
import {
  suppliers,
  receivingHeaders,
  accountMappings,
  journalEntries,
  journalLines,
  fiscalPeriods,
  type AccountMapping,
  type JournalEntry,
  type InsertJournalLine,
  type PurchaseInvoiceHeader,
} from "@shared/schema";

export async function generatePurchaseInvoiceJournalInTx(
  tx: DrizzleTransaction,
  invoiceId: string,
  invoice: PurchaseInvoiceHeader
): Promise<JournalEntry | null> {
  const [existingEntry] = await tx.select().from(journalEntries)
    .where(and(
      eq(journalEntries.sourceType, "purchase_invoice"),
      eq(journalEntries.sourceDocumentId, invoiceId)
    ))
    .limit(1);
  if (existingEntry) return existingEntry;

  const totalBeforeVat = parseFloat(invoice.totalBeforeVat || "0");
  const totalVat       = parseFloat(invoice.totalVat       || "0");
  const totalAfterVat  = parseFloat(invoice.totalAfterVat  || "0");
  const netPayable     = parseFloat(invoice.netPayable      || "0");
  const headerDiscount = totalAfterVat - netPayable;

  if (totalBeforeVat <= 0 && netPayable <= 0) return null;

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

  const [supplier] = await tx.select().from(suppliers)
    .where(eq(suppliers.id, invoice.supplierId));
  const supplierType     = supplier?.supplierType || "drugs";
  const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";

  const supplierSpecificApAccountId = supplier?.glAccountId || null;

  const journalLineData: InsertJournalLine[] = [];
  const descriptionText = `قيد فاتورة مشتريات رقم ${invoice.invoiceNumber}`;

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

  const payablesMapping = mappingMap.get(payablesLineType) || mappingMap.get("payables");

  const effectiveApAccountId = supplierSpecificApAccountId ?? payablesMapping?.creditAccountId ?? null;

  if (!effectiveApAccountId) {
    throw new Error(`حساب ذمم الموردين (${payablesLineType}) غير مُعرَّف في ربط الحسابات. يرجى إضافة حساب الدائن له.`);
  }

  if (netPayable > 0) {
    const apDescription = supplierSpecificApAccountId
      ? `ذمم مورد - ${supplier?.nameAr || "مورد"}`
      : supplierType === "consumables"
        ? "موردين مستلزمات"
        : "موردين أدوية";
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

  const totalDebits  = journalLineData.reduce((s, l) => s + parseFloat(l.debit  || "0"), 0);
  const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
  const diff = Math.abs(totalDebits - totalCredits);
  if (diff > 0.01) {
    throw new Error(`القيد المحاسبي غير متوازن: مدين=${totalDebits.toFixed(2)}، دائن=${totalCredits.toFixed(2)}، الفرق=${diff.toFixed(2)}`);
  }

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

  const seqResult = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
  const entryNumber = Number((seqResult.rows[0] as Record<string, unknown>).next_num);

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

  const linesWithEntryId = await resolveCostCenters(
    journalLineData.map((l, idx) => ({
      ...l,
      journalEntryId: entry.id,
      lineNumber:     idx + 1,
    }))
  );
  await tx.insert(journalLines).values(linesWithEntryId);

  return entry;
}
