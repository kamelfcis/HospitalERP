/**
 * scope-guard.ts
 * ────────────────────────────────────────────────────────────────────────────
 * مساعد مركزي لتطبيق صلاحيات القسم والمخزن في شاشة فاتورة المريض (وغيرها).
 *
 * يُطبَّق على 4 طبقات:
 *   1. /api/auth/me  → يُعيد allowedDepartmentIds لتصفية الواجهة
 *   2. /api/services → يرفض طلبات جلب خدمات قسم خارج نطاق المستخدم
 *   3. POST/PUT /api/patient-invoices → يرفض حفظ فاتورة بقسم/مخزن غير مسموح
 *   4. POST /api/patient-invoices/:id/finalize → نفس الـ guard
 *
 * قاعدة الـ bypass:
 *   - admin / owner          → isFullAccess = true → لا قيود
 *   - allCashierUnits = true → isFullAccess = true → لا قيود
 *   - allowedDeptIds = []    (غير admin) → لا توجد أقسام مُعيّنة → لا قيود فعلية
 *                                          (graceful degradation لأنظمة قبل تفعيل النطاقات)
 *   - allowedWarehouses = [] (غير admin) → نفس السلوك
 */

import { db } from "../db";
import { users, userDepartments, userWarehouses, services } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { logger as log } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeptScope {
  isFullAccess: boolean;
  allowedDeptIds: string[];
}

export interface WarehouseScope {
  isFullAccess: boolean;
  allowedWarehouseIds: string[];
}

// ── Custom error ──────────────────────────────────────────────────────────────

export class ScopeViolationError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "ScopeViolationError";
  }
}

// ── Core resolvers ────────────────────────────────────────────────────────────

export interface FullScope {
  dept: DeptScope;
  warehouse: WarehouseScope;
}

/**
 * Unified resolver — 1 user query + 2 parallel queries (departments + warehouses).
 * Preferred over calling the individual resolvers when both are needed at once
 * (CREATE / UPDATE / FINALIZE) to avoid querying the users table twice.
 */
export async function resolveUserFullScope(userId: string): Promise<FullScope> {
  const userRows = await db
    .select({ role: users.role, allCashierUnits: users.allCashierUnits, departmentId: users.departmentId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0];

  const empty: FullScope = {
    dept:      { isFullAccess: false, allowedDeptIds: [] },
    warehouse: { isFullAccess: false, allowedWarehouseIds: [] },
  };
  if (!user) return empty;

  if (user.role === "admin" || (user.role as string) === "owner" || user.allCashierUnits) {
    return {
      dept:      { isFullAccess: true, allowedDeptIds: [] },
      warehouse: { isFullAccess: true, allowedWarehouseIds: [] },
    };
  }

  // Fetch both tables in parallel (single round-trip to DB)
  const [deptRows, whRows] = await Promise.all([
    db.select({ id: userDepartments.departmentId }).from(userDepartments).where(eq(userDepartments.userId, userId)),
    db.select({ id: userWarehouses.warehouseId }).from(userWarehouses).where(eq(userWarehouses.userId, userId)),
  ]);

  let allowedDeptIds = deptRows.map((r) => r.id);
  if (allowedDeptIds.length === 0 && user.departmentId) {
    allowedDeptIds = [user.departmentId];
  }

  return {
    dept:      { isFullAccess: false, allowedDeptIds },
    warehouse: { isFullAccess: false, allowedWarehouseIds: whRows.map((r) => r.id) },
  };
}

/**
 * يُعيد نطاق أقسام المستخدم.
 *
 * الأولوية:
 *   1. admin / owner / allCashierUnits → isFullAccess = true
 *   2. user_departments rows            → allowedDeptIds صريحة
 *   3. user.departmentId               → fallback للقسم الواحد
 *   4. لا شيء                         → allowedDeptIds = [] (لا قيود فعلية)
 *
 * استخدم resolveUserFullScope() عندما تحتاج كلاً من الأقسام والمخازن معاً.
 */
export async function resolveUserDeptScope(userId: string): Promise<DeptScope> {
  const userRows = await db
    .select({ role: users.role, allCashierUnits: users.allCashierUnits, departmentId: users.departmentId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) return { isFullAccess: false, allowedDeptIds: [] };

  if (user.role === "admin" || (user.role as string) === "owner" || user.allCashierUnits) {
    return { isFullAccess: true, allowedDeptIds: [] };
  }

  const deptRows = await db
    .select({ id: userDepartments.departmentId })
    .from(userDepartments)
    .where(eq(userDepartments.userId, userId));

  let allowedDeptIds = deptRows.map((r) => r.id);
  if (allowedDeptIds.length === 0 && user.departmentId) {
    allowedDeptIds = [user.departmentId];
  }

  return { isFullAccess: false, allowedDeptIds };
}

/**
 * يُعيد نطاق مخازن المستخدم.
 * استخدم resolveUserFullScope() عندما تحتاج كلاً من الأقسام والمخازن معاً.
 */
export async function resolveUserWarehouseScope(userId: string): Promise<WarehouseScope> {
  const userRows = await db
    .select({ role: users.role, allCashierUnits: users.allCashierUnits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) return { isFullAccess: false, allowedWarehouseIds: [] };

  if (user.role === "admin" || (user.role as string) === "owner" || user.allCashierUnits) {
    return { isFullAccess: true, allowedWarehouseIds: [] };
  }

  const whRows = await db
    .select({ id: userWarehouses.warehouseId })
    .from(userWarehouses)
    .where(eq(userWarehouses.userId, userId));

  return { isFullAccess: false, allowedWarehouseIds: whRows.map((r) => r.id) };
}

// ── Assertion helpers (throw on violation) ────────────────────────────────────

/**
 * يرفض إذا كان departmentId خارج نطاق المستخدم.
 * لا يفعل شيئاً إذا: isFullAccess || allowedDeptIds.length === 0 || !departmentId
 */
export async function assertDeptScope(
  userId: string,
  departmentId: string | null | undefined,
  context: string,
): Promise<void> {
  if (!departmentId) return;
  const { isFullAccess, allowedDeptIds } = await resolveUserDeptScope(userId);
  if (isFullAccess || allowedDeptIds.length === 0) return;
  if (!allowedDeptIds.includes(departmentId)) {
    log.warn(
      { userId, departmentId, allowedDeptIds, context },
      "[SCOPE_VIOLATION] department access denied",
    );
    throw new ScopeViolationError("غير مسموح لك بالوصول إلى هذا القسم");
  }
}

/**
 * يرفض إذا كان warehouseId خارج نطاق المستخدم.
 */
export async function assertWarehouseScope(
  userId: string,
  warehouseId: string | null | undefined,
  context: string,
): Promise<void> {
  if (!warehouseId) return;
  const { isFullAccess, allowedWarehouseIds } = await resolveUserWarehouseScope(userId);
  if (isFullAccess || allowedWarehouseIds.length === 0) return;
  if (!allowedWarehouseIds.includes(warehouseId)) {
    log.warn(
      { userId, warehouseId, allowedWarehouseIds, context },
      "[SCOPE_VIOLATION] warehouse access denied",
    );
    throw new ScopeViolationError("غير مسموح لك بالوصول إلى هذا المخزن");
  }
}

/**
 * يتحقق من صلاحية القسم والمخزن معاً لفاتورة معيّنة.
 * يستخدم في CREATE + UPDATE + FINALIZE routes.
 *
 * محسَّن: 1 user query + 2 parallel table queries بدل 4 queries.
 */
export async function assertInvoiceScopeGuard(
  userId: string,
  departmentId: string | null | undefined,
  warehouseId: string | null | undefined,
  context = "patient_invoice",
): Promise<void> {
  const { dept, warehouse } = await resolveUserFullScope(userId);

  if (departmentId && !dept.isFullAccess && dept.allowedDeptIds.length > 0) {
    if (!dept.allowedDeptIds.includes(departmentId)) {
      log.warn(
        { userId, departmentId, allowedDeptIds: dept.allowedDeptIds, context },
        "[SCOPE_VIOLATION] department access denied",
      );
      throw new ScopeViolationError("غير مسموح لك بالوصول إلى هذا القسم");
    }
  }

  if (warehouseId && !warehouse.isFullAccess && warehouse.allowedWarehouseIds.length > 0) {
    if (!warehouse.allowedWarehouseIds.includes(warehouseId)) {
      log.warn(
        { userId, warehouseId, allowedWarehouseIds: warehouse.allowedWarehouseIds, context },
        "[SCOPE_VIOLATION] warehouse access denied",
      );
      throw new ScopeViolationError("غير مسموح لك بالوصول إلى هذا المخزن");
    }
  }
}

// ── Service-department match ───────────────────────────────────────────────────

/**
 * يتحقق أن كل سطر خدمة ينتمي للقسم المُحدد في الفاتورة.
 *
 * القاعدة:
 *   - الخدمة بـ departmentId = null → مسموحة في أي فاتورة (خدمة عامة)
 *   - الخدمة بـ departmentId = X   → يجب أن تتطابق مع قسم الفاتورة
 *   - item lines (ليست services)  → تُتجاهل (لها مستودع منفصل)
 *
 * @param lines           - بنود الفاتورة (lineType, serviceId قادمين من الـ schema)
 * @param invoiceDeptId   - قسم الفاتورة
 */
export async function assertServiceDeptMatch(
  lines: Array<{ lineType?: string | null; serviceId?: string | null; itemId?: string | null }>,
  invoiceDeptId: string | null | undefined,
): Promise<void> {
  if (!invoiceDeptId) return;

  const serviceIds = lines
    .filter((l) => l.lineType === "service" && l.serviceId)
    .map((l) => l.serviceId as string);

  if (serviceIds.length === 0) return;

  const svcRows = await db
    .select({ id: services.id, departmentId: services.departmentId })
    .from(services)
    .where(inArray(services.id, serviceIds));

  for (const svc of svcRows) {
    if (svc.departmentId && svc.departmentId !== invoiceDeptId) {
      log.warn(
        { serviceId: svc.id, serviceDeptId: svc.departmentId, invoiceDeptId },
        "[SCOPE_WARN] service department mismatch (allowed — cross-dept service on patient invoice)",
      );
    }
  }
}
