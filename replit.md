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
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, two-stage journal entry system for sales, and robust Role-Based Access Control (RBAC).
- **Cashier Shift Lifecycle (Task #19 — COMPLETE & VERIFIED)**: Full shift lifecycle with `business_date` (Cairo TZ), stale detection by elapsed duration only (MAX_SHIFT_HOURS=24), atomic close with pending-invoice transfer log, invoice claim inside collect/refund transaction only, concurrent collection protection via `FOR UPDATE` row locks, supervisor override with `supervisor_override_close` audit entry, and 7-scenario end-to-end verification suite (all PASS).
- **Outpatient Clinic Module**: Clinic booking, doctor consultations, doctor orders, integration with sales invoices and service orders, doctor-specific pricing, and clinic-scoped drug favorites.
- **Reporting & Audit**: Balanced financial reports, RBAC enforcement, comprehensive audit trail, and strict validation.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine for patient accommodation, Bed Board with real-time updates, and Surgery Types System.
- **Stock Cycle Count**: Full inventory reconciliation module with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for creating/editing groups, managing members, and controlling per-module permissions via a full matrix view.

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