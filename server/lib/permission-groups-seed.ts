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
 *  [ج] backfill system_key للمجموعات النظامية القديمة التي لا تملكه بعد (مرة واحدة)
 *  [د] استعادة طوارئ: أي مجموعة نظامية فقدت كل صلاحياتها تُستعاد تلقائياً
 *
 *  التعرّف على المجموعات النظامية:
 *  ──────────────────────────────
 *  يعتمد على system_key (VARCHAR) المخزَّن في الجدول.
 *  النسخ القديمة (قبل إضافة system_key) تُعرَّف مرة واحدة بالـ description للـ backfill.
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
    // [ج] backfill system_key للنسخ القديمة (قبل إضافة العمود)
    await _backfillSystemKeys();
    await _deltaSyncPermissions();
  }

  // [د] تحقق طوارئ: استعادة أي مجموعة نظامية فقدت صلاحياتها
  await restoreMissingSystemGroupPermissions();
}

// ─────────────────────────────────────────────────────────────────────────────
//  [أ] Initial Seed — يعمل مرة واحدة عند أول تشغيل
// ─────────────────────────────────────────────────────────────────────────────

async function _initialSeed(): Promise<void> {
  logger.info("[PERM_GROUPS_SEED] starting initial migration: roles → permission groups");

  await db.transaction(async (tx) => {

    const groupIdByRole: Record<string, string> = {};

    // الخطوة 1: إنشاء مجموعة نظامية لكل دور مع system_key
    for (const [roleKey, roleLabel] of Object.entries(ROLE_LABELS)) {
      const sortOrder = ROLE_SORT_ORDER[roleKey] ?? 99;

      const insertedRows = await tx.execute(sql`
        INSERT INTO permission_groups (name, description, is_system, system_key, sort_order)
        VALUES (
          ${roleLabel},
          ${'مجموعة النظام: ' + roleKey},
          TRUE,
          ${roleKey},
          ${sortOrder}
        )
        ON CONFLICT (name) DO UPDATE
          SET description = EXCLUDED.description,
              system_key  = EXCLUDED.system_key
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
          ON CONFLICT (group_id, permission) DO NOTHING
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
//  [ج] Backfill system_key — يعمل مرة واحدة للنسخ القديمة
//  يستخدم description pattern للتعرف على المجموعة ثم يكتب system_key
// ─────────────────────────────────────────────────────────────────────────────

async function _backfillSystemKeys(): Promise<void> {
  let totalBackfilled = 0;

  for (const roleKey of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
    // البحث بـ description للمجموعات التي لا تملك system_key بعد
    const result = await db.execute(sql`
      UPDATE permission_groups
      SET    system_key = ${roleKey}
      WHERE  is_system  = true
        AND  system_key IS NULL
        AND  description = ${'مجموعة النظام: ' + roleKey}
      RETURNING id
    `);
    totalBackfilled += (result as any).rows.length;
  }

  if (totalBackfilled > 0) {
    logger.info(`[PERM_GROUPS_SEED] backfill: set system_key for ${totalBackfilled} system groups`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  [ب] Delta Sync — يضيف فقط الصلاحيات الجديدة حقاً في الكود
//
//  المبدأ:
//   • seed_snapshot = JSON array مرتّب من permission keys كما حددها الكود في آخر مزامنة
//   • عند كل تشغيل: trulyNew = currentCode − previousSnapshot  (جديدة في الكود)
//   • نضيف trulyNew إلى DB إن لم تكن موجودة بالفعل
//   • نحدّث snapshot فقط بعد نجاح العملية كلها (داخل transaction)
//   • العملية additive فقط — لا يُحذف شيء من DB تلقائياً
//
//  سياسة أول تشغيل (seed_snapshot = NULL):
//   • نعتبر كل صلاحيات الكود الحالية "سابقة" → trulyNew = []
//   • لا يُضاف شيء (تجنّب إعادة صلاحيات أزالها المسؤول يدوياً من قبل)
//   • نحفظ snapshot فقط لتأسيس الخط القاعدي للمزامنات التالية
//
//  سياسة snapshot تالف (parse error):
//   • نعتبله كـ NULL (خط قاعدي حالي فقط، بدون إضافات)
//   • أكثر أماناً من اعتباره فارغاً (لو فارغ هيضيف كل الصلاحيات)
// ─────────────────────────────────────────────────────────────────────────────

/** تأكد من وجود عمود seed_snapshot — آمن ومتعدد التشغيل (DDL transactional في PostgreSQL) */
async function _ensureSeedSnapshotColumn(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE permission_groups
    ADD COLUMN IF NOT EXISTS seed_snapshot TEXT DEFAULT NULL
  `);
}

/** تسلسل ثابت: مرتّب أبجدياً + بدون مكررات */
function _serializeSnapshot(keys: string[]): string {
  return JSON.stringify([...new Set(keys)].sort());
}

/** تحليل snapshot مع fallback آمن */
function _parseSnapshot(raw: string | null, currentCodeSet: Set<string>): Set<string> {
  if (!raw) {
    // أول تشغيل: اعتبر كل صلاحيات الكود الحالية "سابقة" → trulyNew = []
    return currentCodeSet;
  }
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    // snapshot تالف: نفس سياسة أول تشغيل (لا نضيف شيئاً، فقط نصلح الـ snapshot)
    logger.warn("[PERM_GROUPS_SEED] corrupt seed_snapshot detected — treating as baseline (no additions)");
    return currentCodeSet;
  }
}

async function _deltaSyncPermissions(): Promise<void> {
  // ① تأكد من وجود عمود seed_snapshot خارج الـ loop (DDL مرة واحدة)
  await _ensureSeedSnapshotColumn();

  let totalAdded = 0;

  for (const [roleKey, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (perms.length === 0) continue;

    // ② الصلاحيات المعرّفة في الكود لهذا الدور — مرتّبة وبدون تكرار
    const currentCodeSet = new Set([...new Set(perms)].sort());
    const currentCodeArr = [...currentCodeSet];
    const newSnapshotStr = _serializeSnapshot(currentCodeArr);

    // ③ كل عملية مجموعة في transaction مستقلة:
    //    قراءة snapshot → تحديد trulyNew → insert → تحديث snapshot
    //    لو أي خطوة فشلت، يُرجَع كل شيء ولا يُحدَّث snapshot
    await db.transaction(async (tx) => {
      // قراءة المجموعة النظامية
      const grpRows = await tx.execute(sql`
        SELECT id, seed_snapshot FROM permission_groups
        WHERE  is_system  = true
          AND  system_key = ${roleKey}
        LIMIT 1
      `);
      const grpRow = (grpRows as any).rows[0] as
        { id: string; seed_snapshot: string | null } | undefined;
      if (!grpRow) return; // لا توجد مجموعة نظامية لهذا الدور → تخطّ

      const groupId           = grpRow.id;
      const previousSnapshot  = _parseSnapshot(grpRow.seed_snapshot, currentCodeSet);

      // الصلاحيات الجديدة حقاً = في الكود الآن ولم تكن في آخر snapshot
      const trulyNew = currentCodeArr.filter(p => !previousSnapshot.has(p));

      if (trulyNew.length > 0) {
        // اقرأ ما هو موجود في DB حالياً (داخل نفس الـ transaction للاتساق)
        const existingRows = await tx.execute(sql`
          SELECT permission FROM group_permissions WHERE group_id = ${groupId}
        `);
        const existingSet = new Set(
          ((existingRows as any).rows as any[]).map((r: any) => r.permission as string)
        );

        const toAdd = trulyNew.filter(p => !existingSet.has(p));
        if (toAdd.length > 0) {
          for (const permission of toAdd) {
            await tx.execute(sql`
              INSERT INTO group_permissions (group_id, permission)
              VALUES (${groupId}, ${permission})
              ON CONFLICT (group_id, permission) DO NOTHING
            `);
          }
          logger.info(
            `[PERM_GROUPS_SEED] delta: added ${toAdd.length} new permissions to "${roleKey}" group`
          );
          totalAdded += toAdd.length;
        }
      }

      // ④ حدّث snapshot فقط بعد نجاح الـ inserts (داخل نفس الـ transaction)
      await tx.execute(sql`
        UPDATE permission_groups
        SET    seed_snapshot = ${newSnapshotStr}
        WHERE  id = ${groupId}
      `);
    });
  }

  if (totalAdded > 0) {
    logger.info(`[PERM_GROUPS_SEED] delta sync complete — ${totalAdded} permissions added across all groups`);
  } else {
    logger.info("[PERM_GROUPS_SEED] delta sync: all groups up to date, nothing to add");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  [د] Emergency Restore — استعادة المجموعات النظامية التي فقدت صلاحياتها
//  يعتمد على system_key أساساً، بعد الـ backfill
// ─────────────────────────────────────────────────────────────────────────────

export async function restoreMissingSystemGroupPermissions(): Promise<void> {
  let totalRestored = 0;

  for (const [roleKey, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (perms.length === 0) continue;

    // البحث بـ system_key
    const grpRows = await db.execute(sql`
      SELECT id, name FROM permission_groups
      WHERE  is_system  = true
        AND  system_key = ${roleKey}
      LIMIT 1
    `);
    const row = (grpRows as any).rows[0] as { id: string; name: string } | undefined;
    if (!row) continue;

    const countRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM group_permissions WHERE group_id = ${row.id}
    `);
    const cnt = Number((countRows as any).rows[0]?.cnt ?? 0);

    if (cnt === 0 && perms.length > 0) {
      logger.warn(`[PERM_GROUPS_SEED] restoring ${perms.length} permissions for system group "${row.name}" (${roleKey})`);
      const unique = [...new Set(perms)];
      for (const permission of unique) {
        await db.execute(sql`
          INSERT INTO group_permissions (group_id, permission)
          VALUES (${row.id}, ${permission})
          ON CONFLICT (group_id, permission) DO NOTHING
        `);
      }
      totalRestored += unique.length;
    }
  }

  if (totalRestored > 0) {
    logger.info(`[PERM_GROUPS_SEED] restore complete — ${totalRestored} permissions restored`);
  }
}
