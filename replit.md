# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, designed to manage accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). It provides a robust, user-friendly accounting solution tailored for the healthcare sector in Arabic-speaking regions, featuring a classic accounting software UI. Key capabilities include comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting. The project aims to become the leading accounting solution for healthcare providers in the Middle East.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). PostgreSQL serves as the primary data store. The application is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Includes Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger). Supports automatic journal entry generation.
- **Inventory & Sales**: Manages Supplier Receiving, Sales Invoicing (with barcode scanning, FEFO allocation), Sales Returns, Patient Invoicing (services, drugs, consumables), Patient Admissions, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: Provides CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Offers isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Features real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, a two-stage journal entry system for sales, and robust Role-Based Access Control (RBAC).
- **Outpatient Clinic Module**: A self-contained module for clinic booking, doctor consultations (diagnosis, prescription, services), and doctor orders. It integrates with sales invoices and service orders, supporting doctor-specific pricing and clinic-scoped drug favorites.
- **Reporting & Audit**: Generates balanced financial reports, enforces RBAC, and maintains a comprehensive audit trail with strict validation.
- **User Experience**: Professional UI with a collapsible sidebar, A4 print styles, and visual auto-save indicators.
- **Department Services Orders**: A unified module for ordering medical services (lab, radiology) with single order and batch entry options, integrated with doctor orders.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, a Stay Engine for patient accommodation, a Bed Board system with real-time updates, and a Surgery Types System.

### Schema and Backend Structure
The schema is organized into domain-specific files (`enums.ts`, `users.ts`, `finance.ts`, etc.) within `shared/schema/`, respecting foreign key dependencies. The backend follows a similar domain-based modular structure for API routes (`server/routes/`) and data access logic (`server/storage/`).

### Technical Implementations
- **API**: RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL.
- **Validation**: Zod with drizzle-zod.
- **Concurrency & Idempotency**: Utilizes `FOR UPDATE` row locks, optimistic concurrency, and idempotent conversion processes.
- **Raw SQL Rule**: `db.execute()` / `tx.execute()` is allowed **only** for locking (`SELECT id ... FOR UPDATE`) or queries too complex for the ORM (e.g., window functions, CTEs). **Never** cast its `.rows[0]` to a named entity type — Drizzle returns snake_case column names from raw SQL while TypeScript expects camelCase. Pattern: `await tx.execute(sql\`SELECT id FROM t WHERE id = ${id} FOR UPDATE\`); const [record] = await tx.select().from(t).where(eq(t.id, id));` — one call to lock, one ORM call to read.
- **Financial Accuracy**: Server-side recomputation of invoice totals with `HALF_UP` rounding.
- **System Settings**: Critical settings are cached in memory.
- **Error Handling**: Centralized Arabic error messages with specific HTTP status codes. `handleError()` wrapper in `server/routes/_utils.ts` replaces repeated error boilerplate patterns. NOTE: only ~5 routes currently use `handleError()` — 330 raw try/catch blocks remain to be migrated.
- **Printing Safety**: Implements print tracking for receipts.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO ordering.
- **Monitoring**: Includes slow request/query logging.
- **Backup & Restore**: Automated scripts for backup and restore.
- **Architectural Enforcement**: Uses route/finance helpers, custom frontend hooks, ESLint, and scaffold generators.
- **Stay Engine Billing Modes**: Supports `hours_24` and `hotel_noon` idempotent billing.
- **Stock Transfer Journal (Atomic)**: `postTransfer()` now generates a balanced journal entry inside the same DB transaction. Uses `warehouses.glAccountId` (set per-warehouse in warehouse settings) to resolve GL accounts. Dr = destination warehouse account, Cr = source warehouse account, Amount = FEFO lot cost. Skips gracefully (no throw) if either warehouse lacks a GL account or no open fiscal period exists. Idempotency enforced by unique index on (sourceType, sourceDocumentId). No tax, supplier, or revenue accounts involved.
- **Invoice & Discharge Rules**: Enforces payment before finalization and finalized invoices before discharge, with RBAC bypass options.
- **Journal Safety Net**: Sales invoice finalization attempts journal generation within the same DB transaction, with a retry mechanism for failures.
- **HTTP Compression**: Express uses `compression` middleware.
- **Audit Trail**: Captures audit entries for critical financial and system operations.
- **Room Management**: Dedicated page for managing floors, rooms, and beds.
- **Surgery Types**: Integration with admissions for OR_ROOM line items.
- **Admissions Management**: Enhanced list with invoice status, department filtering, and financial totals.
- **Refactored Pages**: Key financial and inventory pages are refactored into modular, hook-based components.
- **Shared Components**: `ItemSearchDialog` and `ItemFastSearch` are shared for efficient item lookup.
- **Transfer Preparation**: A smart screen for preparing store transfers based on sales data, with bulk filtering, suggested quantities, and auto FEFO distribution.
- **Seed Data Isolation**: Development seed functions (`runPilotTestSeed`, `runPharmacyDemoSeed`) are isolated in `server/seeds/` and called from routes directly, keeping production storage files clean.
- **Type Safety**: `DrizzleTransaction` type exported from `server/db.ts`; used in `allocateStockInTx`, `insertJournalEntry`, `buildSalesJournalLines`, `generateSalesInvoiceJournalInTx` — replacing unsafe `tx: any`.
- **GL Function Documentation**: `buildSalesJournalLines` and `postTransfer` have step-by-step JSDoc comments. `generateWarehouseTransferJournal` is marked as legacy fallback (not production path).
- **Lot Recosting on Invoice Approval**: `approvePurchaseInvoice()` now performs final lot recosting inside the same DB transaction. Formula: `finalCostPerMinor = (valueBeforeVat − allocatedHeaderDiscount) / totalQtyMinor`. VAT excluded from inventory cost. Lots gain `provisionalPurchasePrice`, `costingStatus`, `costedAt`, `costSourceType`, `costSourceId` fields. Receiving status advances to `posted_costed` after successful recosting. Fully idempotent.

## Refactoring Status (as of last session)

### Completed — Large File Splits (Barrel + Container/Hook Pattern)
All files that were >700 lines have been split. Current state:

**Backend Storage (Barrel pattern):**
- `finance-storage.ts` → `finance-accounts-storage.ts` + `finance-reports-storage.ts` + `finance-journal-storage.ts`
- `purchasing-storage.ts` → `purchasing-receivings-storage.ts` + `purchasing-invoices-core-storage.ts` + `purchasing-invoices-journal-storage.ts`
- `transfers-storage.ts` → `transfers-core-storage.ts` + `transfers-inventory-storage.ts` + `transfers-search-storage.ts` + `transfers-logistics-storage.ts`
- `patient-invoices-storage.ts` → `core` + `distribution` + `returns`
- `sales-invoices-storage.ts` → `sales-invoices-core-storage.ts` + `sales-invoices-finalize-storage.ts`
- `clinic-storage.ts` → `clinic-master-storage.ts` + `clinic-orders-storage.ts`
- `bedboard-stay-storage.ts` → `bedboard-stays-storage.ts` + `bedboard-beds-storage.ts`

**Backend Routes (Domain split):**
- `items.ts` → `items-crud.ts` + `items-master.ts`

**Frontend (Container/Hook pattern):**
- `AdmissionsTab.tsx` → `admission-types.tsx` + `AdmissionList.tsx` + `AdmissionDetail.tsx` + thin `AdmissionsTab.tsx`
- `sidebar.tsx` → `sidebar-context.tsx` + `sidebar-base.tsx` + `sidebar-menu.tsx`
- `ChartOfAccounts.tsx` → `hooks/useChartOfAccounts.ts` + `components/AccountDialog.tsx` + `components/AccountsTree.tsx` + `components/AccountsToolbar.tsx` + thin container
- `item-card/index.tsx` → `hooks/useItemCard.ts` + thin container
- `store-transfers/hooks/useTransferForm.ts` → `sub-hooks/useTransferLines.ts` + `sub-hooks/useTransferAutoSave.ts` + coordinator

### Remaining Technical Debt (for next sessions)
1. **Error handling consistency** — migrate 330 raw try/catch blocks to use `handleError()` (biggest priority for human maintainability)
2. **`any` types** — 96 uses of `any` in storage layer need explicit types
3. **Structured logging** — 52 `console.log` calls should use a proper logger
4. **Files still 500–580 lines** (next targets, largest→smallest):
   - `server/storage/sales-journal-storage.ts` (581)
   - `server/storage/cashier-storage.ts` (579)
   - `client/src/pages/patient-invoice/hooks/useLineManagement.ts` (577)
   - `client/src/pages/RoomManagement.tsx` (570)
   - `server/storage/purchasing-receivings-storage.ts` (568)
   - `client/src/pages/journal-entry-form/index.tsx` (559)
   - `client/src/pages/patient-invoice/components/DistributeDialog.tsx` (544)
   - `client/src/pages/item-card/ItemFormFields.tsx` (532)

### NO-TOUCH Files (pre-existing errors — do not modify)
- `server/routes/auth.ts` — string[] → string type issue
- `server/storage/treasuries-storage.ts` — .slice on never
- `client/src/pages/doctor-orders/components/OrdersTable.tsx` — Map iteration

### Current System Quality Score: 81/100
- Architecture: 90% | TypeScript: 96% | Security: 82%
- Frontend quality: 85% | Error handling consistency: 58%
- File size compliance: 78% | Type safety: 72%

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

### Development Tools
- TypeScript
- Vitest
- `esbuild`
- Vite
