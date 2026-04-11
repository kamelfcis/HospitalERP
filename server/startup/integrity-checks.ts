/**
 * server/startup/integrity-checks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * فحوصات سلامة البيانات عند بدء التشغيل (غير مُوقِفة — تسجّل تحذيرات فقط)
 *
 *  • cashier status-mismatch
 *  • auto-post credit GL journals
 *  • patient invoice GL integrity
 *  • oversell / deferred cost integrity
 *  • stay engine visibility
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { pool } from "../db";
import { logger } from "../lib/logger";

type LogFn = (msg: string, source?: string) => void;

export async function runIntegrityChecks(log: LogFn): Promise<void> {
  // ── Cashier status-mismatch check ─────────────────────────────────────────
  try {
    const mismatch1 = await pool.query<{ id: string; invoice_number: number; issue: string }>(`
      SELECT sih.id, sih.invoice_number, 'collected_no_receipt' AS issue
      FROM sales_invoice_headers sih
      WHERE sih.status = 'collected'
        AND sih.is_return = false
        AND sih.customer_type != 'delivery'
        AND NOT EXISTS (SELECT 1 FROM cashier_receipts cr WHERE cr.invoice_id = sih.id)
      LIMIT 20
    `);
    const mismatch2 = await pool.query<{ id: string; invoice_number: number; issue: string }>(`
      SELECT sih.id, sih.invoice_number, 'return_collected_no_refund' AS issue
      FROM sales_invoice_headers sih
      WHERE sih.status = 'collected'
        AND sih.is_return = true
        AND sih.customer_type != 'credit'
        AND NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)
      LIMIT 20
    `);
    const all = [...mismatch1.rows, ...mismatch2.rows];
    if (all.length > 0) {
      for (const row of all) {
        logger.warn(
          { event: "STATUS_MISMATCH", invoiceId: row.id, invoiceNumber: row.invoice_number, issue: row.issue },
          "[CASHIER_INTEGRITY] invoice status mismatch — investigate with GET /api/admin/cashier-consistency",
        );
      }
    } else {
      logger.info("[STARTUP] cashier status-mismatch check: CLEAN");
    }
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] cashier mismatch check skipped");
  }

  // ── Auto-post draft GL journals for credit invoices/returns ──────────────
  try {
    const { rowCount } = await pool.query(`
      UPDATE journal_entries je
      SET status = 'posted'
      WHERE je.status = 'draft'
        AND je.source_type IN ('sales_invoice', 'sales_return')
        AND EXISTS (
          SELECT 1 FROM sales_invoice_headers sih
          WHERE sih.id = je.source_document_id
            AND sih.customer_type = 'credit'
        )
        AND je.total_debit::numeric > 0
        AND ABS(je.total_debit::numeric - je.total_credit::numeric) < 0.01
    `);
    const affected = rowCount ?? 0;
    logger.info({ count: affected }, "[STARTUP] auto-post credit (آجل) GL journals: done");
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] auto-post credit journals skipped");
  }

  // ── Patient Invoice GL integrity check ────────────────────────────────────
  try {
    const { rows: glFailRows } = await pool.query<{
      count: string; sample: string;
    }>(`
      SELECT
        COUNT(*)::text                                                        AS count,
        STRING_AGG(invoice_number::text, ', ' ORDER BY finalized_at DESC)    AS sample
      FROM (
        SELECT invoice_number, finalized_at
        FROM patient_invoice_headers
        WHERE status       = 'finalized'
          AND journal_status IN ('failed', 'needs_retry')
        ORDER BY finalized_at DESC
        LIMIT 10
      ) t
    `);
    const glFailCount = parseInt(glFailRows[0]?.count || "0");

    const { rows: glNoneRows } = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM patient_invoice_headers
      WHERE status        = 'finalized'
        AND (journal_status IS NULL OR journal_status = 'none')
    `);
    const glNoneCount = parseInt(glNoneRows[0]?.count || "0");

    if (glFailCount > 0) {
      logger.warn(
        {
          event:          "PATIENT_GL_FAILED",
          count:          glFailCount,
          sampleInvoices: glFailRows[0]?.sample,
          actionRequired: "Open Account Mappings page → ensure 'receivables' account is configured → retry from Accounting Events",
        },
        `[PATIENT_INTEGRITY] ${glFailCount} patient invoice(s) failed GL journal generation — action required: configure receivables account in Account Mappings page and retry`,
      );
    } else {
      logger.info("[STARTUP] patient GL integrity check: no failed journals");
    }

    if (glNoneCount > 0) {
      logger.info(
        { count: glNoneCount },
        `[PATIENT_INTEGRITY] ${glNoneCount} finalized patient invoice(s) with journal_status='none' (pre-GL or awaiting mapping) — if journals are expected, verify Account Mappings (receivables) are configured`,
      );
    }
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] patient GL check skipped");
  }

  // ── Oversell (Deferred Cost) integrity check ─────────────────────────────
  try {
    const { rows: oversellRows } = await pool.query<{
      pending_count: string; orphan_count: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE psa.status IN ('pending','partially_resolved')) AS pending_count,
        COUNT(*) FILTER (
          WHERE psa.status IN ('pending','partially_resolved')
            AND pih.status = 'cancelled'
        ) AS orphan_count
      FROM pending_stock_allocations psa
      JOIN patient_invoice_headers pih ON pih.id = psa.invoice_id
    `);
    const pendingCount = parseInt(oversellRows[0]?.pending_count || "0");
    const orphanCount  = parseInt(oversellRows[0]?.orphan_count || "0");

    if (orphanCount > 0) {
      logger.warn(
        { orphanCount },
        `[OVERSELL_INTEGRITY] ${orphanCount} orphan allocation(s) linked to cancelled invoices — run /api/oversell/integrity for details`
      );
    }
    if (pendingCount > 0) {
      logger.info(
        { pendingCount },
        `[OVERSELL_INTEGRITY] ${pendingCount} active pending allocation(s) — resolve via /oversell-resolution`
      );
    } else {
      logger.info("[OVERSELL_INTEGRITY] no active pending allocations — clean");
    }
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] oversell integrity check skipped");
  }

  // ── Stay Engine visibility check ──────────────────────────────────────────
  try {
    const { rows: segRows } = await pool.query<{
      active_count: string; oldest_started: string | null;
    }>(`
      SELECT COUNT(*)::text AS active_count,
             MIN(started_at)::text AS oldest_started
      FROM stay_segments WHERE status = 'ACTIVE'
    `);
    const activeSegs = parseInt(segRows[0]?.active_count || "0");

    const { rows: lineRows } = await pool.query<{ last_accrual_at: string | null }>(`
      SELECT MAX(created_at)::text AS last_accrual_at
      FROM patient_invoice_lines
      WHERE source_type = 'STAY_ENGINE'
    `);
    const lastAccrualAt = lineRows[0]?.last_accrual_at ?? null;
    const hoursSince = lastAccrualAt
      ? Math.floor((Date.now() - new Date(lastAccrualAt).getTime()) / 3_600_000)
      : null;

    if (activeSegs === 0) {
      logger.info("[STARTUP] stay engine: no active segments");
    } else if (hoursSince !== null && hoursSince > 2) {
      logger.warn(
        {
          event:               "STAY_ENGINE_STALE",
          activeSegments:      activeSegs,
          oldestStartedAt:     segRows[0]?.oldest_started,
          lastAccrualAt,
          hoursSinceLastLine:  hoursSince,
          hint:                "Check runtime logs for [STAY_ENGINE] accrual failed — likely a missing DB constraint on patient_invoice_lines",
        },
        `[STAY_ENGINE] ${activeSegs} active segment(s) but last accrual was ${hoursSince}h ago — engine may be silently failing. Check logs for constraint errors.`,
      );
    } else {
      logger.info(
        { activeSegments: activeSegs, lastAccrualAt },
        `[STARTUP] stay engine: ${activeSegs} active segment(s), last accrual OK`,
      );
    }
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] stay engine visibility check skipped");
  }
}
