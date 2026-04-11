/**
 * server/startup/cron.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * المهام الخلفية الدورية (background workers)
 *
 *  • Stay Engine — كل 5 دقائق
 *  • Journal Retry (legacy — sales_invoice only) — كل 5 دقائق
 *  • Accounting Event Retry — كل 7 دقائق
 *  • RPT Refresh (patient visit + classification) — كل 15 دقيقة
 *  • Inventory Snapshot + Item Movements — كل 15 دقيقة
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { storage } from "../storage";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { runAccountingRetryTick } from "../lib/accounting-retry-worker";
import { logger } from "../lib/logger";

type LogFn = (msg: string, source?: string) => void;

export function startCronJobs(log: LogFn): void {
  // ── Stay Engine: every 5 minutes ──────────────────────────────────────────
  const STAY_TICK_MS = 5 * 60 * 1000;
  const runStayTick = async () => {
    try {
      const result = await storage.accrueStayLines();
      if (result.segmentsProcessed > 0 || result.linesUpserted > 0) {
        log(`[STAY_ENGINE] tick: ${result.segmentsProcessed} segments, ${result.linesUpserted} lines upserted`);
      }
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STAY_ENGINE] tick error");
    }
  };
  setTimeout(runStayTick, 5000);
  setInterval(runStayTick, STAY_TICK_MS);

  // ── Journal Retry: every 5 minutes (legacy — sales_invoice only) ──────────
  const JOURNAL_RETRY_MS = 5 * 60 * 1000;
  const runJournalRetry = async () => {
    try {
      const result = await storage.retryFailedJournals();
      if (result.total > 0) {
        log(`[JOURNAL_RETRY] attempted=${result.total} succeeded=${result.succeeded} failed=${result.failed}`);
      }
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[JOURNAL_RETRY] tick error");
    }
  };
  setTimeout(runJournalRetry, 15000);
  setInterval(runJournalRetry, JOURNAL_RETRY_MS);

  // ── Accounting Event Retry: every 7 minutes ──────────────────────────────
  const ACCT_RETRY_MS = 7 * 60 * 1000;
  const runAcctRetry = async () => {
    try {
      const result = await runAccountingRetryTick();
      if (result.attempted > 0) {
        log(`[ACCT_RETRY_WORKER] attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed} skipped=${result.skipped}`);
      }
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[ACCT_RETRY_WORKER] tick error");
    }
  };
  setTimeout(runAcctRetry, 20000);
  setInterval(runAcctRetry, ACCT_RETRY_MS);

  // ── RPT Refresh: every 15 minutes ─────────────────────────────────────────
  const RPT_REFRESH_MS  = 15 * 60 * 1000;
  const SNAP_REFRESH_MS = 15 * 60 * 1000;

  const runRptRefresh = (trigger: "startup" | "polling") => async () => {
    try {
      await runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), trigger);
    } catch {}
  };
  setTimeout(runRptRefresh("startup"), 10000);
  setInterval(runRptRefresh("polling"), RPT_REFRESH_MS);

  const runVisitClassRefresh = (trigger: "startup" | "polling") => async () => {
    try {
      await runRefresh(REFRESH_KEYS.PATIENT_VISIT_CLASS, () => storage.refreshPatientVisitClassification(), trigger);
    } catch {}
  };
  setTimeout(runVisitClassRefresh("startup"), 11000);
  setInterval(runVisitClassRefresh("polling"), RPT_REFRESH_MS);

  const runSnapRefresh = (trigger: "startup" | "polling") => async () => {
    try {
      await Promise.all([
        runRefresh(REFRESH_KEYS.INVENTORY_SNAP,  () => storage.refreshInventorySnapshot(),     trigger),
        runRefresh(REFRESH_KEYS.ITEM_MOVEMENTS,  () => storage.refreshItemMovementsSummary(), trigger),
      ]);
    } catch {}
  };
  setTimeout(runSnapRefresh("startup"), 12000);
  setInterval(runSnapRefresh("polling"), SNAP_REFRESH_MS);
}
