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

import { db } from "../db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
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

// ── ثابت: الحد الأقصى لساعات الوردية قبل اعتبارها منتهية ────────────────
const MAX_SHIFT_HOURS = 24;

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

    const [shift] = await db.select()
      .from(cashierShifts)
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.status, "open")))
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

  // ── عدد الفواتير المعلّقة (مبيعات فقط) ───────────────────────────────
  async getPendingInvoiceCountForUnit(this: DatabaseStorage, shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .innerJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
        .where(and(
          eq(warehouses.departmentId, shift.departmentId),
          eq(salesInvoiceHeaders.status, "finalized"),
          eq(salesInvoiceHeaders.isReturn, false),
        ));
      return Number(result?.count) || 0;
    }
    if (shift.pharmacyId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .where(and(
          eq(salesInvoiceHeaders.pharmacyId, shift.pharmacyId),
          eq(salesInvoiceHeaders.status, "finalized"),
          eq(salesInvoiceHeaders.isReturn, false),
        ));
      return Number(result?.count) || 0;
    }
    return 0;
  },

  // ── عدد المستندات المعلّقة (مبيعات + مرتجعات) ───────────────────────
  async getPendingDocCountForUnit(this: DatabaseStorage, shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .innerJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
        .where(and(
          eq(warehouses.departmentId, shift.departmentId),
          eq(salesInvoiceHeaders.status, "finalized"),
        ));
      return Number(result?.count) || 0;
    }
    if (shift.pharmacyId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .where(and(
          eq(salesInvoiceHeaders.pharmacyId, shift.pharmacyId),
          eq(salesInvoiceHeaders.status, "finalized"),
        ));
      return Number(result?.count) || 0;
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
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.status, "open")))
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

    if (isStale) {
      return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "STALE", isStale: true, hoursOpen };
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
      if (isStaleNow && !isSupervisorOverride) {
        // تسجيل stale إذا لم تُسجَّل بعد
        await tx.execute(sql`
          UPDATE cashier_shifts
          SET status='stale', stale_at=NOW(),
              stale_reason='تجاوز الحد الزمني عند محاولة الإغلاق'
          WHERE id=${shiftId} AND status='open'
        `);
        throw new Error(`الوردية منتهية الصلاحية — مضى عليها ${hoursOpen.toFixed(1)} ساعة (الحد: ${MAX_SHIFT_HOURS})`);
      }
      if (isStaleNow && isSupervisorOverride) {
        // تسجيل تدخل المشرف لإغلاق وردية عتيقة
        await tx.execute(sql`
          INSERT INTO cashier_audit_log (shift_id, action, entity_type, entity_id, details, performed_by)
          VALUES (${shiftId}, 'supervisor_override_close', 'shift', ${shiftId},
                  ${"إغلاق قسري بواسطة مشرف للوردية العتيقة التي مضى عليها " + hoursOpen.toFixed(1) + " ساعة"},
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
      const [pendingCount, otherShift] = await Promise.all([
        this.getPendingDocCountForUnit(shift),
        this.findOtherOpenShiftForUnit(shiftId, shift),
      ]);

      if (pendingCount > 0 && !otherShift) {
        throw new Error(`لا يمكن إغلاق الوردية — يوجد ${pendingCount} مستند معلّق ولا توجد وردية أخرى لاستقباله`);
      }

      // ── 3. تسجيل تحويل المستندات إن وُجدت ──
      if (pendingCount > 0 && otherShift) {
        await tx.insert(cashierTransferLog).values({
          fromShiftId:    shiftId,
          toShiftId:      otherShift.id,
          invoiceIds:     `pending:${pendingCount}`,
          transferredBy:  closedByName,
          reason:         `إغلاق وردية ${shift.cashierName} — تحويل ${pendingCount} مستند إلى ${otherShift.cashierName}`,
        });
      }

      // ── 4. حساب الإجماليات ──
      const [collectResult] = await tx.select({
        total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

      const [refundResult] = await tx.select({
        total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

      const expectedCashVal = (
        parseFloat(shift.openingCash || "0") +
        parseFloat(collectResult?.total || "0") -
        parseFloat(refundResult?.total || "0")
      ).toFixed(2);
      const varianceVal = (parseFloat(closingCash) - parseFloat(expectedCashVal)).toFixed(2);

      // ── 5. إغلاق ذري — WHERE status='open' يمنع سباق التزامن ──
      const closeResult = await tx.execute(sql`
        UPDATE cashier_shifts
        SET
          status       = 'closed',
          closing_cash = ${closingCash},
          expected_cash = ${expectedCashVal},
          variance     = ${varianceVal},
          closed_at    = NOW(),
          closed_by    = ${closedByUserId}
        WHERE id = ${shiftId}
          AND status = 'open'
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

      return updated as CashierShift;
    });
  },

  // ── قائمة الفواتير المعلّقة (مبيعات) ─────────────────────────────────
  //  تُضمَّن claimedByShiftId للعرض البصري — GET لا يكتب
  async getPendingSalesInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, false)];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const results = await db.select({
      id:                  salesInvoiceHeaders.id,
      invoiceNumber:       salesInvoiceHeaders.invoiceNumber,
      invoiceDate:         salesInvoiceHeaders.invoiceDate,
      customerType:        salesInvoiceHeaders.customerType,
      customerName:        salesInvoiceHeaders.customerName,
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

    // ── Guard إضافي: استبعاد الفواتير التي لها إيصال تحصيل فعلي ──────────
    // يمنع ظهور الفواتير في حالة inconsistency بين status و cashier_receipts
    let filtered = results;
    if (results.length > 0) {
      const ids = results.map(r => r.id);
      const existingReceipts = await db.select({ invoiceId: cashierReceipts.invoiceId })
        .from(cashierReceipts)
        .where(inArray(cashierReceipts.invoiceId, ids));
      const alreadyCollected = new Set(existingReceipts.map(r => r.invoiceId));
      filtered = results.filter(r => !alreadyCollected.has(r.id));
    }

    // ── إثراء إضافي: اسم منشئ الفاتورة من جدول users (created_by = UUID) ──
    const creatorIdSet = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds = Array.from(creatorIdSet);
    const nameMap = new Map<string, string>();
    if (creatorIds.length > 0) {
      const userRows = await db.execute(sql`
        SELECT id, full_name FROM users WHERE id = ANY(${creatorIds})
      `);
      for (const row of (userRows as any).rows) {
        nameMap.set(row.id, row.full_name);
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
    const baseConditions = [eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, true)];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const results = await db.select({
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

    // ── Guard إضافي: استبعاد المرتجعات التي لها إيصال صرف فعلي ──────────
    let filtered = results;
    if (results.length > 0) {
      const ids = results.map(r => r.id);
      const existingRefunds = await db.select({ invoiceId: cashierRefundReceipts.invoiceId })
        .from(cashierRefundReceipts)
        .where(inArray(cashierRefundReceipts.invoiceId, ids));
      const alreadyRefunded = new Set(existingRefunds.map(r => r.invoiceId));
      filtered = results.filter(r => !alreadyRefunded.has(r.id));
    }

    // ── إثراء إضافي: اسم منشئ الفاتورة من جدول users (created_by = UUID) ──
    const creatorIdSet2 = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds2 = Array.from(creatorIdSet2);
    const nameMap2 = new Map<string, string>();
    if (creatorIds2.length > 0) {
      const userRows = await db.execute(sql`
        SELECT id, full_name FROM users WHERE id = ANY(${creatorIds2})
      `);
      for (const row of (userRows as any).rows) {
        nameMap2.set(row.id, row.full_name);
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
      const userResult = await db.execute(sql`
        SELECT full_name FROM users WHERE id = ${header.createdBy} LIMIT 1
      `);
      const row = (userResult as any).rows[0];
      if (row?.full_name) pharmacistName = row.full_name;
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

        const amount = invoice.netTotal;
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

      // ── فحص رصيد الخزنة ──
      const [collectSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));
      const [refundSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));
      const availableCash =
        parseFloat(shiftRow.opening_cash || "0") +
        parseFloat(collectSum?.total || "0") -
        parseFloat(refundSum?.total || "0");

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
        throw new Error(
          `رصيد الخزنة غير كافٍ — الرصيد المتاح: ${availableCash.toFixed(2)} ج.م، والمطلوب صرفه: ${requestedTotal.toFixed(2)} ج.م`
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

      // إكمال القيود المحاسبية خارج transaction — مُسجَّل الآن في accounting_event_log
      self.completeSalesJournalsWithCash(
        invoiceIds,
        shiftRow.gl_account_id || null,
        shiftRow.pharmacy_id || "",
      ).catch((err: unknown) => {
        const msg = errMsg(err);
        logger.error({ err: msg, invoiceIds }, "[CASHIER_REFUND] completeSalesJournalsWithCash: top-level failure");
        logAcctEvent({
          sourceType:   "cashier_collection",
          sourceId:     shiftId,
          eventType:    "cashier_refund_journals_top_level_failure",
          status:       "failed",
          errorMessage: `فشل على مستوى الوردية عند إنشاء قيود الاسترداد: ${msg}. المرتجعات المتأثرة: ${invoiceIds.join(', ')}`,
        }).catch(() => {});
      });

      return result;
    });
  },

  // ── إجماليات الوردية ─────────────────────────────────────────────────
  async getShiftTotals(this: DatabaseStorage, shiftId: string): Promise<{
    totalCollected: string;
    totalRefunded: string;
    collectCount: number;
    refundCount: number;
    openingCash: string;
    netCash: string;
    netCollected: string;
    hoursOpen: number;
    isStale: boolean;
  }> {
    const [collectResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

    const [refundResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

    const durationRes = await db.execute(sql`
      SELECT opening_cash, status,
             EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
      FROM cashier_shifts WHERE id = ${shiftId}
    `);
    const shiftRow = (durationRes as any).rows[0];

    const totalCollected = collectResult?.total || "0";
    const totalRefunded  = refundResult?.total  || "0";
    const openingCash    = shiftRow?.opening_cash || "0";
    const hoursOpen      = parseFloat(shiftRow?.hours_open || "0");
    const isStale        = hoursOpen > MAX_SHIFT_HOURS || shiftRow?.status === "stale";
    const netCash        = (parseFloat(openingCash) + parseFloat(totalCollected) - parseFloat(totalRefunded)).toFixed(2);
    const netCollected   = (parseFloat(totalCollected) - parseFloat(totalRefunded)).toFixed(2);

    return {
      openingCash,
      totalCollected,
      collectCount: collectResult?.count || 0,
      totalRefunded,
      refundCount:  refundResult?.count || 0,
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
};

export default methods;
