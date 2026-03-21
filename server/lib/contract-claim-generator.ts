/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contract Claim Generator — مولّد مطالبات العقود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  يُنشئ أو يحدّث دفعة مطالبة (draft batch) تلقائياً عند اعتماد فاتورة مريض
 *  مرتبطة بعقد، ويُضيف سطراً لكل بند مؤهَّل.
 *
 *  شروط الأهلية (جميعها يجب أن تتحقق):
 *    1. companyShareAmount > 0
 *    2. isVoid = false (السطر غير ملغى)
 *    3. coverageStatus ليس 'excluded' أو 'not_covered' (أو null — للتوافق)
 *       → سطور approval_required مؤهَّلة وتُدرج (سلوك موثَّق)
 *
 *  دورة claimStatus على header الفاتورة (للمراقبة):
 *    generating → generated  (نجاح)
 *    generating → failed     (فشل)
 *    null                    (فاتورة غير عقدية — لا تغيير)
 *
 *  يُستدعى من patient-invoices.ts بعد finalize (fire-and-forget).
 *  الفشل لا يوقف عملية الاعتماد.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and, sql, ne, or, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  patientInvoiceHeaders,
  patientInvoiceLines,
  contractClaimLines,
} from "@shared/schema";
import { storage } from "../storage";
import { logger } from "./logger";

// ─── Ineligible coverage statuses ─────────────────────────────────────────
// approval_required lines ARE eligible (claim them; company reviews on their end)
const INELIGIBLE_COVERAGE_STATUSES = ["excluded", "not_covered"];

// ─── Main Entry Point ──────────────────────────────────────────────────────

/**
 * generateClaimsForInvoice
 *
 * Idempotent — DB unique index on patient_invoice_line_id prevents duplicates
 * even under concurrent calls. Code-level check is first-pass optimisation.
 *
 * claimStatus lifecycle (written directly; non-blocking):
 *   - Set to 'generating' by the CALLER before invoking this function
 *   - Set to 'generated' here on success
 *   - Set to 'failed'    here on error
 */
export async function generateClaimsForInvoice(invoiceId: string): Promise<void> {
  const setClaimStatus = async (status: "generating" | "generated" | "failed") => {
    try {
      await db
        .update(patientInvoiceHeaders)
        .set({ claimStatus: status, updatedAt: new Date() })
        .where(eq(patientInvoiceHeaders.id, invoiceId));
    } catch (e: any) {
      logger.warn({ err: e.message, invoiceId, status }, "[Claims] claimStatus update failed");
    }
  };

  try {
    // ── 1. Load header ─────────────────────────────────────────────────────
    const headers = await db
      .select()
      .from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.id, invoiceId))
      .limit(1);

    if (!headers[0]) {
      logger.warn({ invoiceId }, "[Claims] header not found — skipping");
      return;
    }

    const inv = headers[0] as any;
    const companyId  = inv.company_id  ?? inv.companyId;
    const contractId = inv.contract_id ?? inv.contractId;

    if (!companyId || !contractId) {
      // Not a contract invoice — leave claimStatus null
      logger.debug({ invoiceId }, "[Claims] no company/contract on header — not a contract invoice, skipping");
      return;
    }

    // claimStatus was already set to 'generating' by caller — proceed

    // ── 2. Fetch eligible lines ────────────────────────────────────────────
    //   Conditions (ALL must be satisfied):
    //     - companyShareAmount > 0
    //     - isVoid = false
    //     - coverageStatus NOT IN ('excluded', 'not_covered') OR NULL
    //     - approvalStatus IS NULL (non-approval_required lines)
    //       OR approvalStatus = 'approved' (explicitly approved lines)
    //     NOTE: pending approval lines are NOT eligible until approved
    const lines = await db
      .select()
      .from(patientInvoiceLines)
      .where(
        and(
          eq(patientInvoiceLines.headerId, invoiceId),
          sql`CAST(${patientInvoiceLines.companyShareAmount} AS numeric) > 0`,
          eq(patientInvoiceLines.isVoid, false),
          or(
            isNull(patientInvoiceLines.coverageStatus),
            sql`${patientInvoiceLines.coverageStatus} NOT IN ('excluded', 'not_covered')`
          ),
          // Phase 4: approval gate
          or(
            isNull(patientInvoiceLines.approvalStatus),
            sql`${patientInvoiceLines.approvalStatus} = 'approved'`
          )
        )
      );

    if (lines.length === 0) {
      logger.debug({ invoiceId }, "[Claims] no eligible lines after filter — skipping");
      await setClaimStatus("generated"); // no lines to claim is a valid success state
      return;
    }

    // ── 3. Get or create draft batch ───────────────────────────────────────
    const invoiceDate = String(inv.invoice_date ?? inv.invoiceDate ?? new Date().toISOString().split("T")[0]);
    const batch = await storage.findOrCreateDraftBatch(companyId, contractId, invoiceDate);

    // ── 4. Upsert claim lines (idempotent) ─────────────────────────────────
    let addedCount = 0;
    let skippedCount = 0;

    for (const line of lines) {
      const l = line as any;

      // Code-level check (optimisation before hitting unique index)
      const existing = await db
        .select({ id: contractClaimLines.id })
        .from(contractClaimLines)
        .where(eq(contractClaimLines.patientInvoiceLineId, l.id))
        .limit(1);

      if (existing[0]) {
        skippedCount++;
        continue;
      }

      try {
        await storage.upsertClaimLine({
          batchId:              batch.id,
          patientInvoiceLineId: l.id,
          invoiceHeaderId:      invoiceId,
          contractMemberId:     l.contract_member_id ?? l.contractMemberId ?? null,
          serviceDescription:   l.description ?? l.itemName ?? "خدمة طبية",
          serviceDate:          invoiceDate,
          listPrice:            String(l.listPrice    ?? l.list_price    ?? l.unitPrice ?? "0"),
          contractPrice:        String(l.contractPrice ?? l.contract_price ?? l.unitPrice ?? "0"),
          companyShareAmount:   String(l.companyShareAmount ?? l.company_share_amount ?? "0"),
          patientShareAmount:   String(l.patientShareAmount ?? l.patient_share_amount ?? "0"),
        });
        addedCount++;
      } catch (insertErr: any) {
        // Unique constraint violation = concurrent insert won — safe to ignore
        if (insertErr.code === "23505") {
          logger.debug({ invoiceId, lineId: l.id }, "[Claims] duplicate insert blocked by unique index — safe no-op");
          skippedCount++;
        } else {
          throw insertErr; // rethrow unexpected errors
        }
      }
    }

    logger.info({ invoiceId, batchId: batch.id, addedCount, skippedCount }, "[Claims] claim generation complete");
    await setClaimStatus("generated");

  } catch (err: any) {
    logger.warn({ err: err.message, invoiceId }, "[Claims] generateClaimsForInvoice failed (non-fatal)");
    await setClaimStatus("failed");
  }
}
