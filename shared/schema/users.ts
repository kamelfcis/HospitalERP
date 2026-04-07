import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, uniqueIndex, integer, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { userRoleEnum } from "./enums";

// ─────────────────────────────────────────────────────────────────────────────
//  Permission Groups — مجموعات الصلاحيات
// ─────────────────────────────────────────────────────────────────────────────
//  جدول جديد يُحلّ محلّ الـ role enum الثابت.
//  is_system = true  →  مجموعة مُولَّدة من الأدوار الحالية، لا تُحذف.
// ─────────────────────────────────────────────────────────────────────────────
export const permissionGroups = pgTable("permission_groups", {
  id:               varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name:             text("name").notNull().unique(),
  description:      text("description"),
  isSystem:         boolean("is_system").notNull().default(false),
  systemKey:        varchar("system_key"),         // مفتاح الدور الأصلي (owner, admin, pharmacist…) — للمجموعات النظامية فقط
  sortOrder:        integer("sort_order").notNull().default(0),
  seedSnapshot:     text("seed_snapshot"),         // JSON array of last-seeded permissions — used by delta sync to detect truly new permissions
  // ── حدود الخصم — null = لا حد مطبّق ──────────────────────────────────
  maxDiscountPct:   decimal("max_discount_pct",   { precision: 5,  scale: 2 }),   // أقصى نسبة خصم (0-100)
  maxDiscountValue: decimal("max_discount_value",  { precision: 12, scale: 2 }),   // أقصى قيمة خصم ثابتة (جنيه)
  // ── الشاشة الافتتاحية — null = لوحة التحكم الافتراضية ──────────────
  defaultRoute:     varchar("default_route"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});

export const groupPermissions = pgTable("group_permissions", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId:   varchar("group_id").notNull().references(() => permissionGroups.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  groupPermIdx: uniqueIndex("idx_group_perm_unique").on(table.groupId, table.permission),
}));

// ─────────────────────────────────────────────────────────────────────────────
//  Users
// ─────────────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id:                  varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username:            text("username").notNull().unique(),
  password:            text("password").notNull(),
  fullName:            text("full_name").notNull(),
  role:                userRoleEnum("role").notNull().default("admin"),   // legacy — kept as fallback
  permissionGroupId:   varchar("permission_group_id").references(() => permissionGroups.id),
  departmentId:        varchar("department_id"),
  pharmacyId:          varchar("pharmacy_id"),
  defaultWarehouseId:          varchar("default_warehouse_id"),
  defaultPurchaseWarehouseId:  varchar("default_purchase_warehouse_id"),
  isActive:                    boolean("is_active").notNull().default(true),
  cashierGlAccountId:            text("cashier_gl_account_id"),
  cashierVarianceAccountId:      text("cashier_variance_account_id"),        // legacy fallback — used when short/over not set
  cashierVarianceShortAccountId: text("cashier_variance_short_account_id"),  // حساب عجز الجرد النقدي
  cashierVarianceOverAccountId:  text("cashier_variance_over_account_id"),   // حساب فائض الجرد النقدي
  maxDiscountPct:           decimal("max_discount_pct", { precision: 5, scale: 2 }),
  allCashierUnits:          boolean("all_cashier_units").notNull().default(false),
  createdAt:                timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
//  Legacy tables — مُبقى عليهما كـ fallback آمن، لا تُحذف
// ─────────────────────────────────────────────────────────────────────────────
export const rolePermissions = pgTable("role_permissions", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role:      text("role").notNull(),
  permission: text("permission").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  rolePermIdx: uniqueIndex("idx_role_perm_unique").on(table.role, table.permission),
}));

export const userPermissions = pgTable("user_permissions", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    varchar("user_id").notNull().references(() => users.id),
  permission: text("permission").notNull(),
  granted:   boolean("granted").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userPermIdx: uniqueIndex("idx_user_perm_unique").on(table.userId, table.permission),
}));

// ─────────────────────────────────────────────────────────────────────────────
//  Insert schemas & Types
// ─────────────────────────────────────────────────────────────────────────────
export const insertPermissionGroupSchema = createInsertSchema(permissionGroups).omit({ id: true, createdAt: true });
export const insertGroupPermissionSchema = createInsertSchema(groupPermissions).omit({ id: true, createdAt: true });
export const insertUserSchema             = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertRolePermissionSchema   = createInsertSchema(rolePermissions).omit({ id: true, createdAt: true });
export const insertUserPermissionSchema   = createInsertSchema(userPermissions).omit({ id: true, createdAt: true });

export type InsertPermissionGroup = z.infer<typeof insertPermissionGroupSchema>;
export type PermissionGroup       = typeof permissionGroups.$inferSelect;

export type InsertGroupPermission = z.infer<typeof insertGroupPermissionSchema>;
export type GroupPermission       = typeof groupPermissions.$inferSelect;

export type InsertUser     = z.infer<typeof insertUserSchema>;
export type User           = typeof users.$inferSelect;

export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission       = typeof rolePermissions.$inferSelect;

export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission       = typeof userPermissions.$inferSelect;
