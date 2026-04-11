/**
 * account-category-validator.ts
 *
 * Semantic category rules for GL account assignments.
 *
 * Each line type declares which account_type values are acceptable
 * for its debit and credit sides. The resolver and the save API both
 * enforce these rules so a revenue line can never post to an inventory
 * account, and an inventory line can never post to a revenue account.
 *
 * account_type values (from the accounts table enum):
 *   asset | liability | equity | revenue | expense
 */

export interface AccountCategoryRule {
  debit?:  string[];
  credit?: string[];
}

/**
 * Semantic rules per line type.
 * undefined side = no constraint (any account_type is accepted).
 * Empty array    = side is not used (should not be set).
 */
export const LINE_TYPE_CATEGORY_RULES: Record<string, AccountCategoryRule> = {
  revenue_drugs:        { debit: ["asset"],                credit: ["revenue"] },
  revenue_general:      { debit: ["asset"],                credit: ["revenue"] },
  revenue_consumables:  { debit: ["asset"],                credit: ["revenue"] },
  revenue_services:     { debit: ["asset"],                credit: ["revenue"] },
  revenue_gas:          { debit: ["asset"],                credit: ["revenue"] },
  revenue_surgery:      { debit: ["asset"],                credit: ["revenue"] },
  revenue_equipment:    { debit: ["asset"],                credit: ["revenue"] },

  inventory:            { debit: ["asset"],                credit: ["asset"]            },

  cogs:                 { debit: ["expense"],              credit: ["asset"]            },
  cogs_drugs:           { debit: ["expense"],              credit: ["asset"]            },
  cogs_supplies:        { debit: ["expense"],              credit: ["asset"]            },

  receivables:          { debit: ["asset"],                credit: ["asset"]            },

  cash:                 { debit: ["asset"],                credit: ["asset", "liability"] },

  discount_allowed:     { debit: ["revenue", "expense"],  credit: ["asset", "liability"] },

  vat_output:           { debit: ["asset"],                credit: ["liability"]        },
  vat_input:            { debit: ["asset"],                credit: ["asset", "liability"] },

  payables:             { debit: ["asset"],                credit: ["liability"]        },
  payables_drugs:       { debit: ["asset"],                credit: ["liability"]        },
  payables_consumables: { debit: ["asset"],                credit: ["liability"]        },

  discount_earned:      { debit: ["asset", "liability"],  credit: ["revenue", "expense"] },

  doctor_payable:       { debit: ["liability"],            credit: ["asset"]            },
  receivable_clear:     { debit: ["asset"],                credit: ["asset"]            },

  stock_gain:           {                                  credit: ["revenue", "equity"] },
  stock_loss:           { debit: ["expense", "equity"]                                  },

  returns:              { debit: ["revenue"],              credit: ["asset"]            },

  ap_settlement:        { debit: ["liability"],            credit: ["asset"]             },

  // Contract pharmacy receivables — Phase 2
  pharmacy_patient_receivable:  { debit: ["asset"], credit: ["asset"] },
  pharmacy_contract_receivable: { debit: ["asset"], credit: ["asset"] },

  // Cashier shift close — treasury (عهدة أمين الخزنة)
  treasury: { debit: ["asset"], credit: ["asset"] },

  // Contract settlement (Phase 6) ─────────────────────────────────────────────
  //
  // rejection_loss / contract_discount_exp / price_diff_expense:
  //   يقبل "expense" (مصروف مباشر) و"revenue" (مخفض إيراد — مثل 4213 رفض مطالبات).
  //   رفض مطالبات التأمين يُصنَّف في IFRS كـ Revenue Deduction ليس Expense مستقل.
  ar_insurance:          {                                  credit: ["asset"]                         },
  bank_settlement:       { debit: ["asset"]                                                           },
  rejection_loss:        { debit: ["expense", "revenue"]                                              },
  contract_discount_exp: { debit: ["expense", "revenue"]                                              },
  price_diff_expense:    { debit: ["expense", "revenue"]                                              },
  rounding_adjustment:   { debit: ["expense", "revenue", "asset"], credit: ["revenue", "asset"]       },
};

/** Arabic labels for account_type enum values */
export const ACCOUNT_TYPE_LABELS_AR: Record<string, string> = {
  asset:     "أصول",
  liability: "التزامات",
  equity:    "حقوق ملكية",
  revenue:   "إيرادات",
  expense:   "مصروفات",
};

export interface CategoryValidationResult {
  valid:         boolean;
  expectedTypes: string[];
  message:       string;
}

/**
 * Validates that a GL account with the given account_type is semantically
 * acceptable for the specified line type and side (debit or credit).
 *
 * Returns { valid: true } when:
 *  - No rule is defined for the line type, OR
 *  - No constraint exists for the given side, OR
 *  - The account_type appears in the allowed list.
 */
export function validateAccountCategory(
  accountType: string,
  lineType:    string,
  side:        "debit" | "credit",
): CategoryValidationResult {
  const rule = LINE_TYPE_CATEGORY_RULES[lineType];
  if (!rule) {
    return { valid: true, expectedTypes: [], message: "" };
  }

  const allowed = rule[side];
  if (!allowed || allowed.length === 0) {
    return { valid: true, expectedTypes: [], message: "" };
  }

  if (allowed.includes(accountType)) {
    return { valid: true, expectedTypes: allowed, message: "" };
  }

  const sideLabel   = side === "debit" ? "المدين" : "الدائن";
  const allowedAr   = allowed.map(t => ACCOUNT_TYPE_LABELS_AR[t] ?? t).join(", ");
  const actualAr    = ACCOUNT_TYPE_LABELS_AR[accountType] ?? accountType;

  return {
    valid:         false,
    expectedTypes: allowed,
    message:
      `جانب ${sideLabel} لنوع البند "${lineType}" يجب أن يكون من نوع [${allowedAr}]` +
      ` — الحساب المحدد من نوع: ${actualAr}`,
  };
}

/**
 * Revenue-first line types: pharmacy-specific mapping takes priority
 * over warehouse-specific. All other line types remain warehouse-first.
 */
export const REVENUE_FIRST_LINE_TYPES = new Set([
  "revenue_drugs",
  "revenue_general",
  "revenue_consumables",
  "revenue_services",
  "revenue_equipment",
  "returns",
]);
