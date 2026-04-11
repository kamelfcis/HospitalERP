import { pool } from "../db";
import {
  resolvePurchaseLotKind,
  lotKindMatchesLine,
} from "../lib/purchase-lot-kind";
import type {
  PurchaseReturnHeader,
} from "@shared/schema/purchasing";
import type { AvailableLot, ReturnLineDisplay, PurchaseReturnWithDetails } from "./purchase-returns-types-storage";

export async function getAvailableLots(
  itemId: string,
  warehouseId: string,
  isFreeItem: boolean,
): Promise<AvailableLot[]> {
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

  const lots: AvailableLot[] = [];
  for (const r of res.rows) {
    const kind = resolvePurchaseLotKind(r.purchase_price);
    if (!lotKindMatchesLine(kind, isFreeItem)) continue;
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

export async function getNextReturnNumber(): Promise<number> {
  const res = await pool.query<{ max: string }>(
    `SELECT COALESCE(MAX(return_number), 0) AS max FROM purchase_return_headers`
  );
  return parseInt(res.rows[0].max, 10) + 1;
}

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
