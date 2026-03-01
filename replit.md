# Hospital General Ledger System

## Overview

This project is an Arabic RTL web application for hospital general ledger (GL) accounting, designed to manage 500+ accounts, cost centers, and journal entries. Its primary purpose is to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). The system provides a robust, user-friendly accounting solution tailored for the healthcare sector in Arabic-speaking regions, featuring a classic accounting software UI aesthetic.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). It uses PostgreSQL for data storage and is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Includes Chart of Accounts, Cost Centers (with Excel import), comprehensive Journal Entry system (create, post, reverse, templates), Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger). Automatic Journal Entries are generated based on configurable account mappings for various transaction types.
- **Inventory & Sales**: Features Supplier Receiving, Sales Invoicing (with barcode scanning, FEFO allocation, customer types, atomic stock deduction), Patient Invoicing (services, drugs, consumables, payments, "Distribute to Cases" feature, linked to admissions), Patient Admissions management, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: CRUD operations for services, price lists with inline editing and bulk adjustments, and integration with sales invoices.
- **Multi-Pharmacy Support**: Supports multiple pharmacies with isolation for invoicing and cashier operations, ensuring invoices are tied to their respective pharmacies.
- **Cashier & Security**: Includes real-time SSE for instant invoice visibility, password-protected cash drawers with GL account selection for shifts, and a two-stage journal entry system for sales, ensuring financial accuracy.
- **Reporting & Audit**: Generates balanced financial reports, incorporates full role-based access control (RBAC) with granular permissions, and maintains a comprehensive audit trail with strict validation and conflict resolution.
- **User Experience**: Emphasizes a professional UI with collapsible sidebar, A4 print styles, focus management, and visual auto-save indicators.

### Technical Implementations
- **API**: RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL dialect and Drizzle Kit.
- **Validation**: Zod with drizzle-zod.
- **Concurrency & Idempotency**: Utilizes `FOR UPDATE` row locks for critical operations, optimistic concurrency with versioning for patient invoices, and idempotent conversion processes with unique partial indexes.
- **Financial Accuracy**: Invoice totals are recomputed server-side with `HALF_UP` decimal rounding.
- **System Settings**: System settings are cached in memory for performance.
- **Error Handling**: Centralized Arabic error messages with specific HTTP status codes and frontend integration for user feedback.
- **Printing Safety**: Implements print tracking for cashier and refund receipts to prevent double-printing without reason.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO ordering, with centralized helpers for validation.
- **Monitoring**: Includes slow request/query logging and basic ops endpoints for health and backup status.
- **Backup & Restore**: Automated backup and restore scripts with retention.
- **Auto-Save**: Document entry forms feature auto-save functionality.
- **Specialized Features**: Includes Doctor Payable Transfer (Phase 7), Doctor Settlement (Phase 8), a Stay Engine for managing and accruing costs for patient accommodation, and a Bed Board system for hospital bed management with atomic operations and real-time status updates.
- **Doctor Payable Transfer**: `doctor_transfers` table records transfers from finalized patient invoices to doctor payables (مستحقات للطبيب على المستشفى). Idempotency via `client_request_id` UNIQUE. RBAC: owner/admin/accounts_manager only. UI inside PatientInvoice: transfer panel with doctor name, amount (default = remaining = net_amount - already_transferred), notes, and confirm Sheet drawer. APIs: `GET /api/patient-invoices/:id/transfers`, `POST /api/patient-invoices/:id/transfer-to-doctor`.
- **Doctor Settlement**: `doctor_settlements` + `doctor_settlement_allocations` tables. Allocates payment against `doctor_transfer` records FIFO (or manual). Partial settlement allowed. `settlementUuid` UNIQUE for idempotency. Last allocation absorbs rounding delta so `sum(allocations) == amount` exactly. GL posting via `generateJournalEntry` with `sourceType="doctor_payable_settlement"` after commit (Dr Doctor Payable / Cr Cash-Bank per account mapping — never hardcoded; silently skipped if no mapping). Audit + `[DOCTOR_SETTLEMENT]` emit after commit. RBAC: owner/admin/accounts_manager only. Frontend: `/doctor-settlements` (split-pane: create form + FIFO preview left, history right), confirm Sheet drawer. APIs: `GET /api/doctor-settlements`, `GET /api/doctor-settlements/outstanding?doctorName=`, `POST /api/doctor-settlements`.
- **Architectural Enforcement**: Uses route helpers for error handling and validation, finance helpers for consistent money operations, a custom frontend mutation hook, ESLint rules for code quality, test templates, and a scaffold generator for new features.
- **System Settings**: `system_settings` table (key/value). Loaded into memory cache at startup via `server/settings-cache.ts` (`getSetting`, `setSetting`, `loadSettings`). API: `GET /api/settings`, `PUT /api/settings/:key` (whitelist-validated). Frontend: `/system-settings` page. Current keys: `stay_billing_mode` (`"hours_24"` default | `"hotel_noon"`).
- **Stay Engine Billing Modes**: `accrueStayLines()` supports two modes controlled by `stay_billing_mode` setting. `hours_24`: charges one period per 24 hours elapsed from `started_at` (bucket key = date of period start, description = "يوم N"). `hotel_noon`: charges at 12:00 UTC noon boundaries (bucket key = `noon:YYYY-MM-DD`). Both modes are idempotent via `ON CONFLICT (source_type, source_id) DO NOTHING`. Existing calendar-day buckets are forward-compatible with hours_24 mode.
- **PatientInvoicePage Refactor (Phase 12)**: The large PatientInvoicePage (originally 3379 lines) has been systematically refactored. Tab content extracted to `tabs/` (InvoiceTab, RegistryTab, AdmissionsTab). Shared UI to `components/` (SearchDropdown, InvoiceHeaderBar, TotalsSummaryCard, LineGrid). Data/mutation logic extracted to `hooks/` (useInvoiceBootstrap, useAdmissions, useAdmissionsMutations, useRegistry, useInvoiceMutations). Coordinator is now 1683 lines.
- **BedBoard Rewrite (Phase 13)**: Full BedBoard.tsx rewrite with room grade management. `rooms.service_id` FK added via SQL. `getBedBoard()` now returns room serviceId/serviceNameAr/servicePrice. `admitPatientToBed()` auto-resolves effective service (explicit param > room service_id), immediately inserts first stay line (`يوم 1`) + recomputes totals in same TX. APIs: `GET /api/rooms`, `PATCH /api/rooms/:id`. Frontend: `RoomGradeDialog` for inline service assignment per room; room grade badge (shows service name + price, opens dialog on click); `ReceptionSheet` shows auto-filled room grade info (read-only badge) + amber warning if room has no grade; bed enrichment via room.serviceId passed at render time. `sql` import added to routes.ts.
- **Invoice & Discharge Business Rules (Phase 14)**: Finalize blocked unless `paid_amount >= net_amount` (returns code `UNPAID`). Discharge from bed blocked unless patient's invoice is finalized (returns `NO_INVOICE` or `INVOICE_NOT_FINALIZED`). Force bypass available only for `owner`/`admin`/`accounts_manager` roles — server checks `req.session.role`. Frontend `DischargeDialog` uses raw `fetch` to get structured error codes, shows amber warning with "تجاوز وخروج" button for authorized users.

## External Dependencies

### Database
- PostgreSQL
- `connect-pg-simple`

### Key NPM Packages
- `drizzle-orm`, `drizzle-kit`
- `express`
- `@tanstack/react-query`
- `zod`
- `xlsx`
- `shadcn/ui`

### Development Tools
- TypeScript
- Vitest
- `esbuild`
- Vite