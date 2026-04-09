import { db } from "../db";
import { sql } from "drizzle-orm";

export type PaymentClassification = "fully_paid" | "accounts_receivable" | "refund_due";

export interface FinalizationCheckResult {
  canFinalize: boolean;
  issues: string[];
  warnings: string[];
  checks: {
    hasInvoice: boolean;
    invoiceIsDraft: boolean;
    notAlreadyFinalizing: boolean;
    allLinesHaveEncounter: boolean;
    noOrphanLines: boolean;
    totalsConsistent: boolean;
    noVoidedOnly: boolean;
    accountMappingsExist: boolean;
  };
  paymentSummary: {
    classification: PaymentClassification;
    netAmount: number;
    paidAmount: number;
    remaining: number;
    payerBreakdown: Array<{ method: string; amount: number }>;
  } | null;
}

export async function runFinalizationGuard(visitId: string): Promise<FinalizationCheckResult> {
  const issues: string[] = [];
  const warnings: string[] = [];

  const invRes = await db.execute(sql`
    SELECT id, status, total_amount, discount_amount, net_amount, paid_amount, is_final_closed
    FROM patient_invoice_headers
    WHERE visit_id = ${visitId} AND status IN ('draft', 'finalized', 'finalizing')
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 WHEN status = 'finalizing' THEN 1 ELSE 2 END,
      created_at DESC
    LIMIT 1
  `);

  const inv = invRes.rows[0] as Record<string, unknown> | undefined;
  if (!inv) {
    return {
      canFinalize: false,
      issues: ["لا توجد فاتورة مرتبطة بالزيارة"],
      warnings: [],
      checks: {
        hasInvoice: false,
        invoiceIsDraft: false,
        notAlreadyFinalizing: true,
        allLinesHaveEncounter: false,
        noOrphanLines: false,
        totalsConsistent: false,
        noVoidedOnly: false,
        accountMappingsExist: false,
      },
      paymentSummary: null,
    };
  }

  const hasInvoice = true;
  const invoiceIsDraft = inv.status === "draft";
  const notAlreadyFinalizing = inv.status !== "finalizing";
  if (inv.is_final_closed) issues.push("الفاتورة مغلقة نهائياً بالفعل");
  if (!invoiceIsDraft && inv.status !== "finalizing") {
    if (inv.status === "finalized") issues.push("الفاتورة معتمدة بالفعل");
  }
  if (!notAlreadyFinalizing) issues.push("الفاتورة قيد الاعتماد حالياً — يرجى الانتظار");

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
    SELECT
      COALESCE(SUM(amount::numeric), 0) AS paid
    FROM patient_invoice_payments
    WHERE header_id = ${inv.id}
  `);
  const paid = parseFloat(String((paidRes.rows[0] as Record<string, unknown>)?.paid ?? "0"));
  const remaining = computedNet - paid;

  const payerRes = await db.execute(sql`
    SELECT payment_method, COALESCE(SUM(amount::numeric), 0) AS total
    FROM patient_invoice_payments
    WHERE header_id = ${inv.id}
    GROUP BY payment_method
  `);
  const payerBreakdown = (payerRes.rows as Array<Record<string, unknown>>).map(r => ({
    method: r.payment_method as string,
    amount: parseFloat(String(r.total ?? "0")),
  }));

  let classification: PaymentClassification;
  if (remaining <= 0.01 && remaining >= -0.01) {
    classification = "fully_paid";
  } else if (remaining > 0.01) {
    classification = "accounts_receivable";
    warnings.push(`متبقي ${remaining.toFixed(2)} جنيه — سيتم تسجيله كذمم مدينة (AR)`);
  } else {
    classification = "refund_due";
    warnings.push(`مبلغ زائد ${Math.abs(remaining).toFixed(2)} جنيه — سيتم تسجيل مردود`);
  }

  const mappingRes = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM account_mappings
    WHERE transaction_type = 'patient_invoice'
  `);
  const accountMappingsExist = parseInt(String((mappingRes.rows[0] as Record<string, unknown>)?.cnt ?? "0")) > 0;
  if (!accountMappingsExist) warnings.push("لم يتم ضبط ربط الحسابات لفواتير المرضى — القيد المحاسبي لن يُنشأ تلقائياً");

  const canFinalize = hasInvoice && invoiceIsDraft && notAlreadyFinalizing && allLinesHaveEncounter
    && noOrphanLines && totalsConsistent && noVoidedOnly && !inv.is_final_closed;

  return {
    canFinalize,
    issues,
    warnings,
    checks: {
      hasInvoice,
      invoiceIsDraft,
      notAlreadyFinalizing,
      allLinesHaveEncounter,
      noOrphanLines,
      totalsConsistent,
      noVoidedOnly,
      accountMappingsExist,
    },
    paymentSummary: {
      classification,
      netAmount: computedNet,
      paidAmount: paid,
      remaining: Math.abs(remaining) < 0.01 ? 0 : remaining,
      payerBreakdown,
    },
  };
}
