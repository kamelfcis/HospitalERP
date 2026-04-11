import { pool } from "../db";
import type { DatabaseStorage } from "./index";

export interface CreditInvoiceItem {
  invoiceId: string;
  invoiceNumber: number;
  customerName: string | null;
  netTotal: number;
  invoiceDate: string;
}

export interface HandoverShiftRow {
  shiftId: string;
  shiftDate: string | null;
  openedAt: string;
  closedAt: string | null;
  cashierId: string;
  cashierName: string;
  pharmacyId: string | null;
  pharmacyName: string | null;
  unitType: string;
  status: string;
  openingCash: number;
  closingCash: number;
  expectedCash: number;
  variance: number;
  cashSalesTotal: number;
  creditSalesTotal: number;
  creditCollected: number;
  supplierPaid: number;
  deliveryCollectedTotal: number;
  salesInvoiceCount: number;
  returnsTotal: number;
  returnInvoiceCount: number;
  netTotal: number;
  transferredToTreasury: number;
  handoverReceiptNumber: number | null;
  creditInvoices: CreditInvoiceItem[];
}

export interface HandoverTotals {
  totalCashSales: number;
  totalCreditSales: number;
  totalCreditCollected: number;
  totalSupplierPaid: number;
  totalDeliveryCollected: number;
  totalSalesInvoiceCount: number;
  totalReturns: number;
  totalReturnInvoiceCount: number;
  totalNet: number;
  totalTransferredToTreasury: number;
  rowCount: number;
}

export interface HandoverSummaryResult {
  rows: HandoverShiftRow[];
  totals: HandoverTotals;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface HandoverFilters {
  from?: string;
  to?: string;
  cashierName?: string;
  status?: "all" | "open" | "closed";
  page?: number;
  pageSize?: number;
}

const typesMethods = {
  async getDistinctCashierNames(this: DatabaseStorage): Promise<string[]> {
    const result = await pool.query<{ cashier_name: string }>(`
      SELECT DISTINCT cashier_name
      FROM cashier_shifts
      WHERE cashier_name IS NOT NULL AND cashier_name <> ''
      ORDER BY cashier_name
    `);
    return result.rows.map(r => r.cashier_name);
  },
};

export default typesMethods;
