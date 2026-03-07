/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Users & RBAC Storage — طبقة تخزين المستخدمين والصلاحيات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  This module contains all database operations related to users, roles,
 *  permissions (RBAC), user-department/warehouse assignments, cashier scope,
 *  and chat user queries.
 *
 *  يحتوي هذا الملف على جميع عمليات قاعدة البيانات المتعلقة بالمستخدمين،
 *  الأدوار، الصلاحيات، ربط المستخدمين بالأقسام/المخازن، نطاق الكاشير،
 *  واستعلامات مستخدمي المحادثة.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  users,
  rolePermissions,
  userPermissions,
  userDepartments,
  userWarehouses,
  departments,
  warehouses,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  RolePermission,
  UserPermission,
  Department,
  Warehouse,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

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
    return user;
  },

  async deleteUser(this: DatabaseStorage, id: string): Promise<boolean> {
    const [user] = await db.update(users).set({ isActive: false }).where(eq(users.id, id)).returning();
    return !!user;
  },

  async getUsers(this: DatabaseStorage): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  },

  async getUserEffectivePermissions(this: DatabaseStorage, userId: string): Promise<string[]> {
    const user = await this.getUser(userId);
    if (!user) return [];

    const rolPerms = await db.select().from(rolePermissions).where(eq(rolePermissions.role, user.role));
    const rolePermSet = new Set(rolPerms.map(rp => rp.permission));

    const userPerms = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));

    for (const up of userPerms) {
      if (up.granted) {
        rolePermSet.add(up.permission);
      } else {
        rolePermSet.delete(up.permission);
      }
    }

    return Array.from(rolePermSet);
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
  },

  async getUserPermissions(this: DatabaseStorage, userId: string): Promise<UserPermission[]> {
    return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  },

  async setUserPermissions(this: DatabaseStorage, userId: string, perms: { permission: string; granted: boolean }[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
      if (perms.length > 0) {
        await tx.insert(userPermissions).values(
          perms.map(p => ({ userId, permission: p.permission, granted: p.granted }))
        );
      }
    });
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

  async getUserCashierScope(this: DatabaseStorage, userId: string): Promise<{ isFullAccess: boolean; allowedPharmacyIds: string[]; allowedDepartmentIds: string[] }> {
    const user = await this.getUser(userId);
    if (!user) return { isFullAccess: false, allowedPharmacyIds: [], allowedDepartmentIds: [] };

    if (user.role === "admin" || (user.role as string) === "owner") {
      return { isFullAccess: true, allowedPharmacyIds: [], allowedDepartmentIds: [] };
    }

    const perms = await this.getUserEffectivePermissions(userId);
    if (perms.includes("cashier.all_units")) {
      return { isFullAccess: true, allowedPharmacyIds: [], allowedDepartmentIds: [] };
    }

    const allowedPharmacyIds = user.pharmacyId ? [user.pharmacyId] : [];
    const deptRows = await db.select({ id: userDepartments.departmentId })
      .from(userDepartments)
      .where(eq(userDepartments.userId, userId));
    const allowedDepartmentIds = deptRows.map(r => r.id);

    return { isFullAccess: false, allowedPharmacyIds, allowedDepartmentIds };
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
