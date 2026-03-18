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

  // ── 5h. Listen ────────────────────────────────────────────────────────────
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

  // Journal Retry: every 5 minutes
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
