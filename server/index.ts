import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { perfRequestMiddleware, registerMonitoringRoutes } from "./monitoring";
import { loadSettings } from "./settings-cache";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: string;
  }
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

const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "hospital-gl-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    },
  })
);

app.use(perfRequestMiddleware(500));

// ── Global API Auth Guard ─────────────────────────────────────────────────────
// يحمي جميع مسارات /api تلقائياً — بدلاً من إضافة requireAuth لكل route بشكل يدوي
// المسارات العامة (بدون مصادقة): تسجيل الدخول / الخروج / فحص الجلسة
const API_PUBLIC_PATHS = ["/auth/login", "/auth/logout", "/auth/me"];
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (API_PUBLIC_PATHS.includes(req.path)) return next();
  if (!req.session.userId) {
    return res.status(401).json({ message: "يجب تسجيل الدخول" });
  }
  next();
});
// ─────────────────────────────────────────────────────────────────────────────

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      log(`${req.method} ${path}${qs} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  if (process.env.RUN_SEED === "true") {
    try {
      await seedDatabase();
    } catch (error) {
      console.log("Seed database notice:", error);
    }
  }

  try {
    await loadSettings();
    console.log("System settings loaded into cache");
  } catch (e) {
    console.log("System settings table not yet available, will retry after schema sync");
  }

  await registerRoutes(httpServer, app);
  registerMonitoringRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ── مزامنة تسلسل أرقام القيود مع أعلى رقم موجود في قاعدة البيانات ──────────
  // ضروري عند بدء التشغيل لضمان أن الـ SEQUENCE يبدأ من بعد آخر قيد مُدخَل
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
    console.error("[STARTUP] sequence sync error:", err instanceof Error ? err.message : err);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // Stay Engine: accrue daily lines every 5 minutes
  // كل 5 دقائق يضمن احتساب اليوم الجديد خلال 5 دقائق من انتهاء 24 ساعة الدخول
  const STAY_TICK_MS = 5 * 60 * 1000;
  const runStayTick = async () => {
    try {
      const result = await storage.accrueStayLines();
      if (result.segmentsProcessed > 0 || result.linesUpserted > 0) {
        log(`[STAY_ENGINE] tick: ${result.segmentsProcessed} segments, ${result.linesUpserted} lines upserted`);
      }
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      console.error("[STAY_ENGINE] tick error:", _em);
    }
  };
  setTimeout(runStayTick, 5000);
  setInterval(runStayTick, STAY_TICK_MS);

  const JOURNAL_RETRY_MS = 5 * 60 * 1000;
  const runJournalRetry = async () => {
    try {
      const result = await storage.retryFailedJournals();
      if (result.total > 0) {
        log(`[JOURNAL_RETRY] attempted=${result.total} succeeded=${result.succeeded} failed=${result.failed}`);
      }
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      console.error("[JOURNAL_RETRY] tick error:", _em);
    }
  };
  setTimeout(runJournalRetry, 15000);
  setInterval(runJournalRetry, JOURNAL_RETRY_MS);

  // RPT Refresh: rebuild rpt_patient_visit_summary every 15 minutes
  const RPT_REFRESH_MS = 15 * 60 * 1000;
  const runRptRefresh = async () => {
    try {
      const result = await storage.refreshPatientVisitSummary();
      if (result.upserted > 0) {
        log(`[RPT_REFRESH] upserted=${result.upserted} rows in ${result.durationMs}ms`);
      }
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      console.error("[RPT_REFRESH] tick error:", _em);
    }
  };
  setTimeout(runRptRefresh, 10000);
  setInterval(runRptRefresh, RPT_REFRESH_MS);

  // Inventory Snapshot Refresh: rebuild rpt_inventory_snapshot every 15 minutes
  const SNAP_REFRESH_MS = 15 * 60 * 1000;
  const runSnapRefresh = async () => {
    try {
      const result = await storage.refreshInventorySnapshot();
      if (result.upserted > 0) {
        log(`[SNAP_REFRESH] upserted=${result.upserted} rows in ${result.durationMs}ms`);
      }
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      console.error("[SNAP_REFRESH] tick error:", _em);
    }
  };
  setTimeout(runSnapRefresh, 12000);
  setInterval(runSnapRefresh, SNAP_REFRESH_MS);
})();
