/**
 * mapping-completeness.ts
 *
 * Server-side mapping completeness checker.
 * Defines which line types are HARD-REQUIRED (required:true) per transaction type
 * and checks whether they exist in the DB.
 *
 * Used by:
 *  - GET /api/account-mappings/completeness  → global dashboard
 *  - finalization-guard / posting guards      → pre-flight block
 */

import { db } from "../db";
import { accountMappings } from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

// ── Hard-required line types per transaction type ──────────────────────────
// Only "required: true" entries (not "cond") are listed here.
// These MUST have a generic (no scope) mapping for the journal generator to work.
export const REQUIRED_GENERIC_MAPPINGS: Record<string, string[]> = {
  sales_invoice:             ["receivables"],
  receiving:                 ["inventory", "payables"],
  purchase_invoice:          ["inventory"],
  cashier_collection:        ["cash"],
  cashier_shift_close:       ["treasury"],
  warehouse_transfer:        ["inventory"],
  supplier_payment:          ["ap_settlement"],
  contract_settlement:       ["ar_insurance"],
  oversell_resolution:       ["cogs"],
};

// patient_invoice / sales_return / cashier_refund / doctor_payable_settlement
// / stock_count_adjustment are all "cond" — no hard generic requirement,
// but we still surface "no mappings at all" as a completeness warning.
export const SOFT_CHECK_TYPES: string[] = [
  "patient_invoice",
  "sales_return",
  "cashier_refund",
  "doctor_payable_settlement",
  "stock_count_adjustment",
];

export interface TxTypeCompleteness {
  txType:        string;
  isComplete:    boolean;
  missingRequired: string[];   // hard-required line types with no generic mapping
  hasAnyMapping: boolean;      // at least one mapping exists (for soft-check types)
  totalMapped:   number;       // total generic mappings configured
}

export interface CompletenessReport {
  allComplete:    boolean;
  types:          TxTypeCompleteness[];
  missingCount:   number;
}

export async function getMappingCompleteness(): Promise<CompletenessReport> {
  // Fetch all generic mappings (no scope) in one query
  const allGeneric = await db
    .select({
      transactionType: accountMappings.transactionType,
      lineType:        accountMappings.lineType,
    })
    .from(accountMappings)
    .where(
      and(
        eq(accountMappings.isActive, true),
        isNull(accountMappings.warehouseId),
        isNull(accountMappings.pharmacyId),
        isNull(accountMappings.departmentId),
      )
    );

  // Group by transaction type
  const byTxType = new Map<string, Set<string>>();
  for (const row of allGeneric) {
    if (!byTxType.has(row.transactionType)) {
      byTxType.set(row.transactionType, new Set());
    }
    byTxType.get(row.transactionType)!.add(row.lineType);
  }

  const types: TxTypeCompleteness[] = [];

  // Hard-required types
  for (const [txType, required] of Object.entries(REQUIRED_GENERIC_MAPPINGS)) {
    const configured = byTxType.get(txType) ?? new Set();
    const missingRequired = required.filter(lt => !configured.has(lt));
    types.push({
      txType,
      isComplete:      missingRequired.length === 0,
      missingRequired,
      hasAnyMapping:   configured.size > 0,
      totalMapped:     configured.size,
    });
  }

  // Soft-check types (all conditional — just check hasAnyMapping)
  for (const txType of SOFT_CHECK_TYPES) {
    const configured = byTxType.get(txType) ?? new Set();
    types.push({
      txType,
      isComplete:      configured.size > 0,
      missingRequired: [],
      hasAnyMapping:   configured.size > 0,
      totalMapped:     configured.size,
    });
  }

  const missingCount = types.filter(t => !t.isComplete).length;

  return {
    allComplete:  missingCount === 0,
    types:        types.sort((a, b) => (a.isComplete ? 1 : -1) - (b.isComplete ? 1 : -1)),
    missingCount,
  };
}

/**
 * Targeted check for a single transaction type.
 * Returns the list of missing required line types.
 * Empty array = all required mappings are present.
 */
export async function getMissingRequiredMappings(
  txType: string,
  departmentId?: string | null,
  warehouseId?: string | null,
  pharmacyId?: string | null,
): Promise<string[]> {
  const required = REQUIRED_GENERIC_MAPPINGS[txType];
  if (!required || required.length === 0) return [];

  // For scoped checks, also accept scoped mappings as satisfying the requirement
  const rows = await db
    .select({ lineType: accountMappings.lineType })
    .from(accountMappings)
    .where(
      and(
        eq(accountMappings.transactionType, txType),
        eq(accountMappings.isActive, true),
        inArray(accountMappings.lineType, required),
      )
    );

  const existing = new Set(rows.map(r => r.lineType));
  return required.filter(lt => !existing.has(lt));
}

// ── Arabic labels for error messages ──────────────────────────────────────
const LINE_LABELS_AR: Record<string, string> = {
  inventory:     "حساب المخزون",
  payables:      "حساب ذمم الموردين",
  receivables:   "حساب الذمم المدينة",
  cash:          "حساب النقدية",
  treasury:      "حساب الخزنة",
  ap_settlement: "حساب تسوية الموردين",
  ar_insurance:  "حساب ذمم شركات التأمين",
  cogs:          "حساب تكلفة البضاعة المباعة",
  revenue:       "حساب الإيراد",
};

const TX_LABELS_AR: Record<string, string> = {
  receiving:           "ترحيل الاستلام",
  purchase_invoice:    "اعتماد فاتورة الشراء",
  sales_invoice:       "اعتماد فاتورة المبيعات",
  cashier_shift_close: "إقفال وردية الكاشير",
  supplier_payment:    "سداد الموردين",
  patient_invoice:     "اعتماد فاتورة المريض",
};

/**
 * Pre-flight guard: throws a structured 422-like Error if any required
 * mappings are missing for the given transaction type.
 *
 * Usage:
 *   await assertMappingsComplete("receiving");
 *   await assertMappingsComplete("purchase_invoice");
 */
export async function assertMappingsComplete(
  txType: string,
  departmentId?: string | null,
  warehouseId?: string | null,
  pharmacyId?: string | null,
): Promise<void> {
  const missing = await getMissingRequiredMappings(txType, departmentId, warehouseId, pharmacyId);
  if (missing.length === 0) return;

  const txLabel = TX_LABELS_AR[txType] ?? txType;
  const lines = missing.map(lt => `• ${LINE_LABELS_AR[lt] ?? lt}`).join("\n");
  const err = new Error(
    `لا يمكن إتمام (${txLabel}) لأن ربط الحسابات غير مكتمل:\n${lines}\n\nيرجى إضافة الربط في صفحة "ربط الحسابات بالعمليات" ثم إعادة المحاولة.`
  );
  (err as any).status = 422;
  (err as any).code   = "MAPPING_INCOMPLETE";
  (err as any).missingMappings = missing;
  throw err;
}
