/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Permission Groups Seed — ترحيل الأدوار الحالية إلى مجموعات صلاحيات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  يُنفَّذ مرة واحدة عند بدء التشغيل إذا كانت permission_groups فارغة.
 *  آمن للتشغيل المتكرر (idempotent).
 *
 *  الخطوات:
 *  ────────
 *  1. تحقق: هل permission_groups فارغة؟ إذا لا → توقف (لا تُعيد التشغيل)
 *  2. لكل دور في ROLE_LABELS:
 *     a. أنشئ permission_groups row بـ is_system=true
 *     b. انسخ role_permissions المناسبة إلى group_permissions
 *  3. حدِّث users.permission_group_id لكل مستخدم حسب users.role
 *
 *  ضمانات:
 *  ───────
 *  - لا يُغيِّر role_permissions أو users.role (legacy يبقى سليماً)
 *  - كل مستخدم يحصل على نفس صلاحياته بالضبط بعد الترحيل
 *  - مُلفَّف في transaction واحدة ذرية
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { ROLE_LABELS, DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";
import { logger } from "./logger";

// ترتيب عرض المجموعات النظامية في الواجهة
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

export async function seedPermissionGroups(): Promise<void> {
  // ── تحقق: هل الجدول ممتلئ بالفعل؟ ─────────────────────────────────────────
  const countRows = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM permission_groups`);
  const existing  = Number((countRows as any).rows[0]?.cnt ?? 0);

  if (existing > 0) {
    logger.info(`[PERM_GROUPS_SEED] skipped — ${existing} groups already exist`);
    return;
  }

  logger.info("[PERM_GROUPS_SEED] starting migration: roles → permission groups");

  await db.transaction(async (tx) => {

    // ── الخطوة 1: أنشئ مجموعة نظامية لكل دور ────────────────────────────────
    const groupIdByRole: Record<string, string> = {};

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

    // ── الخطوة 2: انسخ الصلاحيات من DEFAULT_ROLE_PERMISSIONS إلى group_permissions ──
    // نستخدم DEFAULT_ROLE_PERMISSIONS (الـ source of truth في الكود)
    // لأنها مطابقة تماماً لما كان سيُولَّد في role_permissions عند الـ seed الأول
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

    // ── الخطوة 3: عيِّن كل مستخدم للمجموعة المطابقة لدوره ───────────────────
    // نحوِّل role::text لتجنب مشكلة cast مع pgEnum
    for (const [roleKey, groupId] of Object.entries(groupIdByRole)) {
      await tx.execute(sql`
        UPDATE users
        SET    permission_group_id = ${groupId}
        WHERE  role::text = ${roleKey}
          AND  permission_group_id IS NULL
      `);
    }

  }); // end transaction

  // ── التحقق: عدِّد المستخدمين بدون مجموعة بعد الترحيل ─────────────────────
  const noGroupRows = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM users WHERE permission_group_id IS NULL
  `);
  const noGroup = Number((noGroupRows as any).rows[0]?.cnt ?? 0);
  if (noGroup > 0) {
    logger.warn(`[PERM_GROUPS_SEED] ${noGroup} users still have no permission_group_id — will use role fallback`);
  }

  const totalGroupRows = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM permission_groups`);
  const total = Number((totalGroupRows as any).rows[0]?.cnt ?? 0);
  logger.info(`[PERM_GROUPS_SEED] migration complete — ${total} groups created`);
}
