/**
 * warehouse-guard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * مساعد مركزي للتحقق من صلاحية المستودع للمستخدم الحالي.
 *
 * القاعدة:
 *  - admin / owner → وصول كامل بلا قيود
 *  - مستخدم بدون user_warehouses → وصول كامل (لم تُحدَّد قيود بعد)
 *  - مستخدم لديه user_warehouses → يُسمح فقط بالمستودعات المعيَّنة له
 *
 * الاستخدام:
 *  const err = await assertUserWarehouseAllowed(userId, warehouseId, storage);
 *  if (err) return res.status(403).json({ message: err });
 */

import type { IStorage } from "../storage";

/**
 * يعيد رسالة خطأ عربية إذا كان المستخدم ليس لديه صلاحية استخدام المستودع،
 * أو null إذا كان الوصول مسموحاً به.
 */
export async function assertUserWarehouseAllowed(
  userId: string,
  warehouseId: string,
  storage: IStorage,
): Promise<string | null> {
  const user = await storage.getUser(userId);
  if (!user) return null;

  if (user.role === "admin" || (user.role as string) === "owner") return null;

  const allowed = await storage.getUserWarehouses(userId);
  if (allowed.length === 0) return null; // لا قيود = وصول كامل

  if (!allowed.some(w => w.id === warehouseId)) {
    return "ليس لديك صلاحية استخدام هذا المستودع";
  }
  return null;
}

/**
 * يتحقق من قائمة مستودعات (مثلاً مصدر + وجهة في التحويل).
 * يعيد رسالة الخطأ الأولى أو null إذا كانت جميعها مسموحة.
 */
export async function assertUserWarehousesAllowed(
  userId: string,
  warehouseIds: string[],
  storage: IStorage,
): Promise<string | null> {
  const user = await storage.getUser(userId);
  if (!user) return null;

  if (user.role === "admin" || (user.role as string) === "owner") return null;

  const allowed = await storage.getUserWarehouses(userId);
  if (allowed.length === 0) return null;

  const allowedSet = new Set(allowed.map(w => w.id));
  for (const whId of warehouseIds) {
    if (whId && !allowedSet.has(whId)) {
      return "ليس لديك صلاحية استخدام هذا المستودع";
    }
  }
  return null;
}
