import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  countPendingDocsForUnit as _countPendingDocsForUnit,
} from "./cashier-pending";
import {
  cashierShifts,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const MAX_SHIFT_HOURS = 24;

export { MAX_SHIFT_HOURS };

export const cashierShiftCloseValidateMethods = {

  async getPendingDocCountForUnit(this: DatabaseStorage, shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      return _countPendingDocsForUnit({ unitType: "department", departmentId: shift.departmentId });
    }
    if (shift.pharmacyId) {
      return _countPendingDocsForUnit({ unitType: "pharmacy", pharmacyId: shift.pharmacyId });
    }
    return 0;
  },

  async findOtherOpenShiftForUnit(this: DatabaseStorage, currentShiftId: string, shift: CashierShift): Promise<CashierShift | null> {
    const unitCondition = shift.unitType === "department" && shift.departmentId
      ? and(eq(cashierShifts.unitType, "department"), eq(cashierShifts.departmentId, shift.departmentId))
      : shift.pharmacyId
        ? and(eq(cashierShifts.unitType, "pharmacy"), eq(cashierShifts.pharmacyId, shift.pharmacyId))
        : null;
    if (!unitCondition) return null;

    const [found] = await db.select()
      .from(cashierShifts)
      .where(and(
        eq(cashierShifts.status, "open"),
        unitCondition,
        sql`${cashierShifts.id} != ${currentShiftId}`,
      ))
      .orderBy(asc(cashierShifts.openedAt))
      .limit(1);
    return found || null;
  },

  async validateShiftClose(this: DatabaseStorage, shiftId: string): Promise<{
    canClose: boolean;
    pendingCount: number;
    hasOtherOpenShift: boolean;
    otherShift: any;
    reasonCode: string;
    isStale: boolean;
    hoursOpen: number;
  }> {
    const shift = await this.getShiftById(shiftId);
    if (!shift) return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "NOT_FOUND", isStale: false, hoursOpen: 0 };
    if (shift.status === "closed") return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "ALREADY_CLOSED", isStale: false, hoursOpen: 0 };

    const durationResult = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
      FROM cashier_shifts WHERE id = ${shiftId}
    `);
    const hoursOpen = parseFloat((durationResult as any).rows[0]?.hours_open || "0");
    const isStale = hoursOpen > MAX_SHIFT_HOURS || shift.status === "stale";

    if (isStale) {
      return { canClose: true, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "STALE", isStale: true, hoursOpen };
    }
    if (shift.status !== "open") {
      return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "NOT_OPEN", isStale, hoursOpen };
    }

    const [pendingCount, otherShift] = await Promise.all([
      this.getPendingDocCountForUnit(shift),
      this.findOtherOpenShiftForUnit(shiftId, shift),
    ]);
    const hasOtherOpenShift = !!otherShift;

    if (pendingCount === 0)     return { canClose: true,  pendingCount: 0,            hasOtherOpenShift, otherShift: otherShift || null, reasonCode: "CLEAN",                       isStale, hoursOpen };
    if (hasOtherOpenShift)      return { canClose: true,  pendingCount,               hasOtherOpenShift: true, otherShift, reasonCode: "PENDING_OTHER_SHIFT_EXISTS",    isStale, hoursOpen };
    return                             { canClose: false, pendingCount,               hasOtherOpenShift: false, otherShift: null, reasonCode: "PENDING_NO_OTHER_SHIFT", isStale, hoursOpen };
  },
};
