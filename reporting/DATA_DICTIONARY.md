# Data Dictionary — Reporting Layer
**Hospital ERP** | Version 1.0 | Status: Pre-Implementation Review

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟦 Operational | Patient journey, clinical, admissions data |
| 🟨 Financial | Revenue, billing, payment amounts (EGP) |
| 🟩 Quantity | Count / qty values (unit-free integers or minor-units) |
| 🟧 Derived | Computed from two or more source values |
| ✅ Safe to SUM | Can be aggregated directly across rows |
| ⚠️ Context-SUM | Aggregate only within the same grain (e.g., same period + dept) |
| ❌ Do Not SUM | Dimension or rate; summing is meaningless |
| 🔁 Event-driven | Refreshed when a specific transaction event fires |
| 🌙 Nightly | Rebuilt in nightly batch job |
| 📅 Monthly | Rebuilt once per month after period close |

---

## Domain Classification

```
A. PATIENT JOURNEY OPERATIONAL
   └── rpt_patient_visit_summary
   └── rpt_patient_service_usage
   └── rpt_department_activity
   └── rpt_doctor_activity

B. BILLING / REVENUE
   └── rpt_patient_revenue
   └── rpt_daily_revenue
   └── rpt_department_profitability

C. ACCOUNTING / GL
   └── rpt_account_balances_by_period

D. INVENTORY / COST
   └── rpt_inventory_snapshot
   └── rpt_item_movements_summary
```

---

---

# A. PATIENT JOURNEY OPERATIONAL

---

## Table: `rpt_patient_visit_summary`

**Purpose:** One row per patient visit. Inpatient = one row per `admissions` record. Outpatient = one row per standalone `patient_invoice_headers` with no admission. Pre-joins clinical + billing so the patient journey report never touches original tables.

**Grain:** 1 row = 1 visit (admission or outpatient encounter)

**Refresh:** 🔁 Event-driven — upserted on: invoice finalize, payment recorded, patient discharge. Never deleted; rows for closed visits become immutable.

**Traceback entry point:** `source_type` + `source_id` — two explicit columns, no discriminator inference needed.

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key of this reporting row. Has no transactional meaning. |
| 2 | `source_type` | VARCHAR(50) | 🟦 ❌ | **Traceback key part 1.** The literal name of the transactional source table: `'admissions'` for inpatient visits, `'patient_invoice_headers'` for standalone outpatient encounters. Used with `source_id` to construct: `SELECT * FROM {source_type} WHERE id = source_id`. Never NULL. |
| 3 | `source_id` | VARCHAR | 🟦 ❌ | **Traceback key part 2.** The primary key value in the table named by `source_type`. `admissions.id` when source_type='admissions'; `patient_invoice_headers.id` when source_type='patient_invoice_headers'. Unique constraint `(source_type, source_id)` enforces one row per source record. |
| 4 | `visit_type` | VARCHAR(20) | 🟦 ❌ | Clinical display label: `'inpatient'` or `'outpatient'`. Derived from `source_type` at refresh time: `'admissions'` → `'inpatient'`; `'patient_invoice_headers'` → `'outpatient'`. Kept separately for readable report filtering without string matching on table names. |
| 5 | `visit_date` | DATE | 🟦 ❌ | First date of the visit. For inpatient: `admissions.admission_date`. For outpatient: `patient_invoice_headers.invoice_date`. |
| 6 | `discharge_date` | DATE | 🟦 ❌ | Date patient left. NULL for outpatient and active inpatients. Source: `admissions.discharge_date`. |
| 7 | `los_days` | NUMERIC(8,2) | 🟧 ⚠️ | Length of stay in days. `discharge_date - admission_date`. NULL if not discharged or outpatient. Safe to average across visits; not safe to SUM across patients. |
| 8 | `period_year` | SMALLINT | 🟦 ❌ | Calendar year of `visit_date`. Pre-extracted to avoid `EXTRACT()` on every query. Source: `EXTRACT(YEAR FROM visit_date)`. |
| 9 | `period_month` | SMALLINT | 🟦 ❌ | Calendar month (1–12) of `visit_date`. Source: `EXTRACT(MONTH FROM visit_date)`. |
| 10 | `period_week` | SMALLINT | 🟦 ❌ | ISO week number of `visit_date`. Source: `EXTRACT(WEEK FROM visit_date)`. |
| 11 | `patient_id` | VARCHAR | 🟦 ❌ | FK reference to `patients.id`. NULL when patient was registered without a system account (walk-in). Source: `admissions.patient_id` or `patient_invoice_headers.patient_id`. |
| 12 | `patient_name` | TEXT | 🟦 ❌ | Full name as entered at time of visit. Copied at visit time — does **not** update if `patients.full_name` changes later. Source: `admissions.patient_name` or `patient_invoice_headers.patient_name`. |
| 13 | `patient_type` | VARCHAR(30) | 🟦 ❌ | Payment classification: `'cash'`, `'insurance'`, `'contract'`, etc. Source: `patient_invoice_headers.patient_type` (enum). |
| 14 | `insurance_company` | TEXT | 🟦 ❌ | Name of insurer. NULL for cash patients. Source: `admissions.insurance_company`. |
| 15 | `payment_type` | VARCHAR(30) | 🟦 ❌ | Admission-level payment arrangement. Source: `admissions.payment_type`. |
| 16 | `department_id` | VARCHAR | 🟦 ❌ | Treating department. Source: `patient_invoice_headers.department_id`. |
| 17 | `department_name` | TEXT | 🟦 ❌ | Denormalized name at refresh time. Source: `departments.name_ar` via `_rpt_dept_name()`. Will not update if dept name changes after refresh. |
| 18 | `doctor_name` | TEXT | 🟦 ❌ | Attending doctor. Free-text display field (not FK). Source: `admissions.doctor_name` → fallback to `patient_invoice_headers.doctor_name`. |
| 19 | `surgery_type_id` | VARCHAR | 🟦 ❌ | Linked surgery type if applicable. Source: `admissions.surgery_type_id`. |
| 20 | `surgery_type_name` | TEXT | 🟦 ❌ | Denormalized surgery name. Source: `surgery_types.name` (lookup at refresh time). NULL until surgery_types join is implemented. |
| 21 | `admission_status` | VARCHAR(20) | 🟦 ❌ | Current admission state: `'active'`, `'discharged'`, `'cancelled'`. Source: `admissions.status` enum cast to text. |
| 22 | `invoice_count` | SMALLINT | 🟩 ✅ | Number of `patient_invoice_headers` linked to this visit. Source: `COUNT(DISTINCT patient_invoice_headers.id)` WHERE `admission_id = source_id`. |
| 23 | `total_invoiced` | NUMERIC(15,2) | 🟨 ✅ | Gross billed before discounts (EGP). Source: `SUM(patient_invoice_headers.total_amount)`. Includes all invoices for this visit including consolidated ones. |
| 24 | `total_discount` | NUMERIC(15,2) | 🟨 ✅ | Total discount granted on all invoices for this visit (EGP). Source: `SUM(patient_invoice_headers.discount_amount)`. |
| 25 | `net_amount` | NUMERIC(15,2) | 🟨 ✅ | Amount after discount (EGP). `total_invoiced - total_discount`. Source: `SUM(patient_invoice_headers.net_amount)`. |
| 26 | `total_paid` | NUMERIC(15,2) | 🟨 ✅ | Total payments received against this visit's invoices (EGP). Source: `SUM(patient_invoice_headers.paid_amount)`. |
| 27 | `outstanding_balance` | NUMERIC(15,2) | 🟧 ✅ | Amount still owed (EGP). `net_amount - total_paid`. Positive = patient owes. Negative = overpaid. |
| 28 | `service_revenue` | NUMERIC(15,2) | 🟨 ✅ | Sum of non-voided lines where `line_type='service'` (EGP). Source: `SUM(patient_invoice_lines.total_price)` filtered by line_type. |
| 29 | `drug_revenue` | NUMERIC(15,2) | 🟨 ✅ | Sum of non-voided lines where `line_type='drug'` (EGP). |
| 30 | `consumable_revenue` | NUMERIC(15,2) | 🟨 ✅ | Sum of non-voided lines where `line_type='consumable'` (EGP). |
| 31 | `stay_revenue` | NUMERIC(15,2) | 🟨 ✅ | Sum of non-voided lines where `line_type='stay'` (EGP). Comes from `stay_segments` billing. |
| 32 | `service_line_count` | INTEGER | 🟩 ✅ | Count of active (non-voided) service lines. Source: `COUNT(*) FILTER (WHERE line_type='service' AND NOT is_void)`. |
| 33 | `drug_line_count` | INTEGER | 🟩 ✅ | Count of active drug lines. |
| 34 | `consumable_line_count` | INTEGER | 🟩 ✅ | Count of active consumable lines. |
| 35 | `refreshed_at` | TIMESTAMP | ❌ | Timestamp of last upsert into this row. Use to detect stale rows. Not a business value. |

**Traceback Path:**
```
-- Step 1: identify the source table and record
rpt_patient_visit_summary.source_type = 'admissions'
  → SELECT * FROM admissions WHERE id = source_id
      → SELECT * FROM patient_invoice_headers WHERE admission_id = source_id
          → SELECT * FROM patient_invoice_lines WHERE header_id IN (...)

rpt_patient_visit_summary.source_type = 'patient_invoice_headers'
  → SELECT * FROM patient_invoice_headers WHERE id = source_id
      → SELECT * FROM patient_invoice_lines WHERE header_id = source_id
```

---

## Table: `rpt_patient_service_usage`

**Purpose:** One row per non-voided patient invoice line. Provides item/service-level detail with cost information for margin analysis. Never physically deleted — voided lines are flagged.

**Grain:** 1 row = 1 `patient_invoice_lines` record

**Refresh:** 🔁 Event-driven — appended when invoice is finalised. `is_void` / `voided_at` updated when a line is voided.

**Traceback entry point:** `source_line_id` → `patient_invoice_lines.id`

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. No transactional meaning. |
| 2 | `source_line_id` | VARCHAR UNIQUE | 🟦 ❌ | **Primary traceback key.** Exact match to `patient_invoice_lines.id`. Unique constraint enforces 1:1 mapping. |
| 3 | `invoice_id` | VARCHAR | 🟦 ❌ | Parent invoice. Traceback: `patient_invoice_headers.id`. Use to retrieve header-level context. |
| 4 | `visit_summary_id` | VARCHAR | 🟦 ❌ | Link to `rpt_patient_visit_summary.id`. May be NULL if visit summary was not yet refreshed. Not a hard FK — reporting layer is intentionally decoupled. |
| 5 | `service_date` | DATE | 🟦 ❌ | Date the service was billed. Source: `patient_invoice_headers.invoice_date` (header date applies to all lines). |
| 6 | `period_year` | SMALLINT | 🟦 ❌ | Pre-extracted year from `service_date`. |
| 7 | `period_month` | SMALLINT | 🟦 ❌ | Pre-extracted month (1–12) from `service_date`. |
| 8 | `patient_id` | VARCHAR | 🟦 ❌ | Source: `patient_invoice_headers.patient_id`. May be NULL for unregistered walk-ins. |
| 9 | `patient_name` | TEXT | 🟦 ❌ | Source: `patient_invoice_headers.patient_name` (snapshot at billing time). |
| 10 | `patient_type` | VARCHAR(30) | 🟦 ❌ | Source: `patient_invoice_headers.patient_type` enum. |
| 11 | `insurance_company` | TEXT | 🟦 ❌ | Source: `admissions.insurance_company` via header's `admission_id`. NULL for outpatient/cash. |
| 12 | `department_id` | VARCHAR | 🟦 ❌ | Source: `patient_invoice_headers.department_id`. |
| 13 | `department_name` | TEXT | 🟦 ❌ | Denormalized from `departments.name_ar` at refresh time. |
| 14 | `doctor_name` | TEXT | 🟦 ❌ | Line-level doctor (source: `patient_invoice_lines.doctor_name`) with fallback to `patient_invoice_headers.doctor_name`. |
| 15 | `line_type` | VARCHAR(20) | 🟦 ❌ | Service category: `'service'`, `'drug'`, `'consumable'`, `'stay'`. Source: `patient_invoice_lines.line_type` enum. Critical filter column for all utilisation reports. |
| 16 | `service_id` | VARCHAR | 🟦 ❌ | FK to `services.id`. NULL for drug/consumable lines. Traceback: `services WHERE id = service_id`. |
| 17 | `service_name` | TEXT | 🟦 ❌ | Denormalized from `services.name_ar` at refresh time. |
| 18 | `service_category` | TEXT | 🟦 ❌ | Service category (lab, radiology, procedure, etc.). Source: `services.category`. |
| 19 | `item_id` | VARCHAR | 🟦 ❌ | FK to `items.id`. NULL for service/stay lines. Traceback: `items WHERE id = item_id`. |
| 20 | `item_name` | TEXT | 🟦 ❌ | Denormalized from `items.name_ar` at refresh time. |
| 21 | `item_category` | TEXT | 🟦 ❌ | Item category enum. Source: `items.category`. Used to separate drugs from supplies. |
| 22 | `quantity` | NUMERIC(12,3) | 🟩 ✅ | Number of units billed. Source: `patient_invoice_lines.quantity`. Unit interpretation depends on `unit_level` in source. Safe to sum within same item. |
| 23 | `unit_price` | NUMERIC(15,2) | 🟨 ⚠️ | Price per unit at time of billing (EGP). Source: `patient_invoice_lines.unit_price`. Do NOT sum — average or use as reference only. |
| 24 | `discount_amount` | NUMERIC(15,2) | 🟨 ✅ | Total discount on this line (EGP). Source: `patient_invoice_lines.discount_amount`. |
| 25 | `total_price` | NUMERIC(15,2) | 🟨 ✅ | Revenue from this line after discount (EGP). Source: `patient_invoice_lines.total_price`. Zero for voided lines. |
| 26 | `unit_cost` | NUMERIC(15,4) | 🟧 ⚠️ | Cost per minor unit at time of sale. Source: `inventory_lots.purchase_price` via `patient_invoice_lines.lot_id`. NULL for service lines (no inventory). Do NOT sum — use only with `quantity`. |
| 27 | `cogs` | NUMERIC(15,2) | 🟧 ✅ | Cost of goods sold for this line (EGP). `quantity × unit_cost`. NULL for service/stay lines with no lot. |
| 28 | `gross_margin` | NUMERIC(15,2) | 🟧 ✅ | `total_price - cogs` (EGP). Positive = profitable line. NULL when cost is unavailable. |
| 29 | `is_void` | BOOLEAN | 🟦 ❌ | TRUE = line was voided after posting. Voided lines are retained for audit but excluded from revenue aggregations using `WHERE NOT is_void`. |
| 30 | `voided_at` | TIMESTAMP | 🟦 ❌ | Timestamp of void event. Source: `patient_invoice_lines.voided_at`. NULL for active lines. |
| 31 | `refreshed_at` | TIMESTAMP | ❌ | Last upsert timestamp. Infrastructure metadata only. |

**Traceback Path:**
```
rpt_patient_service_usage.source_line_id
  → patient_invoice_lines WHERE id = source_line_id
      → patient_invoice_headers WHERE id = invoice_id
      → services WHERE id = service_id         (if service line)
      → items WHERE id = item_id               (if drug/consumable)
      → inventory_lots WHERE id = lot_id       (if drug/consumable with lot)
```

---

## Table: `rpt_department_activity`

**Purpose:** Daily operational snapshot per department. One row per (date × department). Covers admissions, discharges, bed census, service orders, and revenue for that day.

**Grain:** 1 row = 1 calendar day × 1 department

**Refresh:** 🌙 Nightly full rebuild for prior day. Today's row is upserted in near-real-time (approximate; reconciled nightly).

**Traceback entry point:** `activity_date` + `department_id` → filter source tables by date + department

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `activity_date` | DATE | 🟦 ❌ | The calendar day this row represents. |
| 3 | `period_year` | SMALLINT | 🟦 ❌ | Pre-extracted from `activity_date`. |
| 4 | `period_month` | SMALLINT | 🟦 ❌ | Pre-extracted from `activity_date`. |
| 5 | `department_id` | VARCHAR | 🟦 ❌ | Source: `departments.id`. |
| 6 | `department_name` | TEXT | 🟦 ❌ | Source: `departments.name_ar` at refresh time. |
| 7 | `new_admissions` | INTEGER | 🟩 ✅ | Count of admissions where `admission_date = activity_date` in this department. Source: `COUNT(admissions.id) WHERE admission_date = p_date AND dept`. |
| 8 | `discharges` | INTEGER | 🟩 ✅ | Count of admissions where `discharge_date = activity_date` in this department. Source: `COUNT(admissions.id) WHERE discharge_date = p_date`. |
| 9 | `census_eod` | INTEGER | 🟩 ⚠️ | Active inpatients at end of day: admitted on or before `activity_date` and not yet discharged. Source: `COUNT WHERE admission_date <= p_date AND (discharge_date IS NULL OR discharge_date > p_date)`. Do NOT sum across dates — it is a point-in-time count. |
| 10 | `total_beds` | INTEGER | 🟩 ⚠️ | Total physical beds in department at snapshot time. Source: `COUNT(beds) JOIN rooms JOIN floors WHERE dept`. Do NOT sum across dates — it is static unless beds are added/removed. |
| 11 | `beds_occupied_eod` | INTEGER | 🟩 ⚠️ | Beds with `current_admission_id IS NOT NULL` at end of day. Source: `beds WHERE status = 'occupied'` at snapshot time. Point-in-time — do not SUM across dates. |
| 12 | `occupancy_rate` | NUMERIC(5,4) | 🟧 ❌ | `beds_occupied_eod / total_beds`. Range 0.0000–1.0000. Do NOT sum or average naively — recalculate from occupied/total if needed over a range. |
| 13 | `clinic_orders_placed` | INTEGER | 🟩 ✅ | Count of `clinic_orders` created on this date in this department. Source: `COUNT WHERE created_at::DATE = p_date AND target_id = dept_id`. |
| 14 | `clinic_orders_executed` | INTEGER | 🟩 ✅ | Count of `clinic_orders` executed on this date. Source: `COUNT WHERE executed_at::DATE = p_date`. |
| 15 | `invoices_created` | INTEGER | 🟩 ✅ | Count of `patient_invoice_headers` created on this date for this department. Source: `COUNT WHERE invoice_date = p_date AND department_id`. |
| 16 | `invoices_finalized` | INTEGER | 🟩 ✅ | Count finalized on this date. Source: `COUNT WHERE finalized_at::DATE = p_date`. |
| 17 | `gross_revenue` | NUMERIC(15,2) | 🟨 ✅ | `SUM(patient_invoice_headers.total_amount)` for invoices on this date in this department (EGP). |
| 18 | `net_revenue` | NUMERIC(15,2) | 🟨 ✅ | `SUM(patient_invoice_headers.net_amount)` after discounts (EGP). |
| 19 | `cash_collected` | NUMERIC(15,2) | 🟨 ✅ | `SUM(patient_invoice_payments.amount)` where `payment_date = activity_date` in this department (EGP). Note: collected date may differ from invoice date. |
| 20 | `refreshed_at` | TIMESTAMP | ❌ | Last nightly rebuild timestamp. |

**Traceback Path:**
```
rpt_department_activity (activity_date=D, department_id=X)
  → admissions WHERE admission_date=D AND [dept linkage]
  → admissions WHERE discharge_date=D AND [dept linkage]
  → patient_invoice_headers WHERE invoice_date=D AND department_id=X
  → patient_invoice_payments WHERE payment_date=D AND [dept linkage]
  → clinic_orders WHERE created_at::DATE=D AND target_id=X
```

---

## Table: `rpt_doctor_activity`

**Purpose:** Doctor performance aggregated by period. Two row types: `activity_date IS NULL` = monthly summary; `activity_date IS NOT NULL` = daily detail.

**Grain:** 1 row = (doctor_id × period_year × period_month) for monthly rows, or (doctor_id × date) for daily rows

**Refresh:** 🌙 Nightly — daily rows built each night; monthly rollup rebuilt on period close.

**Traceback entry point:** `doctor_id` + `period_year` + `period_month` → filter source tables

**Key design decision:** `doctor_id` is the primary business key, **NOT** `doctor_name`. `doctor_name` is a snapshot/display field only and must never be used in JOINs or WHERE clauses for identity matching. For doctors not linked to a `doctors` table record (free-text names from admissions/invoices), a stable synthetic key `'UNLINKED:' || MD5(lower(doctor_name))` is assigned at refresh time so every row has a non-NULL `doctor_id`.

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `period_year` | SMALLINT | 🟦 ❌ | Calendar year of activity. |
| 3 | `period_month` | SMALLINT | 🟦 ❌ | Calendar month (1–12). |
| 4 | `activity_date` | DATE | 🟦 ❌ | NULL = monthly summary row (one per doctor per month). NOT NULL = daily detail row (one per doctor per day). |
| 5 | `doctor_id` | VARCHAR NOT NULL | 🟦 ❌ | **Primary business key.** Never NULL. For doctors in `doctors` table: `doctors.id`. For free-text doctor names not in the table: `'UNLINKED:' \|\| MD5(lower(doctor_name))` — stable deterministic synthetic key. Used in all joins and filters. Unique constraint: `(doctor_id, period_year, period_month) WHERE activity_date IS NULL` and `(doctor_id, activity_date) WHERE activity_date IS NOT NULL`. |
| 6 | `doctor_name` | TEXT | 🟦 ❌ | **Display/snapshot field only. Do NOT use for filtering or joining.** Captured at refresh time from `doctors.name` (if linked) or from the free-text name in source documents. May differ from `doctors.name` if doctor was renamed after rows were written. |
| 7 | `doctor_specialty` | TEXT | 🟦 ❌ | Snapshot from `doctors.specialty` at refresh time. NULL for unlinked doctors. |
| 8 | `department_id` | VARCHAR | 🟦 ❌ | Primary department of this doctor's activity in this period. |
| 9 | `department_name` | TEXT | 🟦 ❌ | Denormalized from `departments.name_ar`. |
| 10 | `patient_count` | INTEGER | 🟩 ✅ | Distinct patients seen by this doctor in the period. Source: `COUNT(DISTINCT patient_id)` from `patient_invoice_headers WHERE doctor_name = ?`. |
| 11 | `admission_count` | INTEGER | 🟩 ✅ | Admissions where `admissions.doctor_name` matches. Source: `COUNT(admissions.id)`. |
| 12 | `consultation_count` | INTEGER | 🟩 ✅ | Clinic consultations by this doctor. Source: `COUNT(clinic_consultations.id) WHERE doctor_id = ?`. |
| 13 | `surgery_count` | INTEGER | 🟩 ✅ | Admissions with a surgery type linked to this doctor. Source: `COUNT(admissions WHERE surgery_type_id IS NOT NULL AND doctor_name = ?)`. |
| 14 | `orders_placed` | INTEGER | 🟩 ✅ | Clinic orders created by this doctor. Source: `COUNT(clinic_orders WHERE doctor_id = ?)`. |
| 15 | `orders_executed` | INTEGER | 🟩 ✅ | Clinic orders this doctor had executed (filled). |
| 16 | `total_revenue` | NUMERIC(15,2) | 🟨 ✅ | Total revenue on invoices where this doctor is named (EGP). `services_revenue + drug_revenue + surgery_revenue`. |
| 17 | `services_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue from `line_type='service'` lines attributed to this doctor (EGP). Source: `SUM(patient_invoice_lines.total_price)` filtered by doctor_name and line_type. |
| 18 | `drug_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue from `line_type='drug'` lines attributed to this doctor (EGP). |
| 19 | `surgery_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue from surgery-type service lines attributed to this doctor (EGP). |
| 20 | `total_due_to_doctor` | NUMERIC(15,2) | 🟨 ✅ | Sum of `doctor_transfers.amount` for this doctor in the period (EGP). This is the payable obligation created. Source: `SUM(doctor_transfers.amount)`. |
| 21 | `total_transferred` | NUMERIC(15,2) | 🟨 ✅ | Amount moved via doctor transfer records (EGP). Source: `SUM(doctor_transfers.amount)`. |
| 22 | `total_settled` | NUMERIC(15,2) | 🟨 ✅ | Amount paid out via `doctor_settlements` (EGP). Source: `SUM(doctor_settlements.amount)`. |
| 23 | `unsettled_balance` | NUMERIC(15,2) | 🟧 ✅ | `total_due_to_doctor - total_settled` (EGP). Positive = doctor is owed money. |
| 24 | `refreshed_at` | TIMESTAMP | ❌ | Last rebuild timestamp. |

**Traceback Path:**
```
-- Use doctor_id as the join key, NOT doctor_name.
-- For linked doctors (doctor_id starts with doctors.id format):
rpt_doctor_activity (doctor_id=D, period=Y/M)
  → doctors WHERE id=D                          -- get canonical name + specialty
  → patient_invoice_headers WHERE doctor_name = (SELECT name FROM doctors WHERE id=D)
      AND EXTRACT(YEAR/MONTH FROM invoice_date) = Y/M
      → patient_invoice_lines WHERE header_id IN (...)
  → admissions WHERE doctor_name = (SELECT name FROM doctors WHERE id=D)
      AND EXTRACT(YEAR/MONTH FROM admission_date) = Y/M
  → clinic_consultations WHERE doctor_id=D
  → clinic_orders WHERE doctor_id=D
  → doctor_transfers WHERE doctor_name = (SELECT name FROM doctors WHERE id=D)
  → doctor_settlements WHERE doctor_name = (SELECT name FROM doctors WHERE id=D)

-- For unlinked doctors (doctor_id starts with 'UNLINKED:'):
-- Traceback via doctor_name snapshot field only.
-- No doctors table record exists for these doctors.
```

---

---

# B. BILLING / REVENUE

---

## Table: `rpt_patient_revenue`

**Purpose:** Monthly financial rollup per patient. One row per (patient × year × month). Aggregates all invoices across all visits for that patient in that month.

**Grain:** 1 row = 1 patient × 1 calendar month

**Refresh:** 🌙 Nightly batch — rebuilds current month rows nightly. Prior-month rows locked after period close.

**Traceback entry point:** `patient_id` + `period_year` + `period_month` → `patient_invoice_headers`

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `period_year` | SMALLINT | 🟦 ❌ | Calendar year of billing month. |
| 3 | `period_month` | SMALLINT | 🟦 ❌ | Calendar month (1–12). |
| 4 | `patient_id` | VARCHAR | 🟦 ❌ | Source: `patient_invoice_headers.patient_id`. May be NULL for walk-ins. |
| 5 | `patient_name` | TEXT | 🟦 ❌ | Most recent name from invoices in this month. Source: `MAX(patient_invoice_headers.patient_name)`. |
| 6 | `patient_type` | VARCHAR(30) | 🟦 ❌ | Most recent patient type this month. Source: `MAX(patient_invoice_headers.patient_type)`. |
| 7 | `insurance_company` | TEXT | 🟦 ❌ | Insurer name if applicable. Source: `MAX(admissions.insurance_company)`. |
| 8 | `visit_count` | INTEGER | 🟩 ✅ | Distinct visits (admissions or outpatient encounters) in the month. Source: `COUNT(DISTINCT COALESCE(admission_id, header.id))`. |
| 9 | `invoice_count` | INTEGER | 🟩 ✅ | Total invoices issued in the month. Source: `COUNT(DISTINCT patient_invoice_headers.id)`. |
| 10 | `total_invoiced` | NUMERIC(15,2) | 🟨 ✅ | Gross billed across all invoices in month (EGP). Source: `SUM(patient_invoice_headers.total_amount)`. |
| 11 | `total_discount` | NUMERIC(15,2) | 🟨 ✅ | Total discount granted in month (EGP). Source: `SUM(patient_invoice_headers.discount_amount)`. |
| 12 | `net_amount` | NUMERIC(15,2) | 🟨 ✅ | Net revenue from patient in month (EGP). Source: `SUM(patient_invoice_headers.net_amount)`. |
| 13 | `total_paid` | NUMERIC(15,2) | 🟨 ✅ | Total cash received from patient in month (EGP). Source: `SUM(patient_invoice_headers.paid_amount)`. |
| 14 | `outstanding_balance` | NUMERIC(15,2) | 🟧 ✅ | `net_amount - total_paid` (EGP). Positive = patient still owes. Used for AR ageing. |
| 15 | `refreshed_at` | TIMESTAMP | ❌ | Last refresh timestamp. |

**Traceback Path:**
```
rpt_patient_revenue (patient_id=P, year=Y, month=M)
  → patient_invoice_headers
      WHERE patient_id=P
        AND EXTRACT(YEAR FROM invoice_date)=Y
        AND EXTRACT(MONTH FROM invoice_date)=M
        AND status IN ('finalized','paid')
```

---

## Table: `rpt_daily_revenue`

**Purpose:** Daily revenue breakdown by source type (patient invoices vs pharmacy sales) × department × pharmacy × doctor. Drives live dashboards and daily reconciliation reports.

**Grain:** 1 row = 1 date × source_type × department × pharmacy × doctor (combination)

**Refresh:** Two-pass — 🔁 Intraday upsert on each invoice finalize (today). 🌙 Full nightly rebuild of yesterday.

**Traceback entry point:** `revenue_date` + `source_type` + `department_id`/`pharmacy_id` → filter source tables

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `revenue_date` | DATE | 🟦 ❌ | The calendar date of the revenue. For patient invoices: `invoice_date`. For sales: `invoice_date`. |
| 3 | `period_year` | SMALLINT | 🟦 ❌ | Pre-extracted year. |
| 4 | `period_month` | SMALLINT | 🟦 ❌ | Pre-extracted month. |
| 5 | `period_week` | SMALLINT | 🟦 ❌ | ISO week number. Used for weekly trend reports. |
| 6 | `source_type` | VARCHAR(30) | 🟦 ❌ | Origin of revenue: `'patient_invoice'` (clinical billing) \| `'sales_pharmacy'` (OTC pharmacy) \| `'sales_clinic'` (clinic dispensing). Critical dimension for separating revenue streams. |
| 7 | `department_id` | VARCHAR | 🟦 ❌ | Department generating revenue. NULL for pharmacy rows. Source: `patient_invoice_headers.department_id`. |
| 8 | `department_name` | TEXT | 🟦 ❌ | Denormalized at refresh time. |
| 9 | `pharmacy_id` | VARCHAR | 🟦 ❌ | Pharmacy generating revenue. NULL for patient invoice rows. Source: `sales_invoice_headers.pharmacy_id`. |
| 10 | `pharmacy_name` | TEXT | 🟦 ❌ | Denormalized at refresh time. Source: `pharmacies.name_ar`. |
| 11 | `doctor_name` | TEXT | 🟦 ❌ | Doctor dimension for patient invoice rows. NULL for pharmacy rows. Source: `patient_invoice_headers.doctor_name`. |
| 12 | `invoice_count` | INTEGER | 🟩 ✅ | Non-return invoices finalized on this date for this dimension. |
| 13 | `return_count` | INTEGER | 🟩 ✅ | Return/refund invoices on this date. Source: `COUNT WHERE is_return=TRUE` (sales) or voided patient invoices. |
| 14 | `total_gross` | NUMERIC(15,2) | 🟨 ✅ | Gross billed before discounts (EGP). Source: `SUM(subtotal)` for sales, `SUM(total_amount)` for patient invoices. |
| 15 | `total_discount` | NUMERIC(15,2) | 🟨 ✅ | Total discounts on this day (EGP). Source: `SUM(discount_value/amount)`. |
| 16 | `total_net` | NUMERIC(15,2) | 🟨 ✅ | Net revenue after discounts (EGP). Source: `SUM(net_total/net_amount)`. |
| 17 | `total_collected` | NUMERIC(15,2) | 🟨 ✅ | Cash actually received on this date (EGP). Important: collected date can differ from invoice date (e.g., delayed payments). Source: `SUM(patient_invoice_payments.amount WHERE payment_date = revenue_date)`. |
| 18 | `service_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue from service lines on this date (EGP). |
| 19 | `drug_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue from drug lines on this date (EGP). Includes pharmacy sales + patient drug charges. |
| 20 | `consumable_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue from consumable lines on this date (EGP). |
| 21 | `stay_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue from accommodation/stay lines (EGP). |
| 22 | `total_cogs` | NUMERIC(15,2) | 🟧 ✅ | Cost of goods (drugs + consumables) issued on this date (EGP). Source: `SUM(qty_change × unit_cost)` from `inventory_lot_movements WHERE tx_date::DATE = revenue_date`. Populated in nightly pass only. |
| 23 | `gross_profit` | NUMERIC(15,2) | 🟧 ✅ | `total_net - total_cogs` (EGP). Approximation — COGS uses lot-level purchase price, not fully costed until lot recosting runs. |
| 24 | `refreshed_at` | TIMESTAMP | ❌ | Last rebuild timestamp. Use to identify intraday (approximate) vs nightly (reconciled) rows. |

**Traceback Path:**
```
rpt_daily_revenue (revenue_date=D, source_type='patient_invoice', department_id=X)
  → patient_invoice_headers WHERE invoice_date=D AND department_id=X
      AND status IN ('finalized','paid')

rpt_daily_revenue (revenue_date=D, source_type='sales_pharmacy', pharmacy_id=Y)
  → sales_invoice_headers WHERE invoice_date=D AND pharmacy_id=Y
      AND status='finalized'
  → inventory_lot_movements WHERE tx_date::DATE=D AND warehouse_id linked to pharmacy
```

---

## Table: `rpt_department_profitability`

**Purpose:** Monthly P&L per department. Revenue (clinical billing only) minus COGS (inventory cost of drugs + consumables dispensed in dept warehouses) minus partial OpEx (GL expense lines explicitly coded to dept cost centre). Produces gross profit and a partial operating profit figure per department per month.

**Grain:** 1 row = 1 department × 1 calendar month

**Refresh:** 📅 Monthly batch — triggered after fiscal period close. Prior-month rows are immutable.

**Traceback entry point:** `department_id` + `period_year` + `period_month` → multiple source tables

**Profitability model summary:**
- `gross_profit` = `net_revenue - total_cogs` — **GROSS PROFIT** (inventory margin only)
- `operating_profit` = `gross_profit - total_opex` — **PARTIAL NET** (not full P&L — excludes doctor settlements, overhead allocation, unallocated fixed costs)
- Doctor settlements: **NOT included** — tracked separately in `rpt_doctor_activity`
- Overhead (salaries, utilities, depreciation): **NOT included** — no allocation engine in the system
- Pharmacy OTC sales: **NOT included** — belong to pharmacy dimension, not department

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `period_year` | SMALLINT | 🟦 ❌ | Calendar year. |
| 3 | `period_month` | SMALLINT | 🟦 ❌ | Calendar month (1–12). |
| 4 | `department_id` | VARCHAR | 🟦 ❌ | Source: `departments.id`. |
| 5 | `department_name` | TEXT | 🟦 ❌ | Denormalized `departments.name_ar`. |
| 6 | `cost_center_id` | VARCHAR | 🟦 ❌ | GL cost centre mapped to this department. Source: `services.cost_center_id` (dominant for dept) or `warehouses.cost_center_id`. Used to join GL data. |
| 7 | `cost_center_name` | TEXT | 🟦 ❌ | Denormalized `cost_centers.name`. |
| 8 | `gross_revenue` | NUMERIC(15,2) | 🟨 ✅ | Total billed before discount in month (EGP). Source: `SUM(patient_invoice_headers.total_amount WHERE department_id = ?)`. |
| 9 | `total_discount` | NUMERIC(15,2) | 🟨 ✅ | Total discount in month (EGP). Source: `SUM(patient_invoice_headers.discount_amount)`. |
| 10 | `net_revenue` | NUMERIC(15,2) | 🟨 ✅ | Revenue after discount (EGP). `gross_revenue - total_discount`. |
| 11 | `total_cogs` | NUMERIC(15,2) | 🟧 ✅ | Cost of drugs + consumables issued in this dept's warehouse in the month (EGP). Source: `SUM(ABS(qty_change) × unit_cost)` from `inventory_lot_movements` filtered to dept's default warehouse and issue tx_types. |
| 12 | `total_opex` | NUMERIC(15,2) | 🟧 ✅ | Operating expenses posted to this dept's cost centre in GL (EGP). Source: `SUM(journal_lines.debit - journal_lines.credit)` WHERE `cost_center_id = dept_cc` AND `account_type = 'expense'` in posted journal entries for the period. |
| 13 | `gross_profit` | NUMERIC(15,2) | 🟧 ✅ | `net_revenue - total_cogs` (EGP). **GROSS PROFIT** — clinical billing margin after direct drug/consumable costs only. Does NOT include doctor settlements, fixed overhead, or shared services. Use for unit-economics comparison across departments. |
| 14 | `operating_profit` | NUMERIC(15,2) | 🟧 ✅ | `gross_profit - total_opex` (EGP). **PARTIAL figure, NOT full P&L.** Subtracts only GL expense lines explicitly coded to this department's cost centre. Doctor settlements, unallocated salaries, utilities, and depreciation are excluded. Label in reports as "Contribution After Direct Costs" rather than "Operating Profit". |
| 15 | `gross_margin_pct` | NUMERIC(7,4) | 🟧 ❌ | `gross_profit / NULLIF(net_revenue, 0)`. Fraction, range −∞ to 1. Do NOT sum across departments — recalculate from component totals when aggregating. |
| 16 | `patient_count` | INTEGER | 🟩 ✅ | Distinct patients billed in this dept in the month. |
| 17 | `admission_count` | INTEGER | 🟩 ✅ | Admissions linked to this dept in the month. |
| 18 | `service_count` | INTEGER | 🟩 ✅ | Non-voided service lines billed in the month. |
| 19 | `invoice_count` | INTEGER | 🟩 ✅ | Finalized invoices in this dept in the month. |
| 20 | `refreshed_at` | TIMESTAMP | ❌ | Month-close rebuild timestamp. |

**Traceback Path:**
```
rpt_department_profitability (department_id=X, year=Y, month=M)
  → patient_invoice_headers WHERE department_id=X AND period Y/M
  → inventory_lot_movements WHERE warehouse_id IN
      (SELECT id FROM warehouses WHERE department_id=X)
      AND tx_date in period Y/M AND tx_type IN ('sale','patient_sale')
  → journal_lines WHERE cost_center_id = dept_cost_center_id
      JOIN journal_entries WHERE period_id = fiscal_period AND status='posted'
      AND account_type = 'expense'
```

---

---

# C. ACCOUNTING / GL

---

## Table: `rpt_account_balances_by_period`

**Purpose:** Pre-computed GL balance per (account × cost centre × fiscal period). Eliminates full-table scan of `journal_lines` (1M+ rows) for Trial Balance, General Ledger, Income Statement, and Balance Sheet reports.

**Grain:** 1 row = 1 account × 1 cost centre (or NULL for all-centres total) × 1 fiscal period

**Refresh:** 🔁 Event-driven upsert on each `journal_entry` post or reversal. 📅 Full period rebuild on fiscal period close.

**Traceback entry point:** `period_id` + `account_id` → `journal_lines JOIN journal_entries`

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `period_id` | VARCHAR | 🟦 ❌ | FK reference to `fiscal_periods.id`. Traceback: `fiscal_periods WHERE id = period_id`. |
| 3 | `period_year` | SMALLINT | 🟦 ❌ | Pre-extracted from `fiscal_periods.start_date`. |
| 4 | `period_month` | SMALLINT | 🟦 ❌ | Pre-extracted from `fiscal_periods.start_date`. |
| 5 | `period_name` | TEXT | 🟦 ❌ | Denormalized from `fiscal_periods.name`. E.g. "يناير 2026". |
| 6 | `is_period_closed` | BOOLEAN | 🟦 ❌ | Source: `fiscal_periods.is_closed`. TRUE = this row is immutable; no further postings allowed. |
| 7 | `account_id` | VARCHAR | 🟦 ❌ | FK reference to `accounts.id`. |
| 8 | `account_code` | TEXT | 🟦 ❌ | Denormalized from `accounts.code`. E.g. `'1101'`. |
| 9 | `account_name` | TEXT | 🟦 ❌ | Denormalized from `accounts.name`. Will not update if account name changes after refresh. |
| 10 | `account_type` | TEXT | 🟦 ❌ | Denormalized from `accounts.account_type` enum: `'asset'`, `'liability'`, `'equity'`, `'revenue'`, `'expense'`. Critical for report filtering (IS = Income Statement; BS = Balance Sheet). |
| 11 | `account_level` | SMALLINT | 🟦 ❌ | Account hierarchy depth. Source: `accounts.level`. Used for indent/rollup in hierarchical reports. |
| 12 | `parent_account_id` | VARCHAR | 🟦 ❌ | Source: `accounts.parent_id`. Enables tree-rollup queries without joining `accounts` table. |
| 13 | `cost_center_id` | VARCHAR | 🟦 ❌ | FK to `cost_centers.id`. NULL row = account total across all cost centres. Non-NULL row = cost-centre-level split. Use `WHERE cost_center_id IS NULL` for consolidated Trial Balance. |
| 14 | `cost_center_code` | TEXT | 🟦 ❌ | Denormalized from `cost_centers.code`. |
| 15 | `cost_center_name` | TEXT | 🟦 ❌ | Denormalized from `cost_centers.name`. |
| 16 | `opening_balance` | NUMERIC(18,2) | 🟨 ⚠️ | Account balance at start of period (EGP). Source: `accounts.opening_balance` (for first period) or prior period's `closing_balance` (for subsequent periods). Sign convention: positive = debit balance for assets/expenses; positive = credit balance for liabilities/equity/revenue. Do NOT sum across accounts — meaningful only per-account. |
| 17 | `period_debit` | NUMERIC(18,2) | 🟨 ✅ | Total debit postings to this account in this period (EGP). Source: `SUM(journal_lines.debit)` filtered by period and account. |
| 18 | `period_credit` | NUMERIC(18,2) | 🟨 ✅ | Total credit postings to this account in this period (EGP). Source: `SUM(journal_lines.credit)`. |
| 19 | `closing_balance` | NUMERIC(18,2) | 🟨 ⚠️ | Account balance at end of period (EGP). For assets/expenses: `opening + debit - credit`. For liabilities/equity/revenue: `opening - debit + credit`. Do NOT sum across accounts. |
| 20 | `journal_line_count` | INTEGER | 🟩 ✅ | Count of `journal_lines` rows contributing to this balance. Used to detect unexpectedly sparse accounts. |
| 21 | `last_entry_date` | DATE | 🟦 ❌ | Most recent `journal_entries.entry_date` affecting this account in this period. Source: `MAX(journal_entries.entry_date)`. |
| 22 | `refreshed_at` | TIMESTAMP | ❌ | Last upsert timestamp. |

**Traceback Path:**
```
rpt_account_balances_by_period (period_id=P, account_id=A, cost_center_id=C)
  → journal_lines
      WHERE account_id=A AND cost_center_id=C
      JOIN journal_entries
          WHERE period_id=P AND status='posted'
  → journal_entries.source_type + source_document_id
      → e.g. 'sales_invoice' → sales_invoice_headers.id
      → e.g. 'patient_invoice' → patient_invoice_headers.id
      → e.g. 'receiving' → receiving_headers.id
```

---

---

# D. INVENTORY / COST

---

## Table: `rpt_inventory_snapshot`

**Purpose:** Point-in-time stock position per (item × warehouse) per day. Computes expiry alerts, lot count, and inventory valuation. Today's row is rebuilt nightly; historical rows are immutable daily archives.

**Grain:** 1 row = 1 item × 1 warehouse × 1 snapshot date

**Refresh:** 🌙 Nightly full rebuild for `snapshot_date = CURRENT_DATE`. Historical dates never modified.

**Traceback entry point:** `item_id` + `warehouse_id` → `inventory_lots WHERE is_active=TRUE`

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `snapshot_date` | DATE | 🟦 ❌ | The date this snapshot represents. For current stock: use `WHERE snapshot_date = CURRENT_DATE`. For historical: use any past date. |
| 3 | `item_id` | VARCHAR | 🟦 ❌ | FK to `items.id`. |
| 4 | `item_code` | TEXT | 🟦 ❌ | Denormalized from `items.item_code`. |
| 5 | `item_name` | TEXT | 🟦 ❌ | Denormalized from `items.name_ar`. |
| 6 | `item_category` | TEXT | 🟦 ❌ | Denormalized from `items.category` enum. |
| 7 | `has_expiry` | BOOLEAN | 🟦 ❌ | Source: `items.has_expiry`. TRUE = item tracked for expiry. Used to suppress expiry columns for non-expiring items in reports. |
| 8 | `warehouse_id` | VARCHAR | 🟦 ❌ | FK to `warehouses.id`. |
| 9 | `warehouse_code` | TEXT | 🟦 ❌ | Denormalized from `warehouses.warehouse_code`. |
| 10 | `warehouse_name` | TEXT | 🟦 ❌ | Denormalized from `warehouses.name_ar`. |
| 11 | `qty_in_minor` | NUMERIC(18,3) | 🟩 ⚠️ | Total stock on hand in minor units (e.g. tablets, not boxes). Source: `SUM(inventory_lots.qty_in_minor) WHERE is_active=TRUE`. To convert: divide by `items.major_to_minor` or `medium_to_minor` as needed. Do NOT sum across warehouses for financial value — use `total_cost_value` instead. |
| 12 | `active_lot_count` | INTEGER | 🟩 ✅ | Count of lots with `is_active=TRUE AND qty_in_minor > 0`. Indicates inventory fragmentation; high count = many small lots. |
| 13 | `expired_qty` | NUMERIC(18,3) | 🟩 ✅ | Minor-unit quantity in lots where `expiry_date < snapshot_date`. Must be blocked from dispensing per business rule. Source: `SUM(qty_in_minor) WHERE expiry_date < p_date`. |
| 14 | `expiring_30d_qty` | NUMERIC(18,3) | 🟩 ✅ | Minor-unit quantity expiring within 30 days from snapshot date. Source: `SUM WHERE expiry_date BETWEEN snapshot_date AND snapshot_date+30`. |
| 15 | `expiring_90d_qty` | NUMERIC(18,3) | 🟩 ✅ | Minor-unit quantity expiring within 90 days. Includes `expiring_30d_qty`. |
| 16 | `earliest_expiry_date` | DATE | 🟦 ❌ | Nearest upcoming expiry date among active non-expired lots. Source: `MIN(expiry_date) WHERE expiry_date >= snapshot_date AND qty > 0`. |
| 17 | `nearest_expiry_lot_id` | VARCHAR | 🟦 ❌ | `inventory_lots.id` of the lot expiring soonest. Enables direct drill-down to the at-risk lot without re-joining source tables. |
| 18 | `avg_unit_cost` | NUMERIC(15,4) | 🟧 ⚠️ | Weighted average cost per minor unit (EGP). `SUM(qty × cost) / SUM(qty)`. Do NOT sum — use `total_cost_value` for monetary aggregation. |
| 19 | `total_cost_value` | NUMERIC(18,2) | 🟧 ✅ | Total inventory value at cost (EGP). `SUM(qty_in_minor × provisional_purchase_price)`. Safe to sum across items and warehouses. |
| 20 | `total_sale_value` | NUMERIC(18,2) | 🟧 ✅ | Total inventory value at sale price (EGP). `SUM(qty_in_minor × sale_price)`. Represents potential revenue if all stock is sold. |
| 21 | `refreshed_at` | TIMESTAMP | ❌ | Nightly rebuild timestamp. |

**Traceback Path:**
```
rpt_inventory_snapshot (item_id=I, warehouse_id=W, snapshot_date=D)
  → inventory_lots WHERE item_id=I AND warehouse_id=W AND is_active=TRUE
      → inventory_lot_movements WHERE lot_id IN (...)
          (to understand how stock reached this level)
  → nearest_expiry_lot_id → inventory_lots WHERE id = nearest_expiry_lot_id
```

---

## Table: `rpt_item_movements_summary`

**Purpose:** Daily movement aggregates per (item × warehouse). Replaces full-range scan of `inventory_lot_movements` for period reports. Each row is an immutable daily summary of all movement types.

**Grain:** 1 row = 1 item × 1 warehouse × 1 calendar date

**Refresh:** 🔁 Incremental upsert — fires when any `inventory_lot_movements` row is inserted for this item+warehouse+date combination. Past rows are never modified.

**Traceback entry point:** `item_id` + `warehouse_id` + `movement_date` → `inventory_lot_movements JOIN inventory_lots`

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | VARCHAR PK | ❌ | Surrogate key. |
| 2 | `movement_date` | DATE | 🟦 ❌ | Calendar date of movements. Source: `inventory_lot_movements.tx_date::DATE`. |
| 3 | `period_year` | SMALLINT | 🟦 ❌ | Pre-extracted year from `movement_date`. |
| 4 | `period_month` | SMALLINT | 🟦 ❌ | Pre-extracted month from `movement_date`. |
| 5 | `item_id` | VARCHAR | 🟦 ❌ | Source: `inventory_lots.item_id` (joined via `lot_id`). FK to `items.id`. |
| 6 | `item_name` | TEXT | 🟦 ❌ | Denormalized from `items.name_ar`. |
| 7 | `item_category` | TEXT | 🟦 ❌ | Denormalized from `items.category`. Key filter for drug-vs-supply reports. |
| 8 | `warehouse_id` | VARCHAR | 🟦 ❌ | Source: `inventory_lot_movements.warehouse_id`. FK to `warehouses.id`. |
| 9 | `warehouse_name` | TEXT | 🟦 ❌ | Denormalized from `warehouses.name_ar`. |
| 10 | `received_qty` | NUMERIC(15,3) | 🟩 ✅ | Minor-unit quantity received on this date. Source: `SUM(qty_change_in_minor) WHERE tx_type='receive'`. Always positive. |
| 11 | `received_value` | NUMERIC(15,2) | 🟨 ✅ | Cost value of receipts (EGP). `SUM(qty × unit_cost) WHERE tx_type='receive'`. |
| 12 | `receipt_tx_count` | INTEGER | 🟩 ✅ | Number of receipt transactions. Used to detect high-frequency small receipts vs bulk receives. |
| 13 | `issued_qty` | NUMERIC(15,3) | 🟩 ✅ | Minor-unit quantity issued/sold on this date. Source: `ABS(SUM(qty_change_in_minor)) WHERE tx_type IN ('sale','patient_sale')`. Always stored as positive. |
| 14 | `issued_value` | NUMERIC(15,2) | 🟨 ✅ | COGS of issues on this date (EGP). `ABS(SUM(qty × unit_cost)) WHERE tx_type IN issue types`. |
| 15 | `issue_tx_count` | INTEGER | 🟩 ✅ | Number of issue transactions. High count indicates high dispensing frequency. |
| 16 | `return_in_qty` | NUMERIC(15,3) | 🟩 ✅ | Quantity returned INTO warehouse (customer/patient return). Source: `SUM WHERE tx_type='return_in'`. |
| 17 | `return_out_qty` | NUMERIC(15,3) | 🟩 ✅ | Quantity returned OUT of warehouse (supplier return). Source: `ABS(SUM WHERE tx_type='return_out')`. |
| 18 | `transfer_in_qty` | NUMERIC(15,3) | 🟩 ✅ | Quantity received via inter-warehouse transfer. Source: `SUM WHERE tx_type='transfer_in'`. |
| 19 | `transfer_out_qty` | NUMERIC(15,3) | 🟩 ✅ | Quantity sent via inter-warehouse transfer. Source: `ABS(SUM WHERE tx_type='transfer_out')`. |
| 20 | `adjustment_qty` | NUMERIC(15,3) | 🟩 ⚠️ | Net adjustment (positive or negative). Source: `SUM WHERE tx_type='adjustment'`. Can be negative. |
| 21 | `net_qty_change` | NUMERIC(15,3) | 🟧 ⚠️ | `SUM(ALL qty_change_in_minor)` on this date. Positive = net increase; negative = net decrease. Running sum of this column over a date range = stock movement for that range. |
| 22 | `refreshed_at` | TIMESTAMP | ❌ | Last upsert timestamp. |

**Traceback Path:**
```
rpt_item_movements_summary (item_id=I, warehouse_id=W, movement_date=D)
  → inventory_lot_movements
      WHERE warehouse_id=W
        AND tx_date::DATE=D
      JOIN inventory_lots WHERE id=lot_id AND item_id=I
          → inventory_lot_movements.reference_type + reference_id
              → e.g. 'sales_invoice' → sales_invoice_lines.id
              → e.g. 'receiving' → receiving_lines.id
              → e.g. 'transfer' → transfer_lines.id
```

---

---

# Summary: Aggregation Safety Rules

| Column Pattern | Rule |
|---------------|------|
| `_count` (INTEGER) | ✅ Always safe to SUM within the same grain |
| `total_*`, `gross_*`, `net_*` (NUMERIC revenue) | ✅ Safe to SUM — pre-aggregated values |
| `_qty` in movements | ✅ Safe to SUM over date ranges for same item+warehouse |
| `qty_in_minor` in snapshot | ⚠️ Sum only for same item across warehouses; do NOT sum across items |
| `opening_balance`, `closing_balance` | ⚠️ Do NOT sum across accounts — meaningless total |
| `occupancy_rate`, `gross_margin_pct` | ❌ Never sum — recalculate from numerator/denominator |
| `avg_unit_cost`, `unit_price` | ❌ Never sum — weighted average, not additive |
| `census_eod`, `total_beds` | ⚠️ Average over dates; do NOT sum |
| Dimension columns (`_id`, `_name`, `_type`) | ❌ Never aggregate |
| `is_void`, boolean flags | ❌ Never sum — use as filter |

---

# Summary: Refresh Timing per Table

| Table | Strategy | Trigger | Latency |
|-------|----------|---------|---------|
| `rpt_patient_visit_summary` | Event-driven incremental | Invoice finalize, payment, discharge | < 1 sec |
| `rpt_patient_service_usage` | Event-driven append | Invoice finalize | < 1 sec |
| `rpt_patient_revenue` | Daily batch | Nightly 00:10 | ~24 hrs |
| `rpt_account_balances_by_period` | Event-driven upsert + monthly rebuild | Journal post / period close | < 1 sec |
| `rpt_daily_revenue` | Two-pass | Intraday upsert + nightly reconcile 00:05 | Real-time approx |
| `rpt_department_profitability` | Monthly batch | After period close | ~1 month |
| `rpt_inventory_snapshot` | Nightly full rebuild | Nightly 23:59 | ~24 hrs |
| `rpt_item_movements_summary` | Event-driven upsert | Every lot movement insert | < 1 sec |
| `rpt_department_activity` | Nightly batch | Nightly 00:15 | ~24 hrs |
| `rpt_doctor_activity` | Daily batch + monthly rollup | Nightly 00:20 | ~24 hrs |
| `rpt_refresh_log` | Append-only audit | Written by every refresh function | < 1 sec |

---

# D. INFRASTRUCTURE / AUDIT

---

## Table: `rpt_refresh_log`

**Purpose:** Append-only audit trail for every reporting layer refresh operation. One row is inserted at the START of each refresh run and updated to COMPLETED or FAILED on exit. Used for monitoring refresh health, diagnosing data freshness issues, and idempotency checking.

**Grain:** 1 row = 1 execution of any reporting refresh function

**Refresh:** Append-only. Rows are never deleted or updated except to record completion/failure of the same run. No data is read from this table by refresh functions (audit-only).

**Traceback entry point:** N/A — this is the audit table for the reporting layer itself.

---

### Column Dictionary

| # | Column | Type | Category | Business Meaning |
|---|--------|------|----------|-----------------|
| 1 | `id` | BIGSERIAL PK | ❌ | Auto-incrementing surrogate key. Monotonically increasing = chronological order. |
| 2 | `report_table_name` | VARCHAR(100) NOT NULL | 🟦 ❌ | Primary reporting table being written. E.g. `'rpt_patient_visit_summary'`. Value is `'ALL'` for orchestrator function `rpt_nightly_refresh()` which calls multiple sub-functions. |
| 3 | `refresh_function` | VARCHAR(100) NOT NULL | 🟦 ❌ | Name of the PostgreSQL function that was executed. E.g. `'rpt_refresh_account_balances'`, `'rpt_nightly_refresh'`. |
| 4 | `refresh_params` | JSONB | 🟦 ❌ | Parameters passed to the refresh function at call time. E.g. `{"period_id":"FP-2026-01","full":true}`. NULL for parameter-free calls. Stored as JSONB for ad hoc querying. |
| 5 | `refresh_start_at` | TIMESTAMP NOT NULL | 🟦 ❌ | Wall-clock timestamp (`clock_timestamp()`) when the function was entered, before any work begins. |
| 6 | `refresh_end_at` | TIMESTAMP | 🟦 ❌ | Wall-clock timestamp when the function exited (success or failure). NULL while `status='running'`. |
| 7 | `duration_ms` | INTEGER | 🟩 ✅ | Elapsed time in milliseconds (`refresh_end_at - refresh_start_at`). NULL if still running. Use for performance trend monitoring. |
| 8 | `status` | VARCHAR(20) NOT NULL | 🟦 ❌ | Run state: `'running'` → inserted at start; `'success'` → updated on normal completion; `'partial'` → completed but some rows skipped with warnings; `'failed'` → updated on EXCEPTION. Use `WHERE status='failed'` to find broken runs. |
| 9 | `rows_affected` | INTEGER | 🟩 ✅ | Rows inserted or updated in the target table (`GET DIAGNOSTICS`). 0 = ran but nothing changed (idempotent). NULL = still running, or orchestrator (no direct rows). |
| 10 | `rows_inspected` | INTEGER | 🟩 ✅ | Source rows read from transactional tables (for cost/regression diagnostics). Set manually in complex functions. NULL for most functions. |
| 11 | `error_message` | TEXT | 🟦 ❌ | PostgreSQL `SQLERRM` text if `status='failed'`. NULL on success. First line of the error. |
| 12 | `error_detail` | TEXT | 🟦 ❌ | `SQLSTATE` code (e.g. `'23505'` for unique violation). NULL on success. |
| 13 | `error_context` | TEXT | 🟦 ❌ | `PG_EXCEPTION_CONTEXT` stack trace if available. NULL on success. Use for diagnosing errors deep in nested function calls. |
| 14 | `triggered_by` | VARCHAR(50) NOT NULL | 🟦 ❌ | What initiated this refresh: `'nightly_batch'` (default), `'event_invoice_finalize'`, `'event_payment'`, `'event_discharge'`, `'event_journal_post'`, `'event_lot_movement'`, `'period_close'`, `'manual'`. |
| 15 | `triggered_by_user` | VARCHAR | 🟦 ❌ | `users.id` if triggered manually via admin UI. NULL for automated runs. |
| 16 | `period_id` | VARCHAR | 🟦 ❌ | `fiscal_periods.id` for period-scoped refreshes (e.g. `rpt_refresh_account_balances`). NULL for date-scoped or full-table refreshes. |
| 17 | `date_scope` | DATE | 🟦 ❌ | Specific date for date-scoped refreshes (e.g. `rpt_refresh_daily_revenue`, `rpt_refresh_inventory_snapshot`). NULL for period-scoped or full-table refreshes. |

**Usage patterns:**
```sql
-- Check last 24 hours of refresh runs
SELECT report_table_name, refresh_function, status,
       refresh_start_at,
       duration_ms,
       rows_affected
FROM rpt_refresh_log
WHERE refresh_start_at > NOW() - INTERVAL '24 hours'
ORDER BY refresh_start_at DESC;

-- Find all failed runs in last 7 days
SELECT report_table_name, refresh_function,
       refresh_start_at, error_message, error_detail
FROM rpt_refresh_log
WHERE status = 'failed'
  AND refresh_start_at > NOW() - INTERVAL '7 days'
ORDER BY refresh_start_at DESC;

-- Monitor refresh duration trends (detect slowdowns)
SELECT refresh_function,
       AVG(duration_ms)                              AS avg_ms,
       MAX(duration_ms)                              AS max_ms,
       COUNT(*) FILTER (WHERE status = 'failed')     AS fail_count,
       COUNT(*) FILTER (WHERE status = 'success')    AS success_count
FROM rpt_refresh_log
WHERE refresh_start_at > NOW() - INTERVAL '30 days'
  AND status IN ('success', 'failed')
GROUP BY refresh_function
ORDER BY avg_ms DESC;

-- Check freshness: last successful run per table
SELECT DISTINCT ON (report_table_name)
    report_table_name,
    refresh_function,
    refresh_end_at,
    rows_affected
FROM rpt_refresh_log
WHERE status = 'success'
ORDER BY report_table_name, refresh_end_at DESC;
```

---

---

*End of Data Dictionary v1.1 — Status: Pre-Implementation Review (Final Design)*
