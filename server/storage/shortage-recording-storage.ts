import { pool } from "../db";
import type { RecordShortageParams } from "./shortage-types";

export async function recordShortage(params: RecordShortageParams): Promise<{
  recorded: boolean;
  reason?: string;
}> {
  const { itemId, warehouseId, requestedBy, sourceScreen, notes } = params;

  const dupCheck = await pool.query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM shortage_events
       WHERE item_id      = $1
         AND requested_by = $2
         AND requested_at > NOW() - INTERVAL '30 seconds'
     ) AS found`,
    [itemId, requestedBy]
  );
  if (dupCheck.rows[0]?.found) {
    return { recorded: false, reason: "duplicate" };
  }

  await pool.query(
    `INSERT INTO shortage_events (item_id, warehouse_id, requested_by, source_screen, notes, requested_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [itemId, warehouseId ?? null, requestedBy, sourceScreen, notes ?? null]
  );

  await pool.query(
    `INSERT INTO shortage_agg (
       item_id,
       request_count,
       recent_request_count,
       first_requested_at,
       last_requested_at,
       requesting_warehouse_ids,
       is_resolved,
       refreshed_at
     )
     VALUES (
       $1,
       1,
       1,
       NOW(),
       NOW(),
       CASE WHEN $2::text IS NOT NULL THEN jsonb_build_array($2)::text ELSE '[]' END,
       false,
       NOW()
     )
     ON CONFLICT (item_id) DO UPDATE SET
       request_count        = shortage_agg.request_count + 1,
       recent_request_count = (
         SELECT COUNT(*)::int
         FROM   shortage_events
         WHERE  item_id      = $1
           AND  requested_at > NOW() - INTERVAL '7 days'
       ),
       last_requested_at    = NOW(),
       requesting_warehouse_ids = (
         SELECT COALESCE(
           (SELECT json_agg(DISTINCT warehouse_id)::text
            FROM   shortage_events
            WHERE  item_id      = $1
              AND  warehouse_id IS NOT NULL),
           '[]'
         )
       ),
       is_resolved          = false,
       refreshed_at         = NOW()`,
    [itemId, warehouseId ?? null]
  );

  return { recorded: true };
}

export async function resolveShortage(
  itemId: string,
  resolvedBy: string
): Promise<void> {
  await pool.query(
    `UPDATE shortage_agg
     SET is_resolved = true, resolved_at = NOW(), resolved_by = $2, refreshed_at = NOW()
     WHERE item_id = $1`,
    [itemId, resolvedBy]
  );
}
