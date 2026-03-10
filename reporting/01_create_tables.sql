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

    -- Visit type & source
    visit_type            VARCHAR(20)  NOT NULL,          -- 'inpatient' | 'outpatient'
    source_id             VARCHAR      NOT NULL,          -- admissions.id  OR  patient_invoice_headers.id
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
    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW()
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

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW()
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

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (revenue_date, source_type, COALESCE(department_id,''), COALESCE(pharmacy_id,''), COALESCE(doctor_name,''))
);


-- -----------------------------------------------------------
-- rpt_department_profitability
-- Monthly profitability per department (revenue vs COGS vs
-- operating expenses from GL).
-- Drives: Management P&L by department.
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
    gross_revenue         NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_revenue           NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- COGS (inventory issued, from lot_movements + purchase price)
    total_cogs            NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Operating expenses (from posted journal lines on dept cost centre)
    total_opex            NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Profit
    gross_profit          NUMERIC(15,2) NOT NULL DEFAULT 0,  -- net_revenue - total_cogs
    operating_profit      NUMERIC(15,2) NOT NULL DEFAULT 0,  -- gross_profit - total_opex
    gross_margin_pct      NUMERIC(7,4)  NOT NULL DEFAULT 0,  -- 0-1

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
-- Refresh strategy: DAILY BATCH (daily rows) +
--   MONTHLY ROLLUP (monthly summary rows where
--   activity_date IS NULL).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rpt_doctor_activity (
    id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    period_year           SMALLINT     NOT NULL,
    period_month          SMALLINT     NOT NULL,
    activity_date         DATE,                           -- NULL = monthly summary row

    doctor_id             VARCHAR,                        -- NULL = 'unknown doctor' catch-all
    doctor_name           TEXT         NOT NULL,
    doctor_specialty      TEXT,
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

    refreshed_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);
