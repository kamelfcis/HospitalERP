/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contract Claim Settlement Service — Phase 5
 *  خدمة تسوية مطالبات التأمين وتتبع الذمم المدينة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  AR LOGIC:
 *    At claim generation : AR = companyShareAmount  (implicit / claimed)
 *    At approval         : AR adjusts to approvedAmount
 *    At settlement       : reduce AR by settledAmount
 *    Outstanding         = approvedAmount - totalSettled (derived)
 *
 *  SAFETY RULES:
 *    - Cannot settle more than approvedAmount per line
 *    - Partial settlement allowed (line stays 'approved' until fully settled)
 *    - Rejected lines cannot be settled
 *    - Pending lines cannot be settled
 *    - Cancelled batch cannot be settled
 *    - GL posting is OPTIONAL — only fires if bankAccountId + companyArAccountId provided
 *    - Settlement is idempotent-safe: duplicate prevention via settlement line uniqueness
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  contractClaimBatches,
  contractClaimLines,
  contractClaimSettlements,
  contractClaimSettlementLines,
} from "@shared/schema";
import { logger } from "./logger";
import { logAcctEvent } from "./accounting-event-logger";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SettlementLineInput {
  claimLineId:      string;
  settledAmount:    number;
  writeOffAmount?:  number;
  adjustmentReason?: string;
}

export interface SettleBatchInput {
  settlementDate:    string;
  settledAmount:     number;          // overall amount (for GL + header)
  bankAccountId?:    string | null;
  companyArAccountId?: string | null;
  referenceNumber?:  string;
  notes?:            string;
  lines:             SettlementLineInput[];
}

export interface ReconciliationLine {
  claimLineId:       string;
  serviceDescription: string;
  serviceDate:       string;
  claimedAmount:     number;
  approvedAmount:    number;
  settledAmount:     number;
  writeOffAmount:    number;
  outstanding:       number;
  variance:          number;   // claimed - approved
  status:            string;
}

export interface BatchReconciliation {
  batchId:         string;
  batchNumber:     string;
  totalClaimed:    number;
  totalApproved:   number;
  totalSettled:    number;
  totalOutstanding: number;
  totalVariance:   number;
  totalWriteoff:   number;
  lines:           ReconciliationLine[];
}

export class SettlementServiceError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "SettlementServiceError";
  }
}

// ─── Validation ────────────────────────────────────────────────────────────

export function validateSettlementAmounts(
  lines:      SettlementLineInput[],
  claimLines: any[],
): void {
  const lineMap = new Map(claimLines.map(l => [l.id, l]));

  for (const input of lines) {
    const claim = lineMap.get(input.claimLineId);
    if (!claim) {
      throw new SettlementServiceError(
        `سطر المطالبة غير موجود: ${input.claimLineId}`, "NOT_FOUND"
      );
    }
    if (claim.status === "rejected") {
      throw new SettlementServiceError(
        `لا يمكن تسوية سطر مرفوض: ${claim.serviceDescription}`, "INVALID_STATE"
      );
    }
    if (claim.status === "pending") {
      throw new SettlementServiceError(
        `لا يمكن تسوية سطر معلّق — يجب قبوله أولاً: ${claim.serviceDescription}`, "INVALID_STATE"
      );
    }
    const approvedAmt    = parseFloat(String(claim.approvedAmount ?? claim.companyShareAmount ?? "0"));
    const alreadySettled = parseFloat(String(claim.settledAmountSoFar ?? "0"));
    const remaining      = approvedAmt - alreadySettled;
    const writeOff       = input.writeOffAmount ?? 0;

    if (input.settledAmount < 0) {
      throw new SettlementServiceError("مبلغ التسوية لا يمكن أن يكون سالباً", "INVALID_AMOUNT");
    }
    if (writeOff < 0) {
      throw new SettlementServiceError("مبلغ الشطب لا يمكن أن يكون سالباً", "INVALID_AMOUNT");
    }

    // ─── Settlement amount cap ────────────────────────────────────────────
    // settledAmount must not exceed the remaining (approved − already paid)
    if (input.settledAmount > remaining + 0.005) {
      throw new SettlementServiceError(
        `مبلغ التسوية (${input.settledAmount.toFixed(2)}) يتجاوز المتبقي (${remaining.toFixed(2)}) للخدمة: ${claim.serviceDescription}`,
        "AMOUNT_EXCEEDED"
      );
    }

    // ─── Write-off cap ────────────────────────────────────────────────────
    // writeOffAmount must not exceed the remaining outstanding on this line
    if (writeOff > remaining + 0.005) {
      throw new SettlementServiceError(
        `مبلغ الشطب (${writeOff.toFixed(2)}) يتجاوز المتبقي (${remaining.toFixed(2)}) للخدمة: ${claim.serviceDescription}`,
        "WRITEOFF_EXCEEDED"
      );
    }
  }
}

// ─── Calculate Batch Totals ────────────────────────────────────────────────

export function calculateBatchTotals(claimLines: any[]): {
  totalClaimed:     number;
  totalApproved:    number;
  totalSettled:     number;
  totalOutstanding: number;
  totalVariance:    number;
  totalWriteoff:    number;
} {
  let totalClaimed = 0, totalApproved = 0, totalSettled = 0, totalWriteoff = 0;
  for (const l of claimLines) {
    totalClaimed   += parseFloat(String(l.companyShareAmount ?? "0"));
    totalApproved  += parseFloat(String(l.approvedAmount ?? l.companyShareAmount ?? "0"));
    totalSettled   += parseFloat(String(l.settledAmountSoFar ?? "0"));
    totalWriteoff  += parseFloat(String(l.writeOffAmountSoFar ?? "0"));
  }
  const totalOutstanding = totalApproved - totalSettled;
  const totalVariance    = totalClaimed - totalApproved;
  return { totalClaimed, totalApproved, totalSettled, totalOutstanding, totalVariance, totalWriteoff };
}

// ─── Core Settlement Function ──────────────────────────────────────────────

export async function settleBatch(batchId: string, input: SettleBatchInput) {
  // 1. Load + validate batch
  const batchRows = await db.select().from(contractClaimBatches)
    .where(eq(contractClaimBatches.id, batchId))
    .limit(1);
  const batch = batchRows[0];
  if (!batch) throw new SettlementServiceError("دفعة المطالبة غير موجودة", "NOT_FOUND");
  if (batch.status === "cancelled") {
    throw new SettlementServiceError("لا يمكن تسوية دفعة ملغاة", "INVALID_STATE");
  }
  if (batch.status === "draft") {
    throw new SettlementServiceError("لا يمكن تسوية دفعة في حالة مسودة — يجب إرسالها أولاً", "INVALID_STATE");
  }

  // 2. Load claim lines with their current settled amounts
  const claimLineIds = input.lines.map(l => l.claimLineId);
  if (claimLineIds.length === 0) {
    throw new SettlementServiceError("لا توجد سطور للتسوية", "EMPTY_LINES");
  }

  const dbLines = await db.execute(sql`
    SELECT
      cl.id,
      cl.status,
      cl.company_share_amount,
      cl.approved_amount,
      cl.service_description,
      cl.service_date,
      cl.batch_id,
      COALESCE(SUM(csl.settled_amount), 0)   AS settled_amount_so_far,
      COALESCE(SUM(csl.write_off_amount), 0) AS write_off_amount_so_far
    FROM contract_claim_lines cl
    LEFT JOIN contract_claim_settlement_lines csl
      ON csl.claim_line_id = cl.id
    WHERE cl.id = ANY(${claimLineIds})
      AND cl.batch_id = ${batchId}
    GROUP BY cl.id
  `);

  const rawLines = (dbLines as any).rows as any[];

  // Map to normalized shape
  const enrichedLines = rawLines.map(r => ({
    id:                  r.id,
    status:              r.status,
    companyShareAmount:  r.company_share_amount,
    approvedAmount:      r.approved_amount,
    serviceDescription:  r.service_description,
    serviceDate:         r.service_date,
    settledAmountSoFar:  r.settled_amount_so_far,
    writeOffAmountSoFar: r.write_off_amount_so_far,
  }));

  // 3. Validate
  validateSettlementAmounts(input.lines, enrichedLines);

  // 4. Create settlement record + lines in a transaction
  const settlement = await db.transaction(async (tx) => {
    // Insert settlement header
    const [settleRec] = await tx.insert(contractClaimSettlements).values({
      batchId,
      settlementDate:  input.settlementDate,
      settledAmount:   String(input.settledAmount.toFixed(2)),
      bankAccountId:   input.bankAccountId ?? null,
      referenceNumber: input.referenceNumber ?? null,
      notes:           input.notes ?? null,
    }).returning();

    // Insert settlement lines
    if (input.lines.length > 0) {
      await tx.insert(contractClaimSettlementLines).values(
        input.lines.map(l => ({
          settlementId:     settleRec.id,
          claimLineId:      l.claimLineId,
          settledAmount:    String(l.settledAmount.toFixed(2)),
          writeOffAmount:   String((l.writeOffAmount ?? 0).toFixed(2)),
          adjustmentReason: l.adjustmentReason ?? null,
        }))
      );
    }

    // Mark fully-settled lines as 'settled'
    const lineMap = new Map(enrichedLines.map(l => [l.id, l]));
    for (const inputLine of input.lines) {
      const existing = lineMap.get(inputLine.claimLineId);
      if (!existing) continue;
      const prevSettled = parseFloat(String(existing.settledAmountSoFar));
      const approvedAmt = parseFloat(String(existing.approvedAmount ?? existing.companyShareAmount ?? "0"));
      const nowSettled  = prevSettled + inputLine.settledAmount;
      if (nowSettled >= approvedAmt - 0.005) {
        await tx.update(contractClaimLines)
          .set({ status: "settled", settledAt: new Date() })
          .where(eq(contractClaimLines.id, inputLine.claimLineId));
      }
    }

    // Update batch totals
    const allBatchLinesRes = await tx.execute(sql`
      SELECT
        cl.company_share_amount,
        cl.approved_amount,
        COALESCE(SUM(csl.settled_amount), 0)   AS settled_amount_so_far,
        COALESCE(SUM(csl.write_off_amount), 0) AS write_off_amount_so_far
      FROM contract_claim_lines cl
      LEFT JOIN contract_claim_settlement_lines csl ON csl.claim_line_id = cl.id
      WHERE cl.batch_id = ${batchId}
      GROUP BY cl.id
    `);
    const allRows = (allBatchLinesRes as any).rows as any[];
    const totals = calculateBatchTotals(allRows.map(r => ({
      companyShareAmount:  r.company_share_amount,
      approvedAmount:      r.approved_amount,
      settledAmountSoFar:  r.settled_amount_so_far,
      writeOffAmountSoFar: r.write_off_amount_so_far,
    })));

    // Determine if batch is fully settled
    const allSettled = totals.totalOutstanding <= 0.005;
    await tx.update(contractClaimBatches).set({
      totalSettled:     totals.totalSettled.toFixed(2),
      totalOutstanding: Math.max(0, totals.totalOutstanding).toFixed(2),
      totalVariance:    totals.totalVariance.toFixed(2),
      totalWriteoff:    totals.totalWriteoff.toFixed(2),
      status:           allSettled ? "settled" : batch.status,
      updatedAt:        new Date(),
    } as any).where(eq(contractClaimBatches.id, batchId));

    return settleRec;
  });

  // 5. Optional GL posting (non-blocking, separate from transaction)
  if (input.bankAccountId && input.companyArAccountId && input.settledAmount > 0) {
    try {
      // ── حل الفترة المالية أولاً ──────────────────────────────────────────
      const periodRes = await db.execute(sql`
        SELECT id FROM fiscal_periods
        WHERE is_closed = false AND start_date <= ${input.settlementDate} AND end_date >= ${input.settlementDate}
        LIMIT 1
      `);
      const periodId: string | null = (periodRes as any).rows?.[0]?.id ?? null;
      if (!periodId) throw new Error("لا توجد فترة مالية مفتوحة لتاريخ التسوية");

      const entryNumRes = await db.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
      const entryNum = (entryNumRes as any).rows?.[0]?.n;

      const jeRes = await db.execute(sql`
        INSERT INTO journal_entries
          (entry_number, entry_date, description, status, period_id, source_type, source_document_id, created_by, created_at, updated_at)
        VALUES
          (${String(entryNum)}, ${input.settlementDate},
           ${'تسوية مطالبة — ' + (batch as any).batchNumber},
           'posted', ${periodId}, 'contract_settlement', ${settlement.id}, 'system', now(), now())
        RETURNING id
      `);
      const journalEntryId: string | null = (jeRes as any).rows?.[0]?.id ?? null;

      if (journalEntryId) {
        await db.execute(sql`
          INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description, created_at)
          VALUES
            (${journalEntryId}, 1, ${input.bankAccountId}, ${input.settledAmount.toFixed(2)}, 0, 'تحصيل من شركة التأمين', now()),
            (${journalEntryId}, 2, ${input.companyArAccountId}, 0, ${input.settledAmount.toFixed(2)}, 'تسوية ذمم مدينة — شركة تأمين', now())
        `);
        await db.update(contractClaimSettlements)
          .set({ journalEntryId })
          .where(eq(contractClaimSettlements.id, settlement.id));
        logAcctEvent({
          sourceType: "contract_settlement",
          sourceId:   settlement.id,
          eventType:  "settlement_gl_journal",
          status:     "completed",
          journalEntryId,
        }).catch(() => {});
      }
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      logger.warn({ err: msg, batchId, settlementId: settlement.id },
        "[Settlement] GL posting failed (non-fatal) — needs_retry");
      logAcctEvent({
        sourceType: "contract_settlement",
        sourceId:   settlement.id,
        eventType:  "settlement_gl_journal",
        status:     "needs_retry",
        errorMessage: msg,
      }).catch(() => {});
    }
  }

  logger.info({ batchId, settlementId: settlement.id, amount: input.settledAmount },
    "[Settlement] batch settled successfully");

  return settlement;
}

// ─── Get Settlements for Batch ─────────────────────────────────────────────

export async function getSettlementsByBatch(batchId: string) {
  const rows = await db.select().from(contractClaimSettlements)
    .where(eq(contractClaimSettlements.batchId, batchId))
    .orderBy(contractClaimSettlements.settlementDate);
  return rows;
}

// ─── Reconciliation View ───────────────────────────────────────────────────

export async function getBatchReconciliation(batchId: string): Promise<BatchReconciliation> {
  const batchRows = await db.select().from(contractClaimBatches)
    .where(eq(contractClaimBatches.id, batchId))
    .limit(1);
  if (!batchRows[0]) throw new SettlementServiceError("دفعة المطالبة غير موجودة", "NOT_FOUND");
  const batch = batchRows[0] as any;

  const linesRes = await db.execute(sql`
    SELECT
      cl.id,
      cl.service_description,
      cl.service_date,
      cl.company_share_amount,
      cl.approved_amount,
      cl.status,
      COALESCE(SUM(csl.settled_amount),   0) AS total_settled,
      COALESCE(SUM(csl.write_off_amount), 0) AS total_writeoff
    FROM contract_claim_lines cl
    LEFT JOIN contract_claim_settlement_lines csl ON csl.claim_line_id = cl.id
    WHERE cl.batch_id = ${batchId}
    GROUP BY cl.id
    ORDER BY cl.service_date, cl.service_description
  `);

  const rawRows = (linesRes as any).rows as any[];

  const lines: ReconciliationLine[] = rawRows.map(r => {
    const claimed    = parseFloat(r.company_share_amount ?? "0");
    const approved   = parseFloat(r.approved_amount ?? r.company_share_amount ?? "0");
    const settled    = parseFloat(r.total_settled ?? "0");
    const writeoff   = parseFloat(r.total_writeoff ?? "0");
    const outstanding = Math.max(0, approved - settled);
    const variance   = claimed - approved;
    return {
      claimLineId:        r.id,
      serviceDescription: r.service_description,
      serviceDate:        r.service_date,
      claimedAmount:      claimed,
      approvedAmount:     approved,
      settledAmount:      settled,
      writeOffAmount:     writeoff,
      outstanding,
      variance,
      status:             r.status,
    };
  });

  const totalClaimed     = lines.reduce((s, l) => s + l.claimedAmount, 0);
  const totalApproved    = lines.reduce((s, l) => s + l.approvedAmount, 0);
  const totalSettled     = lines.reduce((s, l) => s + l.settledAmount, 0);
  const totalOutstanding = lines.reduce((s, l) => s + l.outstanding, 0);
  const totalVariance    = lines.reduce((s, l) => s + l.variance, 0);
  const totalWriteoff    = lines.reduce((s, l) => s + l.writeOffAmount, 0);

  return {
    batchId,
    batchNumber:     batch.batchNumber ?? batch.batch_number ?? "",
    totalClaimed,
    totalApproved,
    totalSettled,
    totalOutstanding,
    totalVariance,
    totalWriteoff,
    lines,
  };
}
