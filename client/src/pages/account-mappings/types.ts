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
    // ── Semantic meaning of "cash" line type in cashier_collection ─────────────
    // Line type name "cash" is kept for backward-compatibility with existing DB rows.
    // Actual accounting meaning:
    //   Dr = treasury/cash — resolved DYNAMICALLY from the actual cashier shift GL account
    //                        (each cashier produces a DIFFERENT debit account)
    //                        falls back to debitAccountId in mapping if shift has no GL
    //   Cr = receivable clearing — STATICALLY configured here (creditAccountId)
    //
    // The admin ONLY needs to configure the credit (receivable clearing) account.
    // The debit (treasury) is automatically sourced from the cashier shift.
    cash: {
      required: true,
      condition: "الدائن = مقاصة المدينين (يُحدد هنا) — المدين يُحدد تلقائياً من وردية الكاشير",
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
  stock_count_adjustment: {
    // surplus: Dr = warehouse GL account (dynamic — from session warehouse), Cr = stock_gain.creditAccountId (configured here)
    // shortage: Dr = stock_loss.debitAccountId (configured here), Cr = warehouse GL account (dynamic)
    stock_gain: { required: "cond", condition: "عند وجود فوائض في الجرد", debitSide: false, creditSide: true  },
    stock_loss: { required: "cond", condition: "عند وجود عجز في الجرد",   debitSide: true,  creditSide: false },
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
  stock_count_adjustment:    ["stock_gain", "stock_loss"],
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

// ─── Dynamic line specifications ───────────────────────────────────────────────
//
// Declares which account *sides* of which line types are system-resolved
// (dynamic), meaning the account is determined automatically by the engine
// from operational context — not manually configured by the admin.
//
// Structure: { transactionType: { lineType: { debit?: DynamicSideInfo, credit?: DynamicSideInfo } } }
//
// When a side is marked dynamic:
//   - The admin does NOT need to select an account for that side
//   - MappingRowEditor shows an informational badge instead of the account picker
//   - isRowComplete considers the dynamic side as always satisfied

export interface DynamicSideInfo {
  /** Short Arabic label shown in place of the account picker */
  label: string;
  /** Longer Arabic tooltip / explanation */
  tooltip: string;
  /** Is the fallback static mapping still respected if the dynamic source is absent? */
  hasFallback: boolean;
}

export const DYNAMIC_LINE_SPECS: Record<string, Record<string, { debit?: DynamicSideInfo; credit?: DynamicSideInfo }>> = {
  cashier_collection: {
    cash: {
      debit: {
        label:       "مدين: يُحدد تلقائياً من وردية الكاشير",
        tooltip:     "حساب الخزنة يُحدد تلقائياً من الوردية المفتوحة للكاشير الذي استلم الدفع. لكل كاشير حساب خزنة مختلف — لا يحتاج الأدمن لتحديد هذا الحساب يدوياً.",
        hasFallback: true,
      },
      // credit side (receivable_clear) stays static — admin must configure it
    },
  },
  sales_invoice: {
    inventory: {
      credit: {
        label:       "دائن: يُحدد تلقائياً من حساب GL المخزن/الصيدلية",
        tooltip:     "حساب المخزون يُحدد تلقائياً من حساب GL المرتبط بالمخزن أو الصيدلية المستخدمة في الفاتورة. إذا لم يكن للمخزن حساب GL، يُستخدم الحساب الاحتياطي المحدد هنا.",
        hasFallback: true,
      },
    },
  },
  stock_count_adjustment: {
    // Surplus: Dr side is the warehouse GL account (resolved from session warehouse)
    stock_gain: {
      debit: {
        label:       "مدين: يُحدد تلقائياً من حساب GL المخزن",
        tooltip:     "الجانب المدين للفوائض هو حساب GL المخزن نفسه المرتبط بجلسة الجرد. يُحدد تلقائياً ولا يحتاج إلى ضبط يدوي — قم بتحديد الحساب الدائن (إيراد فوائض الجرد) فقط.",
        hasFallback: false,
      },
    },
    // Shortage: Cr side is the warehouse GL account (resolved from session warehouse)
    stock_loss: {
      credit: {
        label:       "دائن: يُحدد تلقائياً من حساب GL المخزن",
        tooltip:     "الجانب الدائن للعجز هو حساب GL المخزن نفسه المرتبط بجلسة الجرد. يُحدد تلقائياً ولا يحتاج إلى ضبط يدوي — قم بتحديد الحساب المدين (خسائر عجز الجرد) فقط.",
        hasFallback: false,
      },
    },
  },
};

// ─── Transaction types with system-resolved warehouse/treasury ─────────────────
//
// For these transaction types, the warehouse or treasury is determined
// automatically from the source document — the admin should NOT select a
// warehouse in the mapping filters.  The warehouse selector is hidden for
// these types and replaced with an explanatory label.
//
// sales_invoice:      inventory credit resolved from invoice warehouse.glAccountId
// cashier_collection: treasury debit resolved from cashier shift GL account
// cashier_refund:     treasury credit resolved from cashier shift (reverse of collection)
// warehouse_transfer: both source and target warehouse GL resolved from the transfer document
//
export const NO_WAREHOUSE_SELECTOR_TYPES: ReadonlySet<string> = new Set([
  "sales_invoice",
  "cashier_collection",
  "cashier_refund",
  "warehouse_transfer",
]);

// ─── isRowComplete ─────────────────────────────────────────────────────────────
// Returns true when all *used* sides of a row have an account assigned.
// Dynamic sides are treated as always satisfied (the engine resolves them).
export function isRowComplete(row: MappingRow, spec: LineTypeSpec | undefined, txType?: string): boolean {
  const dynSpec = txType ? DYNAMIC_LINE_SPECS[txType]?.[row.lineType] : undefined;
  const debitDynamic  = !!dynSpec?.debit;
  const creditDynamic = !!dynSpec?.credit;

  if (!spec) {
    return (debitDynamic  || !!row.debitAccountId) &&
           (creditDynamic || !!row.creditAccountId);
  }
  const needsDebit  = spec.debitSide  ? (debitDynamic  || !!row.debitAccountId)  : true;
  const needsCredit = spec.creditSide ? (creditDynamic || !!row.creditAccountId) : true;
  return needsDebit && needsCredit;
}
