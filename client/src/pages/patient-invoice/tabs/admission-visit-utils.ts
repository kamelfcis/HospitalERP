/**
 * admission-visit-utils.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Pure helpers — NO React imports. Computes visit-group breakdown from
 * already-fetched admInvoices (PatientInvoiceHeader[]). Zero N+1 risk.
 *
 * Rules (Phase D — Null Handling):
 *   • Only non-consolidated invoices (`is_consolidated = false`) are considered.
 *   • If ALL invoices have visitGroupId = null → returns [] (no breakdown shown).
 *   • If ≥1 non-null group exists:
 *     – Non-null groups are ordered by earliest createdAt → stable "زيارة 1", "زيارة 2"…
 *     – Invoices with visitGroupId = null → appended last as "غير مرتبطة بزيارة".
 *   • Consolidated invoices are NEVER included in any bucket.
 *   • An invoice can belong to EXACTLY ONE bucket (its visitGroupId or null).
 */

import type { PatientInvoiceHeader } from "@shared/schema";

export type InvWithDept = PatientInvoiceHeader & { departmentName?: string | null };

export interface VisitGroupSummary {
  /** UUID or null for "unassigned" bucket */
  groupId: string | null;
  /** "زيارة 1" | "زيارة 2" | "غير مرتبطة بزيارة" */
  label: string;
  invoices: InvWithDept[];
  /** Sum of netAmount (or totalAmount fallback) for this group */
  total: number;
  /** Distinct non-empty department names within this group */
  depts: string[];
}

/**
 * Returns visit-group summaries computed from the provided invoice list.
 * Returns an empty array when no breakdown should be shown.
 */
export function groupInvoicesByVisit(invoices: InvWithDept[]): VisitGroupSummary[] {
  const source = invoices.filter(i => !i.isConsolidated);

  // Collect distinct non-null visitGroupIds
  const nonNullIds = new Set<string>();
  for (const inv of source) {
    if (inv.visitGroupId) nonNullIds.add(inv.visitGroupId);
  }

  // No real visit groups → no breakdown
  if (nonNullIds.size === 0) return [];

  // Build bucket map
  const map = new Map<string | null, InvWithDept[]>();
  for (const inv of source) {
    const key = inv.visitGroupId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(inv);
  }

  // Order non-null groups by their earliest invoice's createdAt (stable labelling)
  const ordered = [...nonNullIds]
    .map(gid => {
      const invs = map.get(gid)!;
      const earliest = Math.min(...invs.map(i => new Date(i.createdAt as string).getTime()));
      return { gid, earliest };
    })
    .sort((a, b) => a.earliest - b.earliest);

  const sortByDate = (a: InvWithDept, b: InvWithDept) =>
    new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime();

  const summarize = (gid: string | null, label: string): VisitGroupSummary => {
    const invs = (map.get(gid) ?? []).slice().sort(sortByDate);
    const total = invs.reduce(
      (s, i) => s + parseFloat(String(i.netAmount ?? i.totalAmount ?? "0")), 0
    );
    const depts = [...new Set(
      invs.map(i => i.departmentName?.trim()).filter((d): d is string => Boolean(d))
    )];
    return { groupId: gid, label, invoices: invs, total, depts };
  };

  const result: VisitGroupSummary[] = ordered.map(({ gid }, idx) =>
    summarize(gid, `زيارة ${idx + 1}`)
  );

  // Append null bucket if any un-assigned source invoices exist
  if (map.has(null) && (map.get(null)?.length ?? 0) > 0) {
    result.push(summarize(null, "غير مرتبطة بزيارة"));
  }

  return result;
}

/**
 * Counts distinct non-null visit_group_id values in source invoices.
 * Convenience wrapper used by list-row badge.
 */
export function countDistinctVisitGroups(invoices: InvWithDept[]): number {
  const ids = new Set(
    invoices
      .filter(i => !i.isConsolidated && i.visitGroupId)
      .map(i => i.visitGroupId!)
  );
  return ids.size;
}
