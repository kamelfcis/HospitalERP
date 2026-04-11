/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  cashier-storage.ts — Barrel re-export for Cashier Storage modules
 *
 *  Sub-modules:
 *    cashier-pharmacy-storage.ts   — pharmacy CRUD, drawer passwords
 *    cashier-shifts-storage.ts     — shift open/close/validate
 *    cashier-invoices-storage.ts   — pending invoices, collect, refund, receipts
 *    cashier-journal-storage.ts    — preflight + generateShiftCloseJournal
 * ═══════════════════════════════════════════════════════════════════════════
 */

import cashierPharmacyMethods from "./cashier-pharmacy-storage";
import cashierShiftsMethods, { type ShiftJournalContext } from "./cashier-shifts-storage";
import cashierInvoicesMethods from "./cashier-invoices-storage";
import cashierJournalMethods from "./cashier-journal-storage";

export type { ShiftJournalContext };

const methods = {
  ...cashierPharmacyMethods,
  ...cashierShiftsMethods,
  ...cashierInvoicesMethods,
  ...cashierJournalMethods,
};

export default methods;
