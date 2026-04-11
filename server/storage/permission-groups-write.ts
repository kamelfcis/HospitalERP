import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { permissionGroups, groupPermissions, users } from "@shared/schema";
import type { PermissionGroup } from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { clearPermissionCacheForUser } from "./users-storage";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export const permissionGroupsWriteMethods = {

  async updatePermissionGroup(
    this: DatabaseStorage,
    id: string,
    data: {
      name?: string;
      description?: string;
      maxDiscountPct?:   number | null;
      maxDiscountValue?: number | null;
      defaultRoute?:     string | null;
    }
  ): Promise<PermissionGroup> {
    const [existing] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, id));
    if (!existing) throw new Error("المجموعة غير موجودة");

    const updates: Record<string, unknown> = {};

    if (data.name !== undefined) {
      if (existing.isSystem) throw new Error("لا يمكن تغيير اسم مجموعة نظامية");
      const name = data.name.trim();
      if (!name) throw new Error("اسم المجموعة لا يمكن أن يكون فارغاً");

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

    if ("maxDiscountPct" in data) {
      updates.maxDiscountPct = data.maxDiscountPct != null ? String(data.maxDiscountPct) : null;
    }
    if ("maxDiscountValue" in data) {
      updates.maxDiscountValue = data.maxDiscountValue != null ? String(data.maxDiscountValue) : null;
    }
    if ("defaultRoute" in data) {
      updates.defaultRoute = data.defaultRoute ?? null;
    }

    if (Object.keys(updates).length === 0) return existing;

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

    const members = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM users
      WHERE permission_group_id = ${id} AND is_active = true
    `);
    const cnt = Number((members as any).rows[0]?.cnt ?? 0);
    if (cnt > 0) {
      throw new Error(`لا يمكن حذف المجموعة — بها ${cnt} مستخدم نشط. يرجى نقلهم أولاً`);
    }

    await db.delete(permissionGroups).where(eq(permissionGroups.id, id));
  },

  async setGroupPermissions(
    this: DatabaseStorage,
    groupId: string,
    permissions: string[]
  ): Promise<void> {
    const [group] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, groupId));
    if (!group) throw new Error("المجموعة غير موجودة");

    await db.transaction(async (tx) => {
      await tx.delete(groupPermissions).where(eq(groupPermissions.groupId, groupId));
      if (permissions.length > 0) {
        const unique = [...new Set(permissions)];
        await tx.insert(groupPermissions).values(
          unique.map(permission => ({ groupId, permission }))
        );
      }
    });

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
