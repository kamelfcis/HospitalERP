/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contract Claim Generator — مولّد مطالبات العقود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  يُنشئ أو يحدّث دفعة مطالبة (draft batch) تلقائياً عند تنفيذ المطالبة،
 *  ويُضيف سطراً لكل بند فاتورة مريض تكون فيه:
 *    - coverageStatus = 'covered'   (أو null مع companyShareAmount > 0 للتوافق)
 *    - companyShareAmount > 0
 *    - لم يُنشأ لها سطر مطالبة مسبقاً في أي دفعة draft/submitted
 *
 *  يُستدعى من patient-invoices.ts بعد finalize مباشرةً (fire-and-forget).
 *  الفشل لا يوقف عملية الاعتماد.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and, sql, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  patientInvoiceHeaders,
  patientInvoiceLines,
  contractClaimLines,
} from "@shared/schema";
import { storage } from "../storage";
import { logger } from "./logger";

// ─── Main Entry Point ──────────────────────────────────────────────────────

/**
 * generateClaimsForInvoice
 *
 * يجمع بنود الفاتورة القابلة للمطالبة ويضيفها لدفعة draft مفتوحة (أو ينشئ واحدة).
 * آمن للاستدعاء أكثر من مرة (idempotent — يتحقق من وجود السطر أولاً).
 */
export async function generateClaimsForInvoice(invoiceId: string): Promise<void> {
  try {
    const header = await db
      .select()
      .from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.id, invoiceId))
      .limit(1);

    if (!header[0]) {
      logger.warn({ invoiceId }, "[Claims] header not found — skipping");
      return;
    }

    const inv = header[0] as any;

    const companyId  = inv.company_id  ?? inv.companyId;
    const contractId = inv.contract_id ?? inv.contractId;

    if (!companyId || !contractId) {
      logger.debug({ invoiceId }, "[Claims] no company/contract on header — not a contract invoice, skipping");
      return;
    }

    const lines = await db
      .select()
      .from(patientInvoiceLines)
      .where(
        and(
          eq(patientInvoiceLines.invoiceId, invoiceId),
          sql`CAST(${patientInvoiceLines.companyShareAmount} AS numeric) > 0`
        )
      );

    if (lines.length === 0) {
      logger.debug({ invoiceId }, "[Claims] no company-share lines — skipping");
      return;
    }

    const invoiceDate = String(inv.invoice_date ?? inv.invoiceDate ?? new Date().toISOString().split("T")[0]);

    const batch = await storage.findOrCreateDraftBatch(companyId, contractId, invoiceDate);

    let addedCount = 0;
    for (const line of lines) {
      const l = line as any;

      const existing = await db
        .select({ id: contractClaimLines.id })
        .from(contractClaimLines)
        .where(eq(contractClaimLines.patientInvoiceLineId, l.id))
        .limit(1);

      if (existing[0]) continue;

      await storage.upsertClaimLine({
        batchId:              batch.id,
        patientInvoiceLineId: l.id,
        invoiceHeaderId:      invoiceId,
        contractMemberId:     l.contract_member_id ?? l.contractMemberId ?? null,
        serviceDescription:   l.description ?? l.itemName ?? "خدمة طبية",
        serviceDate:          invoiceDate,
        listPrice:            String(l.unitPrice ?? l.list_price ?? "0"),
        contractPrice:        String(l.contractPrice ?? l.contract_price ?? l.unitPrice ?? "0"),
        companyShareAmount:   String(l.companyShareAmount ?? l.company_share_amount ?? "0"),
        patientShareAmount:   String(l.patientShareAmount ?? l.patient_share_amount ?? "0"),
      });
      addedCount++;
    }

    logger.info({ invoiceId, batchId: batch.id, addedCount }, "[Claims] claim lines generated");

  } catch (err: any) {
    logger.warn({ err: err.message, invoiceId }, "[Claims] generateClaimsForInvoice failed (non-fatal)");
  }
}
