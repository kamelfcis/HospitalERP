import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  countPendingDocsForUnit as _countPendingDocsForUnit,
  PENDING_SALES_SQL,
  PENDING_RETURNS_SQL,
} from "./cashier-pending";
import {
  accounts,
  drawerPasswords,
  cashierShifts,
  cashierReceipts,
  cashierRefundReceipts,
  cashierAuditLog,
  cashierTransferLog,
  warehouses,
  users,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

export interface ShiftJournalContext {
  periodId:           string;
  custodianAccountId: string;
  varianceAccountId:  string | null;
}

const MAX_SHIFT_HOURS = 24;

const methods = {

  async openCashierShift(
    this: DatabaseStorage,
    cashierId: string,
    cashierName: string,
    openingCash: string,
    unitType: string,
    pharmacyId?: string | null,
    departmentId?: string | null,
    glAccountId?: string | null,
  ): Promise<CashierShift> {
    const existingOpen = await this.getMyOpenShift(cashierId);
    if (existingOpen) throw new Error("لديك وردية مفتوحة بالفعل — أغلق وردياتك الحالية أولاً أو استخدم حساباً آخر");

    const pId  = unitType === "pharmacy"   ? (pharmacyId   || null) : null;
    const dId  = unitType === "department" ? (departmentId || null) : null;
    const gId  = glAccountId || null;

    const result = await db.execute(sql`
      INSERT INTO cashier_shifts
        (cashier_id, cashier_name, unit_type, pharmacy_id, department_id,
         gl_account_id, status, opening_cash, business_date)
      VALUES
        (${cashierId}, ${cashierName}, ${unitType}, ${pId}, ${dId},
         ${gId}, 'open', ${openingCash},
         (NOW() AT TIME ZONE 'Africa/Cairo')::date)
      RETURNING *
    `);
    const shift = (result as any).rows[0] as CashierShift;

    const unitLabel = unitType === "department"
      ? `قسم: ${departmentId}`
      : `صيدلية: ${pharmacyId}`;

    await db.insert(cashierAuditLog).values({
      shiftId:     shift.id,
      action:      "open_shift",
      entityType:  "shift",
      entityId:    shift.id,
      details:     `فتح وردية - رصيد افتتاحي: ${openingCash} - ${unitLabel}`,
      performedBy: cashierName,
    });

    return shift;
  },

  async getMyOpenShift(this: DatabaseStorage, cashierId: string): Promise<CashierShift | null> {
    const staleReasonMsg = `تجاوز الحد الزمني للوردية (${MAX_SHIFT_HOURS} ساعة)`;
    await db.execute(sql`
      UPDATE cashier_shifts
      SET
        status       = 'stale',
        stale_at     = NOW(),
        stale_reason = ${staleReasonMsg}
      WHERE cashier_id = ${cashierId}
        AND status = 'open'
        AND EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 > ${MAX_SHIFT_HOURS}
    `);

    const [shift] = await db.select()
      .from(cashierShifts)
      .where(and(
        eq(cashierShifts.cashierId, cashierId),
        sql`${cashierShifts.status} IN ('open', 'stale')`,
      ))
      .orderBy(asc(cashierShifts.openedAt))
      .limit(1);
    return shift || null;
  },

  async getUserCashierGlAccount(this: DatabaseStorage, userId: string): Promise<{ glAccountId: string; code: string; name: string; hasPassword: boolean } | null> {
    const [user] = await db.select({ cashierGlAccountId: users.cashierGlAccountId }).from(users).where(eq(users.id, userId));
    if (!user?.cashierGlAccountId) return null;
    const [account] = await db.select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts).where(eq(accounts.id, user.cashierGlAccountId));
    if (!account) return null;
    const [pwd] = await db.select({ glAccountId: drawerPasswords.glAccountId }).from(drawerPasswords).where(eq(drawerPasswords.glAccountId, account.id));
    return { glAccountId: account.id, code: account.code, name: account.name, hasPassword: !!pwd };
  },

  async getActiveShift(this: DatabaseStorage, cashierId: string, unitType: string, unitId: string): Promise<CashierShift | null> {
    const conditions = [eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.unitType, unitType), eq(cashierShifts.status, "open")];
    if (unitType === "pharmacy") conditions.push(eq(cashierShifts.pharmacyId, unitId));
    else conditions.push(eq(cashierShifts.departmentId, unitId));
    const [shift] = await db.select().from(cashierShifts).where(and(...conditions));
    return shift || null;
  },

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

  async getMyOpenShifts(this: DatabaseStorage, cashierId: string): Promise<CashierShift[]> {
    return db.select().from(cashierShifts)
      .where(and(
        eq(cashierShifts.cashierId, cashierId),
        sql`${cashierShifts.status} IN ('open', 'stale')`,
      ))
      .orderBy(cashierShifts.openedAt);
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

  async getShiftById(this: DatabaseStorage, shiftId: string): Promise<CashierShift | null> {
    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
    return shift || null;
  },

  async closeCashierShift(
    this: DatabaseStorage,
    shiftId: string,
    closingCash: string,
    closedByUserId: string,
    closedByName: string,
    isSupervisorOverride = false,
    journalContext?: ShiftJournalContext,
  ): Promise<CashierShift> {
    return await db.transaction(async (tx) => {

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
                  ${closedByName})
        `);
      }
      if (row.status !== "open" && row.status !== "stale") throw new Error("الوردية ليست في حالة مفتوحة");

      const shift: CashierShift = {
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
        this.findOtherOpenShiftForUnit(shiftId, shift),
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
        const closingNum  = parseFloat(closingCash);
        const expectedNum = parseFloat(expectedCashVal);
        const varianceNum = closingNum - expectedNum;
        const absVar      = Math.abs(varianceNum);
        const glAccountId = shift.glAccountId;
        const jDesc       = `تسوية وردية ${closedByName} — تحويل نقدية إلى عهدة أمين الخزنة`;
        const vDesc       = `فروق جرد نقدية — ${closedByName}`;

        type JLine = { accountId: string; debit: string; credit: string; desc: string };
        const lines: JLine[] = [];
        const closStr = closingNum.toFixed(2);
        const expStr  = expectedNum.toFixed(2);
        const absStr  = absVar.toFixed(2);

        if (absVar <= 0.001) {
          lines.push({ accountId: journalContext.custodianAccountId, debit: closStr, credit: "0.00", desc: jDesc });
          lines.push({ accountId: glAccountId!,                      debit: "0.00", credit: closStr, desc: jDesc });
        } else if (varianceNum > 0) {
          if (!journalContext.varianceAccountId) throw new Error("INTERNAL: حساب الفروق مطلوب — يجب أن يُحدَّد بواسطة preflight");
          lines.push({ accountId: journalContext.custodianAccountId,    debit: closStr, credit: "0.00",   desc: jDesc });
          lines.push({ accountId: glAccountId!,                          debit: "0.00", credit: expStr,   desc: jDesc });
          lines.push({ accountId: journalContext.varianceAccountId,      debit: "0.00", credit: absStr,   desc: vDesc });
        } else {
          if (!journalContext.varianceAccountId) throw new Error("INTERNAL: حساب الفروق مطلوب — يجب أن يُحدَّد بواسطة preflight");
          lines.push({ accountId: journalContext.custodianAccountId,    debit: closStr, credit: "0.00",   desc: jDesc });
          lines.push({ accountId: journalContext.varianceAccountId,     debit: absStr,  credit: "0.00",   desc: vDesc });
          lines.push({ accountId: glAccountId!,                          debit: "0.00", credit: expStr,   desc: jDesc });
        }

        const activeLines = lines.filter(
          l => parseFloat(l.debit) > 0.001 || parseFloat(l.credit) > 0.001
        );

        if (activeLines.length === 0) {
          logger.info({ event: "SHIFT_CLOSE_JOURNAL_SKIPPED_ZERO", shiftId }, "[SHIFT_CLOSE] لا نقدية → تجاوز القيد");
        } else {
          if (activeLines.some(l => !l.accountId)) {
            throw Object.assign(
              new Error("سطر قيد يحتوي على حساب فارغ — تحقق من الإعدادات"),
              { code: "SHIFT_CLOSE_NO_CASHIER_ACCOUNT" }
            );
          }
          const drTotal = activeLines.reduce((s, l) => s + parseFloat(l.debit),  0);
          const crTotal = activeLines.reduce((s, l) => s + parseFloat(l.credit), 0);
          if (Math.abs(drTotal - crTotal) > 0.001) {
            throw Object.assign(
              new Error(`قيد غير متوازن: مدين ${drTotal.toFixed(2)} ≠ دائن ${crTotal.toFixed(2)}`),
              { code: "SHIFT_CLOSE_JOURNAL_IMBALANCED" }
            );
          }

        const seqRes    = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
        const entryNum  = Number((seqRes as any).rows[0].next_num);
        const reference = `SHIFT-CLOSE-${shiftId.substring(0, 8).toUpperCase()}`;

        const jeRes = await tx.execute(sql`
          INSERT INTO journal_entries
            (entry_number, entry_date, description, status, period_id,
             total_debit, total_credit, reference,
             source_type, source_document_id, source_entry_type, posted_at)
          VALUES (
            ${entryNum}, ${updated.business_date}::date, ${jDesc}, 'posted', ${journalContext.periodId},
            ${drTotal.toFixed(2)}, ${crTotal.toFixed(2)}, ${reference},
            'cashier_shift_close', ${shiftId}, 'shift_close', now()
          )
          RETURNING id
        `);
        const journalId = (jeRes as any).rows[0].id;

          for (let i = 0; i < activeLines.length; i++) {
            const l = activeLines[i];
            await tx.execute(sql`
              INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
              VALUES (${journalId}, ${i + 1}, ${l.accountId}, ${l.debit}, ${l.credit}, ${l.desc})
            `);
          }

          logger.info({
            event:              "SHIFT_CLOSE_JOURNAL_CREATED",
            shiftId,
            cashierId:          closedByUserId,
            expectedCash:       expectedNum,
            actualCash:         closingNum,
            variance:           varianceNum,
            cashierGlAccountId: glAccountId,
            varianceAccountId:  journalContext.varianceAccountId,
            treasuryAccountId:  journalContext.custodianAccountId,
            journalEntryId:     journalId,
            createdBy:          closedByUserId,
            timestamp:          new Date().toISOString(),
          }, "[SHIFT_CLOSE] قيد GL أُنشئ بنجاح");
        }
      }

      return updated as CashierShift;
    });
  },
};

export default methods;
