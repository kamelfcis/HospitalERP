import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  accounts,
  drawerPasswords,
  cashierShifts,
  cashierAuditLog,
  users,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

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

  async getMyOpenShifts(this: DatabaseStorage, cashierId: string): Promise<CashierShift[]> {
    return db.select().from(cashierShifts)
      .where(and(
        eq(cashierShifts.cashierId, cashierId),
        sql`${cashierShifts.status} IN ('open', 'stale')`,
      ))
      .orderBy(cashierShifts.openedAt);
  },

  async getShiftById(this: DatabaseStorage, shiftId: string): Promise<CashierShift | null> {
    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
    return shift || null;
  },
};

export default methods;
