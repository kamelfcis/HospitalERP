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
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_je_created_at
      ON journal_entries (created_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_je_status_entry_date
      ON journal_entries (status, entry_date DESC)
      WHERE status = 'posted'
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_treasury_txn_treasury_date
      ON treasury_transactions (treasury_id, transaction_date DESC)
      INCLUDE (amount, type, description)
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

  // ── Compound & Covering Indexes — Phase II ────────────────────────────────
  // كل فهرس مستقل في try-catch خاص به حتى لا يوقف خطأ واحد بقية الفهارس
  const p2Indexes: Array<[string, string]> = [];

  const p2 = async (name: string, ddl: string) => {
    try {
      await db.execute(sql.raw(ddl));
      p2Indexes.push([name, "OK"]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        p2Indexes.push([name, "EXISTS"]);
      } else {
        p2Indexes.push([name, `ERR: ${msg}`]);
        logger.warn({ index: name, err: msg }, `[STARTUP] Phase II index warning`);
      }
    }
  };

  // ① journal_entries: idempotency check — البحث بـ source_type + source_document_id
  // يُنفَّذ في كل تأكيد فاتورة — بدون هذا الفهرس يحدث seq scan على كل القيود
  await p2("idx_je_source_doc", `
    CREATE INDEX IF NOT EXISTS idx_je_source_doc
    ON journal_entries (source_type, source_document_id)
    WHERE source_document_id IS NOT NULL
  `);

  // ② patient_invoice_headers: قائمة فواتير القسم — الفلتر الأكثر استخداماً
  await p2("idx_pih_dept_status_date", `
    CREATE INDEX IF NOT EXISTS idx_pih_dept_status_date
    ON patient_invoice_headers (department_id, status, created_at DESC)
  `);

  // ③ patient_invoice_headers: retry worker — فلترة بحالة القيد
  await p2("idx_pih_journal_status", `
    CREATE INDEX IF NOT EXISTS idx_pih_journal_status
    ON patient_invoice_headers (journal_status)
    WHERE journal_status IN ('needs_retry', 'none', 'failed')
  `);

  // ④ patient_invoice_headers: تقرير مرضى التعاقد بالشركة
  await p2("idx_pih_company_status_date", `
    CREATE INDEX IF NOT EXISTS idx_pih_company_status_date
    ON patient_invoice_headers (company_id, status, created_at DESC)
    WHERE company_id IS NOT NULL
  `);

  // ⑤ patient_invoice_headers: فلتر نوع المريض + قسم
  await p2("idx_pih_type_dept_status", `
    CREATE INDEX IF NOT EXISTS idx_pih_type_dept_status
    ON patient_invoice_headers (patient_type, department_id, status)
  `);

  // ⑥ patient_invoice_lines: الاستعلام الأساسي لكل بنود الفاتورة (header + is_void)
  await p2("idx_pil_header_active", `
    CREATE INDEX IF NOT EXISTS idx_pil_header_active
    ON patient_invoice_lines (header_id, is_void)
  `);

  // ⑦ patient_invoice_lines: بنود فاتورة مع نوع البند — لحساب الإجماليات حسب النوع
  await p2("idx_pil_header_void_type", `
    CREATE INDEX IF NOT EXISTS idx_pil_header_void_type
    ON patient_invoice_lines (header_id, is_void, line_type)
  `);

  // ⑧ patient_invoice_lines: covering index للحساب المحاسبي (GL builder)
  await p2("idx_pil_header_gl_covering", `
    CREATE INDEX IF NOT EXISTS idx_pil_header_gl_covering
    ON patient_invoice_lines (header_id, is_void)
    INCLUDE (line_type, business_classification, total_price, doctor_id, cost_subtype)
  `);

  // ⑨ account_mappings: استعلام ربط الحسابات — النمط الأكثر تكراراً في توليد القيود
  await p2("idx_acct_map_tx_dept", `
    CREATE INDEX IF NOT EXISTS idx_acct_map_tx_dept
    ON account_mappings (transaction_type, department_id)
  `);

  // ⑩ accounting_event_log: retry worker — ترتيب بالحالة والتاريخ
  await p2("idx_ael_status_created", `
    CREATE INDEX IF NOT EXISTS idx_ael_status_created
    ON accounting_event_log (status, created_at DESC)
  `);

  // ⑪ sales_invoice_headers: قائمة صيدلية محددة مرتبة بالتاريخ
  await p2("idx_sih_pharmacy_status_date", `
    CREATE INDEX IF NOT EXISTS idx_sih_pharmacy_status_date
    ON sales_invoice_headers (pharmacy_id, status, created_at DESC)
  `);

  // ⑫ sales_invoice_headers: وردية الكاشير — تجميع إيرادات الوردية
  // العمود الصحيح هو claimed_by_shift_id
  await p2("idx_sih_shift_status", `
    CREATE INDEX IF NOT EXISTS idx_sih_shift_status
    ON sales_invoice_headers (claimed_by_shift_id, status)
    WHERE claimed_by_shift_id IS NOT NULL
  `);

  // ⑬ journal_lines: تقارير GL — ترصيد حساب معين في قيود متعددة
  await p2("idx_jl_entry_account", `
    CREATE INDEX IF NOT EXISTS idx_jl_entry_account
    ON journal_lines (journal_entry_id, account_id)
  `);

  // ⑭ journal_lines: دفتر الأستاذ مع covering columns لتجنب رجوع الجدول
  await p2("idx_jl_account_entry", `
    CREATE INDEX IF NOT EXISTS idx_jl_account_entry
    ON journal_lines (account_id, journal_entry_id)
    INCLUDE (debit, credit, description)
  `);

  // ⑮ patient_invoice_payments: سداد المريض مع الخزينة — يُستخدم في GL builder
  await p2("idx_pip_header_treasury", `
    CREATE INDEX IF NOT EXISTS idx_pip_header_treasury
    ON patient_invoice_payments (header_id, treasury_id)
    WHERE treasury_id IS NOT NULL
  `);

  // ⑯ rpt_patient_visit_summary: شاشة استعلام المرضى المنومين
  // العمود الصحيح هو admission_status (لا يوجد عمود status مباشر)
  await p2("idx_pvs_dept_admission_status_date", `
    CREATE INDEX IF NOT EXISTS idx_pvs_dept_admission_status_date
    ON rpt_patient_visit_summary (department_id, admission_status, visit_date DESC)
    WHERE department_id IS NOT NULL
  `);

  // ⑰ rpt_patient_visit_summary: نوع الزيارة + حالة التنويم
  await p2("idx_pvs_type_admission_status", `
    CREATE INDEX IF NOT EXISTS idx_pvs_type_admission_status
    ON rpt_patient_visit_summary (visit_type, admission_status, visit_date DESC)
  `);

  // ⑱ receiving_headers: قائمة مستلمات المخزن بالحالة والتاريخ
  await p2("idx_rh_warehouse_status_date", `
    CREATE INDEX IF NOT EXISTS idx_rh_warehouse_status_date
    ON receiving_headers (warehouse_id, status, receive_date DESC)
  `);

  // ⑲ store_transfers: تحويلات المخزن — مصدر + حالة + تاريخ
  await p2("idx_st_source_status_date", `
    CREATE INDEX IF NOT EXISTS idx_st_source_status_date
    ON store_transfers (source_warehouse_id, status, transfer_date DESC)
  `);

  // ⑳ store_transfers: تحويلات الوجهة — وجهة + حالة + تاريخ
  await p2("idx_st_dest_status_date", `
    CREATE INDEX IF NOT EXISTS idx_st_dest_status_date
    ON store_transfers (destination_warehouse_id, status, transfer_date DESC)
  `);

  // ㉑ purchase_invoice_lines: covering index لصفحة تفاصيل الفاتورة
  await p2("idx_pil_purchase_invoice_item", `
    CREATE INDEX IF NOT EXISTS idx_pil_purchase_invoice_item
    ON purchase_invoice_lines (invoice_id, item_id)
  `);

  // ㉒ sales_invoice_lines: covering index لحساب تكلفة الصيدلية
  // الأعمدة الصحيحة: qty, sale_price, line_total (لا يوجد quantity أو unit_price)
  await p2("idx_sil_invoice_item_covering", `
    CREATE INDEX IF NOT EXISTS idx_sil_invoice_item_covering
    ON sales_invoice_lines (invoice_id, item_id)
    INCLUDE (qty, sale_price, line_total, lot_id)
  `);

  // ㉓ admissions: compound لاستعلام نزيل نشط
  await p2("idx_adm_patient_status", `
    CREATE INDEX IF NOT EXISTS idx_adm_patient_status
    ON admissions (patient_id, status, admission_date DESC)
  `);

  // ㉔ admissions: covering index لـ ORDER BY created_at (اللازم لعرض القائمة بالتسلسل)
  await p2("idx_adm_created_at", `
    CREATE INDEX IF NOT EXISTS idx_adm_created_at
    ON admissions (created_at DESC)
  `);

  // ㉕ patient_invoice_headers: covering index لـ subquery inv_latest في شاشة الدخول
  // يشمل admission_id + status + is_consolidated مع INCLUDE للحقول المطلوبة
  await p2("idx_pih_adm_status_consolidated", `
    CREATE INDEX IF NOT EXISTS idx_pih_adm_status_consolidated
    ON patient_invoice_headers (admission_id, status, is_consolidated, created_at DESC)
    INCLUDE (invoice_number, id)
    WHERE admission_id IS NOT NULL
  `);

  // ㉖ admissions: GIN index لـ full-text search (pg_trgm) على patient_name و admission_number
  await p2("idx_adm_patient_name_trgm", `
    CREATE INDEX IF NOT EXISTS idx_adm_patient_name_trgm
    ON admissions USING GIN (patient_name gin_trgm_ops)
  `);

  // ㉗ inventory_lot_movements: covering index لتقرير حركة الأصناف
  await p2("idx_ilm_txdate_lot", `
    CREATE INDEX IF NOT EXISTS idx_ilm_txdate_lot
    ON inventory_lot_movements (tx_date, lot_id)
    INCLUDE (warehouse_id, qty_change_in_minor, tx_type)
  `);

  // ㉘ inventory_lots: covering index لتقرير المخزون اللحظي
  await p2("idx_lots_item_wh_qty", `
    CREATE INDEX IF NOT EXISTS idx_lots_item_wh_qty
    ON inventory_lots (item_id, warehouse_id)
    INCLUDE (qty_in_minor, expiry_date, purchase_price)
  `);

  const ok  = p2Indexes.filter(([, s]) => s === "OK" || s === "EXISTS").length;
  const err = p2Indexes.filter(([, s]) => s.startsWith("ERR")).length;
  log(`[STARTUP] Compound & covering indexes (Phase II): ${ok} OK, ${err} errors`);
  if (err > 0) {
    const failures = p2Indexes.filter(([, s]) => s.startsWith("ERR"));
    logger.warn({ failures }, "[STARTUP] Phase II index failures (non-fatal)");
  }
}
