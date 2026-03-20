# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting. It manages accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). The system provides a user-friendly solution for the healthcare sector, featuring a classic accounting software UI. Key capabilities include comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting. The project aims to become the leading accounting solution for healthcare providers in the Middle East.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). PostgreSQL is the primary data store. The application is designed for full Arabic RTL localization.

### UI/UX Decisions
- Professional UI with a collapsible sidebar.
- A4 print styles.
- Visual auto-save indicators.

### Key Features
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger), and automatic journal entry generation.
- **Inventory & Sales**: Supplier Receiving, Sales Invoicing (barcode scanning, FEFO allocation), Sales Returns, Patient Invoicing (services, drugs, consumables), Patient Admissions, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, separated two-journal system for sales (Phase 4: independent sales journal + independent cashier collection journal), robust Role-Based Access Control (RBAC), and **Dynamic Account Resolution** (cashier treasury debit resolved automatically from shift GL; warehouse inventory credit resolved from warehouse GL account).
- **Cashier Shift Lifecycle (Task #19 — COMPLETE & VERIFIED)**: Full shift lifecycle with `business_date` (Cairo TZ), stale detection by elapsed duration only (MAX_SHIFT_HOURS=24), atomic close with pending-invoice transfer log, invoice claim inside collect/refund transaction only, concurrent collection protection via `FOR UPDATE` row locks, supervisor override with `supervisor_override_close` audit entry, and 7-scenario end-to-end verification suite (all PASS).
- **Outpatient Clinic Module**: Clinic booking, doctor consultations, doctor orders, integration with sales invoices and service orders, doctor-specific pricing, and clinic-scoped drug favorites.
- **Reporting & Audit**: Balanced financial reports, RBAC enforcement, comprehensive audit trail, and strict validation.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine for patient accommodation, Bed Board with real-time updates, and Surgery Types System.
- **Stock Cycle Count**: Full inventory reconciliation module with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for creating/editing groups, managing members, and controlling per-module permissions via a full matrix view.
- **Contracts Module — Phase 1 (COMPLETE)**: Master data for insurance/contract companies (`companies` table), contracts (`contracts` table), and member cards (`contract_members` table). Full CRUD API with RBAC (`contracts.view` / `contracts.manage`). Three-panel RTL admin UI (companies → contracts → members). Card lookup endpoint `GET /api/contract-members/lookup?cardNumber=&date=`. Nullable FK columns (`company_id`, `contract_id`, `contract_member_id`) added to `patient_invoice_headers/lines`, `sales_invoice_headers/lines`, `hospital_admissions`, `clinic_appointments`. All legacy text fields (`insuranceCompany`, `contractName`, `payerReference`, `contractCompany`) retained and functional.
- **Contracts Module — Phase 2 Coverage Rules Engine (COMPLETE)**: `contractCoverageRules` table with 8 rule types (`include_service`, `exclude_service`, `include_dept`, `exclude_dept`, `discount_pct`, `fixed_price`, `approval_required`, `global_discount`). Pure 5-pass rule evaluator (`server/lib/contract-rule-evaluator.ts`). Coverage fields stamped on `patientInvoiceLines` at POST/PUT time via `server/lib/patient-invoice-coverage.ts`. CRUD routes GET/POST `/api/contracts/:id/rules`, PATCH/DELETE `/api/contracts/rules/:ruleId`, and `POST /api/contracts/evaluate`. Admin UI: Coverage Rules tab inside contracts screen (rules table sorted by priority, CoverageRuleForm dialog with dynamic fields by ruleType, inline evaluator with explanation panel). Patient invoice line grid shows coverage badges (covered/excluded/approval-pending) and company/patient share chips. Phase 3 (Claims GL accounting) and Sales Invoice / Clinic / Stay integrations deferred.

### Technical Implementations
- **API**: RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL.
- **Validation**: Zod with drizzle-zod.
- **Concurrency & Idempotency**: `FOR UPDATE` row locks, optimistic concurrency, and idempotent conversion processes.
- **Financial Accuracy**: Server-side recomputation of invoice totals with `HALF_UP` rounding.
- **System Settings**: Critical settings cached in memory.
- **Error Handling**: Centralized Arabic error messages with specific HTTP status codes.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO ordering.
- **Monitoring**: Slow request/query logging.
- **Backup & Restore**: Automated scripts.
- **Architectural Enforcement**: Route/finance helpers, custom frontend hooks, ESLint, and scaffold generators.
- **Stay Engine Billing Modes**: Supports `hours_24` and `hotel_noon` idempotent billing.
- **Stock Transfer Journal**: Generates a balanced journal entry within the same DB transaction.
- **Invoice & Discharge Rules**: Enforces payment before finalization and finalized invoices before discharge, with RBAC bypass options.
- **Journal Safety Net**: Sales invoice finalization attempts journal generation within the same DB transaction, with a retry mechanism.
- **HTTP Compression**: Express uses `compression` middleware.
- **Audit Trail**: Captures audit entries for critical financial and system operations.
- **Lot Recosting on Invoice Approval**: Performs final lot recosting within the same DB transaction.
- **Drizzle Schema Maintenance**: Specific rules apply for `tablesFilter`, `role_permissions` column type, `userRoleEnum` and `salesInvoiceStatusEnum` order, custom sequence declarations, FK constraint naming, and unique constraint naming.
- **OPD Billing Workflow**: Reception is the sole financial entry point. Consultation invoice created at booking, doctor consultation screen is purely clinical. Invoice status mapping: `finalized` (paid), `draft` (unpaid), `cancelled` (voided). Handles CASH, INSURANCE, and CONTRACT payment types. Includes duplicate-booking safeguard and doctor queue filtering based on permissions.
- **Centralized Lookup Architecture**: Unified architecture for shared-entity lookups (doctors, departments, accounts, treasuries, clinics, services) using dedicated hooks, components, and types to ensure consistent data fetching and display.
- **OPD GL Accounting — IFRS Revenue Deferral**: Uses deferred revenue (21163) until service delivery is complete for clinic consultation payments. Journal entries are atomic and idempotent. Defines specific GL accounts and entries for CASH booking, consultation completion, and full cancellation with refund.
- **OPD Refund Workflow**: Handled via a dedicated API endpoint with specific behavioral rules for partial and full-cancel refunds. Database writes include negative entries in `patient_invoice_payments`, `treasury_transactions`, and `audit_log`. Access control and hard validation rules are enforced.

## Contracts Module — Phase 1 Acceptance Notes

### What Phase 1 Delivers
- Full master-data CRUD for companies, contracts, and contract members (admin UI + REST API).
- Nullable FK foundation columns (`company_id`, `contract_id`, `contract_member_id`) on all six transactional tables: `patient_invoice_headers`, `patient_invoice_lines`, `sales_invoice_headers`, `sales_invoice_lines`, `hospital_admissions`, `clinic_appointments`.
- Card-lookup endpoint: `GET /api/contract-members/lookup?cardNumber=&date=` — ready for Phase 2 integration.
- RBAC: `contracts.view` / `contracts.manage` enforced on all endpoints.

### What Remains Intentionally Deferred
- **Registration / runtime contract stamping is NOT active.** The three FK columns are nullable and currently always NULL. No existing flow writes to them. Legacy text fields (`insuranceCompany`, `contractName`, `payerReference`, `contractCompany`) remain the live data source for all current operational flows and are fully backward-compatible.
- **Coverage rules engine** (discount schedules, approval limits, co-pay splits) — Phase 2.
- **Claims GL accounting** — Phase 3.
- `sales_invoice_headers.contract_member_id` — explicitly deferred to Phase 2 (pharmacy sales are company-level, not member-level, in Phase 1).
- `PatientFormDialog` member-card lookup widget — Phase 2 (integration point is documented but not wired).

### Temporary FK Integrity Gaps (8 Columns — Phase 1 Documented Gap)

Eight columns on transactional tables carry `contract_id` or `contract_member_id` values but **cannot currently be wired as true Drizzle FK references** due to JavaScript module circular-import constraints:

| Column | Table | Root cause |
|--------|-------|-----------|
| `contract_id` | `patient_invoice_headers` | `contracts.ts` imports `invoicing.ts` (priceLists) → making invoicing.ts → contracts.ts circular |
| `contract_member_id` | `patient_invoice_headers` | same |
| `contract_id` | `patient_invoice_lines` | same |
| `contract_member_id` | `patient_invoice_lines` | same |
| `contract_id` | `sales_invoice_headers` | same |
| `contract_id` | `sales_invoice_lines` | same |
| `contract_id` | `hospital_admissions` | `contracts.ts` imports `hospital.ts` (patients) → making hospital.ts → contracts.ts circular |
| `contract_member_id` | `hospital_admissions` | same |

**Why acceptable in Phase 1:** All eight columns are currently NULL in production. No code writes to them. NULL values are exempt from FK constraint checks in PostgreSQL, so there is no referential integrity risk.

**When this becomes unacceptable:** Phase 2 will begin writing real `contract_id` / `contract_member_id` values into these columns during registration and billing flows. At that point, DB-level FK enforcement becomes mandatory.

**Planned Phase 2 remediation options:**
1. **Raw SQL migration helper** — execute `ALTER TABLE … ADD CONSTRAINT FOREIGN KEY … DEFERRABLE INITIALLY DEFERRED` via a one-time migration script outside Drizzle's schema layer. This adds DB-level enforcement without touching the import graph.
2. **Schema restructuring** — split `contracts.ts` so it no longer imports `invoicing.ts` or `hospital.ts` directly, removing the circular dependency and allowing proper `.references()` declarations.

## External Dependencies
### Database
- PostgreSQL
- `connect-pg-simple`

### Key NPM Packages
- `drizzle-orm`
- `drizzle-kit`
- `express`
- `@tanstack/react-query`
- `zod`
- `xlsx`
- `shadcn/ui`