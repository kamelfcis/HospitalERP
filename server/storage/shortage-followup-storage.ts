import { pool } from "../db";
import type { FollowupRecord } from "./shortage-types";

const DEFAULT_SUPPLIER_FOLLOWUP_DAYS = 2;

export async function markOrderedFromSupplier(
  itemId:   string,
  actionBy: string,
  notes?:   string | null
): Promise<FollowupRecord | { alreadyActive: true; followup: FollowupRecord }> {
  const existing = await pool.query<{
    id: string; item_id: string; action_type: string;
    action_at: Date; follow_up_due_date: Date;
  }>(
    `SELECT id, item_id, action_type, action_at, follow_up_due_date
     FROM shortage_followups
     WHERE item_id     = $1
       AND action_type = 'ordered_from_supplier'
       AND follow_up_due_date > NOW()
     ORDER BY action_at DESC
     LIMIT 1`,
    [itemId]
  );

  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    return {
      alreadyActive: true,
      followup: {
        id:              r.id,
        itemId:          r.item_id,
        actionType:      r.action_type,
        actionAt:        r.action_at.toISOString(),
        followUpDueDate: r.follow_up_due_date.toISOString(),
      },
    };
  }

  const result = await pool.query<{
    id: string;
    item_id: string;
    action_type: string;
    action_at: Date;
    follow_up_due_date: Date;
  }>(
    `INSERT INTO shortage_followups
       (item_id, action_type, action_at, action_by, follow_up_due_date, notes)
     VALUES (
       $1,
       'ordered_from_supplier',
       NOW(),
       $2,
       NOW() + INTERVAL '${DEFAULT_SUPPLIER_FOLLOWUP_DAYS} days',
       $3
     )
     RETURNING id, item_id, action_type, action_at, follow_up_due_date`,
    [itemId, actionBy, notes ?? null]
  );
  const r = result.rows[0];
  return {
    id:              r.id,
    itemId:          r.item_id,
    actionType:      r.action_type,
    actionAt:        r.action_at.toISOString(),
    followUpDueDate: r.follow_up_due_date.toISOString(),
  };
}

export async function markReceived(
  itemId:   string,
  actionBy: string
): Promise<FollowupRecord> {
  const result = await pool.query<{
    id: string; item_id: string; action_type: string;
    action_at: Date; follow_up_due_date: Date;
  }>(
    `INSERT INTO shortage_followups
       (item_id, action_type, action_at, action_by, follow_up_due_date, notes)
     VALUES ($1, 'received', NOW(), $2, NOW(), NULL)
     RETURNING id, item_id, action_type, action_at, follow_up_due_date`,
    [itemId, actionBy]
  );

  await pool.query(
    `UPDATE shortage_followups
     SET follow_up_due_date = NOW()
     WHERE item_id     = $1
       AND action_type = 'ordered_from_supplier'
       AND follow_up_due_date > NOW()`,
    [itemId]
  );

  await pool.query(
    `UPDATE shortage_agg
     SET is_resolved = true, resolved_at = NOW(), resolved_by = $2, refreshed_at = NOW()
     WHERE item_id = $1`,
    [itemId, actionBy]
  );

  const r = result.rows[0];
  return {
    id:              r.id,
    itemId:          r.item_id,
    actionType:      r.action_type,
    actionAt:        r.action_at.toISOString(),
    followUpDueDate: r.follow_up_due_date.toISOString(),
  };
}

export async function undoOrderedFromSupplier(
  followupId: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM shortage_followups
     WHERE id          = $1
       AND action_type = 'ordered_from_supplier'`,
    [followupId]
  );
  return (result.rowCount ?? 0) > 0;
}
