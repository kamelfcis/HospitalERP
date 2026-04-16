/**
 * Vercel catch-all function for /api/**.
 *
 * Vercel Node.js functions receive standard (req, res) HTTP objects.
 * We pass them directly to Express — no serverless-http wrapper needed.
 */
process.noDeprecation = true;
import "dotenv/config";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Express } from "express";

let app: Express | undefined;
let initPromise: Promise<void> | undefined;

function ensureCriticalEnv(): void {
  if (process.env.DATABASE_URL && process.env.SESSION_SECRET) return;

  const fallbackPath = path.resolve(process.cwd(), ".env.example");
  if (!existsSync(fallbackPath)) return;

  const content = readFileSync(fallbackPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) continue;
    if ((key === "DATABASE_URL" || key === "SESSION_SECRET") && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function getApp(): Promise<Express> {
  if (app) return app;
  if (!initPromise) {
    initPromise = (async () => {
      process.env.VERCEL ??= "1";
      ensureCriticalEnv();
      const require = createRequire(import.meta.url);
      const { bootstrapApp } = require("../dist/bootstrap-app.cjs");
      const result = await bootstrapApp();
      app = result.app;
    })();
  }
  await initPromise;
  return app!;
}

/**
 * Ensure req.url contains the full /api/… path.
 *
 * Vercel catch-all `api/[...path].ts` may deliver the matched segments
 * in `req.query.path` (object) or as `?path=…&path=…` query params,
 * while `req.url` is just `/` or `/?path=…`.
 * Express needs the actual pathname to match routes.
 */
function ensureApiUrl(req: any): void {
  const raw = typeof req?.url === "string" ? req.url : "/";

  const qIdx = raw.indexOf("?");
  const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const search = qIdx >= 0 ? raw.slice(qIdx + 1) : "";

  // Case 1: Already a proper /api/something path
  if (pathname.startsWith("/api/") && pathname.length > 5) return;

  // Case 2: Try req.query.path (Vercel augments req with parsed query)
  let slug: string | undefined;
  const qp = req?.query?.path;
  if (qp !== undefined && qp !== null) {
    slug = Array.isArray(qp) ? qp.filter(Boolean).join("/") : String(qp);
  }

  // Case 3: Parse ?path=…&path=… directly from URL string
  if (!slug && search) {
    const parts: string[] = [];
    for (const pair of search.split("&")) {
      const eq = pair.indexOf("=");
      const key = eq >= 0 ? decodeURIComponent(pair.slice(0, eq)) : decodeURIComponent(pair);
      if (key === "path") {
        const val = eq >= 0 ? decodeURIComponent(pair.slice(eq + 1)) : "";
        if (val) parts.push(val);
      }
    }
    if (parts.length > 0) slug = parts.join("/");
  }

  if (slug) {
    req.url = `/api/${slug}`;
    return;
  }

  // Case 4: URL is like /auth/me (prefix stripped by Vercel)
  if (pathname !== "/" && pathname !== "/api" && pathname !== "/api/") {
    const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
    req.url = `/api${clean}`;
    return;
  }

  // Case 5: Bare /api or /
  if (!raw.startsWith("/api")) {
    req.url = `/api${raw.startsWith("/") ? raw : `/${raw}`}`;
  }
}

const SAFETY_TIMEOUT_MS = 55_000;

export default async (req: any, res: any) => {
  const rawUrl = req.url;

  // Diagnostic endpoint — bypasses Express entirely
  if (rawUrl?.includes("__diag")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      rawUrl,
      method: req.method,
      query: req.query,
      hasQueryPath: req.query?.path !== undefined,
    }));
    return;
  }

  ensureApiUrl(req);
  console.log(`[VERCEL] ${req.method} raw=${rawUrl} → fixed=${req.url}`);

  const expressApp = await getApp();

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    // Safety: never let the function hang until Vercel kills it at 60s.
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.writeHead(504, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Serverless function timeout" }));
      }
      finish();
    }, SAFETY_TIMEOUT_MS);

    res.on("finish", () => { clearTimeout(timer); finish(); });
    res.on("close", () => { clearTimeout(timer); finish(); });

    expressApp(req, res);
  });
};
