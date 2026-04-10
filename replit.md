# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, targeting the Middle East healthcare sector. It offers comprehensive financial management, including accounts, cost centers, and journal entries, and generates IFRS-compliant financial reports in EGP. Key capabilities extend to inventory and sales processing, patient and service invoicing, multi-pharmacy operations, and advanced security and reporting. The long-term vision is to establish this system as the leading accounting software solution for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application. The frontend uses React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS), and the backend is built with Node.js Express 5 (TypeScript, Drizzle ORM). PostgreSQL is the primary database. Full Arabic RTL localization is integrated system-wide.

### UI/UX Decisions
The user interface features a professional design, a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators. RTL architecture is implemented comprehensively with specific CSS utilities for toolbars, rows, and pagination, ensuring proper Arabic reading flow.

### Technical Implementations
The system utilizes a RESTful JSON API. Database interactions are managed via Drizzle ORM, with Zod and `drizzle-zod` for validation. Concurrency and idempotency are handled using `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy relies on server-side recomputation with `HALF_UP` rounding. Critical system settings are cached, and centralized error handling provides Arabic messages. Inventory management includes expired batch blocking and FEFO. An audit trail tracks critical operations. Key features include OPD billing with IFRS revenue deferral, a centralized lookup architecture, `React.memo` for performance, and efficient data entry via grid navigation and a scanner pattern. A deferred cost issue mechanism manages dispensing with insufficient stock, featuring a resolution engine. Department/Warehouse scope is enforced at multiple layers for patient invoices.

### Feature Specifications
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant financial reports, and automated journal entry generation.
- **Inventory & Sales**: Supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing, patient admissions, and master data management.
- **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments. Supports default price lists and a specific price resolution order.
- **Multi-Pharmacy Support**: Provides operational isolation for invoicing and cashier operations across pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC) with group-as-sole-authority permission model (group permissions are the only effective permissions when assigned; role is fallback only), and a complete cashier shift lifecycle.
- **Outpatient Clinic Module**: Features clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, and structured consultation fields.
- **Department Services Orders**: A unified module for ordering medical services (lab, radiology).
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation), Bed Board, and Surgery Types System.
- **Opening Stock**: Draft-to-posted document flow with lot entry, Excel import/export, and GL journal generation.
- **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation.
- **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions. Separate permissions for Bed Board (`bed_board.view`), Room Management (`rooms.manage`), and Surgery Types (`surgery_types.manage`). Formal permission model: `Effective = group_permissions` when group assigned, else `role_permissions` (group-as-sole-authority, no additive merge, no deny). PermissionsMatrixTab shows role-default permissions with "(افتراضية)" label as visual reference; checkbox state is the sole authority. User Effective Permissions Dialog (`GET /api/users/:id/effective-permissions`) shows each permission with source (`group` = active, `role_default` = available from role but inactive). One-time startup backfill syncs role→group permissions for system groups (guarded by `role_group_sync_done` flag).
- **Clinic Scope Isolation**: Strict per-user clinic filtering. `user_clinics` and `clinic_user_clinic_assignments` tables unified via `getUserClinicIds()`. Reception users and doctors see only patients/visits of their assigned clinics. Enforced on backend (all clinic routes + patient-visits) and frontend (clinic dropdown auto-filters). Department scope for bed board also per-user.
- **Contracts Module**: Master data for insurance/contract companies, contracts, and member cards, including a 5-pass rule evaluator for coverage and an approval workflow.
- **Account Mappings Module**: UI for bulk updates of automatic journal transaction types.
- **Customer Credit Payments Module**: Manages customer credit and integrates with cashier handover summaries.
- **Supplier Payments Module**: Manages supplier payments with dedicated schemas and GL integration.
- **Sales Return Accounting**: Two-stage journal entry system for sales returns, integrated with inventory and cashier refunds.
- **Purchase Returns Module**: For returning purchased items to suppliers, including invoice-linked returns and GL journal reversal.
- **Delivery Payment Collection**: Module for collecting delivery invoices, featuring atomic receipt creation and shift totals integration.
- **Thermal Receipt Printing**: 80mm thermal receipt system for the cashier module with auto-printing and customization.
- **Shortage Notebook**: Procurement dashboard for pharmacy managers, logging and aggregating shortage events.
- **Pharmacy Mode**: Restricts access to hospital-specific modules for non-owner users.
- **Item Movement Report**: Detailed per-item inventory movement report with search, filters, and Excel export.
- **Unit Conversion Overhaul**: Centralized unit conversion logic with server-side re-verification.
- **Financial Integrity Hardening**: Measures for GL safety, inventory integrity, and accounting for returns.
- **Pharmacy Sales VAT Module**: Per-item VAT configuration, a pure VAT engine, and GL journal integration for VAT output.
- **Internal Task Management System**: Allows staff to create tasks with priorities, due dates, and real-time notifications.
- **Cost Center Auto-Assignment**: Automatically assigns cost centers to journal lines based on account defaults, with a UI for updates.
- **Edit Posted Receiving**: Allows editing quantity/items on posted supplier receiving documents with backend reversal logic.
- **Patient Master Linkage (Upgrade)**: Unifies patient identity across modules by linking `patient_id` to `sales_invoice_headers`.
- **Patient Audit Trail**: Tracks patient linkage for audit purposes.
- **Patient Financial Summary API**: Provides aggregated financial data for patients.
- **Business Classification for Patient Invoice Lines**: Introduces a separate `business_classification` field for items, services, and invoice lines.
- **Doctor Cost System (أجر الطبيب)**: Auto-generates doctor cost lines on patient invoices based on per-service `doctorShareType` (none/percentage/fixed) and `doctorShareValue` configured in service master data. Cost lines are read-only, excluded from patient totals, and displayed with rose styling. `injectDoctorCostLines()` engine in `server/lib/doctor-cost-engine.ts` runs after contract coverage. GL integration handles doctor_cost line type separately.
- **Visit Group Multi-Department Billing**: Lightweight grouping layer for multiple department invoices for the same patient in an OPD visit.
- **Traceability Hardening**: All lines from department services carry `source_type`/`source_id` for improved traceability.
- **Patient File Workspace**: A comprehensive patient master workspace with 6 tabbed sections for overview, history, invoices, payments, and financial statements.
- **Unified Reception Module (الاستقبال الموحد)**: Single consolidated screen for all patient intake flows — consultation booking, bed admission, lab requests, radiology requests. Features patient search with duplicate detection, 3 payment types (cash/insurance/contract) with contract member card lookup, clinic/doctor selection, bed board with floor→room→bed cascade, surgery type search, today's visits list with filters and stats, keyboard navigation (F2 new, Escape clear, arrows/Enter in dropdowns), and thermal ticket printing. Replaces separate PatientFormDialog intake flows; PatientFormDialog retained for edit-only mode. "استقبال مريض" and "تذكرة جديدة" buttons removed from patients list screen.
- **Final Close for Patient Invoices**: Functionality to formally close patient invoices with specific rules and audit trails.
- **Encounter Model**: Unified `encounters` table (surgery/icu/ward/nursery/clinic/lab/radiology) with visit-centric lifecycle. EncounterRoutingService routes invoice lines to the visit's consolidated draft invoice with encounter_id tagging. Smart encounter reuse: `findOrCreateEncounter()` reuses active encounter of same type+department for same visit, with unique partial index (`uq_enc_visit_type_dept_active`) and conflict-retry for concurrency safety. Clinic appointments, clinic orders, and dept service orders all support optional `visitId` for visit-aware routing with standalone fallback. Startup backfill creates ward encounters for existing admissions. API routes at `/api/visits/:id/encounters`, `/api/encounters`, `/api/encounters/:id/complete|cancel|lines`.
- **Invoice Aggregation Engine**: `InvoiceAggregationService` provides single-query visit→encounters→lines→payments→totals aggregation grouped by encounter and department. `FinalizationGuardService` validates readiness with 3-state `PaymentClassification` (fully_paid/accounts_receivable/refund_due) — no longer requires full payment; AR and refund states allowed with warnings. Guard checks: hasInvoice, invoiceIsDraft, notAlreadyFinalizing, allLinesHaveEncounter, totalsConsistent, noVoidedOnly, accountMappingsExist. Two-phase finalize route: Phase 1 sets `status='finalizing'` (FOR UPDATE NOWAIT), Phase 2 recomputes live payment/net inside transaction, snapshots encounter revenue breakdown, sets `status='finalized'` with version assertion; rollback to draft on error. `visitAggregationCache` table for incremental aggregation with `refreshVisitAggregationCache()` called after line additions and finalization. API: `GET /api/visits/:visitId/invoice-summary`, `GET /api/visits/:visitId/finalization-check`, `POST /api/visits/:visitId/finalize-invoice`. Performance indexes on `patient_invoice_headers(visit_id, status)` and `patient_invoice_lines(encounter_id)`. ConsolidatedInvoiceTab UI with payment classification badge (fully paid/AR/refund), finalizing state indicator, totals-match readiness check, and context-aware confirmation dialog.
- **ConsolidatedInvoiceTab Upgrade (Task #41)**: Full upgrade of the patient invoice consolidated view. Added `diagnosis text` column to `patientInvoiceHeaders` schema. New backend routes: `PATCH /api/patient-invoices/:id/clinical-info` (draft-only, saves diagnosis + notes with audit) and `POST /api/patient-invoices/:id/add-payment` (draft-only, no GL, auto-generates reference, recalculates paid_amount). Frontend panels added: ClinicalInfoPanel (diagnosis/notes edit with auto-save button), HeaderDiscountPanel (percent/amount toggle, shows current discount), DoctorTransferPanel (finalized invoices only, shows transfer history), InvoicePrintTab (department + classification breakdown + payment list + print button). ServicesTab enhanced with client-side department filter dropdown. InvoicePaymentsTab (replaces PaymentsTab) includes add-payment form with treasury selector. InvoiceHeaderCard always shows lock state (amber=draft/LockOpen, green=closed/Lock). Non-encounter view now uses sidebar (financial summary + clinical + discount + doctor transfer) + main tabs (services, payments, print). Accounting rule preserved: no GL from any new route — GL only at Finalize.

## External Dependencies

### Database
- PostgreSQL

### Key NPM Packages
- `drizzle-orm`
- `drizzle-kit`
- `express`
- `@tanstack/react-query`
- `zod`
- `xlsx`
- `shadcn/ui`
- `connect-pg-simple`