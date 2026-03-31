/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchase Returns Storage — مرتجعات المشتريات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Design principles:
 *  - Every financial operation is atomic inside db.transaction()
 *  - FOR UPDATE row-locks on inventory_lots to prevent negative balances
 *  - unit_cost ALWAYS from purchase_invoice_lines, NEVER from lot
 *  - vat_amount computed server-side: qty × unitCost × vatRate / 100
 *  - Journal reuses purchase_invoice account mappings with reversed Dr/Cr
 *  - GL: Dr AP = grandTotal | Cr Inventory = subtotal | Cr VAT Input = taxTotal
 *  - roundMoney / roundQty from shared finance-helpers
 *  - Idempotency: unique journal WHERE sourceType='purchase_return'
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { eq, and, gt, sql, inArray, lte, gte, asc } from "drizzle-orm";
import {
  resolvePurchaseLotKind,
  lotKindMatchesLine,
  lotKindMismatchMessage,
} from "../lib/purchase-lot-kind";
import {
  purchaseReturnHeaders,
  purchaseReturnLines,
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  suppliers,
  PurchaseReturnHeader,
  PurchaseReturnLine,
} from "@shared/schema/purchasing";
import {
  inventoryLots,
  inventoryLotMovements,
  items,
  warehouses,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateReturnLineInput {
  purchaseInvoiceLineId: string;
  lotId:                 string;
  qtyReturned:           number;   // in minor units
  bonusQtyReturned?:     number;   // bonus/gift qty being returned (affects VAT base, not subtotal)
  vatRateOverride?:      number;   // optional: user-corrected VAT rate (falls back to invoice line)
}

export interface CreatePurchaseReturnInput {
  purchaseInvoiceId: string;
  supplierId:        string;
  warehouseId:       string;
  returnDate:        string;
  notes?:            string | null;
  createdBy?:        string | null;
  lines:             CreateReturnLineInput[];
}

export interface ReturnLineDisplay {
  id:                    string;
  purchaseInvoiceLineId: string;
  itemId:                string;
  itemNameAr:            string;
  itemCode:              string;
  lotId:                 string;
  lotExpiryDate:         string | null;
  lotQtyAvailable:       string;
  qtyReturned:           string;
  bonusQtyReturned:      string;
  unitCost:              string;
  isFreeItem:            boolean;
  vatRate:               string;
  vatAmount:             string;
  subtotal:              string;
  lineTotal:             string;
}

export interface PurchaseReturnWithDetails extends PurchaseReturnHeader {
  invoiceNumber:     number;
  supplierNameAr:    string;
  warehouseNameAr:   string;
  supplierInvoiceNo: string | null;
  lines:             ReturnLineDisplay[];
}

export interface AvailableLot {
  id:           string;
  warehouseId:  string;
  expiryDate:   string | null;
  expiryMonth:  number | null;
  expiryYear:   number | null;
  purchasePrice: string;
  qtyInMinor:   string;
}

export interface InvoiceLineForReturn {
  id:              string;
  itemId:          string;
  itemNameAr:      string;
  itemCode:        string;
  unitLevel:       string;
  qty:             string;
  bonusQty:        string;
  purchasePrice:   string;
  vatRate:         string;
  vatAmount:       string;
  valueBeforeVat:  string;
  isFreeItem:      boolean;
}

// ─── getApprovedInvoicesForSupplier ──────────────────────────────────────────
// Returns finalized purchase invoices for a given supplier (for the combobox)
export async function getApprovedInvoicesForSupplier(supplierId: string) {
  const res = await pool.query<{
    id: string; invoice_number: number; invoice_date: string;
    net_payable: string; warehouse_id: string; warehouse_name: string;
    supplier_invoice_no: string; total_returns: string;
    receiving_number: number | null;
  }>(
    `SELECT
       pih.id, pih.invoice_number, pih.invoice_date,
       pih.net_payable, pih.warehouse_id,
       w.name_ar AS warehouse_name,
       pih.supplier_invoice_no,
       COALESCE(SUM(prh.grand_total::numeric), 0)::text AS total_returns,
       rh_link.receiving_number
     FROM purchase_invoice_headers pih
     JOIN warehouses w ON w.id = pih.warehouse_id
     LEFT JOIN purchase_return_headers prh
       ON prh.purchase_invoice_id = pih.id AND prh.finalized_at IS NOT NULL
     LEFT JOIN LATERAL (
       SELECT receiving_number
       FROM receiving_headers
       WHERE converted_to_invoice_id = pih.id
       LIMIT 1
     ) rh_link ON true
     WHERE pih.supplier_id = $1
       AND pih.status = 'approved_costed'
     GROUP BY pih.id, w.name_ar, rh_link.receiving_number
     ORDER BY pih.invoice_date DESC, pih.invoice_number DESC`,
    [supplierId]
  );
  return res.rows.map(r => ({
    id:                 r.id,
    invoiceNumber:      r.invoice_number,
    invoiceDate:        r.invoice_date,
    netPayable:         r.net_payable,
    warehouseId:        r.warehouse_id,
    warehouseNameAr:    r.warehouse_name,
    supplierInvoiceNo:  r.supplier_invoice_no,
    totalReturns:       r.total_returns,
    receivingNumber:    r.receiving_number ?? null,
  }));
}

// ─── getPurchaseInvoiceLinesForReturn ─────────────────────────────────────────
// Returns invoice lines enriched with item name/code + remaining qty check
export async function getPurchaseInvoiceLinesForReturn(invoiceId: string): Promise<InvoiceLineForReturn[]> {
  const res = await pool.query<{
    id: string; item_id: string; item_name_ar: string; item_code: string;
    unit_level: string; qty: string; bonus_qty: string;
    purchase_price: string; vat_rate: string; vat_amount: string;
    value_before_vat: string; already_returned: string;
  }>(
    `SELECT
       pil.id, pil.item_id,
       i.name_ar    AS item_name_ar,
       i.item_code  AS item_code,
       pil.unit_level, pil.qty, pil.bonus_qty,
       pil.purchase_price, pil.vat_rate, pil.vat_amount, pil.value_before_vat,
       COALESCE(SUM(prl.qty_returned::numeric), 0)::text AS already_returned
     FROM purchase_invoice_lines pil
     JOIN items i ON i.id = pil.item_id
     LEFT JOIN purchase_return_lines prl ON prl.purchase_invoice_line_id = pil.id
     WHERE pil.invoice_id = $1
     GROUP BY pil.id, i.name_ar, i.item_code
     ORDER BY i.name_ar`,
    [invoiceId]
  );

  return res.rows.map(r => ({
    id:              r.id,
    itemId:          r.item_id,
    itemNameAr:      r.item_name_ar,
    itemCode:        r.item_code,
    unitLevel:       r.unit_level,
    qty:             r.qty,
    bonusQty:        r.bonus_qty,
    purchasePrice:   r.purchase_price,
    vatRate:         r.vat_rate,
    vatAmount:       r.vat_amount,
    valueBeforeVat:  r.value_before_vat,
    isFreeItem:      parseMoney(r.purchase_price) === 0,
  }));
}

// ─── getAvailableLots ─────────────────────────────────────────────────────────
// Returns available lots for a given item + warehouse filtered by lot kind.
//
// Uses resolvePurchaseLotKind (from purchase-lot-kind.ts) as the single
// source of truth — the SQL filter below must stay in sync with that helper:
//   paid lots  → purchase_price > 0
//   free lots  → purchase_price = 0
//   invalid    → excluded by IS NOT NULL + never returned (price<0 impossible via DB insert)
//
// Existing index idx_lots_item_warehouse (item_id, warehouse_id) covers the
// main WHERE conditions — no additional index needed.
export async function getAvailableLots(
  itemId: string,
  warehouseId: string,
  isFreeItem: boolean,
): Promise<AvailableLot[]> {
  // Parameterized boolean prevents any string-interpolation risk.
  // $3::boolean CASE expression mirrors resolvePurchaseLotKind logic exactly.
  const res = await pool.query<{
    id: string; warehouse_id: string; expiry_date: string | null;
    expiry_month: number | null; expiry_year: number | null;
    purchase_price: string; qty_in_minor: string;
  }>(
    `SELECT id, warehouse_id, expiry_date, expiry_month, expiry_year,
            purchase_price, qty_in_minor
     FROM inventory_lots
     WHERE item_id          = $1
       AND warehouse_id     = $2
       AND qty_in_minor     > 0
       AND is_active        = true
       AND purchase_price   IS NOT NULL
       AND CASE WHEN $3::boolean
             THEN purchase_price::numeric  = 0
             ELSE purchase_price::numeric  > 0
           END
     ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
    [itemId, warehouseId, isFreeItem]
  );

  // Post-fetch defense: apply helper to every row so even a SQL quirk cannot
  // leak a lot of the wrong kind.  resolvePurchaseLotKind is the single source.
  const lots: AvailableLot[] = [];
  for (const r of res.rows) {
    const kind = resolvePurchaseLotKind(r.purchase_price);
    if (!lotKindMatchesLine(kind, isFreeItem)) continue; // should never trigger
    lots.push({
      id:            r.id,
      warehouseId:   r.warehouse_id,
      expiryDate:    r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
      expiryMonth:   r.expiry_month,
      expiryYear:    r.expiry_year,
      purchasePrice: r.purchase_price,
      qtyInMinor:    r.qty_in_minor,
    });
  }
  return lots;
}

// ─── getNextReturnNumber ──────────────────────────────────────────────────────
export async function getNextReturnNumber(): Promise<number> {
  const res = await pool.query<{ max: string }>(
    `SELECT COALESCE(MAX(return_number), 0) AS max FROM purchase_return_headers`
  );
  return parseInt(res.rows[0].max, 10) + 1;
}

// ─── computeReturnLineTotals ──────────────────────────────────────────────────
// Pure computation — no DB access. Always call server-side.
// VAT base = (qtyReturned + bonusQtyReturned) × cost  [mirrors purchase invoice logic]
// subtotal  =  qtyReturned                × cost       [only paid units]
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

// ─── validateAndEnrichLines (inside tx) ───────────────────────────────────────
// Validates each return line and returns enriched data ready for insert.
// Throws Arabic business errors on any violation.
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

  // Build map: invoiceLineId → total qty already returned (for over-return check)
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

  // batch-lock + batch-fetch كل الـ lots مرة واحدة (N+1 fix)
  const allLotIds = [...new Set(input.lines.map(l => l.lotId).filter(Boolean))];
  if (allLotIds.length > 0) {
    // FOR UPDATE داخل نفس الـ tx (نفس الـ connection) لضمان صحة القفل
    const lockSql = sql.join(allLotIds.map(id => sql`${id}::uuid`), sql`, `);
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

    // Check item belongs to invoice (already implicit by purchaseInvoiceLineId FK, but double-check)
    const invoiceQtyMinor = parseMoney(invLine.qty);
    const alreadyReturned = alreadyReturnedMap.get(invLine.id) ?? 0;
    const remainingQty    = invoiceQtyMinor - alreadyReturned;

    if (line.qtyReturned > remainingQty + 0.0001) {
      throw new Error(
        `الصنف "${invLine.itemNameAr}": الكمية المطلوبة (${line.qtyReturned.toFixed(4)}) ` +
        `تتجاوز الكمية القابلة للإرجاع (${remainingQty.toFixed(4)}).`
      );
    }

    // Lot already locked + fetched above (batch)
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

    // ── Lot-kind guard (uses central helper — single source of truth) ──────────
    // Derives kind from the actual DB lot, not from anything the client sent.
    const lotKind    = resolvePurchaseLotKind(lot.purchasePrice);
    const isFreeItem = parseMoney(invLine.purchasePrice) === 0;
    const kindErr    = lotKindMismatchMessage(invLine.itemNameAr, lotKind, isFreeItem);
    if (kindErr) throw new Error(kindErr);

    // unit_cost ALWAYS from invoice line, NOT from lot
    const unitCost          = isFreeItem ? 0 : parseMoney(invLine.purchasePrice);
    const bonusQtyReturned  = line.bonusQtyReturned != null && !isNaN(line.bonusQtyReturned)
      ? Math.max(0, line.bonusQtyReturned)
      : 0;
    // vatRate: use user-provided override (correction) if given, else fall back to invoice line
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

// ─── generatePurchaseReturnJournalInTx ────────────────────────────────────────
// Reversal of purchase invoice journal:
//   Dr  AP               = grandTotal   (reduces what we owe the supplier)
//   Cr  Inventory        = subtotal     (reduces inventory asset)
//   Cr  VAT Input        = taxTotal     (reverses recoverable VAT)
async function generatePurchaseReturnJournalInTx(
  tx: DrizzleTransaction,
  returnId: string,
  returnDoc: PurchaseReturnHeader,
  invoiceWarehouseId: string
): Promise<string | null> {
  // Idempotency
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

  // Load account mappings — reuse 'purchase_invoice' mappings with reversed Dr/Cr
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

  // Load supplier for AP account resolution
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

  // Build journal lines (reversed from purchase invoice)
  const lines: InsertJournalLine[] = [];

  // Dr AP (reduces payable to supplier)
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

  // Cr Inventory (reduces stock value)
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

  // Cr VAT Input (reverses recoverable VAT)
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

  // Balance check
  const totalDr = lines.reduce((s, l) => s + parseMoney(l.debit ?? "0"), 0);
  const totalCr = lines.reduce((s, l) => s + parseMoney(l.credit ?? "0"), 0);
  const diff    = Math.abs(totalDr - totalCr);
  if (diff > 0.01) {
    throw new Error(`القيد غير متوازن: مدين=${totalDr.toFixed(2)} دائن=${totalCr.toFixed(2)} فرق=${diff.toFixed(2)}`);
  }

  // Fiscal period
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

  // Next entry number — uses the DB sequence to prevent duplicate-key races
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

  const linesWithId = lines.map((l, idx) => ({
    ...l,
    journalEntryId: entry.id,
    lineNumber:     idx + 1,
  }));
  await tx.insert(journalLines).values(linesWithId);

  return entry.id;
}

// ─── createPurchaseReturn (ATOMIC) ────────────────────────────────────────────
// Single transaction:
//   1. Lock invoice + validate
//   2. Load invoice lines for return validation
//   3. Validate + enrich each return line (lot lock + qty check)
//   4. Insert header (to get returnId)
//   5. Insert lines
//   6. Decrement lots + create lot movements
//   7. Generate GL journal
//   8. Update header with journal info + finalizedAt
export async function createPurchaseReturn(
  input: CreatePurchaseReturnInput
): Promise<PurchaseReturnHeader> {
  if (!input.lines || input.lines.length === 0) {
    throw new Error("يجب إضافة سطر واحد على الأقل في المرتجع.");
  }

  return await db.transaction(async (tx) => {
    // ── 1. Lock and validate invoice ───────────────────────────────────────
    await tx.execute(sql`SELECT id FROM purchase_invoice_headers WHERE id = ${input.purchaseInvoiceId} FOR UPDATE`);
    const [invoice] = await tx.select().from(purchaseInvoiceHeaders)
      .where(eq(purchaseInvoiceHeaders.id, input.purchaseInvoiceId));

    if (!invoice) throw new Error("فاتورة الشراء غير موجودة.");
    if (invoice.status !== "approved_costed") throw new Error("يمكن إرجاع فواتير المشتريات المعتمدة فقط.");
    if (invoice.supplierId !== input.supplierId) {
      throw new Error("المورد المحدد لا يطابق مورد الفاتورة الأصلية.");
    }

    // ── 2. Load invoice lines (for validation only — no lock needed, they are immutable) ──
    const invLines = await getPurchaseInvoiceLinesForReturn(input.purchaseInvoiceId);
    if (invLines.length === 0) throw new Error("فاتورة الشراء لا تحتوي على أصناف.");

    // ── 3. Validate + enrich lines (includes lot FOR UPDATE inside) ────────
    const enriched = await validateAndEnrichLines(tx, input, invLines);

    // ── 4. Compute header totals server-side ───────────────────────────────
    let headerSubtotal  = 0;
    let headerTaxTotal  = 0;
    for (const l of enriched) {
      headerSubtotal += parseMoney(l.subtotal);
      headerTaxTotal += parseMoney(l.vatAmount);
    }
    const headerGrandTotal = headerSubtotal + headerTaxTotal;

    // ── 5. Get next return number inside tx (race-safe) ───────────────────
    const [numRow] = await tx
      .select({ max: sql<number>`COALESCE(MAX(return_number), 0)` })
      .from(purchaseReturnHeaders);
    const returnNumber = (numRow?.max || 0) + 1;

    // ── 6. Insert header ───────────────────────────────────────────────────
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

    // ── 7. Insert lines ────────────────────────────────────────────────────
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

    // ── 8. Decrement lots + create lot movements ───────────────────────────
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

    // ── 9. Generate GL journal ─────────────────────────────────────────────
    let journalEntryId: string | null = null;
    let journalStatus  = "posted";
    let journalError: string | null = null;

    try {
      journalEntryId = await generatePurchaseReturnJournalInTx(
        tx, header.id, header, invoice.warehouseId
      );
    } catch (err: any) {
      // Journal failure = full rollback (throw propagates out of transaction)
      throw new Error(`فشل إنشاء القيد المحاسبي: ${err.message}`);
    }

    // ── 10. Mark as finalized ──────────────────────────────────────────────
    const [finalHeader] = await tx.update(purchaseReturnHeaders).set({
      journalEntryId: journalEntryId ?? undefined,
      journalStatus,
      journalError,
      finalizedAt:    new Date(),
    }).where(eq(purchaseReturnHeaders.id, header.id)).returning();

    return finalHeader;
  });
}

// ─── listPurchaseReturns ──────────────────────────────────────────────────────
export async function listPurchaseReturns(params: {
  supplierId?:        string;
  purchaseInvoiceId?: string;
  fromDate?:          string;
  toDate?:            string;
  search?:            string;
  page?:              number;
  pageSize?:          number;
}) {
  const { page = 1, pageSize = 50 } = params;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["prh.finalized_at IS NOT NULL"];
  const args: (string | number)[] = [];
  let idx = 1;

  if (params.supplierId) {
    conditions.push(`prh.supplier_id = $${idx++}`);
    args.push(params.supplierId);
  }
  if (params.purchaseInvoiceId) {
    conditions.push(`prh.purchase_invoice_id = $${idx++}`);
    args.push(params.purchaseInvoiceId);
  }
  if (params.fromDate) {
    conditions.push(`prh.return_date >= $${idx++}`);
    args.push(params.fromDate);
  }
  if (params.toDate) {
    conditions.push(`prh.return_date <= $${idx++}`);
    args.push(params.toDate);
  }
  if (params.search?.trim()) {
    const p = idx++;
    conditions.push(
      `(s.name_ar ILIKE $${p} OR pih.supplier_invoice_no ILIKE $${p} OR pih.invoice_number::text ILIKE $${p})`
    );
    args.push(`%${params.search.trim()}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const res = await pool.query<{
    id: string; return_number: number; return_date: string;
    subtotal: string; tax_total: string; grand_total: string;
    notes: string | null; journal_status: string | null; finalized_at: string;
    supplier_name: string; warehouse_name: string;
    invoice_number: number; supplier_invoice_no: string;
    total: string;
  }>(
    `SELECT
       prh.id, prh.return_number, prh.return_date,
       prh.subtotal, prh.tax_total, prh.grand_total,
       prh.notes, prh.journal_status, prh.finalized_at,
       s.name_ar  AS supplier_name,
       w.name_ar  AS warehouse_name,
       pih.invoice_number,
       pih.supplier_invoice_no,
       COUNT(*) OVER() AS total
     FROM purchase_return_headers prh
     JOIN suppliers s                ON s.id   = prh.supplier_id
     JOIN warehouses w               ON w.id   = prh.warehouse_id
     JOIN purchase_invoice_headers pih ON pih.id = prh.purchase_invoice_id
     ${where}
     ORDER BY prh.return_date DESC, prh.return_number DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...args, pageSize, offset]
  );

  const total = parseInt(res.rows[0]?.total ?? "0", 10);

  return {
    returns: res.rows.map(r => ({
      id:              r.id,
      returnNumber:    r.return_number,
      returnDate:      String(r.return_date).slice(0, 10),
      subtotal:        r.subtotal,
      taxTotal:        r.tax_total,
      grandTotal:      r.grand_total,
      notes:           r.notes,
      journalStatus:   r.journal_status,
      finalizedAt:     r.finalized_at,
      supplierNameAr:  r.supplier_name,
      warehouseNameAr: r.warehouse_name,
      invoiceNumber:   r.invoice_number,
      supplierInvoiceNo: r.supplier_invoice_no,
    })),
    total,
    page,
    pageSize,
  };
}

// ─── getPurchaseReturnById ────────────────────────────────────────────────────
export async function getPurchaseReturnById(id: string): Promise<PurchaseReturnWithDetails | null> {
  const res = await pool.query<{
    id: string; return_number: number; return_date: string;
    subtotal: string; tax_total: string; grand_total: string;
    notes: string | null; journal_entry_id: string | null;
    journal_status: string | null; finalized_at: string;
    supplier_id: string; supplier_name: string;
    warehouse_id: string; warehouse_name: string;
    purchase_invoice_id: string; invoice_number: number;
    supplier_invoice_no: string; created_by: string | null;
  }>(
    `SELECT prh.*,
       s.name_ar   AS supplier_name,
       w.name_ar   AS warehouse_name,
       pih.invoice_number,
       pih.supplier_invoice_no
     FROM purchase_return_headers prh
     JOIN suppliers s                ON s.id   = prh.supplier_id
     JOIN warehouses w               ON w.id   = prh.warehouse_id
     JOIN purchase_invoice_headers pih ON pih.id = prh.purchase_invoice_id
     WHERE prh.id = $1`,
    [id]
  );

  if (!res.rows.length) return null;
  const h = res.rows[0];

  const linesRes = await pool.query<{
    id: string; purchase_invoice_line_id: string; item_id: string;
    item_name_ar: string; item_code: string; lot_id: string;
    lot_expiry_date: string | null; lot_qty_available: string;
    qty_returned: string; bonus_qty_returned: string; unit_cost: string;
    is_free_item: boolean; vat_rate: string; vat_amount: string;
    subtotal: string; line_total: string;
  }>(
    `SELECT
       prl.id, prl.purchase_invoice_line_id, prl.item_id,
       i.name_ar AS item_name_ar, i.item_code AS item_code,
       prl.lot_id,
       il.expiry_date AS lot_expiry_date,
       il.qty_in_minor AS lot_qty_available,
       prl.qty_returned, prl.bonus_qty_returned, prl.unit_cost, prl.is_free_item,
       prl.vat_rate, prl.vat_amount, prl.subtotal, prl.line_total
     FROM purchase_return_lines prl
     JOIN items i           ON i.id  = prl.item_id
     JOIN inventory_lots il ON il.id = prl.lot_id
     WHERE prl.return_id = $1
     ORDER BY i.name_ar`,
    [id]
  );

  return {
    id:              h.id,
    returnNumber:    h.return_number,
    purchaseInvoiceId: h.purchase_invoice_id,
    supplierId:      h.supplier_id,
    warehouseId:     h.warehouse_id,
    returnDate:      String(h.return_date).slice(0, 10),
    subtotal:        h.subtotal,
    taxTotal:        h.tax_total,
    grandTotal:      h.grand_total,
    notes:           h.notes,
    createdBy:       h.created_by,
    journalEntryId:  h.journal_entry_id,
    journalStatus:   h.journal_status,
    journalError:    null,
    finalizedAt:     h.finalized_at ? new Date(h.finalized_at) : null,
    createdAt:       new Date(),
    supplierNameAr:  h.supplier_name,
    warehouseNameAr: h.warehouse_name,
    invoiceNumber:      h.invoice_number,
    supplierInvoiceNo:  h.supplier_invoice_no || null,
    lines: linesRes.rows.map(l => ({
      id:                    l.id,
      purchaseInvoiceLineId: l.purchase_invoice_line_id,
      itemId:                l.item_id,
      itemNameAr:            l.item_name_ar,
      itemCode:              l.item_code,
      lotId:                 l.lot_id,
      lotExpiryDate:         l.lot_expiry_date ? String(l.lot_expiry_date).slice(0, 10) : null,
      lotQtyAvailable:       l.lot_qty_available,
      qtyReturned:           l.qty_returned,
      bonusQtyReturned:      l.bonus_qty_returned,
      unitCost:              l.unit_cost,
      isFreeItem:            l.is_free_item,
      vatRate:               l.vat_rate,
      vatAmount:             l.vat_amount,
      subtotal:              l.subtotal,
      lineTotal:             l.line_total,
    })) as ReturnLineDisplay[],
  } as PurchaseReturnWithDetails;
}
