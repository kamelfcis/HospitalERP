import type { Express, Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";

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

// Ring buffers with max 100 entries
const MAX_ENTRIES = 100;
let slowRequests: SlowEntry[] = [];
let slowQueries: SlowQuery[] = [];

/**
 * Express middleware to log slow requests
 * Records start time and measures duration using high-resolution timer
 */
export function slowRequestLogger(thresholdMs: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = process.hrtime.bigint();
    const originalPath = req.originalUrl || req.path;

    res.on("finish", () => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000; // Convert nanoseconds to milliseconds

      if (durationMs > thresholdMs) {
        const entry: SlowEntry = {
          timestamp: new Date().toISOString(),
          route: originalPath,
          method: req.method,
          durationMs: Math.round(durationMs * 100) / 100, // Round to 2 decimal places
          statusCode: res.statusCode,
        };

        // Add to ring buffer
        slowRequests.push(entry);
        if (slowRequests.length > MAX_ENTRIES) {
          slowRequests.shift();
        }

        // Log to console
        console.log(
          `[SLOW REQUEST] ${req.method} ${originalPath} - ${Math.round(durationMs)}ms`
        );
      }
    });

    next();
  };
}

/**
 * Log slow database queries
 * Should be called after query execution with the duration
 */
export function logSlowQuery(
  query: string,
  durationMs: number,
  thresholdMs: number = 500
): void {
  if (durationMs > thresholdMs) {
    const entry: SlowQuery = {
      timestamp: new Date().toISOString(),
      query: query.substring(0, 200),
      durationMs: Math.round(durationMs * 100) / 100,
    };

    // Add to ring buffer
    slowQueries.push(entry);
    if (slowQueries.length > MAX_ENTRIES) {
      slowQueries.shift();
    }

    // Log to console
    console.log(
      `[SLOW QUERY] ${Math.round(durationMs)}ms - ${query.substring(0, 200)}`
    );
  }
}

/**
 * Get all recorded slow requests
 */
export function getSlowRequests(): SlowEntry[] {
  return [...slowRequests];
}

/**
 * Get all recorded slow queries
 */
export function getSlowQueries(): SlowQuery[] {
  return [...slowQueries];
}

/**
 * Clear both slow requests and slow queries logs
 */
export function clearSlowLogs(): void {
  slowRequests = [];
  slowQueries = [];
}

/**
 * Register monitoring routes for the admin panel
 */
export function registerMonitoringRoutes(app: Express): void {
  // Get slow requests
  app.get("/api/ops/slow-requests", (req: Request, res: Response) => {
    try {
      res.json(getSlowRequests());
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Get slow queries
  app.get("/api/ops/slow-queries", (req: Request, res: Response) => {
    try {
      res.json(getSlowQueries());
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Clear logs
  app.post("/api/ops/clear-logs", (req: Request, res: Response) => {
    try {
      clearSlowLogs();
      res.json({ message: "Logs cleared successfully" });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Backup status
  app.get("/api/ops/backup-status", (req: Request, res: Response) => {
    try {
      const statusFile = path.resolve("backups/.backup_status.json");
      if (!fs.existsSync(statusFile)) {
        return res.json({ status: "no_backup", message: "لم يتم إجراء أي نسخة احتياطية بعد" });
      }
      const data = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Health endpoint
  app.get("/api/ops/health", (req: Request, res: Response) => {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      res.json({
        status: "ok",
        uptime: Math.round(uptime),
        memoryUsage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
