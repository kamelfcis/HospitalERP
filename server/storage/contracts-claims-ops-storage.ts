import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import {
  contractClaimBatches,
  contractClaimLines,
  type ContractClaimBatch,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import type { RespondLineInput, SettleClaimBatchInput } from "./contracts-claims-storage";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";

const methods = {

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

export default methods;
