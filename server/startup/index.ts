/**
 * server/startup/index.ts — نقطة تجميع عمليات بدء التشغيل
 * ─────────────────────────────────────────────────────────────────────────────
 * يُصدِّر دالة واحدة `runStartup(log)` تُنفَّذ بالترتيب الأصلي:
 *
 *  1. migrations    — enums, indexes, columns, settings
 *  2. sequences     — مزامنة التسلسلات
 *  3. permission-backfills — صلاحيات مجموعات النظام
 *  4. backfills     — بيانات تاريخية (visits, encounters, lots, doctors)
 *  5. integrity-checks — فحوصات سلامة (غير مُوقِفة)
 *  6. cron          — المهام الخلفية الدورية
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { runMigrations } from "./migrations";
import { syncSequences } from "./sequences";
import { runPermissionBackfills } from "./permission-backfills";
import { runBackfills } from "./backfills";
import { runIntegrityChecks } from "./integrity-checks";
import { startCronJobs } from "./cron";

type LogFn = (msg: string, source?: string) => void;

export async function runStartup(log: LogFn): Promise<void> {
  await runMigrations(log);
  await syncSequences(log);
  await runPermissionBackfills(log);
  await runBackfills(log);
  await runIntegrityChecks(log);
  startCronJobs(log);
}
