/**
 * Vercel catch-all function for /api/**.
 */
process.noDeprecation = true;
import "dotenv/config";
import serverless from "serverless-http";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Express } from "express";

let handler: ReturnType<typeof serverless> | undefined;
let initPromise: Promise<void> | undefined;

/**
 * Vercel `api/[...path].ts` often forwards the matched segments as `?path=...`
 * while `req.url` is only `/` or `/api`, so Express never hits `/api/settings` etc.
 * The SPA catch-all then does `next()` for `/api` and the request hangs until maxDuration.
 */
function normalizeCatchAllApiUrl(req: any): void {
  const pathParam = req?.query?.path;
  if (pathParam === undefined || pathParam === null) return;

  const slug = Array.isArray(pathParam)
    ? pathParam.map(String).filter(Boolean).join("/")
    : String(pathParam);
  if (!slug) return;

  const raw = typeof req?.url === "string" ? req.url : "/";
  let pathname: string;
  let params: URLSearchParams;
  try {
    const u = new URL(raw, "http://localhost");
    pathname = u.pathname || "/";
    params = new URLSearchParams(u.searchParams);
  } catch {
    const cut = raw.indexOf("?");
    pathname = cut >= 0 ? raw.slice(0, cut) : raw;
    params = new URLSearchParams(cut >= 0 ? raw.slice(cut + 1) : "");
  }

  if (pathname.startsWith("/api/") && pathname.length > 5) return;

  params.delete("path");
  const q = params.toString();
  req.url = `/api/${slug}${q ? `?${q}` : ""}`;
}

function ensureCriticalEnv(): void {
  if (process.env.DATABASE_URL && process.env.SESSION_SECRET) return;

  // Fallback: in serverless runtime, load defaults from checked-in env example
  // when project env vars are unexpectedly unavailable.
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

async function getHandler(): Promise<ReturnType<typeof serverless>> {
  if (handler) return handler;
  if (!initPromise) {
    initPromise = (async () => {
      process.env.VERCEL ??= "1";
      ensureCriticalEnv();
      const require = createRequire(import.meta.url);
      // Load bundled CJS bootstrap to avoid ESM relative-import resolution pitfalls.
      const { bootstrapApp } = require("../dist/bootstrap-app.cjs");
      const { app } = await bootstrapApp();
      handler = serverless(app as Express, {
        binary: ["application/octet-stream", "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"],
      });
    })();
  }
  await initPromise;
  return handler!;
}

export default async (req: any, res: any) => {
  normalizeCatchAllApiUrl(req);
  const h = await getHandler();
  // On Vercel catch-all functions req.url may arrive without the /api prefix.
  // Our Express app registers routes with /api/*, so normalize before dispatch.
  const url = typeof req?.url === "string" ? req.url : "/";
  if (!url.startsWith("/api")) {
    req.url = url.startsWith("/") ? `/api${url}` : `/api/${url}`;
  }
  return h(req, res);
};
