/**
 * accounting-event-logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * سجّل دائم لأحداث المحاسبة — يُستخدم في كل مسارات توليد القيود المحاسبية
 * وإكمالها لضمان رؤية كاملة لأي فشل أو حالة pending.
 *
 * الوظيفة الأساسية: logAcctEvent() — تكتب صفاً واحداً في accounting_event_log.
 * إذا فشلت الكتابة نفسها، تُسجَّل عبر logger فقط (لا ترفع exception).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export type AcctEventStatus =
  | "completed"
  | "failed"
  | "pending"
  | "needs_retry"
  | "blocked";

export interface AcctEventParams {
  sourceType:    string;
  sourceId:      string;
  eventType:     string;
  status:        AcctEventStatus;
  errorMessage?: string | null;
  journalEntryId?: string | null;
  userId?:       string | null;
}

/**
 * تسجيل حدث محاسبي — لا يرفع exception أبداً حتى لو فشل الإدراج.
 * آمن للاستخدام في مسارات fire-and-forget وخارج transactions.
 */
export async function logAcctEvent(params: AcctEventParams): Promise<string | null> {
  try {
    const result = await db.execute(sql`
      INSERT INTO accounting_event_log
        (event_type, source_type, source_id, posted_by_user,
         status, error_message, journal_entry_id,
         attempt_count, last_attempted_at, updated_at)
      VALUES
        (${params.eventType}, ${params.sourceType}, ${params.sourceId},
         ${params.userId ?? null}, ${params.status},
         ${params.errorMessage ?? null}, ${params.journalEntryId ?? null},
         1, NOW(), NOW())
      RETURNING id
    `);
    return ((result as any).rows[0]?.id as string) ?? null;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), params },
      "[ACCT_EVENT_LOG] Failed to write accounting event"
    );
    return null;
  }
}

/**
 * تحديث سجل حدث موجود — مفيد عند إعادة المحاولة.
 * آمن للاستخدام في مسارات fire-and-forget.
 */
export async function updateAcctEvent(
  eventId: string,
  status: AcctEventStatus,
  opts?: { errorMessage?: string | null; journalEntryId?: string | null },
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE accounting_event_log
      SET  status           = ${status},
           error_message    = ${opts?.errorMessage ?? null},
           journal_entry_id = COALESCE(${opts?.journalEntryId ?? null}, journal_entry_id),
           attempt_count    = attempt_count + 1,
           last_attempted_at = NOW(),
           updated_at       = NOW()
      WHERE id = ${eventId}
    `);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), eventId },
      "[ACCT_EVENT_LOG] Failed to update accounting event"
    );
  }
}
