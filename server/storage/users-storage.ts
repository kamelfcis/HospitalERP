/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Users & RBAC Storage — طبقة تخزين المستخدمين والصلاحيات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ── نموذج الصلاحيات الرسمي (Formal Permission Model) ──
 *
 *  Effective Permissions = Role Permissions ∪ Group Permissions
 *
 *  ترتيب حل الصلاحيات (Permission Resolution):
 *  ──────────────────────────────────────────────────
 *  1. role_permissions   — الأساس دائماً (حسب users.role)
 *  2. group_permissions  — إضافات فوق الأساس (إذا كان للمستخدم permission_group_id)
 *
 *  القواعد:
 *   - الصلاحيات تراكمية (additive) — لا يوجد deny أو سلب
 *   - role_permissions تُقرأ دائماً أولاً كأساس لكل مستخدم
 *   - إذا كان للمستخدم permission_group_id → تُضاف group_permissions فوق الأساس
 *   - إذا لم يكن للمستخدم مجموعة → الصلاحيات = role_permissions فقط
 *   - لا يوجد user-level overrides — لا يمكن سلب صلاحية موروثة من الدور
 *   - المجموعة لا تستبدل الدور، بل تضيف عليه
 *
 *  getUserEffectivePermissionsDetailed():
 *   - يُرجع كل صلاحية مع مصدرها: role / group / both
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  users,
  rolePermissions,
  groupPermissions,
  userDepartments,
  userWarehouses,
  userClinics,
  userAccountScopes,
  departments,
  warehouses,
  accounts,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  RolePermission,
  Department,
  Warehouse,
  Account,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

// ── Permission Cache ──────────────────────────────────────────────────────────
// TTL: 60 ثانية — يُلغى عند تعديل أي مجموعة أو صلاحيات مستخدم
const _permCache = new Map<string, { perms: string[]; expiresAt: number }>();
const PERM_CACHE_TTL_MS = 60_000;

export function clearPermissionCacheForUser(userId: string): void {
  _permCache.delete(userId);
}

export function clearAllPermissionCache(): void {
  _permCache.clear();
}
// ─────────────────────────────────────────────────────────────────────────────

const methods = {
  async getUser(this: DatabaseStorage, id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByUsername(this: DatabaseStorage, username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  },

  async createUser(this: DatabaseStorage, insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  },

  async updateUser(this: DatabaseStorage, id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    if (user) clearPermissionCacheForUser(id);
    return user;
  },

  async deleteUser(this: DatabaseStorage, id: string): Promise<boolean> {
    const [user] = await db.update(users).set({ isActive: false }).where(eq(users.id, id)).returning();
    return !!user;
  },

  async getUsers(this: DatabaseStorage): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  },

  // ── Permission Resolution ──────────────────────────────────────────────────
  //  Effective = role_permissions(user.role) ∪ group_permissions(user.groupId)
  //  1. دايماً اقرأ role_permissions كأساس
  //  2. إذا permission_group_id مضبوط → ادمج group_permissions فوق الأساس
  //  3. لا يوجد deny — تراكمية فقط
  async getUserEffectivePermissions(this: DatabaseStorage, userId: string): Promise<string[]> {
    const cached = _permCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.perms;

    const user = await this.getUser(userId);
    if (!user) return [];

    const rolePermsRaw = await db.execute(sql`
      SELECT permission FROM role_permissions WHERE role = ${user.role}
    `);
    const permSet = new Set(
      (rolePermsRaw.rows as { permission: string }[]).map(r => r.permission)
    );

    if (user.permissionGroupId) {
      const groupPermsRaw = await db.execute(sql`
        SELECT permission FROM group_permissions WHERE group_id = ${user.permissionGroupId}
      `);
      for (const r of groupPermsRaw.rows as { permission: string }[]) {
        permSet.add(r.permission);
      }
    }

    const perms = Array.from(permSet);
    _permCache.set(userId, { perms, expiresAt: Date.now() + PERM_CACHE_TTL_MS });
    return perms;
  },

  // ── Detailed Permission Resolution (with source) ──────────────────────────
  //  Returns each effective permission with its source: 'role' | 'group' | 'both'
  async getUserEffectivePermissionsDetailed(
    this: DatabaseStorage,
    userId: string
  ): Promise<{ permission: string; source: "role" | "group" | "both" }[]> {
    const user = await this.getUser(userId);
    if (!user) return [];

    const rolePermsRaw = await db.execute(sql`
      SELECT permission FROM role_permissions WHERE role = ${user.role}
    `);
    const roleSet = new Set(
      (rolePermsRaw.rows as { permission: string }[]).map(r => r.permission)
    );

    const groupSet = new Set<string>();
    if (user.permissionGroupId) {
      const groupPermsRaw = await db.execute(sql`
        SELECT permission FROM group_permissions WHERE group_id = ${user.permissionGroupId}
      `);
      for (const r of groupPermsRaw.rows as { permission: string }[]) {
        groupSet.add(r.permission);
      }
    }

    const allPerms = new Set([...roleSet, ...groupSet]);
    const result: { permission: string; source: "role" | "group" | "both" }[] = [];
    for (const perm of Array.from(allPerms).sort()) {
      const inRole  = roleSet.has(perm);
      const inGroup = groupSet.has(perm);
      result.push({
        permission: perm,
        source: inRole && inGroup ? "both" : inRole ? "role" : "group",
      });
    }
    return result;
  },

  async getRolePermissions(this: DatabaseStorage, role: string): Promise<RolePermission[]> {
    type RolePermRole = "admin" | "accountant" | "pharmacist" | "cashier" | "doctor" | "nurse" | "receptionist" | "warehouse" | "viewer" | "lab" | "radiology" | "it";
    return db.select().from(rolePermissions).where(eq(rolePermissions.role, role as RolePermRole));
  },

  async setRolePermissions(this: DatabaseStorage, role: string, permissions: string[]): Promise<void> {
    type RolePermRole = "admin" | "accountant" | "pharmacist" | "cashier" | "doctor" | "nurse" | "receptionist" | "warehouse" | "viewer" | "lab" | "radiology" | "it";
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.role, role as RolePermRole));
      if (permissions.length > 0) {
        await tx.insert(rolePermissions).values(
          permissions.map(permission => ({ role: role as RolePermRole, permission }))
        );
      }
    });
    clearAllPermissionCache();
  },

  async getUserDepartments(this: DatabaseStorage, userId: string): Promise<Department[]> {
    const rows = await db.select({ department: departments })
      .from(userDepartments)
      .innerJoin(departments, eq(userDepartments.departmentId, departments.id))
      .where(eq(userDepartments.userId, userId));
    return rows.map(r => r.department);
  },

  async setUserDepartments(this: DatabaseStorage, userId: string, departmentIds: string[]): Promise<void> {
    await db.delete(userDepartments).where(eq(userDepartments.userId, userId));
    if (departmentIds.length > 0) {
      await db.insert(userDepartments).values(
        departmentIds.map(deptId => ({ userId, departmentId: deptId }))
      );
    }
  },

  async getUserWarehouses(this: DatabaseStorage, userId: string): Promise<Warehouse[]> {
    const rows = await db.select({ warehouse: warehouses })
      .from(userWarehouses)
      .innerJoin(warehouses, eq(userWarehouses.warehouseId, warehouses.id))
      .where(eq(userWarehouses.userId, userId));
    return rows.map(r => r.warehouse);
  },

  async setUserWarehouses(this: DatabaseStorage, userId: string, warehouseIds: string[]): Promise<void> {
    await db.delete(userWarehouses).where(eq(userWarehouses.userId, userId));
    if (warehouseIds.length > 0) {
      await db.insert(userWarehouses).values(
        warehouseIds.map(whId => ({ userId, warehouseId: whId }))
      );
    }
  },

  async getUserClinics(this: DatabaseStorage, userId: string): Promise<string[]> {
    const rows = await db.select({ clinicId: userClinics.clinicId })
      .from(userClinics)
      .where(eq(userClinics.userId, userId));
    return rows.map(r => r.clinicId);
  },

  async setUserClinics(this: DatabaseStorage, userId: string, clinicIds: string[]): Promise<void> {
    await db.delete(userClinics).where(eq(userClinics.userId, userId));
    if (clinicIds.length > 0) {
      await db.insert(userClinics).values(
        clinicIds.map(clinicId => ({ userId, clinicId }))
      );
    }
  },

  async getUserAccountScope(this: DatabaseStorage, userId: string): Promise<string[]> {
    const rows = await db.select({ accountId: userAccountScopes.accountId })
      .from(userAccountScopes)
      .where(eq(userAccountScopes.userId, userId));
    return rows.map(r => r.accountId);
  },

  async setUserAccountScope(this: DatabaseStorage, userId: string, accountIds: string[], actorUserId: string): Promise<void> {
    const uniqueIds = [...new Set(accountIds.filter(id => typeof id === "string" && id.trim() !== ""))];
    await db.transaction(async (tx) => {
      await tx.delete(userAccountScopes).where(eq(userAccountScopes.userId, userId));
      if (uniqueIds.length > 0) {
        await tx.insert(userAccountScopes).values(
          uniqueIds.map(accountId => ({ userId, accountId, createdBy: actorUserId }))
        );
      }
    });
  },

  async getVisibleAccountIds(this: DatabaseStorage, userId: string): Promise<string[] | null> {
    const user = await this.getUser(userId);
    if (!user) return null;
    if (user.role === "admin" || (user.role as string) === "owner") return null;
    const rows = await db.select({ accountId: userAccountScopes.accountId })
      .from(userAccountScopes)
      .where(eq(userAccountScopes.userId, userId));
    if (rows.length === 0) return null;
    return rows.map(r => r.accountId);
  },

  /**
   * getUserOperationalScope — نطاق الوحدات التشغيلية للمستخدم
   *
   * ترتيب الأولوية لأقسام الوصول:
   *   1. admin / owner         → isFullAccess = true (وصول كامل)
   *   2. allCashierUnits = true → isFullAccess = true
   *   3. userDepartments rows  → نطاق صريح معيَّن ← الأولوية القصوى
   *   4. user.departmentId     → fallback تلقائي إذا لم يُعيَّن نطاق صريح
   *   5. (لا شيء)              → قائمة فارغة → 403 من المسار الطالب
   */
  async getUserOperationalScope(this: DatabaseStorage, userId: string): Promise<{ isFullAccess: boolean; allowedPharmacyIds: string[]; allowedDepartmentIds: string[]; allowedClinicIds: string[] }> {
    const user = await this.getUser(userId);
    if (!user) return { isFullAccess: false, allowedPharmacyIds: [], allowedDepartmentIds: [], allowedClinicIds: [] };

    if (user.role === "admin" || (user.role as string) === "owner") {
      return { isFullAccess: true, allowedPharmacyIds: [], allowedDepartmentIds: [], allowedClinicIds: [] };
    }

    if (user.allCashierUnits) {
      return { isFullAccess: true, allowedPharmacyIds: [], allowedDepartmentIds: [], allowedClinicIds: [] };
    }

    const allowedPharmacyIds = user.pharmacyId ? [user.pharmacyId] : [];

    // الأولوية الأولى: نطاق صريح معيَّن في جدول userDepartments (شاشة الكاشير)
    const deptRows = await db.select({ id: userDepartments.departmentId })
      .from(userDepartments)
      .where(eq(userDepartments.userId, userId));
    let allowedDepartmentIds = deptRows.map(r => r.id);

    // الأولوية الثانية (fallback): القسم الافتراضي في بروفايل المستخدم
    // يُفعَّل فقط إذا لم يُعيَّن أي نطاق صريح — لا يتعارض مع إعدادات الكاشير الحالية
    if (allowedDepartmentIds.length === 0 && user.departmentId) {
      allowedDepartmentIds = [user.departmentId];
    }

    const clinicRows = await db.select({ clinicId: userClinics.clinicId })
      .from(userClinics)
      .where(eq(userClinics.userId, userId));
    const allowedClinicIds = clinicRows.map(r => r.clinicId);

    return { isFullAccess: false, allowedPharmacyIds, allowedDepartmentIds, allowedClinicIds };
  },

  async getChatUsers(this: DatabaseStorage, currentUserId: string): Promise<{ id: string; fullName: string; role: string; unreadCount: number; lastMessage: string | null; lastMessageAt: Date | null }[]> {
    const rows = await db.execute(sql`
      SELECT
        u.id,
        u.full_name AS "fullName",
        u.role,
        COALESCE(unread.cnt, 0)::int AS "unreadCount",
        lm.body AS "lastMessage",
        lm.created_at AS "lastMessageAt"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM chat_messages cm
        WHERE cm.sender_id = u.id AND cm.receiver_id = ${currentUserId} AND cm.read_at IS NULL
      ) unread ON true
      LEFT JOIN LATERAL (
        SELECT body, created_at
        FROM chat_messages cm2
        WHERE (cm2.sender_id = u.id AND cm2.receiver_id = ${currentUserId})
           OR (cm2.sender_id = ${currentUserId} AND cm2.receiver_id = u.id)
        ORDER BY cm2.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE u.id != ${currentUserId} AND u.is_active = true
      ORDER BY lm.created_at DESC NULLS LAST, u.full_name
    `);
    return rows.rows as any[];
  },

  async getChatConversation(this: DatabaseStorage, userAId: string, userBId: string, limit = 100): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT id, sender_id AS "senderId", receiver_id AS "receiverId", body, read_at AS "readAt", created_at AS "createdAt"
      FROM chat_messages
      WHERE (sender_id = ${userAId} AND receiver_id = ${userBId})
         OR (sender_id = ${userBId} AND receiver_id = ${userAId})
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
    return rows.rows as any[];
  },

  async sendChatMessage(this: DatabaseStorage, senderId: string, receiverId: string, body: string): Promise<any> {
    const rows = await db.execute(sql`
      INSERT INTO chat_messages (sender_id, receiver_id, body)
      VALUES (${senderId}, ${receiverId}, ${body})
      RETURNING id, sender_id AS "senderId", receiver_id AS "receiverId", body, read_at AS "readAt", created_at AS "createdAt"
    `);
    return rows.rows[0] as any;
  },

  async markChatRead(this: DatabaseStorage, senderId: string, currentUserId: string): Promise<void> {
    await db.execute(sql`
      UPDATE chat_messages
      SET read_at = now()
      WHERE sender_id = ${senderId} AND receiver_id = ${currentUserId} AND read_at IS NULL
    `);
  },

  async getChatUnreadCount(this: DatabaseStorage, userId: string): Promise<number> {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM chat_messages
      WHERE receiver_id = ${userId} AND read_at IS NULL
    `);
    return (rows.rows[0] as any)?.cnt ?? 0;
  },
};

export default methods;
