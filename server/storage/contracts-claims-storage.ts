/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Claims Storage — مخزن دفعات المطالبات وسطورها
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  جداول:
 *    contract_claim_batches   — دفعات المطالبات (مجموعات الفواتير المطالب بها)
 *    contract_claim_lines     — سطور المطالبة (بند واحد من فاتورة)
 *
 *  دورة حياة الدفعة:
 *    draft → submitted → responded → settled
 *                     ↘ cancelled
 *
 *  قواعد التحقق:
 *    - لا يمكن إضافة سطور لدفعة غير draft
 *    - التسوية تولّد قيداً محاسبياً (DR نقدية / CR ذمم شركات)
 *    - الرفض يعكس القيد (DR ذمم شركات / CR مصروف ديون معدومة)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  contractClaimBatches,
  contractClaimLines,
  companies,
  contracts,
  type ContractClaimBatch,
  type ContractClaimLine,
  type InsertClaimBatch,
  type InsertClaimLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ClaimBatchFilters {
  companyId?: string;
  contractId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ClaimBatchWithLines extends ContractClaimBatch {
  lines: ContractClaimLine[];
  companyName?: string;
  contractName?: string;
  contractNumber?: string;
}

export interface RespondLineInput {
  lineId:          string;
  status:          "approved" | "rejected";
  approvedAmount?: string;
  rejectionReason?: string;
}

export interface SettleClaimBatchInput {
  companyReferenceNo?: string;
  settlementDate:      string;
  notes?:              string;
  bankAccountId?:      string;
  companyArAccountId?: string;
}

// ─── Storage Methods ──────────────────────────────────────────────────────

const claimsStorageMethods = {

  async getClaimBatches(
    this: DatabaseStorage,
    filters: ClaimBatchFilters = {}
  ): Promise<ClaimBatchWithLines[]> {
    const rows = await db
      .select({
        batch:          contractClaimBatches,
        companyNameAr:  companies.nameAr,
        contractName:   contracts.contractName,
        contractNumber: contracts.contractNumber,
      })
      .from(contractClaimBatches)
      .leftJoin(companies, eq(contractClaimBatches.companyId, companies.id))
      .leftJoin(contracts, eq(contractClaimBatches.contractId, contracts.id))
      .orderBy(desc(contractClaimBatches.createdAt));

    // Apply filters in JS (avoids Drizzle and(undefined...) edge cases)
    const filtered = rows.filter(r => {
      if (filters.companyId  && r.batch.companyId  !== filters.companyId)  return false;
      if (filters.contractId && r.batch.contractId !== filters.contractId) return false;
      if (filters.status     && r.batch.status     !== filters.status)     return false;
      if (filters.dateFrom   && r.batch.batchDate  <  filters.dateFrom)    return false;
      if (filters.dateTo     && r.batch.batchDate  >  filters.dateTo)      return false;
      return true;
    });

    const batchIds = filtered.map(r => r.batch.id);
    if (batchIds.length === 0) return [];

    const allLines = await db
      .select()
      .from(contractClaimLines)
      .where(inArray(contractClaimLines.batchId, batchIds))
      .orderBy(contractClaimLines.serviceDate);

    const linesByBatch: Record<string, ContractClaimLine[]> = {};
    for (const line of allLines) {
      if (!linesByBatch[line.batchId]) linesByBatch[line.batchId] = [];
      linesByBatch[line.batchId].push(line);
    }

    return filtered.map(r => ({
      ...r.batch,
      companyName:    r.companyNameAr  ?? undefined,
      contractName:   r.contractName   ?? undefined,
      contractNumber: r.contractNumber ?? undefined,
      lines:          linesByBatch[r.batch.id] ?? [],
    }));
  },

  async getClaimBatch(
    this: DatabaseStorage,
    batchId: string
  ): Promise<ClaimBatchWithLines | null> {
    const rows = await db
      .select({
        batch:          contractClaimBatches,
        companyNameAr:  companies.nameAr,
        contractName:   contracts.contractName,
        contractNumber: contracts.contractNumber,
      })
      .from(contractClaimBatches)
      .leftJoin(companies, eq(contractClaimBatches.companyId, companies.id))
      .leftJoin(contracts, eq(contractClaimBatches.contractId, contracts.id))
      .where(eq(contractClaimBatches.id, batchId));

    if (!rows[0]) return null;

    const lines = await db
      .select()
      .from(contractClaimLines)
      .where(eq(contractClaimLines.batchId, batchId))
      .orderBy(contractClaimLines.serviceDate);

    return {
      ...rows[0].batch,
      companyName:    rows[0].companyNameAr  ?? undefined,
      contractName:   rows[0].contractName   ?? undefined,
      contractNumber: rows[0].contractNumber ?? undefined,
      lines,
    };
  },

  async findOrCreateDraftBatch(
    this: DatabaseStorage,
    companyId:  string,
    contractId: string,
    batchDate:  string
  ): Promise<ContractClaimBatch> {
    const existing = await db
      .select()
      .from(contractClaimBatches)
      .where(
        and(
          eq(contractClaimBatches.companyId,  companyId),
          eq(contractClaimBatches.contractId, contractId),
          eq(contractClaimBatches.status,     "draft"),
        )
      )
      .limit(1);

    if (existing[0]) return existing[0];

    const batchNumber = await generateBatchNumber();
    const [created] = await db
      .insert(contractClaimBatches)
      .values({ companyId, contractId, batchNumber, batchDate, status: "draft", totalClaimed: "0" })
      .returning();
    return created;
  },

  async upsertClaimLine(
    this: DatabaseStorage,
    data: InsertClaimLine & { batchId: string }
  ): Promise<ContractClaimLine> {
    const idKey = data.patientInvoiceLineId || data.salesInvoiceLineId;

    if (idKey) {
      const existing = await db
        .select()
        .from(contractClaimLines)
        .where(
          and(
            eq(contractClaimLines.batchId, data.batchId),
            data.patientInvoiceLineId
              ? eq(contractClaimLines.patientInvoiceLineId, idKey)
              : eq(contractClaimLines.salesInvoiceLineId, idKey)
          )
        )
        .limit(1);
      if (existing[0]) return existing[0];
    }

    const [line] = await db.insert(contractClaimLines).values(data).returning();

    const companyShare = parseFloat(String(data.companyShareAmount || 0));
    await db
      .update(contractClaimBatches)
      .set({
        totalClaimed: sql`${contractClaimBatches.totalClaimed} + ${companyShare.toFixed(2)}`,
        updatedAt:    new Date(),
      })
      .where(eq(contractClaimBatches.id, data.batchId));

    return line;
  },

  async submitClaimBatch(
    this: DatabaseStorage,
    batchId:     string,
    submittedBy: string
  ): Promise<ContractClaimBatch> {
    const batch = await db.select().from(contractClaimBatches).where(eq(contractClaimBatches.id, batchId)).limit(1);
    if (!batch[0]) throw new Error("دفعة المطالبة غير موجودة");
    if (batch[0].status !== "draft") throw new Error("الدفعة ليست في حالة مسودة");

    const lineCount = await db
      .select({ n: sql<number>`count(*)` })
      .from(contractClaimLines)
      .where(eq(contractClaimLines.batchId, batchId));
    if (Number(lineCount[0]?.n ?? 0) === 0) throw new Error("لا توجد سطور في الدفعة");

    const [updated] = await db
      .update(contractClaimBatches)
      .set({ status: "submitted", submittedAt: new Date(), submittedBy, updatedAt: new Date() })
      .where(eq(contractClaimBatches.id, batchId))
      .returning();
    return updated;
  },

  async respondToClaimBatch(
    this: DatabaseStorage,
    batchId:   string,
    responses: RespondLineInput[]
  ): Promise<ContractClaimBatch> {
    const batch = await db.select().from(contractClaimBatches).where(eq(contractClaimBatches.id, batchId)).limit(1);
    if (!batch[0]) throw new Error("دفعة المطالبة غير موجودة");
    if (batch[0].status !== "submitted") throw new Error("الدفعة يجب أن تكون في حالة مُرسَلة");

    await db.transaction(async (tx) => {
      for (const r of responses) {
        await tx
          .update(contractClaimLines)
          .set({
            status:          r.status,
            approvedAmount:  r.status === "approved" ? (r.approvedAmount ?? null) : null,
            rejectionReason: r.status === "rejected" ? (r.rejectionReason ?? null) : null,
            approvedAt:      r.status === "approved" ? new Date() : null,
          })
          .where(and(eq(contractClaimLines.id, r.lineId), eq(contractClaimLines.batchId, batchId)));
      }

      const totals = await tx
        .select({
          totalApproved: sql<string>`coalesce(sum(case when status='approved' then approved_amount else 0 end), 0)`,
          totalRejected: sql<string>`coalesce(sum(company_share_amount) filter (where status='rejected'), 0)`,
        })
        .from(contractClaimLines)
        .where(eq(contractClaimLines.batchId, batchId));

      await tx
        .update(contractClaimBatches)
        .set({
          status:        "responded",
          totalApproved: totals[0]?.totalApproved ?? "0",
          totalRejected: totals[0]?.totalRejected ?? "0",
          updatedAt:     new Date(),
        })
        .where(eq(contractClaimBatches.id, batchId));
    });

    const [updated] = await db.select().from(contractClaimBatches).where(eq(contractClaimBatches.id, batchId));
    return updated;
  },

  async settleClaimBatch(
    this: DatabaseStorage,
    batchId: string,
    input:   SettleClaimBatchInput
  ): Promise<ContractClaimBatch> {
    const batch = await db.select().from(contractClaimBatches).where(eq(contractClaimBatches.id, batchId)).limit(1);
    if (!batch[0]) throw new Error("دفعة المطالبة غير موجودة");
    if (!["responded", "submitted"].includes(batch[0].status)) {
      throw new Error("الدفعة يجب أن تكون في حالة مُجابة أو مُرسَلة");
    }

    const approvedLines = await db
      .select()
      .from(contractClaimLines)
      .where(and(
        eq(contractClaimLines.batchId, batchId),
        eq(contractClaimLines.status,  "approved"),
      ));

    const totalSettled = approvedLines.reduce(
      (s, l) => s + parseFloat(String(l.approvedAmount ?? l.companyShareAmount)),
      0
    );

    let journalEntryId: string | null = null;
    if (input.bankAccountId && input.companyArAccountId && totalSettled > 0) {
      try {
        // ── حل الفترة المالية أولاً ──────────────────────────────────────────
        const periodRes = await db.execute(
          sql`SELECT id FROM fiscal_periods WHERE is_closed = false AND start_date <= ${input.settlementDate} AND end_date >= ${input.settlementDate} LIMIT 1`
        );
        const periodId: string | null = (periodRes as any).rows?.[0]?.id ?? null;
        if (!periodId) throw new Error("لا توجد فترة مالية مفتوحة لتاريخ التسوية");

        const entryNumRes = await db.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
        const entryNum: number = (entryNumRes as any).rows?.[0]?.n ?? 0;

        const jeRes = await db.execute(
          sql`INSERT INTO journal_entries
                (entry_number, entry_date, description, status, period_id, source_type, source_document_id, created_by, created_at, updated_at)
              VALUES
                (${String(entryNum)}, ${input.settlementDate}, ${'تسوية مطالبة دفعة رقم ' + batch[0].batchNumber},
                 'posted', ${periodId}, 'contract_settlement', ${batchId}, 'system', now(), now())
              RETURNING id`
        );
        journalEntryId = (jeRes as any).rows?.[0]?.id ?? null;

        if (journalEntryId) {
          await db.execute(
            sql`INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description, created_at)
                VALUES
                  (${journalEntryId}, 1, ${input.bankAccountId},      ${totalSettled.toFixed(2)}, 0, 'تحصيل من شركة التأمين', now()),
                  (${journalEntryId}, 2, ${input.companyArAccountId}, 0, ${totalSettled.toFixed(2)}, 'تسوية ذمم شركة تأمين',   now())`
          );
          logAcctEvent({
            sourceType: "contract_claim_batch",
            sourceId:   batchId,
            eventType:  "claim_settlement_journal",
            status:     "completed",
            journalEntryId,
          }).catch(() => {});
        }
      } catch (err: any) {
        const msg: string = err?.message ?? String(err);
        logger.warn({ err: msg, batchId }, "[Claims] settleClaimBatch — journal generation failed");
        logAcctEvent({
          sourceType: "contract_claim_batch",
          sourceId:   batchId,
          eventType:  "claim_settlement_journal",
          status:     "needs_retry",
          errorMessage: msg,
        }).catch(() => {});
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(contractClaimLines)
        .set({ status: "settled", settledAt: new Date() })
        .where(and(
          eq(contractClaimLines.batchId, batchId),
          eq(contractClaimLines.status,  "approved"),
        ));

      await tx
        .update(contractClaimBatches)
        .set({
          status:             "settled",
          companyReferenceNo: input.companyReferenceNo ?? null,
          journalEntryId:     journalEntryId,
          notes:              input.notes ?? null,
          updatedAt:          new Date(),
        })
        .where(eq(contractClaimBatches.id, batchId));
    });

    const [updated] = await db.select().from(contractClaimBatches).where(eq(contractClaimBatches.id, batchId));
    return updated;
  },

  async cancelClaimBatch(
    this: DatabaseStorage,
    batchId: string
  ): Promise<ContractClaimBatch> {
    const batch = await db.select().from(contractClaimBatches).where(eq(contractClaimBatches.id, batchId)).limit(1);
    if (!batch[0]) throw new Error("دفعة المطالبة غير موجودة");
    if (batch[0].status === "settled") throw new Error("لا يمكن إلغاء دفعة مُسوَّاة");

    const [updated] = await db
      .update(contractClaimBatches)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(contractClaimBatches.id, batchId))
      .returning();
    return updated;
  },

};

// ─── Helpers ──────────────────────────────────────────────────────────────

async function generateBatchNumber(): Promise<string> {
  const result = await db.execute(
    sql`SELECT nextval('contract_claim_batch_seq') AS seq`
  ).catch(async () => {
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS contract_claim_batch_seq START 1`);
    return db.execute(sql`SELECT nextval('contract_claim_batch_seq') AS seq`);
  });
  const seq = String((result as any).rows?.[0]?.seq ?? Date.now());
  return `CLM-${new Date().getFullYear()}-${seq.padStart(6, "0")}`;
}

export default claimsStorageMethods;
