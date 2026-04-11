import { pool } from "../db";
import {
  PurchaseReturnHeader,
} from "@shared/schema/purchasing";
import { parseMoney } from "../finance-helpers";

export interface CreateReturnLineInput {
  purchaseInvoiceLineId: string;
  lotId:                 string;
  qtyReturned:           number;
  bonusQtyReturned?:     number;
  vatRateOverride?:      number;
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
  id:                 string;
  itemId:             string;
  itemNameAr:         string;
  itemCode:           string;
  unitLevel:          string;
  qty:                string;
  bonusQty:           string;
  purchasePrice:      string;
  vatRate:            string;
  vatAmount:          string;
  valueBeforeVat:     string;
  isFreeItem:         boolean;
  effectiveUnitCost:  string;
}

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

export async function getPurchaseInvoiceLinesForReturn(invoiceId: string): Promise<InvoiceLineForReturn[]> {
  const hdrRes = await pool.query<{ discount_value: string }>(
    `SELECT discount_value FROM purchase_invoice_headers WHERE id = $1`,
    [invoiceId]
  );
  const headerDiscount = hdrRes.rows.length > 0 ? parseMoney(hdrRes.rows[0].discount_value) : 0;

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

  const totalVBV = res.rows.reduce((s, r) => s + parseMoney(r.value_before_vat), 0);

  return res.rows.map(r => {
    const vbv = parseMoney(r.value_before_vat);
    const qty = parseMoney(r.qty);
    const proportionalDiscount = totalVBV > 0 ? (vbv / totalVBV) * headerDiscount : 0;
    const netLineValue  = vbv - proportionalDiscount;
    const effectiveUnitCost = qty > 0 ? netLineValue / qty : 0;

    return {
      id:                 r.id,
      itemId:             r.item_id,
      itemNameAr:         r.item_name_ar,
      itemCode:           r.item_code,
      unitLevel:          r.unit_level,
      qty:                r.qty,
      bonusQty:           r.bonus_qty,
      purchasePrice:      r.purchase_price,
      vatRate:            r.vat_rate,
      vatAmount:          r.vat_amount,
      valueBeforeVat:     r.value_before_vat,
      isFreeItem:         parseMoney(r.purchase_price) === 0,
      effectiveUnitCost:  effectiveUnitCost.toFixed(6),
    };
  });
}
