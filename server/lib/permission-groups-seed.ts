/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Permission Groups Seed — ترحيل الأدوار الحالية إلى مجموعات صلاحيات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  يُنفَّذ في كل إقلاع — آمن ومتعدد التشغيل (idempotent):
 *
 *  [أ] إذا permission_groups فارغة → seed كامل (إنشاء المجموعات + الصلاحيات + تعيين المستخدمين)
 *  [ب] إذا المجموعات موجودة → delta sync فقط:
 *      • يضيف الصلاحيات الجديدة التي أُضيفت لـ DEFAULT_ROLE_PERMISSIONS لاحقاً
 *        إلى المجموعات النظامية المقابلة (مثلاً admin يحصل على أي permission جديدة)
 *
 *  ضمانات:
 *  ───────
 *  - لا يُغيِّر role_permissions أو users.role
 *  - لا يحذف صلاحيات موجودة من المجموعات
 *  - كل عملية ذرية داخل transaction
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { ROLE_LABELS, DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";
import { logger } from "./logger";

const ROLE_SORT_ORDER: Record<string, number> = {
  owner:              1,
  admin:              2,
  accounts_manager:   3,
  purchase_manager:   4,
  data_entry:         5,
  pharmacist:         6,
  pharmacy_assistant: 7,
  warehouse_assistant:8,
  cashier:            9,
  department_admin:  10,
  reception:         11,
  doctor:            12,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function seedPermissionGroups(): Promise<void> {
  const countRows = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM permission_groups`);
  const existing  = Number((countRows as any).rows[0]?.cnt ?? 0);

  if (existing === 0) {
    await _initialSeed();
  } else {
    await _deltaSyncPermissions();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  [أ] Initial Seed — يعمل مرة واحدة عند أول تشغيل
// ─────────────────────────────────────────────────────────────────────────────

async function _initialSeed(): Promise<void> {
  logger.info("[PERM_GROUPS_SEED] starting initial migration: roles → permission groups");

  await db.transaction(async (tx) => {

    const groupIdByRole: Record<string, string> = {};

    // الخطوة 1: إنشاء مجموعة نظامية لكل دور
    for (const [roleKey, roleLabel] of Object.entries(ROLE_LABELS)) {
      const sortOrder = ROLE_SORT_ORDER[roleKey] ?? 99;

      const insertedRows = await tx.execute(sql`
        INSERT INTO permission_groups (name, description, is_system, sort_order)
        VALUES (${roleLabel}, ${`مجموعة النظام: ${roleKey}`}, TRUE, ${sortOrder})
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
      `);
      const groupId = (insertedRows as any).rows[0]?.id as string;
      groupIdByRole[roleKey] = groupId;
    }

    // الخطوة 2: نسخ الصلاحيات من DEFAULT_ROLE_PERMISSIONS
    for (const [roleKey, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const groupId = groupIdByRole[roleKey];
      if (!groupId || perms.length === 0) continue;

      const unique = [...new Set(perms)];
      for (const permission of unique) {
        await tx.execute(sql`
          INSERT INTO group_permissions (group_id, permission)
          VALUES (${groupId}, ${permission})
          ON CONFLICT DO NOTHING
        `);
      }

      logger.info(`[PERM_GROUPS_SEED] role "${roleKey}" → group "${groupId}" — ${unique.length} permissions`);
    }

    // الخطوة 3: تعيين كل مستخدم للمجموعة المطابقة لدوره
    for (const [roleKey, groupId] of Object.entries(groupIdByRole)) {
      await tx.execute(sql`
        UPDATE users
        SET    permission_group_id = ${groupId}
        WHERE  role::text = ${roleKey}
          AND  permission_group_id IS NULL
      `);
    }

  });

  // تحقق ختامي
  const noGroupRows = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM users WHERE permission_group_id IS NULL
  `);
  const noGroup = Number((noGroupRows as any).rows[0]?.cnt ?? 0);
  if (noGroup > 0) {
    logger.warn(`[PERM_GROUPS_SEED] ${noGroup} users still have no permission_group_id — role fallback will apply`);
  }

  const totalRows = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM permission_groups`);
  logger.info(`[PERM_GROUPS_SEED] initial seed complete — ${(totalRows as any).rows[0]?.cnt} groups created`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  [ب] Delta Sync — يضيف الصلاحيات الجديدة التي أُضيفت للـ code بعد الـ seed الأول
// ─────────────────────────────────────────────────────────────────────────────

async function _deltaSyncPermissions(): Promise<void> {
  let totalAdded = 0;

  for (const [roleKey, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (perms.length === 0) continue;

    // ابحث عن المجموعة النظامية المطابقة للدور (is_system = true)
    const grpRows = await db.execute(sql`
      SELECT pg.id
      FROM permission_groups pg
      WHERE pg.is_system = true
        AND pg.description = ${'مجموعة النظام: ' + roleKey}
      LIMIT 1
    `);
    const groupId = (grpRows as any).rows[0]?.id as string | undefined;
    if (!groupId) continue;

    // الصلاحيات الموجودة لهذه المجموعة
    const existingRows = await db.execute(sql`
      SELECT permission FROM group_permissions WHERE group_id = ${groupId}
    `);
    const existingSet = new Set(
      ((existingRows as any).rows as any[]).map((r: any) => r.permission as string)
    );

    const unique = [...new Set(perms)];
    const missing = unique.filter(p => !existingSet.has(p));

    if (missing.length > 0) {
      for (const permission of missing) {
        await db.execute(sql`
          INSERT INTO group_permissions (group_id, permission)
          VALUES (${groupId}, ${permission})
          ON CONFLICT DO NOTHING
        `);
      }
      logger.info(`[PERM_GROUPS_SEED] delta: added ${missing.length} new permissions to "${roleKey}" group`);
      totalAdded += missing.length;
    }
  }

  if (totalAdded > 0) {
    logger.info(`[PERM_GROUPS_SEED] delta sync complete — ${totalAdded} permissions added across all groups`);
  } else {
    logger.info("[PERM_GROUPS_SEED] delta sync: all groups up to date, nothing to add");
  }
}
