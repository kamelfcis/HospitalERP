/**
 * server/db.ts — اتصال قاعدة البيانات
 *
 * Pool مُضبَّط بحدود واضحة:
 *  - max: 20 اتصال (يمنع استنزاف الموارد)
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
  max:                    20,
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 5_000,
});

// ── إعداد statement_timeout عند إنشاء كل اتصال ────────────────────────────
// يُلغي تلقائياً أي استعلام يتجاوز 30 ثانية على مستوى قاعدة البيانات.
// المسارات الثقيلة تُجاوزه داخل transaction:  SET LOCAL statement_timeout = '0'
pool.on("connect", (client) => {
  client.query("SET statement_timeout = '30s'").catch(() => {
    // نتجاهل الخطأ هنا — الـ pool error handler يلتقطه
  });
});

pool.on("error", (err) => {
  // تسجيل أخطاء pool غير المتوقعة دون إيقاف العملية
  console.error("[DB_POOL] unexpected error:", err.message);
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
