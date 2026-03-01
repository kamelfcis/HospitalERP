# Hospital General Ledger System

## Overview

This project is a production-ready Arabic RTL web application for hospital general ledger (GL) accounting. It is designed to manage 500+ accounts, cost centers, and journal entries, and generate IFRS-compliant financial reports. The system uses Egyptian Pound (EGP) and features a classic accounting software UI aesthetic. Its purpose is to provide a robust, user-friendly accounting solution tailored for the healthcare sector in Arabic-speaking regions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). It uses PostgreSQL for data storage and is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Chart of Accounts, Cost Centers (with Excel import), comprehensive Journal Entry system (create, post, reverse, templates), Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger).
- **Automatic Journal Entries**: Configurable account mappings per transaction type (sales invoice, patient invoice, receiving, purchase invoice). When documents are finalized/posted/approved, draft journal entries are auto-generated using the configured mappings. Two-stage posting workflow: draft (مسودة) for review → posted (مُرحّل) to affect ledger balances. Batch posting available for multiple entries. Source type filter and source document linking in journal entries list. Settings UI at `/account-mappings` for configuring debit/credit accounts per line type (revenue, COGS, inventory, cash, receivables, payables, etc.).
- **Inventory & Sales**:
    - **Receiving**: Supplier Receiving with quantity-only workflow, editable selling price, bonus quantity tracking, sale price/near-expiry warnings, and receiving-to-invoice conversion. Includes an auto-save mechanism.
    - **Sales Invoicing**: Barcode scanning, item search, editable lines with FEFO allocation, bidirectional discount editing, customer types (Cash/Credit/Contract), and atomic stock deduction. Auto-save is implemented.
    - **Patient Invoicing**: Patient information, services, drugs, consumables, equipment, payments, and consolidated invoices with status tracking and payment methods. Includes "Distribute to Cases" feature for splitting drugs/consumables across multiple surgery patients equally, with automatic invoice creation and browser tab opening per patient. Patient invoices can be linked to admissions for multi-department tracking.
    - **Patient Admissions**: Admission management with admission numbers, patient linking, department invoice tracking, consolidated billing, discharge workflow, and printable reports with department filtering. API at `/api/admissions/*`.
- **Master Data & Pricing**: Item Master Data with Unit of Measure (UOM) management, department-based pricing, lot-level sale price tracking, expiry management (MM/YYYY), and barcode management. Patient registry (fullName, phone, nationalId, age) and Doctor registry (name, specialty) with full CRUD, soft delete, and advanced search. Both integrate as search-select dropdowns into Patient Invoice header and distribution dialog for rapid data entry.
- **Services & Price Lists**: CRUD for services, price lists with inline editing, bulk price adjustment, and integration of service consumables into sales invoices.
- **Multi-Pharmacy Support**: Multiple pharmacies (e.g., Main Pharmacy, Emergency Pharmacy), each with dedicated cashiers. Pharmacy-level isolation ensures invoices don't mix between pharmacies. Warehouses map to pharmacies, and invoices auto-inherit pharmacyId from their warehouse.
- **Real-Time SSE**: Server-Sent Events at `/api/cashier/sse/:pharmacyId` broadcast `invoice_finalized` events when pharmacists finalize invoices, enabling instant invoice visibility for cashiers (supports 20+ concurrent users with keep-alive and cleanup).
- **Cashier & Cash Drawer Security**: Password-protected cash drawers with bcrypt hashing, admin UI for drawer password management at `/drawer-passwords`. Cashier shift opening validates drawer password and requires GL account selection (filtered to cash/drawer accounts starting with 1211x/1212x). Shifts without GL account cannot collect/refund to prevent incomplete journal entries.
- **Two-Stage Journal Entries for Sales**: Pharmacist finalization creates a draft journal entry with receivables account. Cashier collection completes the entry by replacing receivables with the actual cash/drawer GL account.
- **Balanced Financial Reports**: Balance sheet calculates net income (revenues - expenses including opening balances) and displays it in equity section as "صافي ربح/خسارة الفترة" to ensure Assets = Liabilities + Equity.
- **Users & Permissions (RBAC)**: Full role-based access control with 11 roles (owner, admin, accounts_manager, purchase_manager, data_entry, pharmacist, pharmacy_assistant, warehouse_assistant, cashier, department_admin, reception) and 60+ granular permissions. Two-layer permission system: role defaults in `role_permissions` table + user-level overrides in `user_permissions` table (granted=true to add, granted=false to revoke). Session-based auth with express-session + connect-pg-simple. Login page, user management UI at `/users` with CRUD, role assignment, and per-user permission editing dialog. Frontend route guards (RequirePermission component) block direct URL access. Sidebar items filtered by permissions. Default admin user: admin/admin123. Permission constants in `shared/permissions.ts`. Auth API: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. User CRUD: `/api/users`, `/api/users/:id/permissions`. Auth context: `useAuth()` hook with `hasPermission()`.
- **Audit & Validation**: Full audit trail, advanced search, strict line-level validation (frontend and backend), and HTTP 409 conflict responses for immutability violations.
- **User Experience**: Collapsible sidebar, professional A4 print styles, focus management for barcode scanning and inline editing, and visual auto-save indicators.

### Technical Implementations
- **API**: RESTful JSON API (`/api/*`).
- **ORM**: Drizzle ORM with PostgreSQL dialect, Drizzle Kit for schema management.
- **Validation**: Zod with drizzle-zod.
- **Concurrency Safety**: `FOR UPDATE` row locks for critical inventory and invoice operations. Patient invoice mutations use optimistic concurrency via `version` column (SELECT FOR UPDATE → validate version → increment → reject stale). 409 VERSION_CONFLICT on mismatch.
- **Idempotency**: Conversion processes are idempotent. Patient invoice lines have `sourceType`/`sourceId` with unique partial index (`WHERE is_void=false`) for idempotent line insertion.
- **Server-Side Totals**: Invoice totals (`totalAmount`, `discountAmount`, `netAmount`, `paidAmount`) are always recomputed server-side inside the transaction using `computeInvoiceTotals()` with HALF_UP decimal rounding via `roundMoney()`. Frontend displays server totals only.
- **System Settings Cache**: `server/settings-cache.ts` loads `system_settings` table into memory on startup. Access via `getSetting(key)`, refresh via `refreshSettings()`. No DB read per request.
- **Error Handling**: Specific HTTP status codes (400 for validation, 403 for closed fiscal period/RBAC, 409 for conflicts). Centralized Arabic error messages in `server/errors.ts` with `ErrorMessages` constants and `apiError()` helper. Frontend `queryClient.ts` extracts backend JSON messages for clean Arabic toasts.
- **Printing Safety**: Cashier receipts and refund receipts have print tracking fields (`printedAt`, `printCount`, `lastPrintedBy`, `reprintReason`). Double-print prevention: reprint requires a reason. API: `POST /api/cashier/receipts/:id/print`, `POST /api/cashier/refund-receipts/:id/print`, `GET /api/cashier/receipts/:id`, `GET /api/cashier/refund-receipts/:id`.
- **Cancelled Documents Reporting**: All list endpoints exclude cancelled documents by default. Add `?includeCancelled=true` query param to include them. Applies to transfers, receivings, purchase invoices, sales invoices, patient invoices.
- **Inventory Strictness**: Expired batch blocking on sales finalization (blocks selling lots whose expiry month/year is past). FEFO ordering (earliest expiry first). Batch/expiry validation based on item `hasExpiry` flag. Centralized helpers in `server/inventory-helpers.ts` for `isLotExpired()`, `validateBatchExpiry()`, `convertQtyToMinor()`, `convertPriceToMinor()`, `validateUnitConversion()`.
- **Monitoring**: Slow request middleware (>1s threshold) and slow query logger (>500ms wired into DB pool layer). Admin endpoints at `/api/ops/health`, `/api/ops/slow-requests`, `/api/ops/slow-queries`, `/api/ops/backup-status`, `POST /api/ops/clear-logs`. In-memory ring buffer (100 entries).
- **Backup & Restore**: Automated backup script at `scripts/backup.sh` (pg_dump + gzip, 7-day retention). Restore script at `scripts/restore.sh`. Status file at `backups/.backup_status.json`.
- **Auto-Save**: Document entry forms feature auto-save every 15 seconds, using temporary IDs and `navigator.sendBeacon` for final saves.
- **Reusable Components**: Custom `ExpiryInput` for MM/YYYY date handling.
- **Stay Engine**: `stay_segments` table tracks accommodation periods per admission (status: ACTIVE/CLOSED). Partial unique index `idx_stay_seg_active_unique` enforces exactly 1 ACTIVE segment per admission at all times. `openStaySegment` locks admission FOR UPDATE and checks for conflict; `closeStaySegment` sets endedAt + CLOSED; `transferStaySegment` closes old + opens new in a single transaction (atomic room transfer). `accrueStayLines()` runs every 30 minutes: computes daily bucket keys from segment.startedAt → today, UPSERT patient_invoice_lines (sourceType=STAY_ENGINE, sourceId=`invoiceId:segmentId:YYYY-MM-DD`) using the existing partial unique index for idempotency, recomputes server-side totals, and audits. Manual trigger at `POST /api/stay/accrue`. Rate (ratePerDay) is denormalized from `services.basePrice` at segment creation. APIs: `GET/POST /api/admissions/:id/segments`, `POST /api/admissions/:id/segments/:segId/close`, `POST /api/admissions/:id/transfer`.

### Enforceable Architecture & Scaffolding
- **Route Helpers** (`server/route-helpers.ts`): `asyncHandler()` wrapper auto-converts thrown errors to proper HTTP codes (403 fiscal, 409 conflict, 400 validation, 404 not found). `validateBody()` for Zod schema validation. `requireParam()`, `getQueryFlag()`, `assertOpenFiscalPeriod()`, `auditLog()` helpers.
- **Finance Helpers** (`server/finance-helpers.ts`): Centralized `roundMoney()`, `roundQty()`, `parseMoney()`, `sumMoney()`, `moneyEquals()`. Re-exported from `server/storage.ts` for backward compatibility.
- **Frontend Mutation Hook** (`client/src/hooks/use-api-mutation.ts`): `useApiMutation()` wraps TanStack mutations with automatic error toasts, success toasts, double-submit prevention, and cache invalidation.
- **ESLint Enforcement** (`eslint.config.js`): Lint rules block direct `fetch()` in client code (must use `apiRequest`), block `db.*` imports in routes (must use storage), flag unsafe float math. Run: `npx eslint -c eslint.config.js client/src/ server/routes.ts`.
- **Test Templates** (`tests/templates/`): Copy-paste templates for fiscal period 403 and conflict 409 tests. Shared helpers in `tests/helpers.ts` for test data creation.
- **Scaffold Generator** (`scripts/scaffold-feature.ts`): Run `npx tsx scripts/scaffold-feature.ts <feature-name>` to generate route, storage, page, and test skeletons. Output in `scaffolds/<feature-name>/`.
- **Feature Checklist** (`docs/feature-checklist.md`): Comprehensive checklist for every new financial/inventory feature covering schema, storage, routes, frontend, tests, and lint.

## External Dependencies

### Database
- PostgreSQL (configured via `DATABASE_URL`)
- `connect-pg-simple` for session storage

### Key NPM Packages
- `drizzle-orm`, `drizzle-kit`
- `express`
- `@tanstack/react-query`
- `zod`
- `xlsx`
- `shadcn/ui` (built on Radix UI)

### Development Tools
- TypeScript
- Vitest for testing
- `esbuild` and Vite for production builds