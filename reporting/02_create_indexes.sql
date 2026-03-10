-- ============================================================
-- HOSPITAL ERP — REPORTING LAYER
-- File 02: Index Definitions
-- Naming convention: ridx_<table_short>_<columns>
-- All indexes are non-unique unless noted.
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_patient_visit_summary                              │
-- └─────────────────────────────────────────────────────────┘

-- Primary access: date-range queries, period roll-ups
CREATE INDEX IF NOT EXISTS ridx_pvs_period
    ON rpt_patient_visit_summary (period_year, period_month);

-- Filter by visit type + date (inpatient vs outpatient lists)
CREATE INDEX IF NOT EXISTS ridx_pvs_type_date
    ON rpt_patient_visit_summary (visit_type, visit_date DESC);

-- Patient history lookup
CREATE INDEX IF NOT EXISTS ridx_pvs_patient
    ON rpt_patient_visit_summary (patient_id, visit_date DESC)
    WHERE patient_id IS NOT NULL;

-- Department + period (department revenue reports)
CREATE INDEX IF NOT EXISTS ridx_pvs_dept_period
    ON rpt_patient_visit_summary (department_id, period_year, period_month)
    WHERE department_id IS NOT NULL;

-- NOTE: the UNIQUE (source_type, source_id) constraint is defined on the table itself
-- (CONSTRAINT rpt_pvs_source_unique) and creates its own backing index automatically.
-- Do NOT add a separate CREATE UNIQUE INDEX here — that would duplicate the index.

-- Clinical visit type filter (inpatient vs outpatient) + date
CREATE INDEX IF NOT EXISTS ridx_pvs_source_type_date
    ON rpt_patient_visit_summary (source_type, visit_date DESC);

-- Insurance/contract AR ageing
CREATE INDEX IF NOT EXISTS ridx_pvs_insurance
    ON rpt_patient_visit_summary (insurance_company, visit_date DESC)
    WHERE insurance_company IS NOT NULL;

-- Outstanding balance filter (AR worklist)
CREATE INDEX IF NOT EXISTS ridx_pvs_outstanding
    ON rpt_patient_visit_summary (outstanding_balance DESC)
    WHERE outstanding_balance > 0;


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_patient_service_usage                              │
-- └─────────────────────────────────────────────────────────┘

-- Period queries (service usage over time)
CREATE INDEX IF NOT EXISTS ridx_psu_period
    ON rpt_patient_service_usage (period_year, period_month);

-- Department service breakdown
CREATE INDEX IF NOT EXISTS ridx_psu_dept_period
    ON rpt_patient_service_usage (department_id, period_year, period_month)
    WHERE department_id IS NOT NULL;

-- Item consumption (pharmacy/inventory reports)
CREATE INDEX IF NOT EXISTS ridx_psu_item_date
    ON rpt_patient_service_usage (item_id, service_date DESC)
    WHERE item_id IS NOT NULL;

-- Service utilisation
CREATE INDEX IF NOT EXISTS ridx_psu_service_period
    ON rpt_patient_service_usage (service_id, period_year, period_month)
    WHERE service_id IS NOT NULL;

-- Visit rollup (link from visit summary)
CREATE INDEX IF NOT EXISTS ridx_psu_visit
    ON rpt_patient_service_usage (visit_summary_id)
    WHERE visit_summary_id IS NOT NULL;

-- Exclude voided lines in most queries
CREATE INDEX IF NOT EXISTS ridx_psu_active
    ON rpt_patient_service_usage (service_date DESC)
    WHERE is_void = FALSE;

-- Doctor revenue attribution
CREATE INDEX IF NOT EXISTS ridx_psu_doctor_period
    ON rpt_patient_service_usage (doctor_name, period_year, period_month)
    WHERE doctor_name IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_patient_revenue                                    │
-- └─────────────────────────────────────────────────────────┘

-- Period-level aggregation (primary access)
CREATE INDEX IF NOT EXISTS ridx_pr_period
    ON rpt_patient_revenue (period_year, period_month);

-- Patient lookup
CREATE INDEX IF NOT EXISTS ridx_pr_patient
    ON rpt_patient_revenue (patient_id, period_year DESC)
    WHERE patient_id IS NOT NULL;

-- Insurance ageing
CREATE INDEX IF NOT EXISTS ridx_pr_insurance_period
    ON rpt_patient_revenue (insurance_company, period_year, period_month)
    WHERE insurance_company IS NOT NULL;

-- Unique upsert target
CREATE UNIQUE INDEX IF NOT EXISTS ridx_pr_upsert
    ON rpt_patient_revenue (period_year, period_month, patient_id);


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_account_balances_by_period                         │
-- └─────────────────────────────────────────────────────────┘

-- Trial Balance: all accounts for a period
CREATE INDEX IF NOT EXISTS ridx_abp_period
    ON rpt_account_balances_by_period (period_id);

-- General Ledger: one account across periods
CREATE INDEX IF NOT EXISTS ridx_abp_account_period
    ON rpt_account_balances_by_period (account_id, period_year, period_month);

-- Account type filter (Income Statement = revenue+expense)
CREATE INDEX IF NOT EXISTS ridx_abp_type_period
    ON rpt_account_balances_by_period (account_type, period_year, period_month);

-- Cost centre P&L slice
CREATE INDEX IF NOT EXISTS ridx_abp_cc_period
    ON rpt_account_balances_by_period (cost_center_id, period_id)
    WHERE cost_center_id IS NOT NULL;

-- Parent hierarchy rollup
CREATE INDEX IF NOT EXISTS ridx_abp_parent
    ON rpt_account_balances_by_period (parent_account_id, period_id)
    WHERE parent_account_id IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_daily_revenue                                      │
-- └─────────────────────────────────────────────────────────┘

-- Date-range dashboard queries
CREATE INDEX IF NOT EXISTS ridx_dr_date
    ON rpt_daily_revenue (revenue_date DESC);

-- Period aggregation
CREATE INDEX IF NOT EXISTS ridx_dr_period
    ON rpt_daily_revenue (period_year, period_month);

-- Department revenue trend
CREATE INDEX IF NOT EXISTS ridx_dr_dept_date
    ON rpt_daily_revenue (department_id, revenue_date DESC)
    WHERE department_id IS NOT NULL;

-- Pharmacy daily report
CREATE INDEX IF NOT EXISTS ridx_dr_pharmacy_date
    ON rpt_daily_revenue (pharmacy_id, revenue_date DESC)
    WHERE pharmacy_id IS NOT NULL;

-- Source type filter
CREATE INDEX IF NOT EXISTS ridx_dr_source_date
    ON rpt_daily_revenue (source_type, revenue_date DESC);


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_department_profitability                           │
-- └─────────────────────────────────────────────────────────┘

-- Period P&L
CREATE INDEX IF NOT EXISTS ridx_dp_period
    ON rpt_department_profitability (period_year, period_month);

-- Department trend over time
CREATE INDEX IF NOT EXISTS ridx_dp_dept_period
    ON rpt_department_profitability (department_id, period_year DESC, period_month DESC);

-- Cost centre mapping
CREATE INDEX IF NOT EXISTS ridx_dp_cc_period
    ON rpt_department_profitability (cost_center_id, period_year, period_month)
    WHERE cost_center_id IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_inventory_snapshot                                 │
-- └─────────────────────────────────────────────────────────┘

-- Latest snapshot per item+warehouse (most common query)
CREATE INDEX IF NOT EXISTS ridx_is_item_date
    ON rpt_inventory_snapshot (item_id, snapshot_date DESC);

-- Latest snapshot per warehouse
CREATE INDEX IF NOT EXISTS ridx_is_wh_date
    ON rpt_inventory_snapshot (warehouse_id, snapshot_date DESC);

-- Expiry monitoring dashboard
CREATE INDEX IF NOT EXISTS ridx_is_expiry
    ON rpt_inventory_snapshot (expiring_30d_qty DESC, snapshot_date DESC)
    WHERE expiring_30d_qty > 0;

-- Expired stock worklist
CREATE INDEX IF NOT EXISTS ridx_is_expired
    ON rpt_inventory_snapshot (expired_qty DESC)
    WHERE expired_qty > 0;

-- Zero-stock alerts
CREATE INDEX IF NOT EXISTS ridx_is_zero_stock
    ON rpt_inventory_snapshot (item_id, warehouse_id)
    WHERE qty_in_minor = 0;


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_item_movements_summary                             │
-- └─────────────────────────────────────────────────────────┘

-- Item movement history
CREATE INDEX IF NOT EXISTS ridx_ims_item_date
    ON rpt_item_movements_summary (item_id, movement_date DESC);

-- Warehouse daily movement
CREATE INDEX IF NOT EXISTS ridx_ims_wh_date
    ON rpt_item_movements_summary (warehouse_id, movement_date DESC);

-- Period aggregation
CREATE INDEX IF NOT EXISTS ridx_ims_period
    ON rpt_item_movements_summary (period_year, period_month);

-- Category-level consumption (drug vs supply reports)
CREATE INDEX IF NOT EXISTS ridx_ims_category_period
    ON rpt_item_movements_summary (item_category, period_year, period_month)
    WHERE item_category IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_department_activity                                │
-- └─────────────────────────────────────────────────────────┘

-- Date-range activity queries
CREATE INDEX IF NOT EXISTS ridx_da_date
    ON rpt_department_activity (activity_date DESC);

-- Department trend
CREATE INDEX IF NOT EXISTS ridx_da_dept_date
    ON rpt_department_activity (department_id, activity_date DESC);

-- Period roll-up
CREATE INDEX IF NOT EXISTS ridx_da_period
    ON rpt_department_activity (period_year, period_month);


-- ┌─────────────────────────────────────────────────────────┐
-- │  rpt_doctor_activity                                    │
-- └─────────────────────────────────────────────────────────┘

-- Doctor monthly history (doctor_id is the business key — NOT NULL)
CREATE INDEX IF NOT EXISTS ridx_docact_doctor_period
    ON rpt_doctor_activity (doctor_id, period_year DESC, period_month DESC);

-- Period cross-doctor comparison
CREATE INDEX IF NOT EXISTS ridx_docact_period
    ON rpt_doctor_activity (period_year, period_month);

-- UNIQUE: one monthly summary row per doctor per month
-- (activity_date IS NULL = monthly summary rows)
CREATE UNIQUE INDEX IF NOT EXISTS ridx_docact_monthly_unique
    ON rpt_doctor_activity (doctor_id, period_year, period_month)
    WHERE activity_date IS NULL;

-- UNIQUE: one daily row per doctor per date
-- (activity_date IS NOT NULL = daily detail rows)
CREATE UNIQUE INDEX IF NOT EXISTS ridx_docact_daily_unique
    ON rpt_doctor_activity (doctor_id, activity_date)
    WHERE activity_date IS NOT NULL;

-- Non-unique index for daily date-range queries
CREATE INDEX IF NOT EXISTS ridx_docact_daily_date
    ON rpt_doctor_activity (doctor_id, activity_date DESC)
    WHERE activity_date IS NOT NULL;

-- Specialty filter (cross-doctor specialty reports)
CREATE INDEX IF NOT EXISTS ridx_docact_specialty_period
    ON rpt_doctor_activity (doctor_specialty, period_year, period_month)
    WHERE doctor_specialty IS NOT NULL;
