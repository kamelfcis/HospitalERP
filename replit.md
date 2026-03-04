# Hospital General Ledger System

## Overview

This project is an Arabic RTL web application for hospital general ledger (GL) accounting. It is designed to manage 500+ accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). The system provides a robust, user-friendly accounting solution tailored for the healthcare sector in Arabic-speaking regions, featuring a classic accounting software UI aesthetic.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). It uses PostgreSQL for data storage and is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Includes Chart of Accounts, Cost Centers (with Excel import), comprehensive Journal Entry system (create, post, reverse, templates), Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger). Automatic Journal Entries are generated based on configurable account mappings.
- **Inventory & Sales**: Features Supplier Receiving, Sales Invoicing (with barcode scanning, FEFO allocation, customer types, atomic stock deduction), Patient Invoicing (services, drugs, consumables, payments, "Distribute to Cases" feature, linked to admissions), Patient Admissions management, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: CRUD operations for services (department-scoped), price lists with inline editing and bulk adjustments, and integration with sales invoices.
- **Multi-Pharmacy Support**: Supports multiple pharmacies with isolation for invoicing and cashier operations.
- **Cashier & Security**: Includes real-time SSE for instant invoice visibility, password-protected cash drawers with GL account selection for shifts, department-level invoice isolation (each unit sees only its own pending invoices), close-shift restriction when pending invoices exist, a two-stage journal entry system for sales. Cashier screen fully refactored into hooks + compound components (925→~200 lines). Supports pharmacies AND departments as cashier units.
- **Reporting & Audit**: Generates balanced financial reports, incorporates full role-based access control (RBAC) with granular permissions, and maintains a comprehensive audit trail with strict validation and conflict resolution.
- **User Experience**: Emphasizes a professional UI with collapsible sidebar, A4 print styles, focus management, and visual auto-save indicators.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, a Stay Engine for managing and accruing costs for patient accommodation, a Bed Board system for hospital bed management with atomic operations, real-time SSE updates, smart bed transfer with instant accommodation billing, and a Surgery Types System.
- **Announcements Ticker**: A scrolling news-ticker header bar (replaces static title bar) that streams active announcements. Admins manage announcements via `/announcements` page. Ticker auto-refreshes every 60 s. Background matches `bg-sidebar` (same color as the sidebar).

### Technical Implementations
- **API**: RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL dialect and Drizzle Kit.
- **Validation**: Zod with drizzle-zod.
- **Concurrency & Idempotency**: Utilizes `FOR UPDATE` row locks, optimistic concurrency with versioning, and idempotent conversion processes.
- **Financial Accuracy**: Invoice totals are recomputed server-side with `HALF_UP` decimal rounding.
- **System Settings**: System settings are cached in memory for performance.
- **Error Handling**: Centralized Arabic error messages with specific HTTP status codes and frontend integration.
- **Printing Safety**: Implements print tracking for cashier and refund receipts.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO ordering.
- **Monitoring**: Includes slow request/query logging and basic ops endpoints.
- **Backup & Restore**: Automated backup and restore scripts with retention.
- **Auto-Save**: Document entry forms feature auto-save functionality.
- **Architectural Enforcement**: Uses route helpers for error handling and validation, finance helpers for consistent money operations, a custom frontend mutation hook, ESLint rules, test templates, and a scaffold generator.
- **Stay Engine Billing Modes**: Supports `hours_24` and `hotel_noon` billing modes for patient stays, both idempotent.
- **Invoice & Discharge Business Rules**: Enforces payment before finalization and finalized invoices before discharge, with role-based bypass options.
- **Audit Trail**: Captures audit entries for critical financial operations like stay line edits and removals.
- **Sidebar Toggle Location**: Moved from top header to inside the sidebar footer (both expanded and collapsed states).
- **AppLayout Structure**: `AppHeader` (marquee ticker) → `main` content. Sidebar toggle button lives in `SidebarFooter`.
- **Source Field Preservation**: Ensures `sourceType`/`sourceId` fields are preserved across all frontend line pipelines.
- **Room Management**: Provides a dedicated page for CRUD operations on floors, rooms, and beds, including grade assignment.
- **Surgery Types Integration**: Allows linking surgery types to admissions, impacting OR_ROOM line items and invoice totals.
- **Admissions Management**: Enhanced admissions list with invoice status, department filtering, and financial totals.
- **Admissions API**: SQL now includes fallback joins to link manually created invoices to patient admissions.

## Patient Invoice Page — Architecture (Refactored)

The `PatientInvoicePage` was refactored from ~1212 lines into ~270 lines using a clean hook-based compound architecture.

### Hooks (client/src/pages/patient-invoice/hooks/)
| Hook | Responsibility |
|------|---------------|
| `useInvoiceBootstrap` | Fetches nextNumber, departments, warehouses, activeAdmissions |
| `useInvoiceForm` | All form field state + resetForm |
| `useSearchState` | Patient/doctor/item/service search state & dropdowns |
| `useLineManagement` | Invoice lines CRUD + FEFO item allocation |
| `usePayments` | Payment rows state + loadPayments/resetPayments |
| `useInvoiceMutations` | Save + Finalize mutations (no delete) |
| `useInvoiceValidation` | Centralized validation: validateSave / validateDistribute / validateFinalize |
| `useDoctorTransfer` | Doctor transfer state + mutation |
| `useStatsDialog` | Stock statistics popup state |
| `useAdmissions` | Admissions tab data + state |
| `useAdmissionsMutations` | Create / Discharge / Consolidate admissions |
| `useRegistry` | Invoice registry tab (search/filter/pagination) |

### Validation Rules (useInvoiceValidation)
- **Save**: Blocked if `patientName` is empty → toast + cancel
- **Distribute**: Blocked if any of `departmentId`, `warehouseId`, `doctorName` is missing, or no lines exist → toast listing missing fields
- **Finalize**: Blocked if invoice not saved, or service lines missing required doctor/nurse names

### Business Rules
- **No delete on patient invoices**: Delete permanently removed. Only path after finalization is مردود (refund).
- `resetAll` composite: resets form + lines + payments in one call.
- `useLineManagement` accepts individual stable params (not a `searchActions` object) to avoid unnecessary callback recreation.

### Components (client/src/pages/patient-invoice/components/)
- `InvoiceHeaderBar` — header fields + action buttons (save/finalize/distribute). No delete button.
- `DoctorTransferSheet` — doctor transfer confirm sheet
- `StockStatsDialog` — stock statistics dialog
- `DistributeDialog` — distribute to cases dialog
- `HeaderDiscountDialog` — header-level discount dialog
- `SurgeryTypeBar` — surgery type selector bar (shown when invoice linked to admission)

### Tabs (client/src/pages/patient-invoice/tabs/)
- `InvoiceTab` — main invoice entry (header + lines + payments + doctor transfer)
- `RegistryTab` — searchable invoice history
- `AdmissionsTab` — admissions management

## Cashier Collection Screen — Architecture (Refactored)

`CashierCollection` was refactored from ~925 lines into ~200 lines + separate modules in `client/src/pages/cashier/`.

### Hooks (`client/src/pages/cashier/hooks/`)
| Hook | Responsibility |
|------|---------------|
| `useCashierShift` | Unit selection (pharmacy/department), shift open/close, GL account, drawer password, totals |
| `usePendingInvoices` | Pending sales & returns queries + SSE real-time updates + invoice details |
| `useCashierActions` | Collect & refund mutations + keyboard shortcuts (Ctrl+Enter / F9) |

### Components (`client/src/pages/cashier/components/`)
| Component | Responsibility |
|-----------|---------------|
| `UnitSelector` | Visual entry picker — shows pharmacies AND departments in a card grid |
| `ShiftOpenForm` | Open-shift form: user dropdown (not free text), GL account + conditional password field |
| `ShiftStatusBar` | Active-shift header bar with unit name, cashier name, opening balance |
| `InvoiceTable` | Reusable pending invoice list (checkbox selection, search, row click) |
| `InvoiceDetailsPanel` | Shows line details for single selection, aggregate totals for multi-selection |
| `CloseShiftDialog` | Close-shift dialog with expected vs actual cash and variance |
| `ShiftTotalsWidget` | Fixed bottom-left totals widget (collected / refunded / net) |

### Business Rules
- **Unit isolation**: Pharmacies see their `sales_invoices`; departments see sales from their warehouses (`warehouse.department_id`)
- **Close restriction**: Backend blocks shift close if pending (finalized but uncollected) invoices exist for the unit
- **Cashier name**: Selected from active users list — no free-text input
- **Session-based cashier ID**: `cashierId` taken from `req.session.userId` (not hardcoded "cashier-1")
- **Password field**: Conditionally shown only when the selected GL account has a stored password hash
- **DB columns added**: `cashier_shifts.unit_type` (pharmacy|department), `cashier_shifts.department_id`

### New API Endpoints
- `GET /api/cashier/units` — combined pharmacies + departments for unit picker
- `GET /api/cashier/staff` — active users for cashier name dropdown
- `GET /api/cashier/shift/active?unitType=X&unitId=Y` — session-based active shift lookup

## Critical Implementation Notes

### DB / Backend
- **`db:push` gets stuck** — always use raw SQL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
- **DB permissions ≠ Code constants**: `DEFAULT_ROLE_PERMISSIONS` NOT auto-synced to `role_permissions` DB table. Must manually `INSERT INTO role_permissions` for new permissions.
- **Session structure**: stores `req.session.userId` and `req.session.role` (NOT `req.session.user`)
- **`roundMoney`** in `server/finance-helpers.ts` returns **string** not number — wrap with `parseMoney()` before arithmetic
- **accounts table**: field is `name` (not `nameAr`). Other tables use `nameAr`
- **Raw SQL camelCase**: `db.execute(sql...)` returns snake_case column names — must add explicit `AS "camelCase"` aliases for all compound column names
- **`auditLog` in routes.ts** is a function from `route-helpers.ts` — call as `await auditLog({...})`

### Frontend
- **Doctor transfer/settlement**: Uses `checkPermission("patient_invoices.transfer_doctor")` — NOT `req.session.user`
- **Doctor statement**: SQL must use explicit `AS "patientName"` etc. aliases for camelCase
- **`useInvoiceMutations` API**: param is `resetAll` (not `resetForm`); `deleteMutation` no longer exported
- **Validation error suppression**: save mutation `onError` skips toast if `error.message === "validation"` (toast was already shown by `validateSave`)

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
