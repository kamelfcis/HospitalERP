import { pool } from "../db";
import { sql, inArray } from "drizzle-orm";
import {
  resolvePurchaseLotKind,
  lotKindMismatchMessage,
} from "../lib/purchase-lot-kind";
import {
  inventoryLots,
} from "@shared/schema/inventory";
import { roundMoney, roundQty, parseMoney } from "../finance-helpers";
import type { DrizzleTransaction } from "../db";
import type { CreatePurchaseReturnInput } from "./purchase-returns-types-storage";
import type { getPurchaseInvoiceLinesForReturn } from "./purchase-returns-types-storage";

export function computeReturnLineTotals(
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

export async function validateAndEnrichLines(
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
