/**
 * Vercel catch-all function for /api and /api/**.
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
  return h(req, res);
};
