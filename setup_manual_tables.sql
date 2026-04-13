-- =============================================================================
--  setup_manual_tables.sql
--  جداول غير مُدارة بـ Drizzle ORM — يجب تنفيذها يدوياً قبل تشغيل التطبيق
-- =============================================================================
--
--  لماذا هذه الجداول خارج Drizzle?
--  ─────────────────────────────────
--  هذه الجداول مستثناة من drizzle.config.ts (tablesFilter)
--  لأنها جداول تقارير (رصيد مؤقت يُعاد بناؤه) أو جداول نظام.
--  يديرها الـ rpt-refresh-orchestrator وليس Drizzle.
--
--  كيفية التشغيل:
--  ──────────────
--    psql $DATABASE_URL -f setup_manual_tables.sql
--
--  كل الأوامر idempotent — آمنة للتنفيذ المتكرر.
-- =============================================================================

-- ─── 1. جدول الإعلانات ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON announcements (is_active, created_at DESC)
  WHERE is_active = TRUE;

-- ─── 2. سجل تحديث جداول التقارير ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS rpt_refresh_log_id_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS rpt_refresh_log (
  id                 BIGINT PRIMARY KEY DEFAULT nextval('rpt_refresh_log_id_seq'),
  report_table_name  VARCHAR(100) NOT NULL,
  refresh_function   VARCHAR(100) NOT NULL,
  refresh_params     JSONB,
  refresh_start_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  refresh_end_at     TIMESTAMP WITHOUT TIME ZONE,
  duration_ms        INTEGER,
  status             VARCHAR(20) NOT NULL DEFAULT 'running',
  rows_affected      INTEGER,
  rows_inspected     INTEGER,
  error_message      TEXT,
  error_detail       TEXT,
  error_context      TEXT,
  triggered_by       VARCHAR(50) NOT NULL DEFAULT 'nightly_batch',
  triggered_by_user  VARCHAR,
  period_id          VARCHAR,
  date_scope         DATE
);
CREATE INDEX IF NOT EXISTS ridx_rrl_table_start
  ON rpt_refresh_log (report_table_name, refresh_start_at DESC);
CREATE INDEX IF NOT EXISTS ridx_rrl_running
  ON rpt_refresh_log (status, refresh_start_at)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS ridx_rrl_failures
  ON rpt_refresh_log (status, refresh_start_at DESC)
  WHERE status IN ('failed', 'partial');

-- ─── 3. ملخص زيارات المرضى (استعلام الدخول) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_patient_visit_summary (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type           VARCHAR(50)  NOT NULL,
  source_id             VARCHAR      NOT NULL,
  visit_type            VARCHAR(20)  NOT NULL,
  visit_date            DATE         NOT NULL,
  discharge_date        DATE,
  los_days              NUMERIC(8,2),
  period_year           SMALLINT     NOT NULL,
  period_month          SMALLINT     NOT NULL,
  period_week           SMALLINT     NOT NULL,
  patient_id            VARCHAR,
  patient_name          TEXT         NOT NULL,
  patient_type          VARCHAR(30),
  insurance_company     TEXT,
  payment_type          VARCHAR(30),
  department_id         VARCHAR,
  department_name       TEXT,
  doctor_name           TEXT,
  surgery_type_id       VARCHAR,
  surgery_type_name     TEXT,
  admission_status      VARCHAR(20),
  invoice_count         SMALLINT     NOT NULL DEFAULT 0,
  total_invoiced        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_paid            NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_balance   NUMERIC(15,2) NOT NULL DEFAULT 0,
  service_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,
  drug_revenue          NUMERIC(15,2) NOT NULL DEFAULT 0,
  consumable_revenue    NUMERIC(15,2) NOT NULL DEFAULT 0,
  stay_revenue          NUMERIC(15,2) NOT NULL DEFAULT 0,
  service_line_count    INTEGER      NOT NULL DEFAULT 0,
  drug_line_count       INTEGER      NOT NULL DEFAULT 0,
  consumable_line_count INTEGER      NOT NULL DEFAULT 0,
  or_room_total         NUMERIC(15,2) NOT NULL DEFAULT 0,
  transferred_total     NUMERIC(15,2) NOT NULL DEFAULT 0,
  refreshed_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rpt_pvs_source_unique
  ON rpt_patient_visit_summary (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_pvs_dept_admission_status_date
  ON rpt_patient_visit_summary (department_id, admission_status, visit_date DESC)
  WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pvs_type_admission_status
  ON rpt_patient_visit_summary (visit_type, admission_status, visit_date DESC);

-- ─── 4. تصنيف بنود فاتورة المريض ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_patient_visit_classification (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type             VARCHAR(50) NOT NULL,
  source_id               VARCHAR     NOT NULL,
  patient_id              VARCHAR,
  department_id           VARCHAR,
  period_year             SMALLINT    NOT NULL,
  period_month            SMALLINT    NOT NULL,
  business_classification VARCHAR(50) NOT NULL,
  total_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
  line_count              INTEGER     NOT NULL DEFAULT 0,
  refreshed_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rpt_patient_visit_classificat_source_type_source_id_busines_key
  ON rpt_patient_visit_classification (source_type, source_id, business_classification);
CREATE INDEX IF NOT EXISTS idx_rpvc_source
  ON rpt_patient_visit_classification (source_type, source_id);
CREATE INDEX IF NOT EXISTS ridx_rpvc_period
  ON rpt_patient_visit_classification (period_year, period_month, business_classification);
CREATE INDEX IF NOT EXISTS ridx_rpvc_dept
  ON rpt_patient_visit_classification (department_id, period_year, period_month)
  WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_rpvc_patient
  ON rpt_patient_visit_classification (patient_id, business_classification)
  WHERE patient_id IS NOT NULL;

-- ─── 5. إيرادات المرضى الشهرية ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_patient_revenue (
  id                   VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year          SMALLINT     NOT NULL,
  period_month         SMALLINT     NOT NULL,
  patient_id           VARCHAR,
  patient_name         TEXT         NOT NULL,
  patient_type         VARCHAR(30),
  insurance_company    TEXT,
  visit_count          INTEGER      NOT NULL DEFAULT 0,
  invoice_count        INTEGER      NOT NULL DEFAULT 0,
  total_invoiced       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_discount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_paid           NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  refreshed_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rpt_pr_patient_period_unique
  ON rpt_patient_revenue (period_year, period_month, patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS ridx_pr_walksin
  ON rpt_patient_revenue (period_year, period_month)
  WHERE patient_id IS NULL;
CREATE INDEX IF NOT EXISTS ridx_pr_period
  ON rpt_patient_revenue (period_year, period_month);
CREATE INDEX IF NOT EXISTS ridx_pr_patient
  ON rpt_patient_revenue (patient_id, period_year DESC)
  WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_pr_insurance_period
  ON rpt_patient_revenue (insurance_company, period_year, period_month)
  WHERE insurance_company IS NOT NULL;

-- ─── 6. استخدام الخدمات لكل بند فاتورة ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_patient_service_usage (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source_line_id     VARCHAR      NOT NULL UNIQUE,
  invoice_id         VARCHAR      NOT NULL,
  visit_summary_id   VARCHAR,
  service_date       DATE         NOT NULL,
  period_year        SMALLINT     NOT NULL,
  period_month       SMALLINT     NOT NULL,
  patient_id         VARCHAR,
  patient_name       TEXT         NOT NULL,
  patient_type       VARCHAR(30),
  insurance_company  TEXT,
  department_id      VARCHAR,
  department_name    TEXT,
  doctor_name        TEXT,
  line_type          VARCHAR(20)  NOT NULL,
  service_id         VARCHAR,
  service_name       TEXT,
  service_category   TEXT,
  item_id            VARCHAR,
  item_name          TEXT,
  item_category      TEXT,
  quantity           NUMERIC(12,3) NOT NULL,
  unit_price         NUMERIC(15,2) NOT NULL,
  discount_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_price        NUMERIC(15,2) NOT NULL,
  unit_cost          NUMERIC(15,4),
  cogs               NUMERIC(15,2),
  gross_margin       NUMERIC(15,2),
  is_void            BOOLEAN      NOT NULL DEFAULT FALSE,
  voided_at          TIMESTAMP WITHOUT TIME ZONE,
  refreshed_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ridx_psu_period
  ON rpt_patient_service_usage (period_year, period_month);
CREATE INDEX IF NOT EXISTS ridx_psu_active
  ON rpt_patient_service_usage (service_date DESC)
  WHERE is_void = FALSE;
CREATE INDEX IF NOT EXISTS ridx_psu_visit
  ON rpt_patient_service_usage (visit_summary_id)
  WHERE visit_summary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_psu_dept_period
  ON rpt_patient_service_usage (department_id, period_year, period_month)
  WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_psu_service_period
  ON rpt_patient_service_usage (service_id, period_year, period_month)
  WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_psu_item_date
  ON rpt_patient_service_usage (item_id, service_date DESC)
  WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_psu_doctor_period
  ON rpt_patient_service_usage (doctor_name, period_year, period_month)
  WHERE doctor_name IS NOT NULL;

-- ─── 7. الإيرادات اليومية ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_daily_revenue (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_date       DATE         NOT NULL,
  period_year        SMALLINT     NOT NULL,
  period_month       SMALLINT     NOT NULL,
  period_week        SMALLINT     NOT NULL,
  source_type        VARCHAR(30)  NOT NULL,
  department_id      VARCHAR,
  department_name    TEXT,
  pharmacy_id        VARCHAR,
  pharmacy_name      TEXT,
  doctor_name        TEXT,
  invoice_count      INTEGER      NOT NULL DEFAULT 0,
  return_count       INTEGER      NOT NULL DEFAULT 0,
  total_gross        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_discount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_net          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_collected    NUMERIC(15,2) NOT NULL DEFAULT 0,
  service_revenue    NUMERIC(15,2) NOT NULL DEFAULT 0,
  drug_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,
  consumable_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  stay_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_cogs         NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_profit       NUMERIC(15,2) NOT NULL DEFAULT 0,
  refreshed_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ridx_dr_upsert
  ON rpt_daily_revenue (
    revenue_date, source_type,
    COALESCE(department_id, ''),
    COALESCE(pharmacy_id, ''),
    COALESCE(doctor_name, '')
  );
CREATE INDEX IF NOT EXISTS ridx_dr_date
  ON rpt_daily_revenue (revenue_date DESC);
CREATE INDEX IF NOT EXISTS ridx_dr_period
  ON rpt_daily_revenue (period_year, period_month);
CREATE INDEX IF NOT EXISTS ridx_dr_source_date
  ON rpt_daily_revenue (source_type, revenue_date DESC);
CREATE INDEX IF NOT EXISTS ridx_dr_dept_date
  ON rpt_daily_revenue (department_id, revenue_date DESC)
  WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_dr_pharmacy_date
  ON rpt_daily_revenue (pharmacy_id, revenue_date DESC)
  WHERE pharmacy_id IS NOT NULL;

-- ─── 8. نشاط الأقسام اليومي ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_department_activity (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_date           DATE         NOT NULL,
  period_year             SMALLINT     NOT NULL,
  period_month            SMALLINT     NOT NULL,
  department_id           VARCHAR      NOT NULL,
  department_name         TEXT         NOT NULL,
  new_admissions          INTEGER      NOT NULL DEFAULT 0,
  discharges              INTEGER      NOT NULL DEFAULT 0,
  census_eod              INTEGER      NOT NULL DEFAULT 0,
  total_beds              INTEGER      NOT NULL DEFAULT 0,
  beds_occupied_eod       INTEGER      NOT NULL DEFAULT 0,
  occupancy_rate          NUMERIC(5,4) NOT NULL DEFAULT 0,
  clinic_orders_placed    INTEGER      NOT NULL DEFAULT 0,
  clinic_orders_executed  INTEGER      NOT NULL DEFAULT 0,
  invoices_created        INTEGER      NOT NULL DEFAULT 0,
  invoices_finalized      INTEGER      NOT NULL DEFAULT 0,
  gross_revenue           NUMERIC(15,2) NOT NULL DEFAULT 0,
  refreshed_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rpt_department_activity_activity_date_department_id_key
  ON rpt_department_activity (activity_date, department_id);

-- ─── 9. لقطة المخزون ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_inventory_snapshot (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date         DATE         NOT NULL,
  item_id               VARCHAR      NOT NULL,
  item_code             TEXT,
  item_name             TEXT         NOT NULL,
  item_category         TEXT,
  has_expiry            BOOLEAN      NOT NULL DEFAULT FALSE,
  warehouse_id          VARCHAR      NOT NULL,
  warehouse_code        TEXT,
  warehouse_name        TEXT         NOT NULL,
  qty_in_minor          NUMERIC(18,3) NOT NULL DEFAULT 0,
  active_lot_count      INTEGER      NOT NULL DEFAULT 0,
  expired_qty           NUMERIC(18,3) NOT NULL DEFAULT 0,
  expiring_30d_qty      NUMERIC(18,3) NOT NULL DEFAULT 0,
  expiring_90d_qty      NUMERIC(18,3) NOT NULL DEFAULT 0,
  earliest_expiry_date  DATE,
  nearest_expiry_lot_id VARCHAR,
  refreshed_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rpt_inventory_snapshot_snapshot_date_item_id_warehouse_id_key
  ON rpt_inventory_snapshot (snapshot_date, item_id, warehouse_id);

-- ─── 10. ملخص حركة الأصناف ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_item_movements_summary (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_date    DATE         NOT NULL,
  period_year      SMALLINT     NOT NULL,
  period_month     SMALLINT     NOT NULL,
  item_id          VARCHAR      NOT NULL,
  item_name        TEXT         NOT NULL,
  item_category    TEXT,
  warehouse_id     VARCHAR      NOT NULL,
  warehouse_name   TEXT         NOT NULL,
  received_qty     NUMERIC(15,3) NOT NULL DEFAULT 0,
  received_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
  receipt_tx_count INTEGER      NOT NULL DEFAULT 0,
  issued_qty       NUMERIC(15,3) NOT NULL DEFAULT 0,
  issued_value     NUMERIC(15,2) NOT NULL DEFAULT 0,
  issue_tx_count   INTEGER      NOT NULL DEFAULT 0,
  return_in_qty    NUMERIC(15,3) NOT NULL DEFAULT 0,
  return_out_qty   NUMERIC(15,3) NOT NULL DEFAULT 0,
  refreshed_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rpt_item_movements_summary_movement_date_item_id_warehouse__key
  ON rpt_item_movements_summary (movement_date, item_id, warehouse_id);

-- ─── 11. أرصدة الحسابات لكل فترة ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rpt_account_balances_by_period (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id          VARCHAR      NOT NULL,
  period_year        SMALLINT     NOT NULL,
  period_month       SMALLINT     NOT NULL,
  period_name        TEXT,
  is_period_closed   BOOLEAN      NOT NULL DEFAULT FALSE,
  account_id         VARCHAR      NOT NULL,
  account_code       TEXT         NOT NULL,
  account_name       TEXT         NOT NULL,
  account_type       TEXT         NOT NULL,
  account_level      SMALLINT,
  parent_account_id  VARCHAR,
  cost_center_id     VARCHAR,
  cost_center_code   TEXT,
  cost_center_name   TEXT,
  opening_balance    NUMERIC(18,2) NOT NULL DEFAULT 0,
  period_debit       NUMERIC(18,2) NOT NULL DEFAULT 0,
  period_credit      NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance    NUMERIC(18,2) NOT NULL DEFAULT 0,
  journal_line_count INTEGER      NOT NULL DEFAULT 0,
  last_entry_date    DATE,
  refreshed_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rpt_account_balances_by_perio_period_id_account_id_cost_cen_key
  ON rpt_account_balances_by_period (period_id, account_id, COALESCE(cost_center_id, ''));
CREATE INDEX IF NOT EXISTS ridx_abp_account_period
  ON rpt_account_balances_by_period (account_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS ridx_abp_parent
  ON rpt_account_balances_by_period (parent_account_id, period_id)
  WHERE parent_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ridx_abp_cc_period
  ON rpt_account_balances_by_period (cost_center_id, period_id)
  WHERE cost_center_id IS NOT NULL;

-- =============================================================================
--  ملاحظة: جدول session يُنشئه connect-pg-simple تلقائياً عند أول تشغيل
--  لا داعي لإنشائه يدوياً.
-- =============================================================================
