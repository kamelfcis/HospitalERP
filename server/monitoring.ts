import { AsyncLocalStorage } from "node:async_hooks";
import type { Express, Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";

// ── Per-request accumulator (shared via AsyncLocalStorage) ────────────────────
export interface RequestContext {
  dbTimeMs: number;
  queryCount: number;
  slowestQueryMs: number;
  slowestQueryText: string;
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();
// ─────────────────────────────────────────────────────────────────────────────

// ── Legacy ring-buffer types (kept for backward compat) ───────────────────────
interface SlowEntry {
  timestamp: string;
  route: string;
  method: string;
  durationMs: number;
  statusCode?: number;
}

interface SlowQuery {
  timestamp: string;
  query: string;
  durationMs: number;
}

// ── Rich perf entry ───────────────────────────────────────────────────────────
export interface PerfEntry {
  timestamp: string;
  method: string;
  route: string;
  statusCode: number;
  totalMs: number;
  dbMs: number;
  backendMs: number;
  queryCount: number;
  slowestQueryMs: number;
  slowestQueryText: string;
  possibleCause: string;
}

type CauseKey =
  | "large_data_fetch"
  | "missing_index"
  | "database_query"
  | "backend_processing";

function diagnoseCause(
  dbMs: number,
  totalMs: number,
  queryCount: number,
  slowestQueryMs: number
): CauseKey {
  if (queryCount > 20) return "large_data_fetch";
  if (slowestQueryMs > 500) return "missing_index";
  if (totalMs > 0 && dbMs / totalMs >= 0.75) return "database_query";
  return "backend_processing";
}
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 200;
let slowRequests: SlowEntry[] = [];
let slowQueries: SlowQuery[] = [];
let perfEntries: PerfEntry[] = [];

// ── Middleware ─────────────────────────────────────────────────────────────────
/**
 * Records per-request performance data: total time, DB time, query count,
 * slowest query, and a heuristic cause. Emits a console line for every
 * request that exceeds thresholdMs. Stores the last MAX_ENTRIES entries.
 */
export function perfRequestMiddleware(thresholdMs = 500) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx: RequestContext = {
      dbTimeMs: 0,
      queryCount: 0,
      slowestQueryMs: 0,
      slowestQueryText: "",
    };

    const startHr = process.hrtime.bigint();

    requestContextStore.run(ctx, () => {
      res.on("finish", () => {
        const totalMs =
          Number(process.hrtime.bigint() - startHr) / 1_000_000;
        const route = req.originalUrl || req.path;

        if (totalMs > thresholdMs) {
          const entry: PerfEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            route,
            statusCode: res.statusCode,
            totalMs: Math.round(totalMs * 100) / 100,
            dbMs: Math.round(ctx.dbTimeMs * 100) / 100,
            backendMs: Math.round(Math.max(0, totalMs - ctx.dbTimeMs) * 100) / 100,
            queryCount: ctx.queryCount,
            slowestQueryMs: Math.round(ctx.slowestQueryMs * 100) / 100,
            slowestQueryText: ctx.slowestQueryText,
            possibleCause: diagnoseCause(
              ctx.dbTimeMs,
              totalMs,
              ctx.queryCount,
              ctx.slowestQueryMs
            ),
          };

          perfEntries.push(entry);
          if (perfEntries.length > MAX_ENTRIES) perfEntries.shift();

          slowRequests.push({
            timestamp: entry.timestamp,
            route,
            method: req.method,
            durationMs: entry.totalMs,
            statusCode: res.statusCode,
          });
          if (slowRequests.length > MAX_ENTRIES) slowRequests.shift();

          console.log(
            `[PERF] ${req.method} ${route} | total=${Math.round(totalMs)}ms` +
              ` db=${Math.round(ctx.dbTimeMs)}ms queries=${ctx.queryCount}` +
              ` cause=${entry.possibleCause}`
          );
        }
      });

      next();
    });
  };
}

/**
 * Log slow database queries (called from db.ts)
 */
export function logSlowQuery(
  query: string,
  durationMs: number,
  thresholdMs = 500
): void {
  if (durationMs > thresholdMs) {
    const entry: SlowQuery = {
      timestamp: new Date().toISOString(),
      query: query.substring(0, 200),
      durationMs: Math.round(durationMs * 100) / 100,
    };
    slowQueries.push(entry);
    if (slowQueries.length > MAX_ENTRIES) slowQueries.shift();
    console.log(
      `[SLOW QUERY] ${Math.round(durationMs)}ms - ${query.substring(0, 200)}`
    );
  }
}

export function getSlowRequests(): SlowEntry[] {
  return [...slowRequests];
}

export function getSlowQueries(): SlowQuery[] {
  return [...slowQueries];
}

export function getPerfEntries(): PerfEntry[] {
  return [...perfEntries].reverse();
}

export function clearSlowLogs(): void {
  slowRequests = [];
  slowQueries = [];
  perfEntries = [];
}

/**
 * Register monitoring routes
 */
export function registerMonitoringRoutes(app: Express): void {
  app.get("/api/ops/slow-requests", (_req: Request, res: Response) => {
    try {
      res.json(getSlowRequests());
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/ops/slow-queries", (_req: Request, res: Response) => {
    try {
      res.json(getSlowQueries());
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/ops/perf-report", (_req: Request, res: Response) => {
    try {
      res.json(getPerfEntries());
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/ops/clear-logs", (_req: Request, res: Response) => {
    try {
      clearSlowLogs();
      res.json({ message: "Logs cleared successfully" });
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/ops/backup-status", (_req: Request, res: Response) => {
    try {
      const statusFile = path.resolve("backups/.backup_status.json");
      if (!fs.existsSync(statusFile)) {
        return res.json({
          status: "no_backup",
          message: "لم يتم إجراء أي نسخة احتياطية بعد",
        });
      }
      const data = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/ops/health", (_req: Request, res: Response) => {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      res.json({
        status: "ok",
        uptime: Math.round(uptime),
        memoryUsage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });
}
