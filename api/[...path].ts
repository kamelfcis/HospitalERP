/**
 * Vercel catch-all function for /api/**.
 */
import "dotenv/config";
import serverless from "serverless-http";
import type { Express } from "express";

let handler: ReturnType<typeof serverless> | undefined;
let initPromise: Promise<void> | undefined;

async function getHandler(): Promise<ReturnType<typeof serverless>> {
  if (handler) return handler;
  if (!initPromise) {
    initPromise = (async () => {
      process.env.VERCEL ??= "1";
      const { bootstrapApp } = await import("../server/bootstrap-app");
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
  const h = await getHandler();
  // On Vercel catch-all functions req.url may arrive without the /api prefix.
  // Our Express app registers routes with /api/*, so normalize before dispatch.
  const url = typeof req?.url === "string" ? req.url : "/";
  if (!url.startsWith("/api")) {
    req.url = url.startsWith("/") ? `/api${url}` : `/api/${url}`;
  }
  return h(req, res);
};
