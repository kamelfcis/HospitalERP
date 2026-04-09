import { db } from "../db";
import { sql } from "drizzle-orm";

export interface FinalizationCheckResult {
  canFinalize: boolean;
  issues: string[];
  checks: {
    hasInvoice: boolean;
    invoiceIsDraft: boolean;
    allLinesHaveEncounter: boolean;
    noOrphanLines: boolean;
    totalsConsistent: boolean;
    isFullyPaid: boolean;
    noVoidedOnly: boolean;
  };
}

export async function runFinalizationGuard(visitId: string): Promise<FinalizationCheckResult> {
  const issues: string[] = [];

  const invRes = await db.execute(sql`
    SELECT id, status, total_amount, discount_amount, net_amount, paid_amount, is_final_closed
    FROM patient_invoice_headers
    WHERE visit_id = ${visitId} AND status IN ('draft', 'finalized')
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1
  `);

  const inv = invRes.rows[0] as Record<string, unknown> | undefined;
  if (!inv) {
    return {
      canFinalize: false,
      issues: ["لا توجد فاتورة مرتبطة بالزيارة"],
      checks: {
        hasInvoice: false,
        invoiceIsDraft: false,
        allLinesHaveEncounter: false,
        noOrphanLines: false,
        totalsConsistent: false,
        isFullyPaid: false,
        noVoidedOnly: false,
      },
    };
  }

  const hasInvoice = true;
  const invoiceIsDraft = inv.status === "draft";
  if (inv.is_final_closed) issues.push("الفاتورة مغلقة نهائياً بالفعل");

  const lineStatsRes = await db.execute(sql`
    SELECT
      COUNT(*) AS total_lines,
      COUNT(*) FILTER (WHERE encounter_id IS NULL) AS orphan_lines,
      COALESCE(SUM(total_price::numeric), 0) AS computed_net,
      COALESCE(SUM(
        (quantity::numeric * unit_price::numeric)
      ), 0) AS computed_gross,
      COALESCE(SUM(discount_amount::numeric), 0) AS computed_discount
    FROM patient_invoice_lines
    WHERE header_id = ${inv.id} AND is_void = false
  `);
  const stats = lineStatsRes.rows[0] as Record<string, unknown>;

  const totalLines = parseInt(String(stats.total_lines ?? "0"));
  const orphanLines = parseInt(String(stats.orphan_lines ?? "0"));
  const computedNet = parseFloat(String(stats.computed_net ?? "0"));

  const noVoidedOnly = totalLines > 0;
  if (!noVoidedOnly) issues.push("الفاتورة فارغة بدون بنود صالحة");

  const allLinesHaveEncounter = orphanLines === 0;
  const noOrphanLines = orphanLines === 0;
  if (orphanLines > 0) issues.push(`${orphanLines} بند بدون مقابلة طبية (encounter)`);

  const headerNet = parseFloat(String(inv.net_amount ?? "0"));
  const totalsConsistent = Math.abs(headerNet - computedNet) < 0.01;
  if (!totalsConsistent) issues.push(`إجمالي الفاتورة (${headerNet}) لا يطابق مجموع البنود (${computedNet.toFixed(2)})`);

  const paidRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS paid
    FROM patient_invoice_payments
    WHERE header_id = ${inv.id}
  `);
  const paid = parseFloat(String((paidRes.rows[0] as Record<string, unknown>)?.paid ?? "0"));
  const remaining = computedNet - paid;
  const isFullyPaid = remaining <= 0.01;
  if (!isFullyPaid) issues.push(`متبقي ${remaining.toFixed(2)} جنيه — يجب السداد الكامل قبل الاعتماد`);

  const canFinalize = hasInvoice && invoiceIsDraft && allLinesHaveEncounter && noOrphanLines
    && totalsConsistent && isFullyPaid && noVoidedOnly && !inv.is_final_closed;

  return {
    canFinalize,
    issues,
    checks: {
      hasInvoice,
      invoiceIsDraft,
      allLinesHaveEncounter,
      noOrphanLines,
      totalsConsistent,
      isFullyPaid,
      noVoidedOnly,
    },
  };
}
