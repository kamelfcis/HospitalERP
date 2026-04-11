import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  cashierAuditLog,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { lockAndValidateShift, handlePendingDocuments, calculateExpectedCash } from "./cashier-shift-close-totals";
import { buildAndPostShiftJournal } from "./cashier-shift-close-journal";
export type { ShiftJournalContext } from "./cashier-shift-close-journal";

export const cashierShiftCloseExecuteMethods = {

  async closeCashierShift(
    this: DatabaseStorage,
    shiftId: string,
    closingCash: string,
    closedByUserId: string,
    closedByName: string,
    isSupervisorOverride = false,
    journalContext?: import("./cashier-shift-close-journal").ShiftJournalContext,
  ): Promise<CashierShift> {
    return await db.transaction(async (tx) => {

      const shift = await lockAndValidateShift(tx, shiftId);
      await handlePendingDocuments(tx, this, shiftId, shift, closedByName);
      const { expectedCashVal, varianceVal } = await calculateExpectedCash(tx, shiftId, shift, closingCash);

      const closeResult = await tx.execute(sql`
        UPDATE cashier_shifts
        SET
          status       = 'closed',
          closing_cash = ${closingCash},
          expected_cash = ${expectedCashVal},
          variance     = ${varianceVal},
          closed_at    = NOW(),
          closed_by    = ${closedByUserId},
          handover_receipt_number = nextval('handover_receipt_num_seq')
        WHERE id = ${shiftId}
          AND status IN ('open', 'stale')
        RETURNING *
      `);
      const updated = (closeResult as any).rows[0];
      if (!updated) throw new Error("فشل إغلاق الوردية — قد تكون تغيرت حالتها");

      const auditDetails = isSupervisorOverride
        ? `إغلاق وردية بواسطة مشرف — النقدية الفعلية: ${closingCash} | المتوقعة: ${expectedCashVal} | الفرق: ${varianceVal}`
        : `إغلاق وردية — النقدية الفعلية: ${closingCash} | المتوقعة: ${expectedCashVal} | الفرق: ${varianceVal}`;

      await tx.insert(cashierAuditLog).values({
        shiftId,
        action:      isSupervisorOverride ? "supervisor_override_close" : "close_shift",
        entityType:  "shift",
        entityId:    shiftId,
        details:     auditDetails,
        performedBy: closedByName,
      });

      if (journalContext) {
        await buildAndPostShiftJournal(
          tx, shiftId, closingCash, expectedCashVal,
          closedByUserId, closedByName,
          shift.glAccountId, journalContext,
          updated.business_date,
        );
      }

      return updated as CashierShift;
    });
  },
};
