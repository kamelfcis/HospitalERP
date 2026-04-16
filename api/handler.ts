/**
 * Vercel serverless function — single handler for ALL /api/** requests.
 *
 * vercel.json `routes` rewrites every /api/* path to this function,
 * injecting the real sub-path as the `__apiPath` query parameter.
 * We reconstruct req.url before passing to Express.
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
 * Reconstruct the real /api/… URL that Express needs for route matching.
 *
 * vercel.json routes rewrite `/api/<anything>` → `/api/handler?__apiPath=<anything>`.
 * We extract `__apiPath`, rebuild `/api/<path>`, and strip the injected param
 * so Express sees the clean original URL.
 */
function rebuildApiUrl(req: any): void {
  const raw = typeof req?.url === "string" ? req.url : "/";
  const qIdx = raw.indexOf("?");
  const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const search = qIdx >= 0 ? raw.slice(qIdx + 1) : "";

  // If the URL already looks correct (local dev, direct hit, etc.)
  if (
    pathname.startsWith("/api/") &&
    pathname.length > 5 &&
    !pathname.startsWith("/api/handler")
  ) {
    return;
  }

  // Extract __apiPath injected by vercel.json routes rewrite
  let apiPath: string | undefined;
  const keepParams: string[] = [];
  if (search) {
    for (const pair of search.split("&")) {
      if (pair.startsWith("__apiPath=")) {
        apiPath = decodeURIComponent(pair.slice("__apiPath=".length));
      } else if (pair && !pair.startsWith("...path=")) {
        keepParams.push(pair);
      }
    }
  }

  if (apiPath) {
    const qs = keepParams.length > 0 ? `?${keepParams.join("&")}` : "";
    req.url = `/api/${apiPath}${qs}`;
    return;
  }

  // Fallback: prefix with /api if missing
  if (!pathname.startsWith("/api/") || pathname.length <= 5) {
    const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const p = clean === "/api/handler" ? "/api" : clean.startsWith("/api/") ? clean : `/api${clean}`;
    const qs = keepParams.length > 0 ? `?${keepParams.join("&")}` : "";
    req.url = `${p}${qs}`;
  }
}

const SAFETY_TIMEOUT_MS = 55_000;

export default async (req: any, res: any) => {
  const rawUrl = req.url;

  // Diagnostic endpoint — bypasses Express entirely
  if (rawUrl?.includes("__diag")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rawUrl, method: req.method, query: req.query }));
    return;
  }

  rebuildApiUrl(req);
  console.log(`[VERCEL] ${req.method} raw=${rawUrl} → url=${req.url}`);

  const expressApp = await getApp();

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

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
