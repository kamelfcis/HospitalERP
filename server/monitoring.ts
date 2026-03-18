/**
 * server/monitoring.ts — مراقبة أداء الطلبات والاستعلامات
 *
 * يُتتبَّع لكل طلب:
 *  - requestId: معرِّف فريد للطلب (correlation ID)
 *  - dbTimeMs: الوقت المُستغرَّق في قاعدة البيانات
 *  - queryCount: عدد الاستعلامات
 *  - slowestQueryMs + slowestQueryText: أبطأ استعلام
 *
 * البيانات تُخزَّن في AsyncLocalStorage وتُشارَك بين الطلبات بأمان.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Express, Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./lib/logger";

// ── Per-request accumulator ───────────────────────────────────────────────────
export interface RequestContext {
  requestId:        string;
  dbTimeMs:         number;
  queryCount:       number;
  slowestQueryMs:   number;
  slowestQueryText: string;
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();
// ─────────────────────────────────────────────────────────────────────────────

// ── Ring-buffer types ─────────────────────────────────────────────────────────
interface SlowEntry {
  timestamp:   string;
  route:       string;
  method:      string;
  durationMs:  number;
  statusCode?: number;
  requestId?:  string;
}

interface SlowQuery {
  timestamp:  string;
  query:      string;
  durationMs: number;
  requestId?: string;
}

export interface PerfEntry {
  timestamp:        string;
  requestId:        string;
  method:           string;
  route:            string;
  statusCode:       number;
  totalMs:          number;
  dbMs:             number;
  backendMs:        number;
  queryCount:       number;
  slowestQueryMs:   number;
  slowestQueryText: string;
  possibleCause:    string;
}

// ── Dev-asset filter ──────────────────────────────────────────────────────────
const DEV_PREFIXES = ["/src/", "/@vite/", "/@fs/", "/__vite", "/node_modules/", "/assets/"];
const DEV_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx",
  ".css", ".scss", ".less",
  ".map",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot",
  ".html",
]);

function isDevAsset(url: string): boolean {
  const p = url.split("?")[0];
  if (DEV_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  const dot = p.lastIndexOf(".");
  if (dot !== -1 && DEV_EXTENSIONS.has(p.slice(dot).toLowerCase())) return true;
  return false;
}

type CauseKey = "large_data_fetch" | "missing_index" | "database_query" | "backend_processing";

function diagnoseCause(dbMs: number, totalMs: number, queryCount: number, slowestMs: number): CauseKey {
  if (queryCount > 20)    return "large_data_fetch";
  if (slowestMs > 500)    return "missing_index";
  if (totalMs > 0 && dbMs / totalMs >= 0.75) return "database_query";
  return "backend_processing";
}

const MAX_ENTRIES = 200;
let slowRequests: SlowEntry[]  = [];
let slowQueries:  SlowQuery[]  = [];
let perfEntries:  PerfEntry[]  = [];

// ── Middleware الأداء ─────────────────────────────────────────────────────────
export function perfRequestMiddleware(thresholdMs = 500) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isDevAsset(req.originalUrl || req.path)) return next();

    const ctx: RequestContext = {
      requestId:        (req as any).requestId || "unknown",
      dbTimeMs:         0,
      queryCount:       0,
      slowestQueryMs:   0,
      slowestQueryText: "",
    };

    const startHr = process.hrtime.bigint();

    requestContextStore.run(ctx, () => {
      res.on("finish", () => {
        const totalMs = Number(process.hrtime.bigint() - startHr) / 1_000_000;
        const route   = req.originalUrl || req.path;

        if (totalMs > thresholdMs) {
          const entry: PerfEntry = {
            timestamp:        new Date().toISOString(),
            requestId:        ctx.requestId,
            method:           req.method,
            route,
            statusCode:       res.statusCode,
            totalMs:          Math.round(totalMs * 100) / 100,
            dbMs:             Math.round(ctx.dbTimeMs * 100) / 100,
            backendMs:        Math.round(Math.max(0, totalMs - ctx.dbTimeMs) * 100) / 100,
            queryCount:       ctx.queryCount,
            slowestQueryMs:   Math.round(ctx.slowestQueryMs * 100) / 100,
            slowestQueryText: ctx.slowestQueryText,
            possibleCause:    diagnoseCause(ctx.dbTimeMs, totalMs, ctx.queryCount, ctx.slowestQueryMs),
          };

          perfEntries.push(entry);
          if (perfEntries.length > MAX_ENTRIES) perfEntries.shift();

          slowRequests.push({
            timestamp: entry.timestamp,
            route,
            method:     req.method,
            durationMs: entry.totalMs,
            statusCode: res.statusCode,
            requestId:  ctx.requestId,
          });
          if (slowRequests.length > MAX_ENTRIES) slowRequests.shift();

          logger.warn({
            requestId:    ctx.requestId,
            method:       req.method,
            route,
            totalMs:      Math.round(totalMs),
            dbMs:         Math.round(ctx.dbTimeMs),
            queries:      ctx.queryCount,
            cause:        entry.possibleCause,
          }, "[PERF] slow request detected");
        }
      });

      next();
    });
  };
}

// ── تسجيل الاستعلامات البطيئة ────────────────────────────────────────────────
export function logSlowQuery(query: string, durationMs: number, thresholdMs = 500): void {
  if (durationMs <= thresholdMs) return;

  const ctx = requestContextStore.getStore();
  const entry: SlowQuery = {
    timestamp:  new Date().toISOString(),
    query:      query.substring(0, 200),
    durationMs: Math.round(durationMs * 100) / 100,
    requestId:  ctx?.requestId,
  };

  slowQueries.push(entry);
  if (slowQueries.length > MAX_ENTRIES) slowQueries.shift();

  logger.warn({
    requestId: ctx?.requestId,
    durationMs: Math.round(durationMs),
    query: query.substring(0, 200),
  }, "[SLOW QUERY]");
}

export function getSlowRequests(): SlowEntry[]  { return [...slowRequests]; }
export function getSlowQueries():  SlowQuery[]  { return [...slowQueries]; }
export function getPerfEntries():  PerfEntry[]  { return [...perfEntries].reverse(); }

export function clearSlowLogs(): void {
  slowRequests = [];
  slowQueries  = [];
  perfEntries  = [];
}

// ── مسارات المراقبة ───────────────────────────────────────────────────────────
export function registerMonitoringRoutes(app: Express): void {
  app.get("/api/ops/slow-requests", (_req: Request, res: Response) => {
    try { res.json(getSlowRequests()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/ops/slow-queries", (_req: Request, res: Response) => {
    try { res.json(getSlowQueries()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/ops/perf-report", (_req: Request, res: Response) => {
    try { res.json(getPerfEntries()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/ops/clear-logs", (_req: Request, res: Response) => {
    try { clearSlowLogs(); res.json({ message: "Logs cleared successfully" }); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/ops/backup-status", (_req: Request, res: Response) => {
    try {
      const statusFile = path.resolve("backups/.backup_status.json");
      if (!fs.existsSync(statusFile)) {
        return res.json({ status: "no_backup", message: "لم يتم إجراء أي نسخة احتياطية بعد" });
      }
      res.json(JSON.parse(fs.readFileSync(statusFile, "utf-8")));
    } catch (e: unknown) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  // /api/ops/health — مفصَّل (يتطلب مصادقة)
  app.get("/api/ops/health", (_req: Request, res: Response) => {
    try {
      const uptime = process.uptime();
      const mem    = process.memoryUsage();
      res.json({
        status: "ok",
        uptime: Math.round(uptime),
        memoryUsage: {
          rss:       Math.round(mem.rss       / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          heapUsed:  Math.round(mem.heapUsed  / 1024 / 1024),
          external:  Math.round(mem.external  / 1024 / 1024),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e: unknown) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });
}
