export interface SupplierItem {
  id: string;
  code: string;
  nameAr: string;
  supplierType: string;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  netPayable: string;
  warehouseId: string;
  warehouseNameAr: string;
  supplierInvoiceNo: string;
  totalReturns: string;
  receivingNumber: number | null;
}

export interface InvoiceLine {
  id: string;
  itemId: string;
  itemNameAr: string;
  itemCode: string;
  unitLevel: string;
  qty: string;
  bonusQty: string;
  purchasePrice: string;
  vatRate: string;
  vatAmount: string;
  valueBeforeVat: string;
  isFreeItem: boolean;
  effectiveUnitCost: string;
}

export interface AvailableLot {
  id: string;
  warehouseId: string;
  expiryDate: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  purchasePrice: string;
  qtyInMinor: string;
}

export interface ReturnLineEntry {
  splitKey:              string;   // unique per row (allows multi-lot splits per invoice line)
  purchaseInvoiceLineId: string;
  itemId:     string;
  itemNameAr: string;
  itemCode:   string;
  invoiceQty:         string;
  invoiceBonusQty:    string;
  purchasePrice:      string;
  effectiveUnitCost:  string;   // for display & client-side preview computation
  vatRate:            string;
  isFreeItem:         boolean;
  isSplitRow:         boolean;  // true = was added via split button
  lotId:           string;
  qtyReturned:     string;
  bonusQtyReturned: string;
  subtotal:  number;
  vatAmount: number;
  lineTotal: number;
}

export interface ReturnRecord {
  id: string;
  returnNumber: number;
  returnDate: string;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  notes: string | null;
  journalStatus: string | null;
  supplierNameAr: string;
  warehouseNameAr: string;
  invoiceNumber: number;
  supplierInvoiceNo: string;
}

export interface ReturnDetail {
  id: string;
  returnNumber: number;
  returnDate: string;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  notes: string | null;
  journalStatus: string | null;
  journalEntryId: string | null;
  supplierNameAr: string;
  warehouseNameAr: string;
  invoiceNumber: number;
  supplierInvoiceNo: string;
  lines: {
    id: string;
    itemNameAr: string;
    itemCode: string;
    lotId: string;
    lotExpiryDate: string | null;
    qtyReturned:      string;
    bonusQtyReturned: string;
    unitCost:  string;
    isFreeItem: boolean;
    vatRate:    string;
    vatAmount:  string;
    subtotal:   string;
    lineTotal:  string;
  }[];
}

export interface ReturnTotals {
  subtotal:   number;
  taxTotal:   number;
  grandTotal: number;
}
