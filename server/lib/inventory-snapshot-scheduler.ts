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
 *   5. يُسجَّل كل حدث بوضوح: scheduling / coalescing / execution / error.
 *
 * نقاط الاستدعاء:
 *   - اعتماد فاتورة مشتريات  (POST /api/purchase-invoices/:id/approve)
 *   - ترحيل فاتورة مبيعات    (POST /api/sales-invoices/:id/finalize)
 *   - ترحيل تحويل مخزون      (POST /api/transfers/:id/post)
 *   - مرتجع مبيعات           (POST /api/sales-returns)
 */

import { storage } from "../storage";

// نافذة الدمج: نتظر 2 ثانية من آخر حدث قبل تشغيل الـ refresh
const DEBOUNCE_MS = 2000;

let debounceHandle: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let pendingAfterRun = false;

/**
 * جدوِل refresh للـ snapshot مع debounce لتجنّب الحمل الزائد.
 * آمن للاستدعاء من أي نقطة بعد commit — لا يحجب المُستجيب ولا ينتظر.
 *
 * @param reason - نص قصير للـ log (اسم الحدث: purchase_approved، sales_finalized، …)
 */
export function scheduleInventorySnapshotRefresh(reason: string): void {
  if (debounceHandle !== null) {
    // يوجد طلب معلَّق — نُعيد ضبط المؤقت (coalesce)
    clearTimeout(debounceHandle);
    console.log(`[SNAP_SCHED] coalesced reason=${reason}`);
  } else {
    console.log(`[SNAP_SCHED] scheduled reason=${reason}`);
  }

  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    void runRefresh(reason);
  }, DEBOUNCE_MS);
}

async function runRefresh(reason: string): Promise<void> {
  if (isRunning) {
    // refresh يعمل الآن — نحتفظ بطلب واحد pending
    console.log(`[SNAP_SCHED] busy, queued pending reason=${reason}`);
    pendingAfterRun = true;
    return;
  }

  isRunning = true;
  const t0 = Date.now();
  try {
    const [snapResult, movResult] = await Promise.all([
      storage.refreshInventorySnapshot(),
      storage.refreshItemMovementsSummary(),
    ]);
    const dur = Date.now() - t0;
    console.log(
      `[SNAP_SCHED] done reason=${reason}` +
      ` snap.upserted=${snapResult.upserted}` +
      ` mov.upserted=${movResult.upserted}` +
      ` duration=${dur}ms`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SNAP_SCHED] error reason=${reason}: ${msg}`);
  } finally {
    isRunning = false;
    if (pendingAfterRun) {
      pendingAfterRun = false;
      console.log(`[SNAP_SCHED] running queued pending`);
      await runRefresh("pending");
    }
  }
}
