/**
 * inventory-snapshot-scheduler.ts
 *
 * مُجدِّد مركزي لتحديث جداول التقارير المخزنية بعد أحداث تغيير المخزون:
 *   - rpt_inventory_snapshot
 *   - rpt_item_movements_summary
 *
 * المشكلة التي يحلّها:
 *   الـ polling كل 15 دقيقة يُبقي snapshot قديمًا بعد استلام بضاعة / بيع / مرتجع /
 *   تحويل. هذا المُجدِّد يُشغّل refresh خلال 2 ثانية من آخر حدث مخزوني.
 *
 * ضمانات التصميم:
 *   1. لا يعمل داخل transaction نشطة — يُستدعى فقط بعد commit.
 *   2. Debounce (DEBOUNCE_MS): يُدمج أحداثاً متعددة خلال نافذة قصيرة في run واحدة.
 *   3. لا تشغيل متوازي (isRunning): إذا كان refresh يعمل، يُحدَّد طلب pending واحد.
 *   4. بعد انتهاء run جارية، يُشغَّل pending واحد فقط (لا تكرار لا نهائي).
 *   5. تسجيل موحَّد عبر rpt-refresh-orchestrator لكل job على حدة.
 *
 * نقاط الاستدعاء:
 *   - اعتماد فاتورة مشتريات  (POST /api/purchase-invoices/:id/approve)
 *   - ترحيل فاتورة مبيعات    (POST /api/sales-invoices/:id/finalize)
 *   - ترحيل تحويل مخزون      (POST /api/transfers/:id/post)
 *   - مرتجع مبيعات           (POST /api/sales-returns)
 */

import { storage } from "../storage";
import { runRefresh, REFRESH_KEYS } from "./rpt-refresh-orchestrator";
import { logger } from "./logger";

const DEBOUNCE_MS = 2000;

let debounceHandle: ReturnType<typeof setTimeout> | null = null;
let isRunning       = false;
let pendingAfterRun = false;

/**
 * جدوِل refresh للـ snapshot و movements معاً بـ debounce لتجنّب الحمل الزائد.
 * آمن للاستدعاء من أي نقطة بعد commit — لا يحجب المُستجيب ولا ينتظر.
 *
 * @param reason - نص قصير للـ log (اسم الحدث: purchase_approved، sales_finalized، …)
 */
export function scheduleInventorySnapshotRefresh(reason: string): void {
  if (debounceHandle !== null) {
    clearTimeout(debounceHandle);
    logger.debug({ reason }, "[SNAP_SCHED] coalesced");
  } else {
    logger.debug({ reason }, "[SNAP_SCHED] scheduled");
  }

  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    void runScheduled(reason);
  }, DEBOUNCE_MS);
}

async function runScheduled(reason: string): Promise<void> {
  if (isRunning) {
    logger.debug({ reason }, "[SNAP_SCHED] busy, queued pending");
    pendingAfterRun = true;
    return;
  }

  isRunning = true;
  try {
    await Promise.all([
      runRefresh(
        REFRESH_KEYS.INVENTORY_SNAP,
        () => storage.refreshInventorySnapshot(),
        "event-driven",
      ),
      runRefresh(
        REFRESH_KEYS.ITEM_MOVEMENTS,
        () => storage.refreshItemMovementsSummary(),
        "event-driven",
      ),
    ]);
  } catch (_err: unknown) {
    // errors already logged + status updated by orchestrator; swallow here
    // so the scheduler's pendingAfterRun logic can still execute
  } finally {
    isRunning = false;
    if (pendingAfterRun) {
      pendingAfterRun = false;
      logger.debug("[SNAP_SCHED] running queued pending");
      await runScheduled("pending");
    }
  }
}
