/**
 * server/index.ts — نقطة دخول الخادم
 *
 * يُطبِّق:
 *  ✓ التحقق من المتغيرات البيئية عند بدء التشغيل
 *  ✓ Request Correlation ID لكل طلب
 *  ✓ GET /health بدون مصادقة (يُعيد 503 أثناء الإغلاق)
 *  ✓ Pool مُضبَّط مع statement_timeout
 *  ✓ Graceful Shutdown (SIGTERM / SIGINT)
 *  ✓ Structured logging عبر pino
 */

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import compression from "compression";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { seedPermissionGroups } from "./lib/permission-groups-seed";
import { perfRequestMiddleware, registerMonitoringRoutes, requestContextStore } from "./monitoring";
import { loadSettings } from "./settings-cache";
import { storage } from "./storage";
import { db, pool, testDbConnection } from "./db";
import { sql } from "drizzle-orm";
import { runRefresh, REFRESH_KEYS } from "./lib/rpt-refresh-orchestrator";
import { logger } from "./lib/logger";
import { runAccountingRetryTick } from "./lib/accounting-retry-worker";

// ── Module augmentations ──────────────────────────────────────────────────────
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
    requestId: string;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: string;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Startup Validation
// Fails fast with a clear message before binding any port.
// ─────────────────────────────────────────────────────────────────────────────
const KNOWN_DEFAULT_SECRET = "hospital-gl-session-secret";
const isProd = process.env.NODE_ENV === "production";

(function validateEnv() {
  const errors: string[] = [];

  // DATABASE_URL validated in db.ts (throws immediately)
  // Here we add belt-and-suspenders for SESSION_SECRET in production
  if (isProd) {
    if (!process.env.SESSION_SECRET) {
      errors.push("SESSION_SECRET is not set — sessions will be insecure");
    } else if (process.env.SESSION_SECRET === KNOWN_DEFAULT_SECRET) {
      errors.push("SESSION_SECRET is using the known default value — change it in production");
    }
  }

  if (errors.length > 0) {
    for (const e of errors) {
      logger.fatal({ env: "production" }, `[FATAL STARTUP] ${e}`);
    }
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Graceful Shutdown State
// isShuttingDown → /health returns 503, new requests get 503
// ─────────────────────────────────────────────────────────────────────────────
let isShuttingDown = false;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Express App + HTTP Server
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);

// ── Compression ───────────────────────────────────────────────────────────────
app.use(compression({ threshold: 1024 }));

// ── JSON body parsing ─────────────────────────────────────────────────────────
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// ── Request Correlation ID ────────────────────────────────────────────────────
// Generates a unique requestId per request, attaches to req and response header,
// and is propagated through the AsyncLocalStorage context.
app.use((req: Request, res: Response, next: NextFunction) => {
  const id = (req.headers["x-request-id"] as string) || randomUUID().substring(0, 8);
  (req as any).requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
});

// ── /health — UNPROTECTED, before session + auth ──────────────────────────────
// Lightweight: only status, db, uptime, version — no internal details in prod.
// Returns 503 during graceful shutdown so load balancers stop routing traffic.
app.get("/health", async (_req: Request, res: Response) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: "shutting_down", db: "unknown", uptime: Math.round(process.uptime()) });
  }
  try {
    await pool.query("SELECT 1");
    res.json({
      status:  "ok",
      db:      "ok",
      uptime:  Math.round(process.uptime()),
      version: process.env.npm_package_version || "1.0.0",
    });
  } catch {
    res.status(503).json({
      status:  "error",
      db:      "unreachable",
      uptime:  Math.round(process.uptime()),
      version: process.env.npm_package_version || "1.0.0",
    });
  }
});

// ── Sessions ──────────────────────────────────────────────────────────────────
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      conString:            process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret:           process.env.SESSION_SECRET || KNOWN_DEFAULT_SECRET,
    resave:           false,
    saveUninitialized: false,
    cookie: {
      maxAge:   24 * 60 * 60 * 1000,
      httpOnly: true,
      secure:   false,
      sameSite: "lax",
    },
  })
);

// ── Performance monitoring middleware ─────────────────────────────────────────
// Correlation ID is already on req.requestId when this runs — monitoring.ts
// picks it up inside requestContextStore.run() when creating the ctx object.
app.use(perfRequestMiddleware(500));

// ── Global API Auth Guard ─────────────────────────────────────────────────────
const API_PUBLIC_PATHS = ["/auth/login", "/auth/logout", "/auth/me"];
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (API_PUBLIC_PATHS.includes(req.path)) return next();
  if (!req.session.userId) {
    return res.status(401).json({ message: "يجب تسجيل الدخول" });
  }
  next();
});

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path  = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api") || path === "/health") {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      log(`${req.method} ${path}${qs} ${res.statusCode} in ${duration}ms`, "express");
    }
  });

  next();
});

// ── Backward-compatible log() wrapper ─────────────────────────────────────────
// Keeps the same signature as the original function — callers need no changes.
export function log(message: string, source = "express"): void {
  logger.info({ source }, message);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "[SHUTDOWN] received signal — starting graceful shutdown");

  // Phase 1: Stop accepting new connections (/health now returns 503).
  // Wait for in-flight requests to finish BEFORE closing the DB pool.
  // A race between pool.end() and active DB queries is the critical bug this fixes.
  const DRAIN_TIMEOUT_MS = SHUTDOWN_TIMEOUT_MS - 1_000; // 9s drain, 1s for pool close
  await new Promise<void>((resolve) => {
    const drainTimer = setTimeout(() => {
      logger.warn("[SHUTDOWN] drain timeout — proceeding to pool close with active connections");
      resolve();
    }, DRAIN_TIMEOUT_MS);

    httpServer.close((err) => {
      clearTimeout(drainTimer);
      if (err) {
        logger.error({ err: err.message }, "[SHUTDOWN] error closing HTTP server");
      } else {
        logger.info("[SHUTDOWN] HTTP server drained — all in-flight requests complete");
      }
      resolve();
    });
  });

  // Phase 2: Now it is safe to close the DB pool — no active requests remain.
  try {
    await pool.end();
    logger.info("[SHUTDOWN] DB pool closed");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[SHUTDOWN] error closing DB pool");
  }

  logger.info("[SHUTDOWN] graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: Main async startup
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  // ── 5a. DB connection test ────────────────────────────────────────────────
  try {
    await testDbConnection();
    logger.info("[STARTUP] database connection verified");
  } catch (err: unknown) {
    logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "[FATAL STARTUP] cannot connect to database");
    process.exit(1);
  }

  // ── 5b. Optional seed ─────────────────────────────────────────────────────
  if (process.env.RUN_SEED === "true") {
    try {
      await seedDatabase();
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, "[STARTUP] seed notice");
    }
  }

  // ── 5b-2. Permission Groups seed (idempotent — skips if already seeded) ──
  try {
    await seedPermissionGroups();
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "[STARTUP] permission groups seed warning");
  }

  // ── 5b-3. Cashier status-mismatch check (soft warning) ───────────────────
  // Detects STATUS_MISMATCH anomalies: invoices whose status disagrees with
  // the receipt tables. These are silent data anomalies that would NOT appear
  // in ghost-invoice detection but would cause UI/collection discrepancies.
  // Logs WARN only — never crashes startup.
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
        -- مرتجع الآجل يُغلق بـ collected مباشرة بدون إيصال صرف كاشير — هذا السلوك المقصود
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

  // ── 5b-3b. Auto-post draft GL journals for credit invoices/returns ─────────
  // Credit invoices (آجل) should have status='posted' immediately — no cashier step.
  // Any existing 'draft' journals linked to credit invoices/returns are stale
  // (created before the posted-immediately rule was introduced) and safe to post now,
  // provided their lines are balanced (totalDebit == totalCredit).
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

  // ── 5b-4. Patient Invoice GL integrity check ──────────────────────────────
  // Detects finalized patient invoices whose GL journal generation failed or
  // was never attempted. Root cause is almost always missing Account Mappings
  // (especially the receivables account). Logs WARN — never crashes startup.
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

  // ── 5b-5. Stay Engine visibility check ───────────────────────────────────
  // Non-blocking startup snapshot: active segments + last accrual timestamp.
  // If last accrual is stale (>2h) while segments are active, the engine is
  // likely failing silently — check runtime logs for STAY_ENGINE errors.
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

  // ── 5c. System settings ───────────────────────────────────────────────────
  try {
    await loadSettings();
    logger.info("[STARTUP] system settings loaded into cache");
  } catch {
    logger.warn("[STARTUP] system settings table not yet available — will retry after schema sync");
  }

  // ── 5d. Register routes ───────────────────────────────────────────────────
  await registerRoutes(httpServer, app);
  registerMonitoringRoutes(app);

  // ── 5e. Global error handler ──────────────────────────────────────────────
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status  = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error({
      requestId: (req as any).requestId,
      status,
      err:       err.message,
      stack:     status >= 500 ? err.stack : undefined,
    }, "Internal Server Error");

    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  // ── 5f. Static / Vite ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ── 5g. Journal sequence sync ─────────────────────────────────────────────
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

  // ── 5g2. Handover receipt sequence sync (creates sequence + backfills nulls) ─
  try {
    await db.execute(sql`
      CREATE SEQUENCE IF NOT EXISTS handover_receipt_num_seq START WITH 1 INCREMENT BY 1
    `);
    await db.execute(sql`
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS handover_receipt_number INTEGER
    `);
    // بكفيل الورديات المغلقة بدون أرقام ترتيباً حسب تاريخ الإغلاق
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

  // ── 5g3. Delivery receipt number sequence ────────────────────────────────
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

  // ── 5g4. Customer receipt number sequence ────────────────────────────────
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

  // ── 5h-pre. DB-level hardening for cashier_collection journals ───────────
  try {
    // Add 'failed' enum value if not already present (idempotent — safe every boot)
    await db.execute(sql`ALTER TYPE journal_status ADD VALUE IF NOT EXISTS 'failed'`);
    // Partial unique index — prevents race-condition duplicate cashier_collection journals
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_je_cashier_collection_dedup
      ON journal_entries (source_document_id)
      WHERE source_type = 'cashier_collection'
    `);
    log("[STARTUP] journal_status 'failed' + idx_je_cashier_collection_dedup ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] cashier_collection hardening error");
  }

  // ── 5h-bis. Performance indexes (FEFO, journals, permissions) ────────────
  try {
    // inventory_lots: remove exact duplicate index (identical to idx_lots_item_warehouse_expiry)
    try { await db.execute(sql`DROP INDEX IF EXISTS idx_lots_item_warehouse_expiry_month`); } catch { /* ignore lock errors */ }
    // inventory_lots: FEFO covering index — item+warehouse prefix, FEFO sort columns, active lots only
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_lots_fefo
      ON inventory_lots (item_id, warehouse_id, expiry_year NULLS FIRST, expiry_month NULLS FIRST, received_date)
      WHERE is_active = true
    `);
    // journal_entries: source_type + date for list filter queries
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_je_source_type_date
      ON journal_entries (source_type, entry_date DESC)
    `);
    // journal_entries: GIN trigram for ILIKE search on description field
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_je_description_trgm
      ON journal_entries USING gin (description gin_trgm_ops)
    `);
    // purchase_invoice_headers: supplier + date (non-cancelled invoices only)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pi_supplier_date
      ON purchase_invoice_headers (supplier_id, invoice_date DESC)
      WHERE status != 'cancelled'
    `);
    // users: permission_group_id lookup (active users only)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_users_group_id
      ON users (permission_group_id)
      WHERE is_active = true
    `);
    // sales_invoice_headers: compound for cashier handover credit_agg subquery
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sales_inv_handover_credit
      ON sales_invoice_headers (claimed_by_shift_id, customer_type, status)
      WHERE is_return = false AND claimed_by_shift_id IS NOT NULL
    `);
    // store_transfers: status filter (missing — list page filters by status)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_store_transfers_status
      ON store_transfers (status, transfer_date DESC)
    `);
    // purchase_return_headers: warehouse + date (list page filters by warehouse)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pr_warehouse_date
      ON purchase_return_headers (warehouse_id, created_at DESC)
    `);
    // receiving_headers: compound status+date (list filtered by status then date)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_receiving_status_date
      ON receiving_headers (status, receive_date DESC)
      WHERE status != 'cancelled'
    `);
    // sales_invoice_lines: compound for quantity-sold check in returns
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sales_lines_inv_lot
      ON sales_invoice_lines (invoice_id, lot_id)
      WHERE lot_id IS NOT NULL
    `);
    // items: trigram index للبحث السريع ILIKE على name_ar و item_code (18k+ صنف)
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_items_name_ar_trgm
      ON items USING GIN (name_ar gin_trgm_ops)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_items_code_trgm
      ON items USING GIN (item_code gin_trgm_ops)
    `);
    // shortage_events: duplicate guard (item + user + timestamp)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_shortage_events_item_user_at
      ON shortage_events (item_id, requested_by, requested_at DESC)
    `);
    // shortage_agg: list sorted by request_count desc (dashboard default)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_shortage_agg_count_last
      ON shortage_agg (request_count DESC, last_requested_at DESC)
      WHERE is_resolved = false
    `);
    // item movement report: تسريع lookup بـ reference_type + reference_id
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_lot_movements_ref
      ON inventory_lot_movements (reference_type, reference_id)
    `);
    // contract report: تسريع فواتير التعاقد (customer_type=contract, status=finalized)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sih_contract_report
      ON sales_invoice_headers (customer_type, status, invoice_date DESC)
      WHERE customer_type = 'contract'
    `);
    // patients: expression index for find-or-create exact match (LOWER(TRIM(full_name)))
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_patients_name_lower
      ON patients (LOWER(TRIM(full_name)))
    `);
    // patients: GIN trigram index for ILIKE search (searchPatients)
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_patients_name_trgm
      ON patients USING GIN (full_name gin_trgm_ops)
    `);
    // admissions: partial index for walk-in name search (patient_id IS NULL)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_adm_walkin_name
      ON admissions (LOWER(TRIM(patient_name)))
      WHERE patient_id IS NULL
    `);
    log("[STARTUP] Performance indexes ensured");
    // NOTE: purchase_invoice_lines(invoice_id) → idx_pi_lines_invoice (in Drizzle schema)
    // NOTE: purchase_return_lines(purchase_invoice_line_id) → idx_prl_invoice_line (in Drizzle schema)
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] performance index error");
  }

  // ── 5h-post. Seed default system settings for cashier GL ─────────────────
  try {
    await db.execute(sql`
      INSERT INTO system_settings (key, value)
      VALUES ('cashier_treasury_account_code', '12127')
      ON CONFLICT (key) DO NOTHING
    `);
    log("[STARTUP] cashier_treasury_account_code setting ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] cashier settings seed error");
  }

  // ── 5h-post2. Seed pharmacy_mode default ─────────────────────────────────
  try {
    await db.execute(sql`
      INSERT INTO system_settings (key, value)
      VALUES ('pharmacy_mode', 'false')
      ON CONFLICT (key) DO NOTHING
    `);
    log("[STARTUP] pharmacy_mode setting ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] pharmacy_mode seed error");
  }

  // ── 5h-post2b. Seed returns_mode default ─────────────────────────────────
  // "reverse_original" = عكس القيد الأصلي على نفس الحسابات (IFRS-aligned)
  // "separate_accounts" = استخدام حسابات مردود منفصلة
  try {
    await db.execute(sql`
      INSERT INTO system_settings (key, value)
      VALUES ('returns_mode', 'reverse_original')
      ON CONFLICT (key) DO NOTHING
    `);
    log("[STARTUP] returns_mode setting ensured (default: reverse_original)");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] returns_mode seed error");
  }

  // ── 5h-post2c. Seed enable_pharmacy_sales_output_vat default ────────────
  // false = ضريبة الصيدلية معطّلة افتراضياً — المالك يُفعّلها يدوياً
  try {
    await db.execute(sql`
      INSERT INTO system_settings (key, value)
      VALUES ('enable_pharmacy_sales_output_vat', 'false')
      ON CONFLICT (key) DO NOTHING
    `);
    log("[STARTUP] enable_pharmacy_sales_output_vat setting ensured (default: false)");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] enable_pharmacy_sales_output_vat seed error");
  }

  // ── 5h-post3. Backfill CASHIER_OPEN_SHIFT → system groups ───────────────
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

  // ── 5h-post4. Stay Engine UNIQUE constraint ───────────────────────────────
  // Stay Engine uses ON CONFLICT (source_type, source_id) WHERE is_void = false ...
  // This partial unique index MUST exist or every accrual tick throws:
  //   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
  try {
    // 1) تحقق من وجود duplicates (source_type + source_id) قبل الـ index
    const dupRes = await db.execute(sql`
      SELECT source_type, source_id, COUNT(*) AS cnt
      FROM patient_invoice_lines
      WHERE is_void = false
        AND source_type IS NOT NULL
        AND source_id IS NOT NULL
      GROUP BY source_type, source_id
      HAVING COUNT(*) > 1
    `);
    const dups = (dupRes as any).rows ?? [];

    if (dups.length > 0) {
      // REPORT — لا حذف تلقائي
      logger.error({
        event:   "STAY_ENGINE_DUPLICATES_FOUND",
        count:   dups.length,
        samples: dups.slice(0, 5),
        hint:    "Duplicates must be resolved manually before the UNIQUE index can be created",
      }, `[STARTUP] STAY_ENGINE: ${dups.length} duplicate (source_type, source_id) row(s) found — UNIQUE index NOT created. Manual repair required.`);
    } else {
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pil_source_type_id
        ON patient_invoice_lines (source_type, source_id)
        WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
      `);
      log("[STARTUP] uq_pil_source_type_id UNIQUE index ensured (Stay Engine ON CONFLICT ready)");
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] Stay Engine UNIQUE index error");
  }

  // ── TASK-DR-02: Inventory lots true-duplicate guardrail ─────────────────
  // يفحص وجود lots مكررة بنفس (item+warehouse+expiry+purchasePrice) — وهي corruption حقيقية
  // ملاحظة: lots مختلفة الـ purchasePrice لنفس (item+warehouse+expiry) مقصودة (تقسيم التكلفة في التحويل)
  try {
    const trueDups = await db.execute(sql`
      SELECT item_id, warehouse_id, expiry_month, expiry_year,
             CAST(purchase_price AS numeric) AS price, COUNT(*) AS cnt
      FROM inventory_lots
      WHERE is_active = true
      GROUP BY item_id, warehouse_id, expiry_month, expiry_year, CAST(purchase_price AS numeric)
      HAVING COUNT(*) > 1
    `);
    const trueDupRows = (trueDups as any).rows ?? [];
    if (trueDupRows.length > 0) {
      logger.warn(
        { duplicates: trueDupRows.length },
        `[STARTUP] INVENTORY_LOTS: ${trueDupRows.length} true-duplicate lot group(s) found (same item+warehouse+expiry+cost). ` +
        `UNIQUE index NOT created. Run data repair before re-enabling.`
      );
    } else {
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_lots_item_wh_expiry_cost
        ON inventory_lots (item_id, warehouse_id, expiry_month, expiry_year, purchase_price)
        WHERE is_active = true
      `);
      log("[STARTUP] uq_lots_item_wh_expiry_cost UNIQUE index ensured (true-duplicate prevention active)");
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] Inventory lots UNIQUE index error");
  }

  // ── 5h. Backfill expiry_month/expiry_year from expiry_date ────────────────
  // حالات تاريخية: دفعات دخلت بـ expiry_date لكن بدون expiry_month/expiry_year
  // (استيراد إكسيل، opening stock قديم). آمن ومتكرر الإجراء.
  try {
    const fix = await db.execute(sql`
      UPDATE inventory_lots
      SET    expiry_month = EXTRACT(MONTH FROM expiry_date)::int,
             expiry_year  = EXTRACT(YEAR  FROM expiry_date)::int,
             updated_at   = NOW()
      WHERE  expiry_date IS NOT NULL
        AND  (expiry_month IS NULL OR expiry_year IS NULL)
    `);
    const fixed = (fix as any).rowCount ?? 0;
    if (fixed > 0) log(`[STARTUP] inventory_lots expiry backfill: ${fixed} row(s) fixed`);
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] expiry backfill error");
  }

  // ── 5i. Listen ────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Background jobs (Stay Engine, Journal Retry, RPT Refresh)
  // ─────────────────────────────────────────────────────────────────────────

  // Stay Engine: every 5 minutes
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

  // Journal Retry: every 5 minutes (legacy — sales_invoice only)
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

  // Accounting Event Retry: every 7 minutes — covers all source types via accounting_event_log
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

  // RPT Refresh: every 15 minutes
  const RPT_REFRESH_MS  = 15 * 60 * 1000;
  const SNAP_REFRESH_MS = 15 * 60 * 1000;

  const runRptRefresh = (trigger: "startup" | "polling") => async () => {
    try {
      await runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), trigger);
    } catch {}
  };
  setTimeout(runRptRefresh("startup"), 10000);
  setInterval(runRptRefresh("polling"), RPT_REFRESH_MS);

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
})();
