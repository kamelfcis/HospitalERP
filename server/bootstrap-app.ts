/**
 * server/bootstrap-app.ts — تهيئة Express (مشتركة بين تشغيل Node العادي و Vercel Serverless)
 */

import { existsSync } from "fs";
import path from "path";
import express, { type Express, type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import compression from "compression";
import { randomUUID } from "crypto";
import { createServer, type Server } from "http";
// Vercel serverless runtime resolves ESM imports strictly; avoid directory import.
import { registerRoutes } from "./routes/index.js";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";
import { seedPermissionGroups } from "./lib/permission-groups-seed";
import { perfRequestMiddleware, registerMonitoringRoutes } from "./monitoring";
import { loadSettings } from "./settings-cache";
import { pool, testDbConnection } from "./db";
import { logger } from "./lib/logger";
import { runStartup } from "./startup";

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

const KNOWN_DEFAULT_SECRET = "hospital-gl-session-secret";
const isProd = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";

(function validateEnv() {
  const errors: string[] = [];
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

let isShuttingDown = false;

export function log(message: string, source = "express"): void {
  logger.info({ source }, message);
}

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function gracefulShutdown(signal: string, httpServer: Server): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "[SHUTDOWN] received signal — starting graceful shutdown");

  const DRAIN_TIMEOUT_MS = SHUTDOWN_TIMEOUT_MS - 1_000;
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

  try {
    await pool.end();
    logger.info("[SHUTDOWN] DB pool closed");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[SHUTDOWN] error closing DB pool");
  }

  logger.info("[SHUTDOWN] graceful shutdown complete");
  process.exit(0);
}

/**
 * Builds the fully configured Express app + HTTP server (no listen).
 * On Vercel, static UI is served from the CDN; this app handles /api/* and /health only.
 */
export async function bootstrapApp(): Promise<{ app: Express; httpServer: Server }> {
  const app = express();
  const httpServer = createServer(app);

  if (isVercel) {
    app.set("trust proxy", 1);
  }

  app.use(compression({ threshold: 1024 }));

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  // Some serverless adapters pass catch-all API URLs without the `/api` prefix.
  // Normalize early so the existing `/api/*` route table continues to work unchanged.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url === "/health" || req.url.startsWith("/api/") || req.url === "/api") return next();
    req.url = req.url.startsWith("/") ? `/api${req.url}` : `/api/${req.url}`;
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers["x-request-id"] as string) || randomUUID().substring(0, 8);
    (req as any).requestId = id;
    res.setHeader("X-Request-ID", id);
    next();
  });

  const healthHandler = async (_req: Request, res: Response) => {
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
  };
  app.get("/health", healthHandler);
  // Vercel rewrites bare /health → /api/health so it hits the serverless catch-all
  app.get("/api/health", healthHandler);

  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool,
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
      }),
      proxy:            isVercel,
      secret:           process.env.SESSION_SECRET || KNOWN_DEFAULT_SECRET,
      resave:           false,
      saveUninitialized: false,
      cookie: {
        maxAge:   24 * 60 * 60 * 1000,
        httpOnly: true,
        secure:   isVercel,
        sameSite: "lax",
      },
    }),
  );

  app.use(perfRequestMiddleware(500));

  const API_PUBLIC_EXACT = new Set(["/auth/login", "/auth/logout", "/auth/me", "/health"]);
  /** Unauthenticated API paths (paths may be /api/... or /... depending on mount / serverless adapter). */
  function isApiPublicRoute(req: Request): boolean {
    const orig = (req.originalUrl ?? req.url ?? "").split("?")[0] || "";
    const base = [req.path || "", orig];
    const candidates: string[] = [];
    for (const p of base) {
      candidates.push(p);
      if (p.startsWith("/api/")) candidates.push(p.slice(4) || "/");
    }
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      if (API_PUBLIC_EXACT.has(p)) return true;
      if (p === "/public/login-background" || p.startsWith("/public/")) return true;
    }
    return false;
  }

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (isApiPublicRoute(req)) return next();
    if (!req.session.userId) {
      return res.status(401).json({ message: "يجب تسجيل الدخول" });
    }
    next();
  });

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

  if (!isVercel) {
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM", httpServer));
    process.on("SIGINT",  () => gracefulShutdown("SIGINT", httpServer));
  }

  try {
    await testDbConnection();
    logger.info("[STARTUP] database connection verified");
  } catch (err: unknown) {
    logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "[FATAL STARTUP] cannot connect to database");
    process.exit(1);
  }

  if (process.env.RUN_SEED === "true") {
    try {
      await seedDatabase();
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, "[STARTUP] seed notice");
    }
  }

  try {
    await seedPermissionGroups();
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "[STARTUP] permission groups seed warning");
  }

  try {
    await loadSettings();
    logger.info("[STARTUP] system settings loaded into cache");
  } catch {
    logger.warn("[STARTUP] system settings table not yet available — will retry after schema sync");
  }

  try {
    await registerRoutes(httpServer, app);
    logger.info("[STARTUP] HTTP API routes registered");
    registerMonitoringRoutes(app);

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

    if (isVercel) {
      logger.info("[STARTUP] Vercel — public/ at edge + Express (Fluid) for API and SPA HTML");
      const indexPath = path.join(process.cwd(), "public", "index.html");
      if (!existsSync(indexPath)) {
        logger.warn(
          { indexPath },
          "[STARTUP] public/index.html missing — run build with VERCEL=1 so dist/public is copied to public/",
        );
      }
      // Client routes (wouter): no matching file under public/ → serve SPA shell.
      // Express 5 path parser rejects bare "*", so use a regex catch-all.
      app.get(/.*/, (req, res, next) => {
        if (req.path.startsWith("/api")) return next();
        if (!existsSync(indexPath)) {
          return res.status(503).type("text").send("UI bundle missing: build must copy dist/public to public/ on Vercel.");
        }
        res.sendFile(indexPath, (err) => {
          if (err) next(err);
        });
      });
    } else if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      logger.info("[STARTUP] initializing Vite dev middleware (may take a few seconds)…");
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
      logger.info("[STARTUP] Vite dev middleware ready");
    }

    if (isVercel) {
      logger.info("[STARTUP] Vercel serverless detected — skipping heavy deferred startup tasks");
    } else {
      logger.info("[STARTUP] running deferred startup tasks (DB migrations, integrity, workers)…");
      await runStartup(log);
      logger.info("[STARTUP] deferred startup tasks finished");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? err.stack : undefined;
    logger.fatal({ err: message, stack }, "[FATAL STARTUP] server failed during bootstrap (routes, vite, migrations, or listen)");
    process.exit(1);
  }

  return { app, httpServer };
}
