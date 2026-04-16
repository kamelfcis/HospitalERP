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
 * in `req.query.path` while `req.url` is just `/` or `/?path=…`.
 * Express needs the actual pathname to match routes.
 */
function ensureApiUrl(req: any): void {
  const url = typeof req?.url === "string" ? req.url : "/";

  // Already a proper /api/something path — nothing to fix.
  const qIdx = url.indexOf("?");
  const pathname = qIdx >= 0 ? url.slice(0, qIdx) : url;
  if (pathname.startsWith("/api/") && pathname.length > 5) return;

  // Try to reconstruct from query.path (Vercel catch-all parameter).
  const pathParam = req?.query?.path;
  if (pathParam !== undefined && pathParam !== null) {
    const slug = Array.isArray(pathParam)
      ? pathParam.map(String).filter(Boolean).join("/")
      : String(pathParam);
    if (slug) {
      req.url = `/api/${slug}`;
      return;
    }
  }

  // Fallback: just prefix with /api if missing.
  if (!url.startsWith("/api")) {
    req.url = url.startsWith("/") ? `/api${url}` : `/api/${url}`;
  }
}

const SAFETY_TIMEOUT_MS = 55_000;

export default async (req: any, res: any) => {
  ensureApiUrl(req);

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
