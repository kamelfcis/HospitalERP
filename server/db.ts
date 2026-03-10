import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { logSlowQuery, requestContextStore } from "./monitoring";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const originalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const originalQuery = originalPool.query.bind(originalPool);
(originalPool as any).query = function () {
  const args = arguments;
  const start = performance.now();
  const result: unknown = originalQuery.apply(originalPool, args as any);
  if (result && typeof (result as any).then === "function") {
    return (result as any).then((res: any) => {
      const duration = performance.now() - start;
      const queryText =
        typeof args[0] === "string"
          ? args[0]
          : ((args[0] as any)?.text ?? "unknown");

      logSlowQuery(queryText, duration);

      const ctx = requestContextStore.getStore();
      if (ctx) {
        ctx.dbTimeMs += duration;
        ctx.queryCount += 1;
        if (duration > ctx.slowestQueryMs) {
          ctx.slowestQueryMs = duration;
          ctx.slowestQueryText = queryText.substring(0, 300);
        }
      }

      return res;
    });
  }
  return result;
};

export const pool = originalPool;

export const db = drizzle(pool, { schema });

export type DrizzleTransaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0];
