import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { permissionGroups } from "@shared/schema";
import type { PermissionGroup } from "@shared/schema";
import type { DatabaseStorage } from "./index";

export interface PermissionGroupWithStats extends PermissionGroup {
  permissionCount:  number;
  memberCount:      number;
  systemKey:        string | null;
  maxDiscountPct:   string | null;
  maxDiscountValue: string | null;
  defaultRoute:     string | null;
}

export interface PermissionGroupDetail extends PermissionGroup {
  permissions:      string[];
  rolePermissions:  string[];
  members:          { id: string; fullName: string; username: string }[];
  systemKey:        string | null;
  maxDiscountPct:   string | null;
  maxDiscountValue: string | null;
  defaultRoute:     string | null;
  permissionCount:  number;
  memberCount:      number;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export const permissionGroupsReadMethods = {

  async getPermissionGroups(
    this: DatabaseStorage
  ): Promise<PermissionGroupWithStats[]> {
    const rows = await db.execute(sql`
      SELECT
        pg.id,
        pg.name,
        pg.description,
        pg.is_system,
        pg.system_key,
        pg.sort_order,
        pg.max_discount_pct,
        pg.max_discount_value,
        pg.default_route,
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
      id:               r.id,
      name:             r.name,
      description:      r.description ?? null,
      isSystem:         Boolean(r.is_system),
      systemKey:        r.system_key ?? null,
      sortOrder:        Number(r.sort_order ?? 0),
      createdAt:        r.created_at,
      permissionCount:  Number(r.permission_count ?? 0),
      memberCount:      Number(r.member_count ?? 0),
      maxDiscountPct:   r.max_discount_pct   ?? null,
      maxDiscountValue: r.max_discount_value ?? null,
      defaultRoute:     r.default_route      ?? null,
    }));
  },

  async getPermissionGroup(
    this: DatabaseStorage,
    id: string
  ): Promise<PermissionGroupDetail | null> {
    const grpRows = await db.execute(sql`
      SELECT id, name, description, is_system, system_key, sort_order,
             max_discount_pct, max_discount_value, default_route, created_at
      FROM permission_groups WHERE id = ${id}
    `);
    const g = (grpRows as any).rows[0];
    if (!g) return null;

    const permRows = await db.execute(sql`
      SELECT permission FROM group_permissions WHERE group_id = ${id} ORDER BY permission
    `);
    const permissions = ((permRows as any).rows as any[]).map((r: any) => r.permission as string);

    let rolePermissionsList: string[] = [];
    const systemKey = g.system_key as string | null;
    if (systemKey) {
      const rolePermRows = await db.execute(sql`
        SELECT permission FROM role_permissions WHERE role = ${systemKey} ORDER BY permission
      `);
      rolePermissionsList = ((rolePermRows as any).rows as any[]).map((r: any) => r.permission as string);
    }

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
      id:               g.id,
      name:             g.name,
      description:      g.description ?? null,
      isSystem:         Boolean(g.is_system),
      systemKey:        systemKey ?? null,
      sortOrder:        Number(g.sort_order ?? 0),
      createdAt:        g.created_at,
      permissions,
      rolePermissions:  rolePermissionsList,
      members,
      memberCount:      members.length,
      permissionCount:  permissions.length,
      maxDiscountPct:   g.max_discount_pct   ?? null,
      maxDiscountValue: g.max_discount_value ?? null,
      defaultRoute:     g.default_route      ?? null,
    };
  },

  async createPermissionGroup(
    this: DatabaseStorage,
    data: { name: string; description?: string; sortOrder?: number }
  ): Promise<PermissionGroup> {
    const name = data.name.trim();
    if (!name) throw new Error("اسم المجموعة مطلوب");

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
};
