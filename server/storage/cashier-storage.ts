/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  cashier-storage.ts — Cashier Shift Lifecycle (Task #19)
 *  دورة حياة وردية الكاشير — قواعد صارمة
 *
 *  القواعد الصارمة:
 *  1. business_date = (NOW() AT TIME ZONE 'Africa/Cairo')::date   — SQL فقط عند الفتح
 *  2. stale = EXTRACT(EPOCH FROM (NOW()-opened_at))/3600 > MAX   — مدة فقط، لا تاريخ
 *  3. فاتورة claim: داخل transaction التحصيل/الاسترداد فقط
 *  4. claimed_by_shift_id: GET يقرأ فقط، لا ينشئ
 *  5. findOtherOpenShift: ORDER BY opened_at ASC، status='open' فقط
 *  6. الملكية إلزامية؛ bypass المشرف يُسجَّل في cashier_audit_log
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  countPendingDocsForUnit as _countPendingDocsForUnit,
  PENDING_DOCS_SQL,
  PENDING_SALES_SQL,
  PENDING_RETURNS_SQL,
} from "./cashier-pending";
import {
  pharmacies,
  accounts,
  drawerPasswords,
  cashierShifts,
  cashierReceipts,
  cashierRefundReceipts,
  cashierAuditLog,
  cashierTransferLog,
  salesInvoiceHeaders,
  salesInvoiceLines,
  warehouses,
  items,
  users,
  type Pharmacy,
  type InsertPharmacy,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { getCollectibleAmountStr } from "../lib/cashier-collection-amount";

// ── ثابت: الحد الأقصى لساعات الوردية قبل اعتبارها منتهية ────────────────
const MAX_SHIFT_HOURS = 24;

// ── نوع: سياق قيد إغلاق الوردية (مُعاد من preflightShiftClose) ──────────
export interface ShiftJournalContext {
  periodId:           string;
  custodianAccountId: string;
  varianceAccountId:  string | null;
}

// ── مساعد: استخراج رسالة الخطأ ──────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const methods = {

  // ── الصيدليات ──────────────────────────────────────────────────────────

  async getPharmacies(this: DatabaseStorage): Promise<Pharmacy[]> {
    return db.select().from(pharmacies).orderBy(asc(pharmacies.code));
  },

  async getPharmacy(this: DatabaseStorage, id: string): Promise<Pharmacy | undefined> {
    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, id));
    return pharmacy;
  },

  async createPharmacy(this: DatabaseStorage, data: InsertPharmacy): Promise<Pharmacy> {
    const [pharmacy] = await db.insert(pharmacies).values(data).returning();
    return pharmacy;
  },

  async updatePharmacy(this: DatabaseStorage, id: string, data: Partial<InsertPharmacy>): Promise<Pharmacy> {
    const [pharmacy] = await db.update(pharmacies).set(data).where(eq(pharmacies.id, id)).returning();
    return pharmacy;
  },

  // ── كلمات سر أدراج الخزنة ─────────────────────────────────────────────

  async setDrawerPassword(this: DatabaseStorage, glAccountId: string, passwordHash: string): Promise<void> {
    const [existing] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    if (existing) {
      await db.update(drawerPasswords).set({ passwordHash, updatedAt: new Date() }).where(eq(drawerPasswords.glAccountId, glAccountId));
    } else {
      await db.insert(drawerPasswords).values({ glAccountId, passwordHash });
    }
  },

  async getDrawerPassword(this: DatabaseStorage, glAccountId: string): Promise<string | null> {
    const [row] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return row?.passwordHash || null;
  },

  async removeDrawerPassword(this: DatabaseStorage, glAccountId: string): Promise<boolean> {
    const result = await db.delete(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return (result.rowCount || 0) > 0;
  },

  async getDrawersWithPasswordStatus(this: DatabaseStorage): Promise<{ glAccountId: string; hasPassword: boolean; code: string; name: string }[]> {
    const cashAccounts = await db.select().from(accounts).where(
      sql`${accounts.code} LIKE '1211%' OR ${accounts.code} LIKE '1212%'`
    ).orderBy(asc(accounts.code));

    const passwords = await db.select({ glAccountId: drawerPasswords.glAccountId }).from(drawerPasswords);
    const passwordSet = new Set(passwords.map(p => p.glAccountId));

    return cashAccounts.map(a => ({
      glAccountId: a.id,
      hasPassword: passwordSet.has(a.id),
      code: a.code,
      name: a.name,
    }));
  },

  // ── فتح وردية جديدة ────────────────────────────────────────────────────
  //  القاعدة 1: business_date محسوب SQL-side بتوقيت Africa/Cairo
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

    // business_date يُحسب SQL-side فقط بتوقيت القاهرة
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

  // ── جلب الوردية المفتوحة للكاشير الحالي ──────────────────────────────
  //  يُسقط تلقائياً الورديات المنتهية (> MAX_SHIFT_HOURS)
  async getMyOpenShift(this: DatabaseStorage, cashierId: string): Promise<CashierShift | null> {
    // القاعدة 2: اكتشاف الـ stale بالمدة SQL-side فقط، ثم تحديث الحالة
    // ملاحظة: stale_reason يُبنى JS-side ثم يُمرَّر كمعامل مكتوب — لا يُضمَّن داخل نص SQL
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

    // نُرجع الوردية إذا كانت open أو stale — الكاشير يرى وردياته المتوقفة ويمكنه إغلاقها
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

  // ── عدد المستندات المعلّقة (مبيعات + مرتجعات) ───────────────────────
  //  ★ المصدر الوحيد للحقيقة: cashier-pending.ts → countPendingDocsForUnit
  //  ★ لا تُعدِّل هذا المنطق هنا — عدِّل cashier-pending.ts فقط
  async getPendingDocCountForUnit(this: DatabaseStorage, shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      return _countPendingDocsForUnit({ unitType: "department", departmentId: shift.departmentId });
    }
    if (shift.pharmacyId) {
      return _countPendingDocsForUnit({ unitType: "pharmacy", pharmacyId: shift.pharmacyId });
    }
    return 0;
  },

  // ── إيجاد وردية أخرى مفتوحة لنفس الوحدة ────────────────────────────
  //  القاعدة 5: ORDER BY opened_at ASC (الأقدم أولاً) — status='open' فقط
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
        eq(cashierShifts.status, "open"),   // open فقط — ليس stale أو closing
        unitCondition,
        sql`${cashierShifts.id} != ${currentShiftId}`,
      ))
      .orderBy(asc(cashierShifts.openedAt)) // الأقدم أولاً — حتمي ومتكرر
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

  // ── التحقق من إمكانية إغلاق الوردية (GET — لا يعدّل) ────────────────
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

    // حساب المدة SQL-side
    const durationResult = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
      FROM cashier_shifts WHERE id = ${shiftId}
    `);
    const hoursOpen = parseFloat((durationResult as any).rows[0]?.hours_open || "0");
    const isStale = hoursOpen > MAX_SHIFT_HOURS || shift.status === "stale";

    // الورديات المتوقفة يُسمح بإغلاقها مع تحذير (لا حجب)
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

  // ── إغلاق وردية — ذري مع قفل TOCTOU ──────────────────────────────────
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

      // ── 1. قفل الصف مع تحقق المدة SQL-side ──
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
        // تسجيل إغلاق الوردية المتوقفة في سجل التدقيق دائماً
        await tx.execute(sql`
          INSERT INTO cashier_audit_log (shift_id, action, entity_type, entity_id, details, performed_by)
          VALUES (${shiftId}, 'stale_shift_close', 'shift', ${shiftId},
                  ${"إغلاق وردية متوقفة — مضى عليها " + hoursOpen.toFixed(1) + " ساعة"},
                  ${closedByName})
        `);
      }
      if (row.status !== "open" && row.status !== "stale") throw new Error("الوردية ليست في حالة مفتوحة");

      // نبني كائن shift من نتيجة SQL الخام
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

      // ── 2. فحص المستندات المعلّقة + الوردية البديلة ──
      //  ★ IMPORTANT: use tx.execute() here — NOT pool.query() — to stay on the
      //    same transaction connection as the FOR UPDATE lock above.
      //    PENDING_SALES_SQL / PENDING_RETURNS_SQL from cashier-pending.ts.
      //    Counts are split so the blocked log reports (pendingSales, pendingReturns)
      //    separately for structured diagnostics (requirement E).
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

      // ── 3. تسجيل تحويل المستندات إن وُجدت ──
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

      // ── 4. حساب الإجماليات ──
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

      // ── 5. إغلاق ذري — WHERE status IN ('open','stale') يمنع سباق التزامن ──
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

      // ── 6. سجل audit ──
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

      // ── 7. قيد GL ذري — داخل نفس الـ transaction ──────────────────────
      if (journalContext) {
        const closingNum  = parseFloat(closingCash);
        const expectedNum = parseFloat(expectedCashVal);
        const varianceNum = closingNum - expectedNum;
        const absVar      = Math.abs(varianceNum);
        const glAccountId = shift.glAccountId;
        const jDesc       = `تسوية وردية ${closedByName} — تحويل نقدية إلى عهدة أمين الخزنة`;
        const vDesc       = `فروق جرد نقدية — ${closedByName}`;

        // ── بناء أسطر القيد ─────────────────────────────────────────────
        type JLine = { accountId: string; debit: string; credit: string; desc: string };
        const lines: JLine[] = [];
        const closStr = closingNum.toFixed(2);
        const expStr  = expectedNum.toFixed(2);
        const absStr  = absVar.toFixed(2);

        if (absVar <= 0.001) {
          // بدون فروق
          lines.push({ accountId: journalContext.custodianAccountId, debit: closStr, credit: "0.00", desc: jDesc });
          lines.push({ accountId: glAccountId!,                      debit: "0.00", credit: closStr, desc: jDesc });
        } else if (varianceNum > 0) {
          // فائض: د.12127 = closingCash; ق.كاشير = expectedCash; ق.فروق = variance
          if (!journalContext.varianceAccountId) throw new Error("INTERNAL: حساب الفروق مطلوب — يجب أن يُحدَّد بواسطة preflight");
          lines.push({ accountId: journalContext.custodianAccountId,    debit: closStr, credit: "0.00",   desc: jDesc });
          lines.push({ accountId: glAccountId!,                          debit: "0.00", credit: expStr,   desc: jDesc });
          lines.push({ accountId: journalContext.varianceAccountId,      debit: "0.00", credit: absStr,   desc: vDesc });
        } else {
          // عجز: د.12127 = closingCash; د.فروق = |variance|; ق.كاشير = expectedCash
          if (!journalContext.varianceAccountId) throw new Error("INTERNAL: حساب الفروق مطلوب — يجب أن يُحدَّد بواسطة preflight");
          lines.push({ accountId: journalContext.custodianAccountId,    debit: closStr, credit: "0.00",   desc: jDesc });
          lines.push({ accountId: journalContext.varianceAccountId,     debit: absStr,  credit: "0.00",   desc: vDesc });
          lines.push({ accountId: glAccountId!,                          debit: "0.00", credit: expStr,   desc: jDesc });
        }

        // ── إزالة الأسطر الصفرية (بدون أثر محاسبي) ─────────────────────
        // يحدث مثلاً عند closingCash=0 في وردية مدين بحتة، أو عندما
        // يكون المبلغ المستلم 0 في حالة عجز كامل — الجانب الآخر يُسجَّل.
        const activeLines = lines.filter(
          l => parseFloat(l.debit) > 0.001 || parseFloat(l.credit) > 0.001
        );

        // وردية بدون أي نقدية فعلية أو متوقعة — لا قيد مطلوب
        if (activeLines.length === 0) {
          logger.info({ event: "SHIFT_CLOSE_JOURNAL_SKIPPED_ZERO", shiftId }, "[SHIFT_CLOSE] لا نقدية → تجاوز القيد");
        } else {
          // ── فحص التوازن ───────────────────────────────────────────────
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

        // ── رقم القيد التسلسلي ──────────────────────────────────────────
        const seqRes    = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS next_num`);
        const entryNum  = Number((seqRes as any).rows[0].next_num);
        const reference = `SHIFT-CLOSE-${shiftId.substring(0, 8).toUpperCase()}`;

        // ── إدراج رأس القيد ──────────────────────────────────────────────
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

          // ── إدراج أسطر القيد ──────────────────────────────────────────
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
        } // end else (activeLines.length > 0)
      } // end if (journalContext)

      return updated as CashierShift;
    });
  },

  // ── قائمة الفواتير المعلّقة (مبيعات) ─────────────────────────────────
  //  تُضمَّن claimedByShiftId للعرض البصري — GET لا يكتب
  async getPendingSalesInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    // ★ قاعدة "المعلّق": تُطبَّق على مستوى SQL — المصدر: cashier-pending.ts
    const baseConditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, false),
      sql`NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = ${salesInvoiceHeaders.id})`,
      sql`NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = ${salesInvoiceHeaders.id})`,
      // فواتير التعاقد التي نصيب المريض=0 تُدفع من شركة التأمين مباشرة — لا تظهر للكاشير
      sql`(${salesInvoiceHeaders.customerType} != 'contract' OR COALESCE(CAST(${salesInvoiceHeaders.patientShareTotal} AS numeric), 0) > 0)`,
    ];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const filtered = await db.select({
      id:                  salesInvoiceHeaders.id,
      invoiceNumber:       salesInvoiceHeaders.invoiceNumber,
      invoiceDate:         salesInvoiceHeaders.invoiceDate,
      customerType:        salesInvoiceHeaders.customerType,
      customerName:        salesInvoiceHeaders.customerName,
      contractCompany:     salesInvoiceHeaders.contractCompany,
      patientShareTotal:   salesInvoiceHeaders.patientShareTotal,
      companyShareTotal:   salesInvoiceHeaders.companyShareTotal,
      subtotal:            salesInvoiceHeaders.subtotal,
      discountValue:       salesInvoiceHeaders.discountValue,
      netTotal:            salesInvoiceHeaders.netTotal,
      createdBy:           salesInvoiceHeaders.createdBy,
      status:              salesInvoiceHeaders.status,
      createdAt:           salesInvoiceHeaders.createdAt,
      claimedByShiftId:    salesInvoiceHeaders.claimedByShiftId,
      claimedAt:           salesInvoiceHeaders.claimedAt,
      warehouseName:       warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    // ── إثراء: اسم منشئ الفاتورة من جدول users (created_by = UUID) ──────
    const creatorIdSet = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds = Array.from(creatorIdSet);
    const nameMap = new Map<string, string>();
    if (creatorIds.length > 0) {
      const userRows = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
        .from(users)
        .where(inArray(users.id, creatorIds));
      for (const row of userRows) {
        nameMap.set(row.id, row.fullName || row.username || "");
      }
    }
    const enriched = filtered.map(r => ({
      ...r,
      pharmacistName: (r.createdBy ? nameMap.get(r.createdBy) || null : null),
    }));

    if (search) {
      const s = search.toLowerCase();
      return enriched.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s)) ||
        (r.createdBy && r.createdBy.toLowerCase().includes(s))
      );
    }
    return enriched;
  },

  // ── قائمة المرتجعات المعلّقة ─────────────────────────────────────────
  async getPendingReturnInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    // ★ قاعدة "المعلّق": تُطبَّق على مستوى SQL — المصدر: cashier-pending.ts
    const baseConditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, true),
      sql`NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = ${salesInvoiceHeaders.id})`,
      sql`NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = ${salesInvoiceHeaders.id})`,
    ];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const filtered = await db.select({
      id:                  salesInvoiceHeaders.id,
      invoiceNumber:       salesInvoiceHeaders.invoiceNumber,
      invoiceDate:         salesInvoiceHeaders.invoiceDate,
      customerType:        salesInvoiceHeaders.customerType,
      customerName:        salesInvoiceHeaders.customerName,
      subtotal:            salesInvoiceHeaders.subtotal,
      discountValue:       salesInvoiceHeaders.discountValue,
      netTotal:            salesInvoiceHeaders.netTotal,
      createdBy:           salesInvoiceHeaders.createdBy,
      originalInvoiceId:   salesInvoiceHeaders.originalInvoiceId,
      status:              salesInvoiceHeaders.status,
      createdAt:           salesInvoiceHeaders.createdAt,
      claimedByShiftId:    salesInvoiceHeaders.claimedByShiftId,
      claimedAt:           salesInvoiceHeaders.claimedAt,
      warehouseName:       warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    // ── إثراء إضافي: اسم منشئ الفاتورة من جدول users (created_by = UUID) ──
    const creatorIdSet2 = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds2 = Array.from(creatorIdSet2);
    const nameMap2 = new Map<string, string>();
    if (creatorIds2.length > 0) {
      const userRows2 = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
        .from(users)
        .where(inArray(users.id, creatorIds2));
      for (const row of userRows2) {
        nameMap2.set(row.id, row.fullName || row.username || "");
      }
    }
    const enriched = filtered.map(r => ({
      ...r,
      pharmacistName: (r.createdBy ? nameMap2.get(r.createdBy) || null : null),
    }));

    if (search) {
      const s = search.toLowerCase();
      return enriched.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s))
      );
    }
    return enriched;
  },

  async getSalesInvoiceDetails(this: DatabaseStorage, invoiceId: string): Promise<any> {
    const [header] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!header) return null;

    const lines = await db.select({
      id:        salesInvoiceLines.id,
      lineNo:    salesInvoiceLines.lineNo,
      itemId:    salesInvoiceLines.itemId,
      unitLevel: salesInvoiceLines.unitLevel,
      qty:       salesInvoiceLines.qty,
      salePrice: salesInvoiceLines.salePrice,
      lineTotal: salesInvoiceLines.lineTotal,
      itemName:  items.nameAr,
      itemCode:  items.itemCode,
    })
    .from(salesInvoiceLines)
    .leftJoin(items, eq(salesInvoiceLines.itemId, items.id))
    .where(eq(salesInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.lineNo));

    // ── إثراء إضافي: اسم منشئ الفاتورة (created_by = UUID) + وقت الفاتورة ─
    let pharmacistName: string | null = null;
    if (header.createdBy) {
      const [userRow] = await db.select({ fullName: users.fullName, username: users.username })
        .from(users)
        .where(eq(users.id, header.createdBy));
      if (userRow) pharmacistName = userRow.fullName || userRow.username || null;
    }
    const invoiceDateTime = header.createdAt ? header.createdAt.toISOString() : null;

    return { ...header, lines, pharmacistName, invoiceDateTime };
  },

  // ── تحصيل الفواتير ────────────────────────────────────────────────────
  //  القواعد: stale check أول، claim داخل نفس transaction
  async collectInvoices(
    this: DatabaseStorage,
    shiftId: string,
    invoiceIds: string[],
    collectedBy: string,
    paymentDate?: string,
  ): Promise<{ receipts: Record<string, unknown>[]; totalCollected: string; count: number }> {
    const self = this;
    return await db.transaction(async (tx) => {

      // ── قفل الوردية + تحقق المدة SQL-side ──
      const shiftCheck = await tx.execute(sql`
        SELECT *,
               EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
        FROM cashier_shifts
        WHERE id = ${shiftId}
        FOR UPDATE
      `);
      const shiftRow = (shiftCheck as any).rows[0];
      if (!shiftRow)                    throw new Error("الوردية غير موجودة");
      if (shiftRow.status !== "open")   throw new Error("الوردية ليست مفتوحة");

      const hoursOpen = parseFloat(shiftRow.hours_open || "0");
      if (hoursOpen > MAX_SHIFT_HOURS) {
        // القاعدة 2: stale بالمدة فقط — تسجيل فوري
        await tx.execute(sql`
          UPDATE cashier_shifts
          SET status='stale', stale_at=NOW(),
              stale_reason='تجاوز الحد الزمني عند محاولة التحصيل'
          WHERE id=${shiftId} AND status='open'
        `);
        throw new Error(`الوردية منتهية الصلاحية — مضى عليها ${hoursOpen.toFixed(1)} ساعة — لا يمكن التحصيل`);
      }
      if (!shiftRow.gl_account_id) throw new Error("الوردية لا تحتوي على حساب خزنة — يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierReceipts);
      let nextReceiptNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalCollected = 0;

      for (const invoiceId of invoiceIds) {
        // ── قفل الفاتورة + تحقق الملكية ──
        const [invoice] = await tx.select()
          .from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} هي مرتجع`);

        // القاعدة 4: claimed_by_shift_id — يُكتب هنا فقط داخل transaction
        if (invoice.claimedByShiftId && invoice.claimedByShiftId !== shiftId) {
          throw new Error(`الفاتورة ${invoice.invoiceNumber} محجوزة لوردية أخرى`);
        }

        const [existingReceipt] = await tx.select()
          .from(cashierReceipts)
          .where(eq(cashierReceipts.invoiceId, invoiceId));
        if (existingReceipt) throw new Error(`الفاتورة ${invoice.invoiceNumber} محصّلة بالفعل`);

        // للفواتير التعاقدية: يُحصَّل نصيب المريض فقط (patientShareTotal)
        // لباقي الفواتير: الصافي الكامل (netTotal)
        const amount = getCollectibleAmountStr(invoice);
        totalCollected += parseFloat(amount);

        // ── 1. اكتساب الملكية + إدراج الإيصال ضمن نفس transaction ──
        await tx.execute(sql`
          UPDATE sales_invoice_headers
          SET claimed_by_shift_id = ${shiftId}, claimed_at = NOW()
          WHERE id = ${invoiceId}
        `);

        const [receipt] = await tx.insert(cashierReceipts).values({
          receiptNumber: nextReceiptNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          collectedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status:    "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action:      "collect",
          entityType:  "sales_invoice",
          entityId:    invoiceId,
          details:     `تحصيل فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: collectedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalCollected: totalCollected.toFixed(2), count: receipts.length };

      // Phase 4: إنشاء قيد تحصيل مستقل خارج transaction بدلاً من تعديل قيد المبيعات
      // إذا لم يكن هناك ربط حسابات كامل (cashier_collection/cash)، يتراجع تلقائياً للمسار القديم
      self.createCashierCollectionJournals(
        invoiceIds,
        shiftRow.gl_account_id || null,
        shiftRow.pharmacy_id || "",
      ).catch((err: unknown) => {
        const msg = errMsg(err);
        logger.error({ err: msg, invoiceIds }, "[CASHIER] createCashierCollectionJournals: top-level failure");
        logAcctEvent({
          sourceType:   "cashier_collection",
          sourceId:     shiftId,
          eventType:    "cashier_collection_journals_top_level_failure",
          status:       "failed",
          errorMessage: `فشل على مستوى الوردية عند إنشاء قيود التحصيل: ${msg}. الفواتير المتأثرة: ${invoiceIds.join(', ')}`,
        }).catch(() => {});
      });

      return result;
    });
  },

  // ── استرداد المرتجعات ─────────────────────────────────────────────────
  //  نفس قواعد التحصيل + فحص الرصيد المتاح
  async refundInvoices(
    this: DatabaseStorage,
    shiftId: string,
    invoiceIds: string[],
    refundedBy: string,
    paymentDate?: string,
  ): Promise<{ receipts: Record<string, unknown>[]; totalRefunded: string; count: number }> {
    const self = this;
    return await db.transaction(async (tx) => {

      // ── قفل الوردية + تحقق المدة SQL-side ──
      const shiftCheck = await tx.execute(sql`
        SELECT *,
               EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
        FROM cashier_shifts
        WHERE id = ${shiftId}
        FOR UPDATE
      `);
      const shiftRow = (shiftCheck as any).rows[0];
      if (!shiftRow)                    throw new Error("الوردية غير موجودة");
      if (shiftRow.status !== "open")   throw new Error("الوردية ليست مفتوحة");

      const hoursOpen = parseFloat(shiftRow.hours_open || "0");
      if (hoursOpen > MAX_SHIFT_HOURS) {
        await tx.execute(sql`
          UPDATE cashier_shifts
          SET status='stale', stale_at=NOW(),
              stale_reason='تجاوز الحد الزمني عند محاولة الاسترداد'
          WHERE id=${shiftId} AND status='open'
        `);
        throw new Error(`الوردية منتهية الصلاحية — مضى عليها ${hoursOpen.toFixed(1)} ساعة — لا يمكن الاسترداد`);
      }
      if (!shiftRow.gl_account_id) throw new Error("الوردية لا تحتوي على حساب خزنة — يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      // ── فحص رصيد الخزنة (نفس معادلة netCash في getShiftTotals) ──
      // available = افتتاح + تحصيل نقدي + آجل + توصيل − مرتجعات − موردين
      const [collectSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));
      const [refundSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));
      const supplierPaidRes = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount::numeric), 0)::text AS total
        FROM supplier_payments WHERE shift_id = ${shiftId}
      `);
      const supplierPaid = parseFloat((supplierPaidRes as any).rows[0]?.total || "0");
      const creditRes = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount::numeric), 0)::text AS total
        FROM customer_credit_payments WHERE shift_id = ${shiftId}
      `);
      const creditCollected = parseFloat((creditRes as any).rows[0]?.total || "0");
      const deliveryRes = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount::numeric), 0)::text AS total
        FROM delivery_receipts WHERE shift_id = ${shiftId}
      `);
      const deliveryCollected = parseFloat((deliveryRes as any).rows[0]?.total || "0");

      const availableCash =
        parseFloat(shiftRow.opening_cash || "0") +
        parseFloat(collectSum?.total || "0") +
        creditCollected +
        deliveryCollected -
        parseFloat(refundSum?.total || "0") -
        supplierPaid;

      const invoiceRows = await tx.select({
        id:            salesInvoiceHeaders.id,
        invoiceNumber: salesInvoiceHeaders.invoiceNumber,
        netTotal:      salesInvoiceHeaders.netTotal,
        status:        salesInvoiceHeaders.status,
        isReturn:      salesInvoiceHeaders.isReturn,
      })
        .from(salesInvoiceHeaders)
        .where(inArray(salesInvoiceHeaders.id, invoiceIds));
      const invoiceMap = new Map(invoiceRows.map(r => [r.id, r]));

      let requestedTotal = 0;
      for (const invoiceId of invoiceIds) {
        const inv = invoiceMap.get(invoiceId);
        if (inv) requestedTotal += parseFloat(inv.netTotal);
      }

      if (requestedTotal > availableCash) {
        const openingF    = parseFloat(shiftRow.opening_cash || "0");
        const collectedF  = parseFloat(collectSum?.total || "0");
        const refundedF   = parseFloat(refundSum?.total || "0");
        throw new Error(
          `رصيد الخزنة غير كافٍ للمرتجع\n` +
          `• الرصيد المتاح: ${availableCash.toFixed(2)} ج.م\n` +
          `  (افتتاح ${openingF.toFixed(2)} + تحصيل ${collectedF.toFixed(2)} + آجل ${creditCollected.toFixed(2)} + توصيل ${deliveryCollected.toFixed(2)} − مرتجعات سابقة ${refundedF.toFixed(2)} − موردين ${supplierPaid.toFixed(2)})\n` +
          `• المطلوب صرفه: ${requestedTotal.toFixed(2)} ج.م\n` +
          `• النقص: ${(requestedTotal - availableCash).toFixed(2)} ج.م`
        );
      }

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierRefundReceipts);
      let nextRefundNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalRefunded = 0;

      for (const invoiceId of invoiceIds) {
        const [invoice] = await tx.select()
          .from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (!invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست مرتجع`);

        // القاعدة 4: claimed_by_shift_id — داخل transaction فقط
        if (invoice.claimedByShiftId && invoice.claimedByShiftId !== shiftId) {
          throw new Error(`مرتجع الفاتورة ${invoice.invoiceNumber} محجوز لوردية أخرى`);
        }

        const [existingRefund] = await tx.select()
          .from(cashierRefundReceipts)
          .where(eq(cashierRefundReceipts.invoiceId, invoiceId));
        if (existingRefund) throw new Error(`مرتجع الفاتورة ${invoice.invoiceNumber} مصروف بالفعل`);

        const amount = invoice.netTotal;
        totalRefunded += parseFloat(amount);

        // ── اكتساب الملكية + إدراج الإيصال ضمن نفس transaction ──
        await tx.execute(sql`
          UPDATE sales_invoice_headers
          SET claimed_by_shift_id = ${shiftId}, claimed_at = NOW()
          WHERE id = ${invoiceId}
        `);

        const [receipt] = await tx.insert(cashierRefundReceipts).values({
          receiptNumber: nextRefundNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          refundedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status:    "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action:      "refund",
          entityType:  "return_invoice",
          entityId:    invoiceId,
          details:     `صرف مرتجع فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: refundedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalRefunded: totalRefunded.toFixed(2), count: receipts.length };

      // إكمال قيود المرحلة الثانية للمردودات (عكس قيد الخزنة) خارج الـ transaction
      self.completeSalesReturnWithCash(
        invoiceIds,
        shiftRow.gl_account_id || null,
      ).catch((err: unknown) => {
        const msg = errMsg(err);
        logger.error({ err: msg, invoiceIds }, "[CASHIER_REFUND] completeSalesReturnWithCash: top-level failure");
        logAcctEvent({
          sourceType:   "sales_return",
          sourceId:     shiftId,
          eventType:    "cashier_refund_journals_top_level_failure",
          status:       "failed",
          errorMessage: `فشل في قيود صرف المرتجعات: ${msg}. المتأثرة: ${invoiceIds.join(', ')}`,
        }).catch(() => {});
      });

      return result;
    });
  },

  // ── إجماليات الوردية ─────────────────────────────────────────────────
  async getShiftTotals(this: DatabaseStorage, shiftId: string): Promise<{
    totalCollected: string;
    totalRefunded: string;
    totalDeferred: string;
    collectCount: number;
    refundCount: number;
    deferredCount: number;
    openingCash: string;
    netCash: string;
    netCollected: string;
    hoursOpen: number;
    isStale: boolean;
    creditCollected: string;
    creditCount: number;
    supplierPaid: string;
    supplierPaidCount: number;
    deliveryCollected: string;
    deliveryCollectedCount: number;
  }> {
    const [collectResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

    const [refundResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

    const deferredRes = await db.execute(sql`
      SELECT COALESCE(SUM(net_total), 0)::text AS total, COUNT(*)::int AS count
      FROM sales_invoice_headers
      WHERE claimed_by_shift_id = ${shiftId}
        AND is_return = false
        AND customer_type = 'credit'
        AND status IN ('finalized', 'collected')
    `);
    const deferredRow = (deferredRes as any).rows[0];

    const creditRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM customer_receipts
      WHERE shift_id = ${shiftId}
    `);
    const creditRow = (creditRes as any).rows[0];

    const supplierPaidRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM supplier_payments
      WHERE shift_id = ${shiftId}
    `);
    const supplierPaidRow = (supplierPaidRes as any).rows[0];

    const deliveryCollectedRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM delivery_receipts
      WHERE shift_id = ${shiftId}
    `);
    const deliveryCollectedRow = (deliveryCollectedRes as any).rows[0];

    const durationRes = await db.execute(sql`
      SELECT opening_cash, status,
             EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
      FROM cashier_shifts WHERE id = ${shiftId}
    `);
    const shiftRow = (durationRes as any).rows[0];

    const totalCollected   = collectResult?.total || "0";
    const totalRefunded    = refundResult?.total  || "0";
    const totalDeferred    = deferredRow?.total   || "0";
    const deferredCount    = parseInt(deferredRow?.count || "0", 10);
    const creditCollected  = creditRow?.total     || "0";
    const creditCount      = parseInt(creditRow?.count || "0", 10);
    const supplierPaid          = supplierPaidRow?.total         || "0";
    const supplierPaidCount     = parseInt(supplierPaidRow?.count     || "0", 10);
    const deliveryCollected     = deliveryCollectedRow?.total    || "0";
    const deliveryCollectedCount = parseInt(deliveryCollectedRow?.count || "0", 10);
    const openingCash           = shiftRow?.opening_cash         || "0";
    const hoursOpen             = parseFloat(shiftRow?.hours_open || "0");
    const isStale               = hoursOpen > MAX_SHIFT_HOURS || shiftRow?.status === "stale";
    const netCash               = (
      parseFloat(openingCash) +
      parseFloat(totalCollected) +
      parseFloat(creditCollected) +
      parseFloat(deliveryCollected) -
      parseFloat(totalRefunded) -
      parseFloat(supplierPaid)
    ).toFixed(2);
    const netCollected          = (
      parseFloat(totalCollected) +
      parseFloat(creditCollected) +
      parseFloat(deliveryCollected) -
      parseFloat(totalRefunded)
    ).toFixed(2);

    return {
      openingCash,
      totalCollected,
      totalDeferred,
      collectCount:  collectResult?.count || 0,
      totalRefunded,
      refundCount:   refundResult?.count  || 0,
      deferredCount,
      creditCollected,
      creditCount,
      supplierPaid,
      supplierPaidCount,
      deliveryCollected,
      deliveryCollectedCount,
      netCash,
      netCollected,
      hoursOpen,
      isStale,
    };
  },

  // ── إيصالات ──────────────────────────────────────────────────────────

  async getCashierReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    return receipt || null;
  },

  async getCashierRefundReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    return receipt || null;
  },

  async markReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    if (!receipt) throw new Error("الإيصال غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("الإيصال مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierReceipts).set({
      printedAt:     new Date(),
      printCount:    (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierReceipts.id, receiptId)).returning();
    return updated;
  },

  async markRefundReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    if (!receipt) throw new Error("إيصال المرتجع غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("إيصال المرتجع مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierRefundReceipts).set({
      printedAt:     new Date(),
      printCount:    (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierRefundReceipts.id, receiptId)).returning();
    return updated;
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  preflightShiftClose — التحقق المسبق الإلزامي قبل إغلاق الوردية
  //
  //  الشروط الأربعة المطلوبة (كلها أو لا شيء):
  //  1) فترة مالية مفتوحة تغطي business_date
  //  2) حساب عهدة أمين الخزنة (12127) موجود ونشط
  //  3) حساب GL الكاشير موجود ونشط
  //  4) إن كان هناك فرق → حساب فروق الجرد مُعيَّن ونشط
  //
  //  يُرجع بيانات الوردية المحسوبة جاهزة لإنشاء القيد
  //  يرمي خطأ 422 مع رسالة عربية واضحة إن فشل أي شرط
  // ══════════════════════════════════════════════════════════════════════════
  async preflightShiftClose(
    this: DatabaseStorage,
    shiftId: string,
    closingCash: string | number,
  ): Promise<{
    cashierGlAccountId:   string;
    cashierId:            string;
    cashierName:          string;
    businessDate:         string;
    expectedCash:         number;
    variance:             number;
    periodId:             string;
    custodianAccountId:   string;
    varianceAccountId:    string | null;
  }> {
    const client = await pool.connect();
    try {
      // ── 1. قراءة بيانات الوردية (الحالة مفتوحة فقط) ──────────────────
      const shiftRes = await client.query(
        `SELECT id, cashier_id, cashier_name, gl_account_id, opening_cash,
                business_date
         FROM cashier_shifts
         WHERE id = $1 AND status IN ('open', 'stale')
         LIMIT 1`,
        [shiftId]
      );
      if (!shiftRes.rows.length) {
        throw Object.assign(new Error("الوردية غير موجودة أو مغلقة بالفعل"), { status: 404 });
      }
      const sr = shiftRes.rows[0];
      const businessDate: string = sr.business_date instanceof Date
        ? sr.business_date.toISOString().slice(0, 10)
        : String(sr.business_date);

      // ── 2. حساب النقدية المتوقعة (قراءة فقط — خارج transaction) ────────
      const [collectRes, refundRes] = await Promise.all([
        client.query(
          `SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM cashier_receipts WHERE shift_id = $1`,
          [shiftId]
        ),
        client.query(
          `SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM cashier_refund_receipts WHERE shift_id = $1`,
          [shiftId]
        ),
      ]);
      const openingCash    = parseFloat(sr.opening_cash || "0");
      const totalCollected = parseFloat(collectRes.rows[0].total || "0");
      const totalRefunded  = parseFloat(refundRes.rows[0].total || "0");
      const expectedCash   = openingCash + totalCollected - totalRefunded;
      const variance       = parseFloat(String(closingCash)) - expectedCash;

      // ── 3. شرط: فترة مالية مفتوحة ────────────────────────────────────
      const periodRes = await client.query(
        `SELECT id FROM fiscal_periods
          WHERE start_date <= $1::date
            AND end_date   >= $1::date
            AND is_closed = false
          LIMIT 1`,
        [businessDate]
      );
      if (!periodRes.rows.length) {
        throw Object.assign(
          new Error(`لا يمكن إغلاق الوردية لعدم وجود فترة مالية مفتوحة للتاريخ ${businessDate} — يرجى مراجعة الإعدادات المحاسبية`),
          { status: 422, code: "SHIFT_CLOSE_NO_PERIOD" }
        );
      }
      const periodId = periodRes.rows[0].id;

      // ── 4. حساب عهدة الخزنة — account_mappings أولاً، ثم system_settings كـ fallback ──
      // البحث في account_mappings (cashier_shift_close / treasury)
      const amTreasuryRes = await client.query(
        `SELECT debit_account_id FROM account_mappings
          WHERE transaction_type = 'cashier_shift_close'
            AND line_type = 'treasury'
            AND is_active = true
          LIMIT 1`
      );
      let custodianAccountId: string;
      if (amTreasuryRes.rows.length && amTreasuryRes.rows[0].debit_account_id) {
        const chk = await client.query(
          `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
          [amTreasuryRes.rows[0].debit_account_id]
        );
        if (!chk.rows.length) {
          throw Object.assign(
            new Error("حساب عهدة الخزنة المُعيَّن في ربط الحسابات (إغلاق وردية) غير موجود أو غير نشط"),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = chk.rows[0].id;
      } else {
        // fallback: system_settings.cashier_treasury_account_code
        const settingRes = await client.query(
          `SELECT value FROM system_settings WHERE key = 'cashier_treasury_account_code' LIMIT 1`
        );
        const treasuryCode = settingRes.rows[0]?.value || '12127';
        const custRes = await client.query(
          `SELECT id FROM accounts WHERE code = $1 AND is_active = true LIMIT 1`,
          [treasuryCode]
        );
        if (!custRes.rows.length) {
          throw Object.assign(
            new Error(`لا يمكن إغلاق الوردية لعدم وجود حساب عهدة الخزنة (${treasuryCode}) أو إنه غير نشط — يرجى إعداده في ربط الحسابات أو إعدادات النظام`),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = custRes.rows[0].id;
      }

      // ── 5. شرط: حساب GL الكاشير موجود ونشط ──────────────────────────
      if (!sr.gl_account_id) {
        throw Object.assign(
          new Error("لا يمكن إغلاق الوردية لعدم ربط حساب خزنة بها — يرجى فتح وردية جديدة بعد إعداد الحساب"),
          { status: 422, code: "SHIFT_CLOSE_NO_CASHIER_ACCOUNT" }
        );
      }
      const glRes = await client.query(
        `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
        [sr.gl_account_id]
      );
      if (!glRes.rows.length) {
        throw Object.assign(
          new Error("حساب الخزنة المرتبط بالوردية غير موجود أو غير نشط — يرجى مراجعة الإعدادات"),
          { status: 422, code: "SHIFT_CLOSE_NO_CASHIER_ACCOUNT" }
        );
      }

      // ── 6. شرط: حساب فروق الجرد (إذا كان هناك فرق) ──────────────────
      // الأولوية: cashierVarianceShortAccountId / cashierVarianceOverAccountId → fallback: cashierVarianceAccountId
      let varianceAccountId: string | null = null;
      if (Math.abs(variance) > 0.001) {
        const userRes = await client.query(
          `SELECT cashier_variance_account_id,
                  cashier_variance_short_account_id,
                  cashier_variance_over_account_id
           FROM users WHERE id = $1 LIMIT 1`,
          [sr.cashier_id]
        );
        const ur = userRes.rows[0];
        if (variance < 0) {
          // عجز: استخدم حساب العجز أو الـ fallback
          varianceAccountId = ur?.cashier_variance_short_account_id || ur?.cashier_variance_account_id || null;
        } else {
          // فائض: استخدم حساب الفائض أو الـ fallback
          varianceAccountId = ur?.cashier_variance_over_account_id || ur?.cashier_variance_account_id || null;
        }
        if (!varianceAccountId) {
          throw Object.assign(
            new Error(
              `لا يمكن إغلاق الوردية — يوجد فرق نقدي ` +
              `(${variance > 0 ? "فائض" : "عجز"}: ${Math.abs(variance).toFixed(2)} ج.م) ` +
              `ولم يُعيَّن حساب فروق الجرد لهذا الكاشير — يرجى إعداده من إدارة المستخدمين`
            ),
            { status: 422, code: "SHIFT_CLOSE_NO_VARIANCE_ACCOUNT" }
          );
        }
        const varActiveRes = await client.query(
          `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
          [varianceAccountId]
        );
        if (!varActiveRes.rows.length) {
          throw Object.assign(
            new Error("حساب فروق الجرد المرتبط بالكاشير غير موجود أو غير نشط — يرجى مراجعة الإعدادات"),
            { status: 422, code: "SHIFT_CLOSE_NO_VARIANCE_ACCOUNT" }
          );
        }
      }

      return {
        cashierGlAccountId:  sr.gl_account_id,
        cashierId:           sr.cashier_id,
        cashierName:         sr.cashier_name,
        businessDate,
        expectedCash,
        variance,
        periodId,
        custodianAccountId,
        varianceAccountId,
      };
    } finally {
      client.release();
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  generateShiftCloseJournal — قيد GL لإغلاق الوردية
  //
  //  يسجّل نقل النقدية من حساب درج الكاشير (12121–12126) إلى
  //  حساب عهدة أمين الخزنة (12127)، مع قيد فروق الجرد (529xx).
  //
  //  بنية القيد:
  //   • لا فروق:  د. 12127 = إجمالي; ق. حساب الكاشير = إجمالي
  //   • فائض:    د. 12127 = closingCash; ق. حساب الكاشير = expectedCash
  //                                        ق. حساب الفروق   = variance
  //   • عجز:     د. 12127 = closingCash; د. حساب الفروق   = |variance|
  //                                        ق. حساب الكاشير = expectedCash
  //
  //  خارج أي transaction — آمن للاستدعاء بعد إغلاق الوردية
  // ══════════════════════════════════════════════════════════════════════════
  async generateShiftCloseJournal(
    this: DatabaseStorage,
    params: {
      shiftId:          string;
      cashierGlAccountId: string;
      cashierId:        string;
      cashierName:      string;
      closingCash:      number;
      expectedCash:     number;
      businessDate:     string;
    }
  ): Promise<{ journalId: string }> {
    const { shiftId, cashierGlAccountId, cashierId, cashierName, closingCash, expectedCash, businessDate } = params;
    const variance = closingCash - expectedCash;
    const client = await pool.connect();
    try {
      // ── 1. إيديمبوتنت: هل تم إنشاء القيد مسبقاً؟ ──────────────────────
      const existing = await client.query(
        `SELECT id FROM journal_entries
          WHERE source_type = 'cashier_shift_close'
            AND source_document_id = $1
          LIMIT 1`,
        [shiftId]
      );
      if (existing.rows.length > 0) {
        logger.info({ shiftId, journalId: existing.rows[0].id }, "[SHIFT_CLOSE_JOURNAL] idempotent — قيد موجود مسبقاً");
        return { journalId: existing.rows[0].id };
      }

      // ── 2. حساب عهدة الخزنة — account_mappings أولاً، ثم system_settings كـ fallback ──
      const amTreasuryRes2 = await client.query(
        `SELECT debit_account_id FROM account_mappings
          WHERE transaction_type = 'cashier_shift_close'
            AND line_type = 'treasury'
            AND is_active = true
          LIMIT 1`
      );
      let custodianAccountId: string;
      if (amTreasuryRes2.rows.length && amTreasuryRes2.rows[0].debit_account_id) {
        const chk = await client.query(
          `SELECT id FROM accounts WHERE id = $1 AND is_active = true LIMIT 1`,
          [amTreasuryRes2.rows[0].debit_account_id]
        );
        if (!chk.rows.length) {
          throw Object.assign(
            new Error("حساب عهدة الخزنة المُعيَّن في ربط الحسابات (إغلاق وردية) غير موجود أو غير نشط"),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = chk.rows[0].id;
      } else {
        // fallback: system_settings.cashier_treasury_account_code
        const tSettingRes = await client.query(
          `SELECT value FROM system_settings WHERE key = 'cashier_treasury_account_code' LIMIT 1`
        );
        const tCode = tSettingRes.rows[0]?.value || '12127';
        const custodianRes = await client.query(
          `SELECT id FROM accounts WHERE code = $1 AND is_active = true LIMIT 1`,
          [tCode]
        );
        if (!custodianRes.rows.length) {
          throw Object.assign(
            new Error(`حساب عهدة الخزنة (${tCode}) غير موجود أو غير نشط — يرجى إعداده في ربط الحسابات أو إعدادات النظام`),
            { status: 422, code: "SHIFT_CLOSE_NO_TREASURY_ACCOUNT" }
          );
        }
        custodianAccountId = custodianRes.rows[0].id;
      }

      // ── 3. حساب فروق الجرد — short/over أولاً، ثم fallback الموحد ─────
      let varianceAccountId: string | null = null;
      if (Math.abs(variance) > 0.001) {
        const userRes = await client.query(
          `SELECT cashier_variance_account_id,
                  cashier_variance_short_account_id,
                  cashier_variance_over_account_id
           FROM users WHERE id = $1 LIMIT 1`,
          [cashierId]
        );
        const ur = userRes.rows[0];
        if (variance < 0) {
          varianceAccountId = ur?.cashier_variance_short_account_id || ur?.cashier_variance_account_id || null;
        } else {
          varianceAccountId = ur?.cashier_variance_over_account_id || ur?.cashier_variance_account_id || null;
        }
        if (!varianceAccountId) {
          throw Object.assign(
            new Error(
              `لا يمكن إنشاء قيد الوردية — يوجد فرق نقدي ` +
              `(${variance > 0 ? "فائض" : "عجز"}: ${Math.abs(variance).toFixed(2)} ج.م) ` +
              `ولم يُعيَّن حساب فروق الجرد لهذا الكاشير`
            ),
            { status: 422, code: "SHIFT_CLOSE_NO_VARIANCE_ACCOUNT" }
          );
        }
      }

      // ── 4. الفترة المالية ─────────────────────────────────── STRICT ─────
      const periodRes = await client.query(
        `SELECT id FROM fiscal_periods
          WHERE start_date <= $1::date AND end_date >= $1::date AND is_closed = false
          LIMIT 1`,
        [businessDate]
      );
      if (!periodRes.rows.length) {
        throw Object.assign(
          new Error(`لا توجد فترة مالية مفتوحة لتاريخ ${businessDate} — يرجى مراجعة الإعدادات المحاسبية`),
          { status: 422, code: "SHIFT_CLOSE_NO_PERIOD" }
        );
      }
      const periodId = periodRes.rows[0].id;

      // ── 5. إعداد أسطر القيد ─────────────────────────────────────────────
      const closingStr  = closingCash.toFixed(2);
      const expectedStr = expectedCash.toFixed(2);
      const absVariance = Math.abs(variance);
      const description  = `تسوية وردية ${cashierName} — تحويل نقدية إلى عهدة أمين الخزنة`;
      const varianceDesc = `فروق جرد نقدية — ${cashierName}`;

      type Line = { accountId: string; debit: string; credit: string; desc: string };
      const lines: Line[] = [];

      if (absVariance <= 0.001) {
        // بدون فروق
        lines.push({ accountId: custodianAccountId, debit: closingStr,              credit: "0.00",                desc: description });
        lines.push({ accountId: cashierGlAccountId,  debit: "0.00",                credit: closingStr,            desc: description });
      } else if (variance > 0) {
        // فائض: د.12127 = closingCash; ق.كاشير = expectedCash; ق.فروق = variance
        lines.push({ accountId: custodianAccountId,   debit: closingStr,            credit: "0.00",                desc: description });
        lines.push({ accountId: cashierGlAccountId,   debit: "0.00",               credit: expectedStr,           desc: description });
        lines.push({ accountId: varianceAccountId!,   debit: "0.00",               credit: absVariance.toFixed(2), desc: varianceDesc });
      } else {
        // عجز: د.12127 = closingCash; د.فروق = |variance|; ق.كاشير = expectedCash
        lines.push({ accountId: custodianAccountId,   debit: closingStr,            credit: "0.00",                desc: description });
        lines.push({ accountId: varianceAccountId!,   debit: absVariance.toFixed(2), credit: "0.00",              desc: varianceDesc });
        lines.push({ accountId: cashierGlAccountId,   debit: "0.00",               credit: expectedStr,           desc: description });
      }

      // ── فلترة الأسطر الصفرية (وردية مدين بحتة أو عجز/فائض كامل) ─────────
      const activeLines2 = lines.filter(
        l => parseFloat(l.debit) > 0.001 || parseFloat(l.credit) > 0.001
      );

      if (activeLines2.length === 0) {
        // لا نقدية فعلية أو متوقعة — تجاوز القيد بالكامل
        logger.info({ shiftId }, "[SHIFT_CLOSE_JOURNAL] لا نقدية → تجاوز القيد");
        return;
      }

      // ── فحص السلامة المحاسبية ────────────────────────────────────────────
      const totalDebit  = activeLines2.reduce((s, l) => s + parseFloat(l.debit),  0);
      const totalCredit = activeLines2.reduce((s, l) => s + parseFloat(l.credit), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new Error(`قيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`);
      }
      if (activeLines2.some(l => !l.accountId)) {
        throw new Error("سطر قيد يحتوي على حساب فارغ — تحقق من الإعدادات");
      }

      // ── 6. رقم القيد التسلسلي ────────────────────────────────────────────
      const seqRes = await client.query(`SELECT nextval('journal_entry_number_seq') AS next_num`);
      const entryNumber = Number(seqRes.rows[0].next_num);

      // ── 7. إدخال قيد دفتر الأستاذ ──────────────────────────────────────
      await client.query("BEGIN");
      const jeRes = await client.query(`
        INSERT INTO journal_entries
          (entry_number, entry_date, description, status, period_id,
           total_debit, total_credit, reference,
           source_type, source_document_id, source_entry_type,
           posted_at)
        VALUES ($1, $2::date, $3, 'posted', $4,
                $5, $6, $7,
                'cashier_shift_close', $8, 'shift_close',
                now())
        RETURNING id
      `, [
        entryNumber, businessDate, description, periodId,
        totalDebit.toFixed(2), totalCredit.toFixed(2),
        `SHIFT-CLOSE-${shiftId.substring(0, 8).toUpperCase()}`,
        shiftId,
      ]);
      const journalId = jeRes.rows[0].id;

      for (let i = 0; i < activeLines2.length; i++) {
        const l = activeLines2[i];
        await client.query(
          `INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [journalId, i + 1, l.accountId, l.debit, l.credit, l.desc]
        );
      }
      await client.query("COMMIT");

      logger.info(
        { shiftId, journalId, entryNumber, totalDebit, variance },
        "[SHIFT_CLOSE_JOURNAL] قيد إغلاق الوردية أُنشئ بنجاح"
      );
      logAcctEvent({
        sourceType: "cashier_shift_close",
        sourceId:   shiftId,
        eventType:  "journal_posted",
        status:     "posted",
      }).catch(() => {});

      return { journalId };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error({ shiftId, err }, "[SHIFT_CLOSE_JOURNAL] فشل إنشاء قيد إغلاق الوردية");
      throw err;
    } finally {
      client.release();
    }
  },
};

export default methods;
