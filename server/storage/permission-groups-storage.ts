/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Permission Groups Storage — تخزين مجموعات الصلاحيات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  CRUD كامل لمجموعات الصلاحيات:
 *  ─────────────────────────────
 *  getPermissionGroups     — قائمة المجموعات مع عدد الصلاحيات والأعضاء
 *  getPermissionGroup      — مجموعة واحدة مع صلاحياتها الكاملة
 *  createPermissionGroup   — إنشاء مجموعة جديدة
 *  updatePermissionGroup   — تعديل اسم / وصف مجموعة
 *  deletePermissionGroup   — حذف مجموعة (غير النظامية فقط، بدون أعضاء)
 *  setGroupPermissions     — استبدال الصلاحيات كاملةً لمجموعة (atomic)
 *  assignUserToGroup       — تعيين مستخدم لمجموعة (أو إلغاء التعيين)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { permissionGroups, groupPermissions, users } from "@shared/schema";
import type { PermissionGroup, GroupPermission } from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { clearAllPermissionCache, clearPermissionCacheForUser } from "./users-storage";

// ─────────────────────────────────────────────────────────────────────────────
//  Public interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface PermissionGroupWithStats extends PermissionGroup {
  permissionCount: number;
  memberCount:     number;
}

export interface PermissionGroupDetail extends PermissionGroup {
  permissions: string[];
  members: { id: string; fullName: string; username: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** تطبيع اسم المجموعة: trim + lowercase للمقارنة */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────────────────────────────────────

const permissionGroupsMethods = {

  async getPermissionGroups(
    this: DatabaseStorage
  ): Promise<PermissionGroupWithStats[]> {
    const rows = await db.execute(sql`
      SELECT
        pg.id,
        pg.name,
        pg.description,
        pg.is_system,
        pg.sort_order,
        pg.created_at,
        COUNT(DISTINCT gp.id)::int  AS permission_count,
        COUNT(DISTINCT u.id)::int   AS member_count
      FROM permission_groups pg
      LEFT JOIN group_permissions gp ON gp.group_id = pg.id
      LEFT JOIN users            u  ON u.permission_group_id = pg.id AND u.is_active = true
      GROUP BY pg.id
      ORDER BY pg.sort_order ASC, pg.name ASC
    `);

    return ((rows as any).rows as any[]).map((r: any) => ({
      id:              r.id,
      name:            r.name,
      description:     r.description ?? null,
      isSystem:        Boolean(r.is_system),
      sortOrder:       Number(r.sort_order ?? 0),
      createdAt:       r.created_at,
      permissionCount: Number(r.permission_count ?? 0),
      memberCount:     Number(r.member_count ?? 0),
    }));
  },

  async getPermissionGroup(
    this: DatabaseStorage,
    id: string
  ): Promise<PermissionGroupDetail | null> {
    const grpRows = await db.execute(sql`
      SELECT id, name, description, is_system, sort_order, created_at
      FROM permission_groups WHERE id = ${id}
    `);
    const g = (grpRows as any).rows[0];
    if (!g) return null;

    const permRows = await db.execute(sql`
      SELECT permission FROM group_permissions WHERE group_id = ${id} ORDER BY permission
    `);
    const permissions = ((permRows as any).rows as any[]).map((r: any) => r.permission as string);

    const memberRows = await db.execute(sql`
      SELECT id, full_name AS "fullName", username
      FROM users
      WHERE permission_group_id = ${id} AND is_active = true
      ORDER BY full_name
    `);
    const members = ((memberRows as any).rows as any[]).map((r: any) => ({
      id:       r.id       as string,
      fullName: r.fullName as string,
      username: r.username as string,
    }));

    return {
      id:          g.id,
      name:        g.name,
      description: g.description ?? null,
      isSystem:    Boolean(g.is_system),
      sortOrder:   Number(g.sort_order ?? 0),
      createdAt:   g.created_at,
      permissions,
      members,
    };
  },

  async createPermissionGroup(
    this: DatabaseStorage,
    data: { name: string; description?: string; sortOrder?: number }
  ): Promise<PermissionGroup> {
    const name = data.name.trim();
    if (!name) throw new Error("اسم المجموعة مطلوب");

    // تحقق من عدم التكرار (case-insensitive)
    const existing = await db.execute(sql`
      SELECT id FROM permission_groups WHERE LOWER(TRIM(name)) = ${normalizeName(name)}
    `);
    if ((existing as any).rows.length > 0) {
      throw new Error(`يوجد مجموعة بالاسم "${name}" بالفعل`);
    }

    const [group] = await db.insert(permissionGroups).values({
      name,
      description: data.description ?? null,
      isSystem:    false,
      sortOrder:   data.sortOrder ?? 100,
    }).returning();
    return group;
  },

  async updatePermissionGroup(
    this: DatabaseStorage,
    id: string,
    data: { name?: string; description?: string }
  ): Promise<PermissionGroup> {
    const [existing] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, id));
    if (!existing) throw new Error("المجموعة غير موجودة");

    const updates: Record<string, unknown> = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new Error("اسم المجموعة لا يمكن أن يكون فارغاً");

      // تحقق من التكرار (باستثناء المجموعة الحالية)
      const dup = await db.execute(sql`
        SELECT id FROM permission_groups
        WHERE LOWER(TRIM(name)) = ${normalizeName(name)} AND id != ${id}
      `);
      if ((dup as any).rows.length > 0) {
        throw new Error(`يوجد مجموعة بالاسم "${name}" بالفعل`);
      }
      updates.name = name;
    }

    if (data.description !== undefined) {
      updates.description = data.description;
    }

    const [updated] = await db.update(permissionGroups)
      .set(updates)
      .where(eq(permissionGroups.id, id))
      .returning();

    return updated;
  },

  async deletePermissionGroup(
    this: DatabaseStorage,
    id: string
  ): Promise<void> {
    const [group] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, id));
    if (!group) throw new Error("المجموعة غير موجودة");
    if (group.isSystem) throw new Error("لا يمكن حذف مجموعة نظامية");

    // التحقق من عدم وجود أعضاء
    const members = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM users
      WHERE permission_group_id = ${id} AND is_active = true
    `);
    const cnt = Number((members as any).rows[0]?.cnt ?? 0);
    if (cnt > 0) {
      throw new Error(`لا يمكن حذف المجموعة — بها ${cnt} مستخدم نشط. يرجى نقلهم أولاً`);
    }

    // حذف cascade يُزيل group_permissions تلقائياً
    await db.delete(permissionGroups).where(eq(permissionGroups.id, id));
  },

  async setGroupPermissions(
    this: DatabaseStorage,
    groupId: string,
    permissions: string[]
  ): Promise<void> {
    const [group] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, groupId));
    if (!group) throw new Error("المجموعة غير موجودة");

    // استبدال ذري كامل
    await db.transaction(async (tx) => {
      await tx.delete(groupPermissions).where(eq(groupPermissions.groupId, groupId));
      if (permissions.length > 0) {
        // إزالة المكررات أولاً
        const unique = [...new Set(permissions)];
        await tx.insert(groupPermissions).values(
          unique.map(permission => ({ groupId, permission }))
        );
      }
    });

    // امسح cache كل أعضاء هذه المجموعة
    const memberRows = await db.execute(sql`
      SELECT id FROM users WHERE permission_group_id = ${groupId}
    `);
    ((memberRows as any).rows as any[]).forEach((r: any) => clearPermissionCacheForUser(r.id as string));
  },

  async assignUserToGroup(
    this: DatabaseStorage,
    userId: string,
    groupId: string | null
  ): Promise<void> {
    if (groupId !== null) {
      const [group] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, groupId));
      if (!group) throw new Error("المجموعة غير موجودة");
    }

    await db.update(users)
      .set({ permissionGroupId: groupId })
      .where(eq(users.id, userId));

    clearPermissionCacheForUser(userId);
  },
};

export default permissionGroupsMethods;
