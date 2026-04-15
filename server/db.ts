/**
 * server/db.ts — اتصال قاعدة البيانات
 *
 * Pool مُضبَّط بحدود واضحة:
 *  - max: 30 اتصال — يستوعب 20 مستخدم × 3 طلبات متزامنة في الذروة
 *  - idleTimeoutMillis: 30s (يُغلق الاتصالات الخاملة)
 *  - connectionTimeoutMillis: 5s (يفشل بسرعة إذا كان الـ pool ممتلئاً)
 *  - statement_timeout: 30s (يُلغي الاستعلامات البطيئة تلقائياً)
 *
 * استثناء: المسارات الثقيلة (تقارير، migrations) يجب أن تستخدم
 *   SET LOCAL statement_timeout = '0'  داخل transaction خاصة بها.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { logSlowQuery, requestContextStore } from "./monitoring";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("[FATAL] DATABASE_URL must be set — الخادم لا يعمل بدون قاعدة بيانات");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:                    30,
  idleTimeoutMillis:      30_000,
  // Remote PostgreSQL (VPS / high-latency links) can exceed a 5s TCP handshake.
  // Keep this high enough that startup doesn't fail while still failing fast on truly dead hosts.
  connectionTimeoutMillis: 30_000,
});

// ── إعداد statement_timeout عند إنشاء كل اتصال ────────────────────────────
// يُلغي تلقائياً أي استعلام يتجاوز 30 ثانية على مستوى قاعدة البيانات.
// المسارات الثقيلة تُجاوزه داخل transaction:  SET LOCAL statement_timeout = '0'
pool.on("connect", (client) => {
  client.query("SET statement_timeout = '30s'").catch((err: Error) => {
    // فشل SET statement_timeout — نسجِّله بدل البلع الصامت
    import("./lib/logger").then(({ logger }) => {
      logger.warn({ err: err.message }, "[DB_POOL] failed to set statement_timeout on new connection");
    }).catch(() => {
      process.stderr.write(`[DB_POOL] failed to set statement_timeout: ${err.message}\n`);
    });
  });
});

pool.on("error", (err) => {
  // أخطاء pool غير المتوقعة لا توقف العملية — تُسجَّل فقط
  // نستورد logger بشكل آمن لتجنب circular imports
  import("./lib/logger").then(({ logger }) => {
    logger.error({ err: err.message }, "[DB_POOL] unexpected pool error");
  }).catch(() => {
    process.stderr.write(`[DB_POOL] unexpected pool error: ${err.message}\n`);
  });
});

// ── تعديل query لرصد الأداء ────────────────────────────────────────────────
const originalQuery = pool.query.bind(pool);
(pool as any).query = function () {
  const args = arguments;
  const start = performance.now();
  const result: unknown = originalQuery.apply(pool, args as any);
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
        ctx.dbTimeMs      += duration;
        ctx.queryCount    += 1;
        if (duration > ctx.slowestQueryMs) {
          ctx.slowestQueryMs   = duration;
          ctx.slowestQueryText = queryText.substring(0, 300);
        }
      }

      return res;
    });
  }
  return result;
};

export const db = drizzle(pool, { schema });

export type DrizzleTransaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0];

/**
 * testDbConnection — يُستخدم عند بدء التشغيل للتحقق من إمكانية الوصول لقاعدة البيانات.
 * يُعيد true عند النجاح، يرمي خطأ عند الفشل.
 */
export async function testDbConnection(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}
