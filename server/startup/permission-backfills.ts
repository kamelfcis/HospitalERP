/**
 * server/startup/permission-backfills.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * مزامنة الصلاحيات مع مجموعات النظام عند بدء التشغيل
 *
 *  • role → group sync (one-time)
 *  • cashier.open_shift
 *  • pharmacies.manage
 *  • tasks permissions
 *  • reception.view
 *  • bed_board / rooms / surgery_types
 *  • cashier.all_units → scope flag migration
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

type LogFn = (msg: string, source?: string) => void;

export async function runPermissionBackfills(log: LogFn): Promise<void> {
  // ── One-time role → group sync ────────────────────────────────────────────
  try {
    const [flagRow] = (await db.execute(sql`
      SELECT value FROM system_settings WHERE key = 'role_group_sync_done'
    `)).rows as { value: string }[];
    if (!flagRow) {
      const syncResult = await db.execute(sql`
        INSERT INTO group_permissions (group_id, permission)
        SELECT pg.id, rp.permission
        FROM permission_groups pg
        JOIN role_permissions rp ON rp.role = pg.system_key
        WHERE pg.system_key IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM group_permissions gp
            WHERE gp.group_id = pg.id AND gp.permission = rp.permission
          )
        ON CONFLICT DO NOTHING
      `);
      const count = (syncResult as any).rowCount ?? 0;
      await db.execute(sql`
        INSERT INTO system_settings (key, value) VALUES ('role_group_sync_done', 'true')
        ON CONFLICT (key) DO NOTHING
      `);
      log(`[STARTUP] one-time role→group sync: ${count} permission(s) added, flag set`);
    } else {
      log("[STARTUP] role→group sync already completed (flag set)");
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] role→group sync error");
  }

  // ── cashier.open_shift → system groups ────────────────────────────────────
  try {
    await db.execute(sql`
      INSERT INTO group_permissions (group_id, permission)
      SELECT pg.id, 'cashier.open_shift'
      FROM permission_groups pg
      WHERE pg.is_system = true
        AND pg.system_key IN ('cashier', 'owner', 'admin')
        AND NOT EXISTS (
          SELECT 1 FROM group_permissions gp
          WHERE gp.group_id = pg.id AND gp.permission = 'cashier.open_shift'
        )
    `);
    log("[STARTUP] cashier.open_shift permission backfilled to system groups");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] cashier.open_shift backfill error");
  }

  // ── pharmacies.manage → owner + admin ─────────────────────────────────────
  try {
    await db.execute(sql`
      INSERT INTO group_permissions (group_id, permission)
      SELECT pg.id, 'pharmacies.manage'
      FROM permission_groups pg
      WHERE pg.is_system = true
        AND pg.system_key IN ('owner', 'admin')
        AND NOT EXISTS (
          SELECT 1 FROM group_permissions gp
          WHERE gp.group_id = pg.id AND gp.permission = 'pharmacies.manage'
        )
    `);
    log("[STARTUP] pharmacies.manage permission backfilled to owner/admin groups");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] pharmacies.manage backfill error");
  }

  // ── tasks.view + tasks.create → all system groups, tasks.manage → owner/admin
  try {
    await db.execute(sql`
      INSERT INTO group_permissions (group_id, permission)
      SELECT pg.id, perms.p
      FROM permission_groups pg
      CROSS JOIN (VALUES ('tasks.view'), ('tasks.create')) AS perms(p)
      WHERE pg.is_system = true
        AND NOT EXISTS (
          SELECT 1 FROM group_permissions gp
          WHERE gp.group_id = pg.id AND gp.permission = perms.p
        )
    `);
    await db.execute(sql`
      INSERT INTO group_permissions (group_id, permission)
      SELECT pg.id, 'tasks.manage'
      FROM permission_groups pg
      WHERE pg.is_system = true
        AND pg.system_key IN ('owner', 'admin')
        AND NOT EXISTS (
          SELECT 1 FROM group_permissions gp
          WHERE gp.group_id = pg.id AND gp.permission = 'tasks.manage'
        )
    `);
    log("[STARTUP] tasks permissions backfilled to all system groups");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] tasks backfill error");
  }

  // ── reception.view → owner + admin + reception ────────────────────────────
  try {
    await db.execute(sql`
      INSERT INTO group_permissions (group_id, permission)
      SELECT pg.id, 'reception.view'
      FROM permission_groups pg
      WHERE pg.is_system = true
        AND pg.system_key IN ('owner', 'admin', 'reception')
        AND NOT EXISTS (
          SELECT 1 FROM group_permissions gp
          WHERE gp.group_id = pg.id AND gp.permission = 'reception.view'
        )
    `);
    log("[STARTUP] reception.view permission backfilled to owner/admin/reception groups");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] reception.view backfill error");
  }

  // ── bed_board / rooms / surgery_types → owner + admin (+ bed_board.view → reception)
  try {
    await db.execute(sql`
      INSERT INTO group_permissions (group_id, permission)
      SELECT pg.id, perms.p
      FROM permission_groups pg
      CROSS JOIN (VALUES ('bed_board.view'), ('rooms.manage'), ('surgery_types.manage')) AS perms(p)
      WHERE pg.is_system = true
        AND pg.system_key IN ('owner', 'admin')
        AND NOT EXISTS (
          SELECT 1 FROM group_permissions gp
          WHERE gp.group_id = pg.id AND gp.permission = perms.p
        )
    `);
    await db.execute(sql`
      INSERT INTO group_permissions (group_id, permission)
      SELECT pg.id, 'bed_board.view'
      FROM permission_groups pg
      WHERE pg.is_system = true
        AND pg.system_key = 'reception'
        AND NOT EXISTS (
          SELECT 1 FROM group_permissions gp
          WHERE gp.group_id = pg.id AND gp.permission = 'bed_board.view'
        )
    `);
    log("[STARTUP] bed_board/rooms/surgery_types permissions backfilled to system groups");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] bed_board/rooms/surgery backfill error");
  }

  // ── cashier.all_units → users.all_cashier_units scope flag migration ─────
  try {
    await db.execute(sql`
      UPDATE users u
      SET all_cashier_units = true
      FROM user_permissions up
      WHERE up.user_id = u.id
        AND up.permission = 'cashier.all_units'
        AND up.granted = true
        AND u.all_cashier_units = false
    `);
    await db.execute(sql`
      DELETE FROM user_permissions WHERE permission = 'cashier.all_units'
    `);
    log("[STARTUP] cashier.all_units migrated to users.all_cashier_units scope flag");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] cashier.all_units migration error");
  }
}
