import type { Express } from "express";
import { requireAuth, checkPermission }        from "./_auth";
import { PERMISSIONS }                         from "@shared/permissions";
import { logger }                              from "../lib/logger";
import { runAccountingRetryTick }              from "../lib/accounting-retry-worker";
import { retryOneAccountingEvent }             from "../services/accounting-event-retry-service";

export function registerAccountingEventsActionsRoutes(app: Express) {

  // POST /api/accounting/events/retry-batch — إعادة محاولة دُفعة تلقائياً
  app.post(
    "/api/accounting/events/retry-batch",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const actorUserId = req.session.userId as string;
        logger.info({ actorUserId }, "[ACCT_RETRY_BATCH] manual batch retry initiated");

        const result = await runAccountingRetryTick();

        logger.info({ actorUserId, ...result }, "[ACCT_RETRY_BATCH] batch retry complete");
        return res.json({
          success:   true,
          attempted: result.attempted,
          succeeded: result.succeeded,
          failed:    result.failed,
          skipped:   result.skipped,
          message:   `تمت إعادة المحاولة لـ ${result.attempted} حدث — نجح ${result.succeeded}، فشل ${result.failed}، تجاوزنا ${result.skipped}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, "[ACCT_RETRY_BATCH] batch retry error");
        return res.status(500).json({ message: msg });
      }
    },
  );

  // POST /api/accounting/events/:id/retry — إعادة محاولة حدث واحد بعينه
  app.post(
    "/api/accounting/events/:id/retry",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const { id }        = req.params;
        const actorUserId   = req.session.userId as string;

        const result = await retryOneAccountingEvent(id, actorUserId);

        if (!result.ok) {
          return res.status(result.status).json({ message: result.message });
        }

        const response: Record<string, unknown> = { success: true };
        if (result.journalEntryId) response.journalEntryId = result.journalEntryId;
        if (result.message)        response.message        = result.message;

        logger.info({ id, actorUserId, ...response }, "[ACCT_RETRY] complete");
        return res.json(response);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg, id: req.params.id }, "[ACCT_RETRY] failed");
        return res.status(500).json({ message: msg });
      }
    },
  );
}
