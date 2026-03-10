-- ============================================================
-- HOSPITAL ERP — REPORTING LAYER
-- File 01: Table Definitions
-- Architecture: Pre-aggregated denormalized reporting tables
-- populated by refresh logic (see 03_refresh_logic.sql).
-- DO NOT add foreign key constraints to transactional tables —
-- reporting tables are intentionally decoupled.
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  PATIENT JOURNEY                                        │
-- └─────────────────────────────────────────────────────────┘

-- -----------------------------------------------------------
-- rpt_patient_visit_summary
-- One row per patient visit (inpatient admission or
-- outpatient invoice). Pre-joins patient + clinical +
-- billing totals so reports never touch multiple large tables.
--
-- Refresh strategy: INCREMENTAL EVENT-DRIVEN
--   Triggered on: admission discharge, invoice finalize,
--   payment recording.  Past rows are NOT rebuilt unless
--   a void/adjustment occurs.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_patient_visit_summary (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Explicit source tracing (two-column pattern — no discriminator inference needed)
    source_type           VARCHAR(50)  NOT NULL,          -- exact source table: 'admissions' | 'patient_invoice_headers'
    source_id             VARCHAR      NOT NULL,          -- PK value in the source table named by source_type
    visit_type            VARCHAR(20)  NOT NULL,          -- clinical display: 'inpatient' | 'outpatient'
    visit_date            DATE         NOT NULL,
    discharge_date        DATE,
    los_days              NUMERIC(8,2),                   -- length of stay (NULL for outpatient)

    -- Period bucketing (avoids EXTRACT on every query)
    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,
    period_week           SMALLINT     NOT NULL,

    -- Patient dimension
    patient_id            VARCHAR,
    patient_name          TEXT         NOT NULL,
    patient_type          VARCHAR(30),                    -- 'cash' | 'insurance' | 'contract'
    insurance_company     TEXT,
    payment_type          VARCHAR(30),

    -- Clinical dimension
    department_id         VARCHAR,
    department_name       TEXT,
    doctor_name           TEXT,
    surgery_type_id       VARCHAR,
    surgery_type_name     TEXT,
    admission_status      VARCHAR(20),                    -- 'active' | 'discharged' | 'cancelled'

    -- Billing summary
    invoice_count         SMALLINT     NOT NULL DEFAULT 0,
    total_invoiced        NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_paid            NUMERIC(15,2) NOT NULL DEFAULT 0,
    outstanding_balance   NUMERIC(15,2) NOT NULL DEFAULT 0,  -- net_amount - total_paid

    -- Line-type breakdown
    service_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,
    drug_revenue          NUMERIC(15,2) NOT NULL DEFAULT 0,
    consumable_revenue    NUMERIC(15,2) NOT NULL DEFAULT 0,
    stay_revenue          NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Line counts
    service_line_count    INTEGER      NOT NULL DEFAULT 0,
    drug_line_count       INTEGER      NOT NULL DEFAULT 0,
    consumable_line_count INTEGER      NOT NULL DEFAULT 0,

    -- Metadata
    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    -- Unique: one row per source record
    CONSTRAINT rpt_pvs_source_unique UNIQUE (source_type, source_id)
);


-- -----------------------------------------------------------
-- rpt_patient_service_usage
-- One row per non-voided patient invoice line.
-- Supports: service utilisation by dept/doctor, drug
-- consumption per patient, procedure counts, gross margin
-- per service.
--
-- Refresh strategy: INCREMENTAL APPEND ON INVOICE FINALIZE
--   Insert new rows when invoice is finalised.
--   Mark rows void_flag=true when line is voided.
--   Never physically delete — keeps audit trail.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_patient_service_usage (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source reference
    source_line_id        VARCHAR      NOT NULL UNIQUE,   -- patient_invoice_lines.id
    invoice_id            VARCHAR      NOT NULL,          -- patient_invoice_headers.id
    visit_summary_id      VARCHAR,                        -- FK to rpt_patient_visit_summary.id

    -- Date
    service_date          DATE         NOT NULL,
    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,

    -- Patient context
    patient_id            VARCHAR,
    patient_name          TEXT         NOT NULL,
    patient_type          VARCHAR(30),
    insurance_company     TEXT,

    -- Clinical context
    department_id         VARCHAR,
    department_name       TEXT,
    doctor_name           TEXT,

    -- Service / item
    line_type             VARCHAR(20)  NOT NULL,          -- 'service' | 'drug' | 'consumable' | 'stay'
    service_id            VARCHAR,
    service_name          TEXT,
    service_category      TEXT,
    item_id               VARCHAR,
    item_name             TEXT,
    item_category         TEXT,                           -- items.category enum

    -- Financials
    quantity              NUMERIC(12,3) NOT NULL,
    unit_price            NUMERIC(15,2) NOT NULL,
    discount_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_price           NUMERIC(15,2) NOT NULL,
    unit_cost             NUMERIC(15,4),                  -- from lot at sale time
    cogs                  NUMERIC(15,2),                  -- quantity * unit_cost (minor-adjusted)
    gross_margin          NUMERIC(15,2),                  -- total_price - cogs

    -- Void tracking
    is_void               BOOLEAN      NOT NULL DEFAULT FALSE,
    voided_at             TIMESTAMP,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------
-- rpt_patient_revenue
-- Monthly financial rollup per patient.
-- Drives: patient lifetime value, outstanding balance ageing,
-- insurance vs cash mix.
--
-- Refresh strategy: DAILY BATCH (nightly, prior-month
--   rows are locked after period close).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_patient_revenue (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,

    patient_id            VARCHAR,
    patient_name          TEXT         NOT NULL,
    patient_type          VARCHAR(30),
    insurance_company     TEXT,

    visit_count           INTEGER      NOT NULL DEFAULT 0,
    invoice_count         INTEGER      NOT NULL DEFAULT 0,
    total_invoiced        NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_paid            NUMERIC(15,2) NOT NULL DEFAULT 0,
    outstanding_balance   NUMERIC(15,2) NOT NULL DEFAULT 0,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    -- Unique constraint enforces one row per (patient × period).
    -- NULL patient_id (walk-ins) is NOT covered by this constraint —
    -- walk-in aggregates are separated by a partial UNIQUE index ridx_pr_walksin in 02.
    CONSTRAINT rpt_pr_patient_period_unique UNIQUE (period_year, period_month, patient_id)
);


-- ┌─────────────────────────────────────────────────────────┐
-- │  FINANCIAL                                              │
-- └─────────────────────────────────────────────────────────┘

-- -----------------------------------------------------------
-- rpt_account_balances_by_period
-- Pre-computed GL account balances per fiscal period,
-- optionally split by cost centre.
-- Drives: Trial Balance, General Ledger, Balance Sheet,
--   Income Statement. Eliminates 1M+ journal_lines scan.
--
-- Refresh strategy: INCREMENTAL ON JOURNAL POST
--   Upsert when a journal_entry is posted/reversed.
--   Full rebuild triggered on period close.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_account_balances_by_period (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Period
    period_id             VARCHAR      NOT NULL,          -- fiscal_periods.id
    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,
    period_name           TEXT,
    is_period_closed      BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Account dimension (denormalised for zero-join reads)
    account_id            VARCHAR      NOT NULL,
    account_code          TEXT         NOT NULL,
    account_name          TEXT         NOT NULL,
    account_type          TEXT         NOT NULL,          -- 'asset'|'liability'|'equity'|'revenue'|'expense'
    account_level         SMALLINT,
    parent_account_id     VARCHAR,

    -- Cost centre split (NULL = account total across all centres)
    cost_center_id        VARCHAR,
    cost_center_code      TEXT,
    cost_center_name      TEXT,

    -- Balances
    opening_balance       NUMERIC(18,2) NOT NULL DEFAULT 0,
    period_debit          NUMERIC(18,2) NOT NULL DEFAULT 0,
    period_credit         NUMERIC(18,2) NOT NULL DEFAULT 0,
    closing_balance       NUMERIC(18,2) NOT NULL DEFAULT 0,  -- opening + debit - credit (for assets/expenses)

    -- Activity stats
    journal_line_count    INTEGER      NOT NULL DEFAULT 0,
    last_entry_date       DATE,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (period_id, account_id, cost_center_id)
);


-- -----------------------------------------------------------
-- rpt_daily_revenue
-- Granular daily revenue by source (patient invoices,
-- pharmacy sales, clinic sales) × department × pharmacy ×
-- doctor. Drives dashboards, daily cash reports, KPI alerts.
--
-- Refresh strategy: TWO-PASS
--   Pass 1 (real-time approximation): incremental upsert
--     each time an invoice is finalised (today's row).
--   Pass 2 (nightly reconciliation): full rebuild of
--     yesterday's row from source tables at 00:05.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_daily_revenue (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    revenue_date          DATE         NOT NULL,
    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,
    period_week           SMALLINT     NOT NULL,

    -- Dimension
    source_type           VARCHAR(30)  NOT NULL,          -- 'patient_invoice' | 'sales_pharmacy' | 'sales_clinic'
    department_id         VARCHAR,
    department_name       TEXT,
    pharmacy_id           VARCHAR,
    pharmacy_name         TEXT,
    doctor_name           TEXT,

    -- Invoice metrics
    invoice_count         INTEGER      NOT NULL DEFAULT 0,
    return_count          INTEGER      NOT NULL DEFAULT 0,
    total_gross           NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_net             NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_collected       NUMERIC(15,2) NOT NULL DEFAULT 0,  -- cash receipts on this date

    -- By line type
    service_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,
    drug_revenue          NUMERIC(15,2) NOT NULL DEFAULT 0,
    consumable_revenue    NUMERIC(15,2) NOT NULL DEFAULT 0,
    stay_revenue          NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- COGS (from lot movements on same date)
    total_cogs            NUMERIC(15,2) NOT NULL DEFAULT 0,
    gross_profit          NUMERIC(15,2) NOT NULL DEFAULT 0,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW()

    -- NOTE: uniqueness enforced by functional index ridx_dr_upsert in 02_create_indexes.sql.
    -- COALESCE expressions cannot be used in inline UNIQUE constraints in PostgreSQL;
    -- they require a CREATE UNIQUE INDEX.  Do NOT add a UNIQUE constraint here.
);


-- -----------------------------------------------------------
-- rpt_department_profitability
-- Monthly P&L per department.  Drives management reporting.
--
-- PROFITABILITY MODEL — READ CAREFULLY:
--
-- REVENUE (net_revenue):
--   Source: SUM(patient_invoice_headers.net_amount)
--     WHERE department_id = this department
--       AND status IN ('finalized', 'paid')
--       AND invoice_date falls within the period
--   Includes: all finalized clinical billings for the dept
--     (services, drugs, consumables, stay charges)
--   Excludes: draft invoices, cancelled invoices, return
--     invoices (is_return or voided lines)
--   NOT included: sales_invoice_headers (pharmacy OTC sales —
--     those belong to the pharmacy dimension, not dept)
--
-- DIRECT COST / COGS (total_cogs):
--   Source: SUM(ABS(inventory_lot_movements.qty_change_in_minor)
--            × inventory_lot_movements.unit_cost)
--     WHERE lot.warehouse_id IN dept's warehouses
--       AND tx_type IN ('sale', 'patient_sale', 'patient_invoice')
--       AND tx_date falls within the period
--   Represents: inventory cost of drugs + consumables
--     dispensed to patients billed to this department
--   Uses: lot-level purchase_price (FIFO/FEFO costing) —
--     upgraded to provisional_purchase_price when available
--   Excludes: service lines (no physical inventory consumed)
--   Excludes: stay/accommodation (no COGS)
--
-- DOCTOR SETTLEMENTS (NOT included):
--   doctor_transfers and doctor_settlements are NOT included
--   in total_cogs or total_opex.  Doctor payables are a
--   separate liability/expense dimension tracked in
--   rpt_doctor_activity.  Including them here would require
--   allocating settlement amounts by department, which the
--   system does not currently support at line level.
--
-- OVERHEAD ALLOCATION (NOT included):
--   No overhead (salaries, utilities, depreciation) is
--   allocated to departments in this table.  The system has
--   no overhead allocation engine.  total_opex reflects only
--   GL expense lines explicitly posted to the dept's cost
--   centre via journal entries.
--
-- RESULT TYPE — GROSS PROFIT:
--   gross_profit = net_revenue - total_cogs
--   This is GROSS PROFIT (billing revenue minus direct
--   inventory cost).  It is NOT contribution margin (which
--   would subtract variable non-inventory costs) and NOT
--   full net profitability (which would include overhead,
--   doctor settlements, and allocated fixed costs).
--
--   operating_profit = gross_profit - total_opex
--   This is a PARTIAL NET FIGURE — it subtracts only GL
--   expense lines explicitly coded to the dept cost centre.
--   Interpret with caution: departments with few direct GL
--   postings will show inflated operating_profit.
--
-- Refresh strategy: MONTHLY BATCH after period close.
--   Prior months are immutable once period is closed.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_department_profitability (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,

    department_id         VARCHAR      NOT NULL,
    department_name       TEXT         NOT NULL,
    cost_center_id        VARCHAR,
    cost_center_name      TEXT,

    -- Revenue
    -- = SUM(patient_invoice_headers.net_amount) for finalized invoices in period
    gross_revenue         NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_revenue           NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Direct Cost / COGS
    -- = inventory cost of drugs+consumables dispensed in dept warehouses
    -- Does NOT include doctor settlements or overhead
    total_cogs            NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Operating expenses coded to dept cost centre in GL
    -- = SUM(journal_lines.debit) WHERE cost_center_id=dept_cc AND account_type='expense'
    -- Partial figure only — excludes unallocated overhead
    total_opex            NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Gross Profit = net_revenue - total_cogs (GROSS PROFIT, not full P&L)
    gross_profit          NUMERIC(15,2) NOT NULL DEFAULT 0,
    -- Partial Net = gross_profit - total_opex (PARTIAL figure — see model notes above)
    operating_profit      NUMERIC(15,2) NOT NULL DEFAULT 0,
    -- gross_profit / net_revenue  (0–1 ratio, do NOT sum across depts)
    gross_margin_pct      NUMERIC(7,4)  NOT NULL DEFAULT 0,

    -- Activity counters
    patient_count         INTEGER      NOT NULL DEFAULT 0,
    admission_count       INTEGER      NOT NULL DEFAULT 0,
    service_count         INTEGER      NOT NULL DEFAULT 0,
    invoice_count         INTEGER      NOT NULL DEFAULT 0,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (period_year, period_month, department_id)
);


-- ┌─────────────────────────────────────────────────────────┐
-- │  PHARMACY / INVENTORY                                   │
-- └─────────────────────────────────────────────────────────┘

-- -----------------------------------------------------------
-- rpt_inventory_snapshot
-- Point-in-time stock position per (item × warehouse).
-- One row per item+warehouse per snapshot_date.
-- Today's row is continuously updated; historical rows
-- are immutable (one snapshot per day kept).
-- Drives: stock on hand, expiry monitoring, reorder alerts,
--   FIFO valuation reports.
--
-- Refresh strategy: NIGHTLY FULL REBUILD of today's row.
--   Historical snapshots are INSERT-only (daily archive).
-- -----------------------------------------------------------
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

    -- Stock on hand (in minor units)
    qty_in_minor          NUMERIC(18,3) NOT NULL DEFAULT 0,
    active_lot_count      INTEGER       NOT NULL DEFAULT 0,

    -- Expiry monitoring
    expired_qty           NUMERIC(18,3) NOT NULL DEFAULT 0,
    expiring_30d_qty      NUMERIC(18,3) NOT NULL DEFAULT 0,
    expiring_90d_qty      NUMERIC(18,3) NOT NULL DEFAULT 0,
    earliest_expiry_date  DATE,
    nearest_expiry_lot_id VARCHAR,

    -- Valuation
    avg_unit_cost         NUMERIC(15,4),
    total_cost_value      NUMERIC(18,2),
    total_sale_value      NUMERIC(18,2),

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (snapshot_date, item_id, warehouse_id)
);


-- -----------------------------------------------------------
-- rpt_item_movements_summary
-- Daily movement aggregates per (item × warehouse).
-- Eliminates full scan of inventory_lot_movements (500k+ rows)
-- for period-range movement reports.
--
-- Refresh strategy: INCREMENTAL ON LOT MOVEMENT INSERT
--   Upsert today's row on each lot movement.
--   Past rows are immutable.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_item_movements_summary (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    movement_date         DATE         NOT NULL,
    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,

    item_id               VARCHAR      NOT NULL,
    item_name             TEXT         NOT NULL,
    item_category         TEXT,

    warehouse_id          VARCHAR      NOT NULL,
    warehouse_name        TEXT         NOT NULL,

    -- Receipts (tx_type = 'receive')
    received_qty          NUMERIC(15,3) NOT NULL DEFAULT 0,
    received_value        NUMERIC(15,2) NOT NULL DEFAULT 0,
    receipt_tx_count      INTEGER       NOT NULL DEFAULT 0,

    -- Sales / Issues (tx_type = 'sale' | 'patient_invoice')
    issued_qty            NUMERIC(15,3) NOT NULL DEFAULT 0,
    issued_value          NUMERIC(15,2) NOT NULL DEFAULT 0,
    issue_tx_count        INTEGER       NOT NULL DEFAULT 0,

    -- Returns in / out
    return_in_qty         NUMERIC(15,3) NOT NULL DEFAULT 0,
    return_out_qty        NUMERIC(15,3) NOT NULL DEFAULT 0,

    -- Transfers
    transfer_in_qty       NUMERIC(15,3) NOT NULL DEFAULT 0,
    transfer_out_qty      NUMERIC(15,3) NOT NULL DEFAULT 0,

    -- Adjustments
    adjustment_qty        NUMERIC(15,3) NOT NULL DEFAULT 0,

    -- Net
    net_qty_change        NUMERIC(15,3) NOT NULL DEFAULT 0,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (movement_date, item_id, warehouse_id)
);


-- ┌─────────────────────────────────────────────────────────┐
-- │  OPERATIONAL                                            │
-- └─────────────────────────────────────────────────────────┘

-- -----------------------------------------------------------
-- rpt_department_activity
-- Daily operational snapshot per department.
-- Drives: bed occupancy dashboard, department workload,
--   admission/discharge KPIs, real-time census.
--
-- Refresh strategy: NIGHTLY BATCH for prior day.
--   Today's row: updated in near-real-time on each admission
--   or invoice event (approximate census).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_department_activity (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    activity_date         DATE         NOT NULL,
    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,

    department_id         VARCHAR      NOT NULL,
    department_name       TEXT         NOT NULL,

    -- Admissions activity
    new_admissions        INTEGER      NOT NULL DEFAULT 0,
    discharges            INTEGER      NOT NULL DEFAULT 0,
    census_eod            INTEGER      NOT NULL DEFAULT 0,  -- inpatients at end of day

    -- Bed occupancy
    total_beds            INTEGER      NOT NULL DEFAULT 0,
    beds_occupied_eod     INTEGER      NOT NULL DEFAULT 0,
    occupancy_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,  -- 0.0000 – 1.0000

    -- Service activity
    clinic_orders_placed  INTEGER      NOT NULL DEFAULT 0,
    clinic_orders_executed INTEGER     NOT NULL DEFAULT 0,

    -- Revenue
    invoices_created      INTEGER      NOT NULL DEFAULT 0,
    invoices_finalized    INTEGER      NOT NULL DEFAULT 0,
    gross_revenue         NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_revenue           NUMERIC(15,2) NOT NULL DEFAULT 0,
    cash_collected        NUMERIC(15,2) NOT NULL DEFAULT 0,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (activity_date, department_id)
);


-- -----------------------------------------------------------
-- rpt_doctor_activity
-- Monthly (and optionally daily) doctor performance.
-- Drives: doctor revenue report, settlement base,
--   workload analysis, referral tracking.
--
-- Primary business key: doctor_id (doctors.id).
-- doctor_name is a denormalized snapshot field for display only.
-- For doctors not yet linked to a doctors table record,
-- doctor_id = 'UNLINKED:' || MD5(doctor_name) as a stable
-- synthetic key to avoid NULL key collisions.
--
-- Refresh strategy: DAILY BATCH (daily rows) +
--   MONTHLY ROLLUP (monthly summary rows where
--   activity_date IS NULL).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_doctor_activity (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,
    activity_date         DATE,                           -- NULL = monthly summary row

    -- doctor_id is the primary business key.
    -- Use doctors.id when available.
    -- Use 'UNLINKED:' || MD5(lower(doctor_name)) for free-text names
    -- not linked to a doctors record. Never NULL.
    doctor_id             VARCHAR      NOT NULL,
    doctor_name           TEXT         NOT NULL,          -- snapshot/display only — do not use for joins
    doctor_specialty      TEXT,                           -- snapshot from doctors.specialty at refresh time
    department_id         VARCHAR,
    department_name       TEXT,

    -- Clinical activity
    patient_count         INTEGER      NOT NULL DEFAULT 0,
    admission_count       INTEGER      NOT NULL DEFAULT 0,
    consultation_count    INTEGER      NOT NULL DEFAULT 0,
    surgery_count         INTEGER      NOT NULL DEFAULT 0,
    orders_placed         INTEGER      NOT NULL DEFAULT 0,
    orders_executed       INTEGER      NOT NULL DEFAULT 0,

    -- Revenue attributed to doctor
    total_revenue         NUMERIC(15,2) NOT NULL DEFAULT 0,
    services_revenue      NUMERIC(15,2) NOT NULL DEFAULT 0,
    drug_revenue          NUMERIC(15,2) NOT NULL DEFAULT 0,
    surgery_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Doctor payable
    total_due_to_doctor   NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_transferred     NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_settled         NUMERIC(15,2) NOT NULL DEFAULT 0,
    unsettled_balance     NUMERIC(15,2) NOT NULL DEFAULT 0,

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    -- Unique constraints:
    --   Monthly summary rows  (activity_date IS NULL):  one per doctor per month
    --   Daily detail rows     (activity_date IS NOT NULL): one per doctor per day
    -- Enforced via partial unique indexes in 02_create_indexes.sql:
    --   ridx_docact_monthly_unique  WHERE activity_date IS NULL
    --   ridx_docact_daily_unique    WHERE activity_date IS NOT NULL
    CONSTRAINT rpt_doctor_activity_doctor_period_monthly_check
        CHECK (activity_date IS NULL OR period_year IS NOT NULL)
);


-- ┌─────────────────────────────────────────────────────────┐
-- │  INFRASTRUCTURE                                         │
-- └─────────────────────────────────────────────────────────┘

-- -----------------------------------------------------------
-- rpt_refresh_log
-- Audit trail for every reporting refresh operation.
-- One row per function call — regardless of success or failure.
-- Provides: performance monitoring, failure alerting,
--   freshness tracking, and replay audit trail.
--
-- This table is populated by all refresh functions in
-- 03_refresh_logic.sql via BEGIN/END wrapper calls.
-- It is append-only — rows are never updated or deleted.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_refresh_log (
    id                    BIGSERIAL    PRIMARY KEY,

    -- Which reporting table was refreshed
    report_table_name     VARCHAR(100) NOT NULL,

    -- Which refresh function was called
    refresh_function      VARCHAR(100) NOT NULL,          -- e.g. 'rpt_refresh_account_balances'

    -- Parameters passed to the function (for replay/debugging)
    refresh_params        JSONB,                          -- e.g. {"period_id":"FP-2026-01","full":true}

    -- Timing
    refresh_start_at      TIMESTAMP    NOT NULL,
    refresh_end_at        TIMESTAMP,                      -- NULL if still running or failed before completion
    duration_ms           INTEGER,                        -- refresh_end_at - refresh_start_at in milliseconds

    -- Outcome
    status                VARCHAR(20)  NOT NULL           -- 'running' | 'success' | 'partial' | 'failed'
                          DEFAULT 'running',
    rows_affected         INTEGER,                        -- rows inserted/updated (NULL on failure)
    rows_inspected        INTEGER,                        -- source rows read (for cost diagnostics)

    -- Failure details
    error_message         TEXT,                           -- NULL on success
    error_detail          TEXT,                           -- Postgres error detail / hint
    error_context         TEXT,                           -- stack context if available

    -- Who/what triggered the refresh
    triggered_by          VARCHAR(50)  NOT NULL           -- 'nightly_batch' | 'event_invoice' | 'event_payment'
                          DEFAULT 'nightly_batch',        --   | 'event_discharge' | 'manual' | 'period_close'
    triggered_by_user     VARCHAR,                        -- users.id if manually triggered; NULL for automated

    -- Period scope (for period-scoped refreshes)
    period_id             VARCHAR,                        -- fiscal_periods.id if applicable
    date_scope            DATE                            -- specific date if date-scoped (e.g. daily revenue)
);


-- Index: query freshness for a given table (most common monitoring query)
CREATE INDEX IF NOT EXISTS ridx_rrl_table_start
    ON rpt_refresh_log (report_table_name, refresh_start_at DESC);

-- Index: find all failures
CREATE INDEX IF NOT EXISTS ridx_rrl_failures
    ON rpt_refresh_log (status, refresh_start_at DESC)
    WHERE status IN ('failed', 'partial');

-- Index: find long-running or still-running jobs
CREATE INDEX IF NOT EXISTS ridx_rrl_running
    ON rpt_refresh_log (status, refresh_start_at)
    WHERE status = 'running';
