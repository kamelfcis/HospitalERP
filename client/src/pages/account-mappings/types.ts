/**
 * account-mappings/types.ts
 *
 * Centralized constants, types, and helpers for the Account Mappings feature.
 * Nothing here imports from the page — only from @shared/schema and raw primitives.
 */

import { transactionTypeLabels, mappingLineTypeLabels } from "@shared/schema";

// ─── Line-type specification ───────────────────────────────────────────────────
//  required: true   → blocks posting if absent (hard failure in journal generation)
//  required: "cond" → conditional; only needed when the business condition applies
//  debitSide / creditSide: which GL side this line type actually drives
//  (purchase_invoice lines drive only ONE side; all others drive BOTH)

export interface LineTypeSpec {
  required: true | "cond";
  condition?: string;
  debitSide: boolean;
  creditSide: boolean;
}

export const lineTypeSpecs: Record<string, Record<string, LineTypeSpec>> = {
  purchase_invoice: {
    inventory:            { required: true,   debitSide: true,  creditSide: false },
    vat_input:            { required: "cond", condition: "عند وجود ضريبة",         debitSide: true,  creditSide: false },
    discount_earned:      { required: "cond", condition: "عند وجود خصم رأسي",      debitSide: false, creditSide: true  },
    payables_drugs:       { required: "cond", condition: "لموردي الأدوية",          debitSide: false, creditSide: true  },
    payables_consumables: { required: "cond", condition: "لموردي المستلزمات",       debitSide: false, creditSide: true  },
  },
  sales_invoice: {
    revenue_drugs:       { required: true,   debitSide: true, creditSide: true },
    revenue_consumables: { required: true,   debitSide: true, creditSide: true },
    revenue_general:     { required: "cond", condition: "للبنود العامة",            debitSide: true, creditSide: true },
    cogs_drugs:          { required: "cond", condition: "عند احتساب التكلفة",       debitSide: true, creditSide: true },
    cogs_supplies:       { required: "cond", condition: "عند احتساب التكلفة",       debitSide: true, creditSide: true },
    discount_allowed:    { required: "cond", condition: "عند وجود خصم",             debitSide: true, creditSide: true },
    vat_output:          { required: "cond", condition: "عند وجود ضريبة",           debitSide: true, creditSide: true },
    returns:             { required: "cond", condition: "عند وجود مرتجع",           debitSide: true, creditSide: true },
  },
  patient_invoice: {
    cash:                { required: "cond", condition: "للمرضى النقديين",          debitSide: true, creditSide: true },
    receivables:         { required: "cond", condition: "للمرضى الآجلين",           debitSide: true, creditSide: true },
    revenue_services:    { required: "cond", condition: "عند وجود خدمات",           debitSide: true, creditSide: true },
    revenue_drugs:       { required: "cond", condition: "عند وجود أدوية",           debitSide: true, creditSide: true },
    revenue_consumables: { required: "cond", condition: "عند وجود مستلزمات",        debitSide: true, creditSide: true },
    revenue_equipment:   { required: "cond", condition: "عند وجود معدات",           debitSide: true, creditSide: true },
  },
  receiving: {
    inventory: { required: true, debitSide: true, creditSide: true },
    payables:  { required: true, debitSide: true, creditSide: true },
  },
  cashier_collection: {
    cash: {
      required: true,
      condition: "مدين = الخزنة / دائن = مقاصة المدينين — يفعّل قيد التحصيل المستقل",
      debitSide: true, creditSide: true,
    },
  },
  cashier_refund: {
    cash:          { required: true,   debitSide: true, creditSide: true },
    returns:       { required: "cond", condition: "عند وجود مرتجع",  debitSide: true, creditSide: true },
    revenue_drugs: { required: "cond", condition: "عند وجود أدوية",  debitSide: true, creditSide: true },
    inventory:     { required: "cond", condition: "عند استعادة مخزون", debitSide: true, creditSide: true },
  },
  warehouse_transfer: {
    inventory: { required: true, debitSide: true, creditSide: true },
  },
  doctor_payable_settlement: {
    doctor_payable:   { required: true,   debitSide: true, creditSide: true },
    cash:             { required: "cond", condition: "عند الدفع نقداً", debitSide: true, creditSide: true },
    receivable_clear: { required: "cond", condition: "لتصفية الذمم",    debitSide: true, creditSide: true },
  },
};

// Ordered list of suggested line types per transaction type (controls default row order)
export const suggestedLineTypes: Record<string, string[]> = {
  sales_invoice:             ["revenue_drugs", "revenue_consumables", "revenue_general", "cogs_drugs", "cogs_supplies", "discount_allowed", "vat_output", "returns"],
  patient_invoice:           ["cash", "receivables", "revenue_services", "revenue_drugs", "revenue_consumables", "revenue_equipment"],
  receiving:                 ["inventory", "payables"],
  purchase_invoice:          ["inventory", "vat_input", "discount_earned", "payables_drugs", "payables_consumables"],
  cashier_collection:        ["cash"],
  cashier_refund:            ["cash", "returns", "revenue_drugs", "inventory"],
  warehouse_transfer:        ["inventory"],
  doctor_payable_settlement: ["doctor_payable", "cash", "receivable_clear"],
};

// Derived sets reused across multiple components
export const transactionTypes   = Object.keys(transactionTypeLabels);
export const allLineTypeOptions = Object.entries(mappingLineTypeLabels);

// ─── MappingRow ────────────────────────────────────────────────────────────────
// Client-only view model: combines DB data + local edits + source provenance
export interface MappingRow {
  key:            string;          // stable local key (for React key prop)
  lineType:       string;
  debitAccountId: string;
  creditAccountId: string;
  source: "warehouse" | "generic" | "new";
}

// ─── isRowComplete ─────────────────────────────────────────────────────────────
// Returns true when all *used* sides of a row have an account assigned.
export function isRowComplete(row: MappingRow, spec: LineTypeSpec | undefined): boolean {
  if (!spec) return !!(row.debitAccountId && row.creditAccountId);
  const needsDebit  = spec.debitSide  ? !!row.debitAccountId  : true;
  const needsCredit = spec.creditSide ? !!row.creditAccountId : true;
  return needsDebit && needsCredit;
}
