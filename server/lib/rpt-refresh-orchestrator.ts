/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  rpt-refresh-orchestrator.ts — منسِّق تحديث جداول التقارير
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  المسؤوليات:
 *    1. تتبع حالة كل refresh job (idle / running / success / error) في الذاكرة
 *    2. تسجيل موحَّد: started / done / error / skipped
 *    3. منع التشغيل المتزامن عبر نفس المفتاح (per-key currentlyRunning flag)
 *    4. getStatusAll() — للمراقبة وعرض الحالة للمشرف
 *
 *  القرار: حالة في الذاكرة (in-memory).
 *  مبرر: التطبيق instance واحد، jobs تُشغَّل تلقائياً خلال 10-15 ثانية من
 *  بدء التشغيل، فترتسم الحالة سريعاً دون الحاجة لجدول في قاعدة البيانات.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DEPENDENCY MAP — خريطة التبعيات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ┌─────────────────────────────────────────────────────────────────────────┐
 *  │  rpt_patient_visit_summary                                              │
 *  │  ─────────────────────────                                              │
 *  │  Sources:   admissions, patient_invoice_headers, patient_invoice_lines, │
 *  │             doctor_transfers, patients                                  │
 *  │  Refresh:   refreshPatientVisitSummary()                                │
 *  │  Triggers:  startup (10s delay) → polling (15 min)                     │
 *  │             manual via POST /api/admin/rpt/refresh/patient_visit_summary│
 *  │  Consumers: GET /api/patients/stats                                     │
 *  ├─────────────────────────────────────────────────────────────────────────┤
 *  │  rpt_inventory_snapshot                                                 │
 *  │  ──────────────────────                                                 │
 *  │  Sources:   inventory_lots (qty_in_minor, is_active, expiry, costs)     │
 *  │  Refresh:   refreshInventorySnapshot()                                  │
 *  │  Triggers:  startup (12s delay) → polling (15 min)                     │
 *  │             event-driven via inventory-snapshot-scheduler (2s debounce) │
 *  │             after: purchase approve, sales finalize, transfer post,     │
 *  │                    sales return                                         │
 *  │             manual via POST /api/admin/rpt/refresh/inventory_snapshot   │
 *  │  Consumers: GET /api/items/search (searchItemsAdvanced)                 │
 *  ├─────────────────────────────────────────────────────────────────────────┤
 *  │  rpt_item_movements_summary                                             │
 *  │  ──────────────────────────                                             │
 *  │  Sources:   inventory_lot_movements JOIN inventory_lots                 │
 *  │  Grain:     one row per calendar day × item_id × warehouse_id           │
 *  │  Refresh:   refreshItemMovementsSummary()                               │
 *  │  Triggers:  startup (12s delay) → polling (15 min)                     │
 *  │             event-driven via inventory-snapshot-scheduler (2s debounce) │
 *  │             (same 4 stock-changing events as snapshot)                  │
 *  │             manual via POST /api/admin/rpt/refresh/item_movements_summary│
 *  │  Consumers: GET /api/reports/item-movements                             │
 *  └─────────────────────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export type TriggerSource = "startup" | "polling" | "event-driven" | "manual";
export type JobStatus    = "idle" | "running" | "success" | "error";

export interface RefreshJobStatus {
  refreshKey:        string;
  lastStartedAt:     string | null;
  lastFinishedAt:    string | null;
  lastStatus:        JobStatus;
  lastDurationMs:    number | null;
  lastRowsUpserted:  number | null;
  lastErrorMessage:  string | null;
  triggerSource:     TriggerSource | null;
  currentlyRunning:  boolean;
}

export interface RptRefreshResult {
  upserted:   number;
  durationMs: number;
  ranAt:      string;
}

// ── Canonical refresh keys ────────────────────────────────────────────────────
export const REFRESH_KEYS = {
  PATIENT_VISIT:  "patient_visit_summary",
  INVENTORY_SNAP: "inventory_snapshot",
  ITEM_MOVEMENTS: "item_movements_summary",
} as const;

export type RefreshKey = typeof REFRESH_KEYS[keyof typeof REFRESH_KEYS];

// ── In-memory status store ────────────────────────────────────────────────────
const statusMap = new Map<string, RefreshJobStatus>(
  Object.values(REFRESH_KEYS).map(key => [key, {
    refreshKey:       key,
    lastStartedAt:    null,
    lastFinishedAt:   null,
    lastStatus:       "idle",
    lastDurationMs:   null,
    lastRowsUpserted: null,
    lastErrorMessage: null,
    triggerSource:    null,
    currentlyRunning: false,
  }])
);

function getOrInit(key: string): RefreshJobStatus {
  let s = statusMap.get(key);
  if (!s) {
    s = {
      refreshKey:       key,
      lastStartedAt:    null,
      lastFinishedAt:   null,
      lastStatus:       "idle",
      lastDurationMs:   null,
      lastRowsUpserted: null,
      lastErrorMessage: null,
      triggerSource:    null,
      currentlyRunning: false,
    };
    statusMap.set(key, s);
  }
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns current refresh status for all registered reporting jobs.
 * Safe to call at any time — never mutates state.
 */
export function getStatusAll(): RefreshJobStatus[] {
  return Array.from(statusMap.values());
}

/**
 * Standardized refresh execution wrapper.
 *
 * Behaviour:
 *  - If the job is already running: logs "skipped" and returns null (no throw).
 *  - Marks running, logs "started".
 *  - Executes fn(), captures result.
 *  - On success: logs "done", updates status → success.
 *  - On error:   logs "error", updates status → error, RE-THROWS so callers can
 *                handle or propagate. Error is never swallowed silently.
 *  - Always clears currentlyRunning in finally.
 *
 * @param key     - One of REFRESH_KEYS values (or any unique string)
 * @param fn      - The async refresh function to execute
 * @param trigger - Why this refresh was triggered
 * @returns RptRefreshResult on success, null if skipped (already running)
 */
export async function runRefresh(
  key: string,
  fn: () => Promise<RptRefreshResult>,
  trigger: TriggerSource,
): Promise<RptRefreshResult | null> {
  const status = getOrInit(key);

  if (status.currentlyRunning) {
    console.log(`[RPT_ORCH] skipped key=${key} trigger=${trigger} reason=already_running`);
    return null;
  }

  status.currentlyRunning  = true;
  status.lastStatus        = "running";
  status.lastStartedAt     = new Date().toISOString();
  status.triggerSource     = trigger;
  status.lastErrorMessage  = null;
  console.log(`[RPT_ORCH] started key=${key} trigger=${trigger}`);

  const t0 = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - t0;

    status.lastDurationMs    = durationMs;
    status.lastRowsUpserted  = result.upserted;
    status.lastStatus        = "success";
    status.lastFinishedAt    = new Date().toISOString();
    console.log(
      `[RPT_ORCH] done key=${key} trigger=${trigger}` +
      ` upserted=${result.upserted} duration=${durationMs}ms`
    );
    return result;
  } catch (err: unknown) {
    const durationMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);

    status.lastDurationMs    = durationMs;
    status.lastStatus        = "error";
    status.lastFinishedAt    = new Date().toISOString();
    status.lastErrorMessage  = msg;
    console.error(
      `[RPT_ORCH] error key=${key} trigger=${trigger}` +
      ` duration=${durationMs}ms: ${msg}`
    );
    throw err;
  } finally {
    status.currentlyRunning = false;
  }
}
