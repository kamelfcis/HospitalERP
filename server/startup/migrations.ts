/**
 * server/startup/migrations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ترقيات قاعدة البيانات التلقائية عند بدء التشغيل
 * (enums, indexes, columns, settings, unique constraints)
 *
 * كل عملية idempotent — آمنة للتنفيذ المتكرر في كل تشغيل.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

type LogFn = (msg: string, source?: string) => void;

export async function runMigrations(log: LogFn): Promise<void> {
  // ── Cashier collection journal hardening ──────────────────────────────────
  try {
    await db.execute(sql`ALTER TYPE journal_status ADD VALUE IF NOT EXISTS 'failed'`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_je_cashier_collection_dedup
      ON journal_entries (source_document_id)
      WHERE source_type = 'cashier_collection'
    `);
    log("[STARTUP] journal_status 'failed' + idx_je_cashier_collection_dedup ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] cashier_collection hardening error");
  }

  // ── Performance indexes ───────────────────────────────────────────────────
  try {
    try { await db.execute(sql`DROP INDEX IF EXISTS idx_lots_item_warehouse_expiry_month`); } catch { /* ignore */ }
    try { await db.execute(sql`DROP INDEX IF EXISTS idx_lots_fefo`);          } catch { /* ignore */ }
    try { await db.execute(sql`DROP INDEX IF EXISTS idx_lots_fefo_covering`); } catch { /* ignore */ }

    await db.execute(sql`
      CREATE INDEX idx_lots_fefo
      ON inventory_lots (item_id, warehouse_id, expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC)
      WHERE is_active = true AND qty_in_minor::numeric > 0
    `);
    await db.execute(sql`
      CREATE INDEX idx_lots_fefo_covering
      ON inventory_lots (item_id, warehouse_id, expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC)
      INCLUDE (id, qty_in_minor, purchase_price, sale_price, expiry_date)
      WHERE is_active = true AND qty_in_minor::numeric > 0
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_je_source_type_date
      ON journal_entries (source_type, entry_date DESC)
    `);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_je_description_trgm
      ON journal_entries USING gin (description gin_trgm_ops)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pi_supplier_date
      ON purchase_invoice_headers (supplier_id, invoice_date DESC)
      WHERE status != 'cancelled'
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_users_group_id
      ON users (permission_group_id)
      WHERE is_active = true
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sales_inv_handover_credit
      ON sales_invoice_headers (claimed_by_shift_id, customer_type, status)
      WHERE is_return = false AND claimed_by_shift_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_store_transfers_status
      ON store_transfers (status, transfer_date DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pr_warehouse_date
      ON purchase_return_headers (warehouse_id, created_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_receiving_status_date
      ON receiving_headers (status, receive_date DESC)
      WHERE status != 'cancelled'
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sales_lines_inv_lot
      ON sales_invoice_lines (invoice_id, lot_id)
      WHERE lot_id IS NOT NULL
    `);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_items_name_ar_trgm
      ON items USING GIN (name_ar gin_trgm_ops)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_items_code_trgm
      ON items USING GIN (item_code gin_trgm_ops)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_shortage_events_item_user_at
      ON shortage_events (item_id, requested_by, requested_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_shortage_agg_count_last
      ON shortage_agg (request_count DESC, last_requested_at DESC)
      WHERE is_resolved = false
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_lot_movements_ref
      ON inventory_lot_movements (reference_type, reference_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sih_contract_report
      ON sales_invoice_headers (customer_type, status, invoice_date DESC)
      WHERE customer_type = 'contract'
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_patients_name_lower
      ON patients (LOWER(TRIM(full_name)))
    `);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_patients_name_trgm
      ON patients USING GIN (full_name gin_trgm_ops)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_adm_walkin_name
      ON admissions (LOWER(TRIM(patient_name)))
      WHERE patient_id IS NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pil_service_id
      ON patient_invoice_lines (service_id)
      WHERE service_id IS NOT NULL AND is_void = false
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pil_item_id
      ON patient_invoice_lines (item_id)
      WHERE item_id IS NOT NULL AND is_void = false
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pih_visit_draft
      ON patient_invoice_headers (visit_id, status)
      WHERE visit_id IS NOT NULL AND status = 'draft'
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pih_visit_status
      ON patient_invoice_headers (visit_id, status)
      WHERE visit_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pil_encounter_active
      ON patient_invoice_lines (encounter_id)
      WHERE encounter_id IS NOT NULL AND is_void = false
    `);
    await db.execute(sql`DROP INDEX IF EXISTS idx_enc_visit_type_active`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_enc_visit_type_dept_active
      ON encounters (visit_id, encounter_type, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'))
      WHERE status = 'active'
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pat_line_linked_line
      ON patient_invoice_lines (linked_line_id)
      WHERE linked_line_id IS NOT NULL
    `);
    log("[STARTUP] Performance indexes ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] performance index error");
  }

  // ── patient_invoice_status 'finalizing' enum ─────────────────────────────
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumtypid = 'patient_invoice_status'::regtype AND enumlabel = 'finalizing'
        ) THEN
          ALTER TYPE patient_invoice_status ADD VALUE IF NOT EXISTS 'finalizing' BEFORE 'finalized';
        END IF;
      END
      $$
    `);
    log("[STARTUP] patient_invoice_status 'finalizing' enum value ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] enum alter error");
  }

  // ── Default system settings seeds ─────────────────────────────────────────
  const settingsDefaults: Array<[string, string, string]> = [
    ["cashier_treasury_account_code", "12127", "cashier_treasury_account_code"],
    ["pharmacy_mode", "false", "pharmacy_mode"],
    ["returns_mode", "reverse_original", "returns_mode"],
    ["enable_pharmacy_sales_output_vat", "false", "enable_pharmacy_sales_output_vat"],
    ["enable_deferred_cost_issue", "false", "enable_deferred_cost_issue"],
  ];

  for (const [key, value, label] of settingsDefaults) {
    try {
      await db.execute(sql`
        INSERT INTO system_settings (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key) DO NOTHING
      `);
      const defaultHint = value !== key ? ` (default: ${value})` : "";
      log(`[STARTUP] ${label} setting ensured${defaultHint}`);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, `[STARTUP] ${label} seed error`);
    }
  }

  // ── Stay Engine UNIQUE constraint ─────────────────────────────────────────
  try {
    const dupRes = await db.execute(sql`
      SELECT source_type, source_id, COUNT(*) AS cnt
      FROM patient_invoice_lines
      WHERE is_void = false
        AND source_type IS NOT NULL
        AND source_id IS NOT NULL
      GROUP BY source_type, source_id
      HAVING COUNT(*) > 1
    `);
    const dups = (dupRes as any).rows ?? [];

    if (dups.length > 0) {
      logger.error({
        event:   "STAY_ENGINE_DUPLICATES_FOUND",
        count:   dups.length,
        samples: dups.slice(0, 5),
        hint:    "Duplicates must be resolved manually before the UNIQUE index can be created",
      }, `[STARTUP] STAY_ENGINE: ${dups.length} duplicate (source_type, source_id) row(s) found — UNIQUE index NOT created. Manual repair required.`);
    } else {
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pil_source_type_id
        ON patient_invoice_lines (source_type, source_id)
        WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
      `);
      log("[STARTUP] uq_pil_source_type_id UNIQUE index ensured (Stay Engine ON CONFLICT ready)");
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] Stay Engine UNIQUE index error");
  }

  // ── Inventory lots true-duplicate guardrail ───────────────────────────────
  try {
    const trueDups = await db.execute(sql`
      SELECT item_id, warehouse_id, expiry_month, expiry_year,
             CAST(purchase_price AS numeric) AS price, COUNT(*) AS cnt
      FROM inventory_lots
      WHERE is_active = true
      GROUP BY item_id, warehouse_id, expiry_month, expiry_year, CAST(purchase_price AS numeric)
      HAVING COUNT(*) > 1
    `);
    const trueDupRows = (trueDups as any).rows ?? [];
    if (trueDupRows.length > 0) {
      logger.warn(
        { duplicates: trueDupRows.length },
        `[STARTUP] INVENTORY_LOTS: ${trueDupRows.length} true-duplicate lot group(s) found (same item+warehouse+expiry+cost). ` +
        `UNIQUE index NOT created. Run data repair before re-enabling.`
      );
    } else {
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_lots_item_wh_expiry_cost
        ON inventory_lots (item_id, warehouse_id, expiry_month, expiry_year, purchase_price)
        WHERE is_active = true
      `);
      log("[STARTUP] uq_lots_item_wh_expiry_cost UNIQUE index ensured (true-duplicate prevention active)");
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] Inventory lots UNIQUE index error");
  }

  // ── Admission + consolidated index ────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pih_admission_consolidated
      ON patient_invoice_headers (admission_id, is_consolidated)
      WHERE admission_id IS NOT NULL
    `);
    log("[STARTUP] idx_pih_admission_consolidated index ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] admission_consolidated index error");
  }

  // ── Visit Group composite index ───────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pat_inv_visit_group_patient
      ON patient_invoice_headers (visit_group_id, patient_id)
      WHERE visit_group_id IS NOT NULL
    `);
    log("[STARTUP] idx_pat_inv_visit_group_patient index ensured");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] visit_group_patient index error");
  }
}
