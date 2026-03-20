/**
 * accounting-event-logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * سجّل دائم لأحداث المحاسبة — يُستخدم في كل مسارات توليد القيود المحاسبية
 * وإكمالها لضمان رؤية كاملة لأي فشل أو حالة pending.
 *
 * logAcctEvent() — upsert عند وجود (event_type, source_type, source_id):
 *   • إذا كانت الحالة الحالية "completed" لن تُحدَّث (لا رجوع عن الاكتمال)
 *   • في جميع الحالات الأخرى تُحدَّث الحالة والرسالة والعدد
 *
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
  sourceType:      string;
  sourceId:        string;
  eventType:       string;
  status:          AcctEventStatus;
  errorMessage?:   string | null;
  journalEntryId?: string | null;
  userId?:         string | null;
  /** Override auto-computed next_retry_at. Pass null to clear. */
  nextRetryAt?:    Date | null;
}

/** Maximum auto-retry attempts before an event is permanently stuck */
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Exponential backoff for next retry (capped at 24 h):
 *  attempt 1 →  2 min | 2 → 4 min | 3 → 8 min | 4 → 16 min | 5 → 32 min …
 */
export function computeNextRetryAt(attemptCount: number): Date {
  const delayMs = Math.min(Math.pow(2, attemptCount) * 60_000, 24 * 60 * 60_000);
  return new Date(Date.now() + delayMs);
}

/**
 * تسجيل حدث محاسبي — لا يرفع exception أبداً حتى لو فشل الإدراج.
 *
 * عند توفر (source_type + source_id) يستخدم UPSERT بناءً على الفهرس الفريد
 * idx_ael_dedup (event_type, source_type, source_id) لمنع التكرار:
 *   - إذا كانت الحالة الحالية "completed" → لا تُعدِّل (completed لا يُراجَع)
 *   - غير ذلك → حدِّث الحالة والخطأ والعدد
 *
 * في حالة NULL source (أحداث OPD القديمة) يُنفَّذ INSERT عادي.
 */
export async function logAcctEvent(params: AcctEventParams): Promise<string | null> {
  try {
    let result: unknown;

    // next_retry_at: caller override wins; otherwise auto-compute for failure statuses
    const nra: Date | null =
      params.nextRetryAt !== undefined
        ? params.nextRetryAt
        : (params.status === "failed" || params.status === "needs_retry")
          ? computeNextRetryAt(1)
          : null;

    if (params.sourceType && params.sourceId) {
      // ── Upsert مع منع الكتابة فوق "completed" ──────────────────────────
      result = await db.execute(sql`
        INSERT INTO accounting_event_log
          (event_type, source_type, source_id, posted_by_user,
           status, error_message, journal_entry_id,
           attempt_count, last_attempted_at, next_retry_at, updated_at)
        VALUES
          (${params.eventType}, ${params.sourceType}, ${params.sourceId},
           ${params.userId ?? null}, ${params.status},
           ${params.errorMessage ?? null}, ${params.journalEntryId ?? null},
           1, NOW(), ${nra?.toISOString() ?? null}, NOW())
        ON CONFLICT (event_type, source_type, source_id)
        DO UPDATE SET
          status           = CASE
                               WHEN accounting_event_log.status = 'completed' THEN 'completed'
                               ELSE EXCLUDED.status
                             END,
          error_message    = CASE
                               WHEN accounting_event_log.status = 'completed' THEN accounting_event_log.error_message
                               ELSE EXCLUDED.error_message
                             END,
          journal_entry_id = COALESCE(EXCLUDED.journal_entry_id, accounting_event_log.journal_entry_id),
          next_retry_at    = CASE
                               WHEN accounting_event_log.status = 'completed' THEN NULL
                               WHEN EXCLUDED.status IN ('failed', 'needs_retry')
                                 THEN NOW() + (POWER(2, accounting_event_log.attempt_count + 1)::int * INTERVAL '1 minute')
                               ELSE NULL
                             END,
          attempt_count    = accounting_event_log.attempt_count + 1,
          last_attempted_at = NOW(),
          updated_at       = NOW()
        RETURNING id
      `);
    } else {
      // ── INSERT عادي للأحداث التي لا تحمل source_id (مثل OPD) ──────────
      result = await db.execute(sql`
        INSERT INTO accounting_event_log
          (event_type, source_type, source_id, posted_by_user,
           status, error_message, journal_entry_id,
           attempt_count, last_attempted_at, next_retry_at, updated_at)
        VALUES
          (${params.eventType}, ${(params as any).sourceType ?? null}, ${(params as any).sourceId ?? null},
           ${params.userId ?? null}, ${params.status},
           ${params.errorMessage ?? null}, ${params.journalEntryId ?? null},
           1, NOW(), ${nra?.toISOString() ?? null}, NOW())
        RETURNING id
      `);
    }

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
           next_retry_at    = CASE
                                WHEN ${status} IN ('failed', 'needs_retry')
                                  THEN NOW() + (POWER(2, attempt_count + 1)::int * INTERVAL '1 minute')
                                ELSE NULL
                              END,
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
