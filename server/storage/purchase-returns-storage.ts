/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchase Returns Storage — مرتجعات المشتريات (Barrel)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Barrel re-export — split into:
 *    purchase-returns-crud-storage.ts     → types, list, get, lookups
 *    purchase-returns-posting-storage.ts  → create/post/finalize + GL journal
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export {
  type CreateReturnLineInput,
  type CreatePurchaseReturnInput,
  type ReturnLineDisplay,
  type PurchaseReturnWithDetails,
  type AvailableLot,
  type InvoiceLineForReturn,
  getApprovedInvoicesForSupplier,
  getPurchaseInvoiceLinesForReturn,
  getAvailableLots,
  getNextReturnNumber,
  listPurchaseReturns,
  getPurchaseReturnById,
} from "./purchase-returns-crud-storage";

export {
  createPurchaseReturn,
} from "./purchase-returns-posting-storage";
