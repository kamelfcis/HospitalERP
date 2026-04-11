import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  users,
  rolePermissions,
  groupPermissions,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  RolePermission,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const _permCache = new Map<string, { perms: string[]; expiresAt: number }>();
const PERM_CACHE_TTL_MS = 60_000;

export function clearPermissionCacheForUser(userId: string): void {
  _permCache.delete(userId);
}

export function clearAllPermissionCache(): void {
  _permCache.clear();
}

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

  async getUserEffectivePermissions(this: DatabaseStorage, userId: string): Promise<string[]> {
    const cached = _permCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.perms;

    const user = await this.getUser(userId);
    if (!user) return [];

    let perms: string[];

    if (user.permissionGroupId) {
      const groupPermsRaw = await db.execute(sql`
        SELECT permission FROM group_permissions WHERE group_id = ${user.permissionGroupId}
      `);
      perms = (groupPermsRaw.rows as { permission: string }[]).map(r => r.permission);
    } else {
      const rolePermsRaw = await db.execute(sql`
        SELECT permission FROM role_permissions WHERE role = ${user.role}
      `);
      perms = (rolePermsRaw.rows as { permission: string }[]).map(r => r.permission);
    }

    _permCache.set(userId, { perms, expiresAt: Date.now() + PERM_CACHE_TTL_MS });
    return perms;
  },

  async getUserEffectivePermissionsDetailed(
    this: DatabaseStorage,
    userId: string
  ): Promise<{ permission: string; source: "group" | "role_default"; active: boolean }[]> {
    const user = await this.getUser(userId);
    if (!user) return [];

    const rolePermsRaw = await db.execute(sql`
      SELECT permission FROM role_permissions WHERE role = ${user.role}
    `);
    const roleSet = new Set(
      (rolePermsRaw.rows as { permission: string }[]).map(r => r.permission)
    );

    if (user.permissionGroupId) {
      const groupPermsRaw = await db.execute(sql`
        SELECT permission FROM group_permissions WHERE group_id = ${user.permissionGroupId}
      `);
      const groupSet = new Set(
        (groupPermsRaw.rows as { permission: string }[]).map(r => r.permission)
      );

      const result: { permission: string; source: "group" | "role_default"; active: boolean }[] = [];
      for (const perm of Array.from(groupSet).sort()) {
        result.push({ permission: perm, source: "group", active: true });
      }
      for (const perm of Array.from(roleSet).sort()) {
        if (!groupSet.has(perm)) {
          result.push({ permission: perm, source: "role_default", active: false });
        }
      }
      return result;
    } else {
      return Array.from(roleSet).sort().map(perm => ({
        permission: perm,
        source: "role_default" as const,
        active: true,
      }));
    }
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
};

export default methods;
