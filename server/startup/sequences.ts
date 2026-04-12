/**
 * server/startup/sequences.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * مزامنة تسلسلات الأرقام (sequences) عند بدء التشغيل
 *
 *  • journal_entry_number_seq
 *  • handover_receipt_num_seq
 *  • delivery_receipt_number_seq
 *  • customer_receipt_number_seq
 *  • admission_number_seq
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

type LogFn = (msg: string, source?: string) => void;

export async function syncSequences(log: LogFn): Promise<void> {
  // ── Journal entry number sequence ─────────────────────────────────────────
  try {
    await db.execute(sql`
      SELECT setval(
        'journal_entry_number_seq',
        COALESCE((SELECT MAX(entry_number) FROM journal_entries), 0) + 1,
        false
      )
    `);
    log("[STARTUP] journal_entry_number_seq synced");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] sequence sync error");
  }

  // ── Handover receipt sequence (creates sequence + backfills nulls) ────────
  try {
    await db.execute(sql`
      CREATE SEQUENCE IF NOT EXISTS handover_receipt_num_seq START WITH 1 INCREMENT BY 1
    `);
    await db.execute(sql`
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS handover_receipt_number INTEGER
    `);
    await db.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(closed_at, opened_at) ASC) AS rn
        FROM cashier_shifts WHERE handover_receipt_number IS NULL
      )
      UPDATE cashier_shifts cs
      SET handover_receipt_number = ranked.rn
      FROM ranked WHERE cs.id = ranked.id
    `);
    await db.execute(sql`
      SELECT setval(
        'handover_receipt_num_seq',
        COALESCE((SELECT MAX(handover_receipt_number) FROM cashier_shifts), 0) + 1,
        false
      )
    `);
    log("[STARTUP] handover_receipt_num_seq synced");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] handover receipt seq error");
  }

  // ── Delivery receipt number sequence ──────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE SEQUENCE IF NOT EXISTS delivery_receipt_number_seq START WITH 1 INCREMENT BY 1
    `);
    await db.execute(sql`
      SELECT setval(
        'delivery_receipt_number_seq',
        COALESCE((SELECT MAX(receipt_number) FROM delivery_receipts), 0) + 1,
        false
      )
    `);
    log("[STARTUP] delivery_receipt_number_seq synced");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] delivery receipt seq error");
  }

  // ── Customer receipt number sequence ──────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE SEQUENCE IF NOT EXISTS customer_receipt_number_seq START WITH 1 INCREMENT BY 1
    `);
    await db.execute(sql`
      SELECT setval(
        'customer_receipt_number_seq',
        COALESCE((SELECT MAX(receipt_number) FROM customer_receipts), 0) + 1,
        false
      )
    `);
    log("[STARTUP] customer_receipt_number_seq synced");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] customer receipt seq error");
  }

  // ── Admission number sequence ──────────────────────────────────────────────
  // يحل محل MAX() الذي يسبب race condition عند دخول متزامن من أقسام متعددة
  try {
    await db.execute(sql`
      CREATE SEQUENCE IF NOT EXISTS admission_number_seq START WITH 1 INCREMENT BY 1
    `);
    await db.execute(sql`
      SELECT setval(
        'admission_number_seq',
        COALESCE(
          (SELECT MAX(CAST(NULLIF(regexp_replace(admission_number, '[^0-9]', '', 'g'), '') AS INTEGER)) FROM admissions),
          0
        ) + 1,
        false
      )
    `);
    log("[STARTUP] admission_number_seq synced");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] admission_number_seq error");
  }
}
