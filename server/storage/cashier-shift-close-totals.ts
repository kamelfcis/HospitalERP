import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  PENDING_SALES_SQL,
  PENDING_RETURNS_SQL,
} from "./cashier-pending";
import {
  cashierReceipts,
  cashierRefundReceipts,
  cashierTransferLog,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { MAX_SHIFT_HOURS } from "./cashier-shift-close-validate";

export async function lockAndValidateShift(
  tx: any,
  shiftId: string,
): Promise<CashierShift> {
  const lockResult = await tx.execute(sql`
    SELECT *,
           EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
    FROM cashier_shifts
    WHERE id = ${shiftId}
    FOR UPDATE
  `);
  const row = (lockResult as any).rows[0];
  if (!row) throw new Error("الوردية غير موجودة");

  const hoursOpen = parseFloat(row.hours_open || "0");

  if (row.status === "closed") throw new Error("الوردية مغلقة بالفعل");
  const isStaleNow = row.status === "stale" || hoursOpen > MAX_SHIFT_HOURS;
  if (isStaleNow) {
    await tx.execute(sql`
      INSERT INTO cashier_audit_log (shift_id, action, entity_type, entity_id, details, performed_by)
      VALUES (${shiftId}, 'stale_shift_close', 'shift', ${shiftId},
              ${"إغلاق وردية متوقفة — مضى عليها " + hoursOpen.toFixed(1) + " ساعة"},
              ${"system"})
    `);
  }
  if (row.status !== "open" && row.status !== "stale") throw new Error("الوردية ليست في حالة مفتوحة");

  return {
    id:            row.id,
    cashierId:     row.cashier_id,
    cashierName:   row.cashier_name,
    unitType:      row.unit_type,
    pharmacyId:    row.pharmacy_id,
    departmentId:  row.department_id,
    glAccountId:   row.gl_account_id,
    status:        row.status,
    openingCash:   row.opening_cash,
    closingCash:   row.closing_cash,
    expectedCash:  row.expected_cash,
    variance:      row.variance,
    openedAt:      row.opened_at,
    closedAt:      row.closed_at,
    businessDate:  row.business_date,
    closedBy:      row.closed_by,
    staleAt:       row.stale_at,
    staleReason:   row.stale_reason,
  } as CashierShift;
}

export async function handlePendingDocuments(
  tx: any,
  self: DatabaseStorage,
  shiftId: string,
  shift: CashierShift,
  closedByName: string,
): Promise<void> {
  const countPendingByPredicate = async (predicate: string): Promise<number> => {
    if (shift.unitType === "department" && shift.departmentId) {
      const r = await tx.execute(sql`
        SELECT COUNT(*) AS count
        FROM sales_invoice_headers sih
        INNER JOIN warehouses w ON w.id = sih.warehouse_id
        WHERE w.department_id = ${shift.departmentId}
          AND ${sql.raw(predicate)}
      `);
      return parseInt((r as any).rows[0]?.count || "0", 10);
    }
    if (shift.pharmacyId) {
      const r = await tx.execute(sql`
        SELECT COUNT(*) AS count
        FROM sales_invoice_headers sih
        WHERE sih.pharmacy_id = ${shift.pharmacyId}
          AND ${sql.raw(predicate)}
      `);
      return parseInt((r as any).rows[0]?.count || "0", 10);
    }
    return 0;
  };

  const [[pendingSales, pendingReturns], otherShift] = await Promise.all([
    Promise.all([
      countPendingByPredicate(PENDING_SALES_SQL),
      countPendingByPredicate(PENDING_RETURNS_SQL),
    ]),
    self.findOtherOpenShiftForUnit(shiftId, shift),
  ]);
  const pendingCount = pendingSales + pendingReturns;

  if (pendingCount > 0 && !otherShift) {
    logger.warn(
      { event: "SHIFT_CLOSE_BLOCKED", shiftId, pendingSales, pendingReturns, cashierName: shift.cashierName },
      "[SHIFT_CLOSE] blocked — pending documents exist with no handover shift",
    );
    throw new Error(`لا يمكن إغلاق الوردية — يوجد ${pendingCount} مستند معلّق (${pendingSales} بيع + ${pendingReturns} مرتجع) ولا توجد وردية أخرى لاستقباله`);
  }

  if (pendingCount > 0 && otherShift) {
    logger.info(
      { event: "SHIFT_CLOSE_HANDOVER", shiftId, pendingSales, pendingReturns, toShiftId: otherShift.id },
      "[SHIFT_CLOSE] handing over pending documents to other open shift",
    );
    await tx.insert(cashierTransferLog).values({
      fromShiftId:    shiftId,
      toShiftId:      otherShift.id,
      invoiceIds:     `pending:${pendingCount}`,
      transferredBy:  closedByName,
      reason:         `إغلاق وردية ${shift.cashierName} — تحويل ${pendingCount} مستند (${pendingSales} بيع + ${pendingReturns} مرتجع) إلى ${otherShift.cashierName}`,
    });
  }
}

export async function calculateExpectedCash(
  tx: any,
  shiftId: string,
  shift: CashierShift,
  closingCash: string,
): Promise<{ expectedCashVal: string; varianceVal: string }> {
  const [collectResult] = await tx.select({
    total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
  }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

  const [refundResult] = await tx.select({
    total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
  }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

  const creditRes = await tx.execute(sql`
    SELECT COALESCE(SUM(total_amount), 0)::text AS total
    FROM customer_receipts WHERE shift_id = ${shiftId}
  `);
  const creditCollected = (creditRes as any).rows[0]?.total || "0";

  const deliveryRes = await tx.execute(sql`
    SELECT COALESCE(SUM(total_amount), 0)::text AS total
    FROM delivery_receipts WHERE shift_id = ${shiftId}
  `);
  const deliveryCollected = (deliveryRes as any).rows[0]?.total || "0";

  const supplierRes = await tx.execute(sql`
    SELECT COALESCE(SUM(total_amount), 0)::text AS total
    FROM supplier_payments WHERE shift_id = ${shiftId}
  `);
  const supplierPaid = (supplierRes as any).rows[0]?.total || "0";

  const expectedCashVal = (
    parseFloat(shift.openingCash  || "0") +
    parseFloat(collectResult?.total || "0") +
    parseFloat(creditCollected) +
    parseFloat(deliveryCollected) -
    parseFloat(refundResult?.total || "0") -
    parseFloat(supplierPaid)
  ).toFixed(2);
  const varianceVal = (parseFloat(closingCash) - parseFloat(expectedCashVal)).toFixed(2);

  return { expectedCashVal, varianceVal };
}
