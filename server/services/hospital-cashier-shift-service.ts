/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Cashier Shift Service
 *  Contains orchestration logic extracted from hospital-cashier-shifts.ts:
 *    - resolveShiftActor  : resolves userId → { fullName, isAdminOrSupervisor }
 *    - assertShiftOwnership : ownership + supervisor-override audit log
 *    - openShiftFlow       : scope check + drawer-password check + storage call
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db }      from "../db";
import { eq }      from "drizzle-orm";
import bcrypt      from "bcryptjs";
import { users, cashierAuditLog } from "@shared/schema";
import { storage } from "../storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShiftActor {
  fullName:            string;
  isAdminOrSupervisor: boolean;
}

export interface OpenShiftParams {
  cashierId:      string;
  openingCash:    string | undefined;
  unitType:       string;
  pharmacyId:     string | undefined;
  departmentId:   string | undefined;
  drawerPassword: string | undefined;
}

// ─── resolveShiftActor ────────────────────────────────────────────────────────
// Replaces the repeated db.select({ fullName, role }) block in close/collect/refund handlers.

export async function resolveShiftActor(userId: string): Promise<ShiftActor> {
  const [row] = await db
    .select({ fullName: users.fullName, role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  return {
    fullName:            row?.fullName || userId,
    isAdminOrSupervisor: !!(row?.role === "admin" || row?.role === "owner"),
  };
}

// ─── assertShiftOwnership ─────────────────────────────────────────────────────
// Moved from local function in route file — unchanged logic.

export async function assertShiftOwnership(
  shiftId:             string,
  userId:              string,
  userFullName:        string,
  isAdminOrSupervisor: boolean,
): Promise<void> {
  const shift = await storage.getShiftById(shiftId);
  if (!shift) throw Object.assign(new Error("الوردية غير موجودة"), { status: 404 });

  if (shift.cashierId === userId) return;

  if (!isAdminOrSupervisor) {
    throw Object.assign(
      new Error("هذه الوردية لا تخصك — لا يمكنك تنفيذ هذه العملية"),
      { status: 403 },
    );
  }

  await db.insert(cashierAuditLog).values({
    shiftId,
    action:      "supervisor_override",
    entityType:  "shift",
    entityId:    shiftId,
    details:     `تدخل مشرف بواسطة ${userFullName} على وردية ${shift.cashierName}`,
    performedBy: userFullName,
  });
}

// ─── openShiftFlow ────────────────────────────────────────────────────────────
// Validates GL account → scope → drawer password → opens shift.
// Throws typed errors (with .status) on any validation failure.

export async function openShiftFlow(params: OpenShiftParams) {
  const { cashierId, openingCash, unitType, pharmacyId, departmentId, drawerPassword } = params;

  const userGlAccount = await storage.getUserCashierGlAccount(cashierId);
  if (!userGlAccount) {
    throw Object.assign(
      new Error("لم يتم تحديد حساب خزنة لهذا المستخدم — تواصل مع المدير لتعيين حساب الخزنة"),
      { status: 400 },
    );
  }

  const scope = await storage.getUserOperationalScope(cashierId);
  if (!scope.isFullAccess) {
    const selectedId = unitType === "pharmacy" ? pharmacyId : departmentId;
    const allowed = unitType === "pharmacy"
      ? scope.allowedPharmacyIds.includes(selectedId!)
      : scope.allowedDepartmentIds.includes(selectedId!);
    if (!allowed) {
      throw Object.assign(
        new Error("ليس لديك صلاحية فتح وردية لهذه الوحدة"),
        { status: 403 },
      );
    }
  }

  const passwordHash = await storage.getDrawerPassword(userGlAccount.glAccountId);
  if (passwordHash) {
    if (!drawerPassword) {
      throw Object.assign(new Error("كلمة سر الخزنة مطلوبة"), { status: 401 });
    }
    if (!await bcrypt.compare(drawerPassword, passwordHash)) {
      throw Object.assign(new Error("كلمة سر الخزنة غير صحيحة"), { status: 401 });
    }
  }

  const [userRow] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, cashierId));

  return storage.openCashierShift(
    cashierId,
    userRow?.fullName || cashierId,
    openingCash || "0",
    unitType,
    pharmacyId,
    departmentId,
    userGlAccount.glAccountId,
  );
}
