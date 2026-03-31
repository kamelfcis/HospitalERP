# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, designed for the Middle East healthcare sector. It provides comprehensive financial management, including accounts, cost centers, and journal entries, generating IFRS-compliant financial reports in EGP. The system also supports inventory and sales processing, patient and service invoicing, multi-pharmacy operations, and advanced security and reporting. The primary objective is to establish this solution as the leading accounting software for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application. The frontend uses React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS), and the backend uses Node.js Express 5 (TypeScript, Drizzle ORM). PostgreSQL is the primary database. The application fully supports Arabic RTL localization.

### UI/UX Decisions
The user interface features a professional design, a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators.

### Technical Implementations
The system uses a RESTful JSON API. Drizzle ORM manages PostgreSQL interactions, with Zod and `drizzle-zod` for validation. Concurrency and idempotency are handled via `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy is ensured by server-side recomputation with `HALF_UP` rounding. Critical system settings are cached. Centralized error handling provides Arabic messages and specific HTTP status codes. Inventory management includes expired batch blocking and FEFO. An audit trail tracks critical operations, and automated backup/restore is supported. OPD billing implements IFRS revenue deferral. A centralized lookup architecture ensures consistent data fetching. Performance optimizations include `React.memo` for table rows and vendor chunking. Efficient data entry is facilitated by mandatory grid navigation and a scanner pattern.

### Feature Specifications
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger), and automatic journal entry generation.
- **Inventory & Sales**: Supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing, patient admissions, and master data.
- **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), Dynamic Account Resolution, and a complete cashier shift lifecycle.
- **Outpatient Clinic Module**: Clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, clinic-scoped drug favorites, structured consultation fields (SOAP), doctor templates, and patient history optimization.
- **Reporting & Audit**: Balanced financial reports, RBAC enforcement, comprehensive audit trails, and strict validation.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation billing), Bed Board with real-time updates, and a Surgery Types System.
- **Opening Stock**: Draft-to-posted document flow with per-line lot entry, Excel import/export, and GL journal generation upon posting.
- **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions with individual user overrides.
- **Contracts Module**: Master data for insurance/contract companies, contracts, and member cards, including a 5-pass rule evaluator for contract coverage, claims GL accounting, and an approval workflow.
- **Account Mappings Module**: Dedicated UI and transactional backend for bulk updates.
- **Items Excel Import/Export**: Bulk management of items via xlsx with upsert functionality and barcode handling.
- **Customer Credit Payments Module**: Manages customer credit, integrating with cashier handover summaries.
- **Supplier Payments Module**: Manages supplier payments with dedicated database schemas, backend storage for balances, payment processing routes, and GL journal integration.
- **Sales Return Accounting**: Two-stage journal entry system for sales returns, integrating with inventory movements and cashier refunds.
- **Purchase Returns Module**: Full module for returning purchased items to suppliers, including invoice-linked returns, atomic lot decrement, and GL journal reversal.
- **Delivery Payment Collection**: Full module for collecting delivery invoices, featuring atomic receipt creation with GL journal, shift totals integration, and cashier handover report columns.
- **Thermal Receipt Printing**: Full 80mm thermal receipt system for the cashier module, with auto-printing, customizable settings, and a reprint function.
- **Shortage Notebook**: Procurement decision dashboard for pharmacy managers, logging shortage events and providing aggregated statistics.
- **Pharmacy Mode**: A toggle (`pharmacy_mode`) that restricts access to hospital-specific modules for non-owner users, enforced via sidebar filtering, route-level guards, and backend middleware.
- **Item Movement Report**: Detailed per-item inventory movement report with search, filters, unit-level toggle, signed quantities, running balance, and Excel export/print functionality, implemented with server-side pagination.
- **Unit Conversion Overhaul**: Centralized unit conversion logic with `QTY_MINOR_TOLERANCE=0.0005`, supporting various unit configurations and server-side re-verification. Unit name changes are protected after transactions, and a Data Integrity Report page is available.
- **Financial Integrity Hardening**: Includes measures for GL safety, inventory integrity, and accounting for returns, with a `returns_mode` system setting to define sales return accounting behavior.
- **Pharmacy Sales VAT Module**: Per-item VAT configuration (`taxType`, `defaultTaxRate`, `pharmacyPricesIncludeTax`), pure VAT engine in `server/lib/tax/pharmacy-vat-engine.ts`, service layer in `server/services/pharmacy-sales-tax-service.ts`, per-line tax snapshot on sales invoice lines, header-level tax totals (`totalTaxAmount`, `totalNetAmount`, `totalGrossAmount`), GL journal `vat_output` line injection with proportional revenue split, returns reversal via `Dr vat_output`, and a feature flag `enable_pharmacy_sales_output_vat` (default: false). UI: item card tax fields, invoice totals bar shows VAT row when enabled.

## External Dependencies

### Database
- PostgreSQL

### Performance Rules — N+1 Query Policy

**RULE: No reads inside a loop. EVER.**

All DB reads must happen BEFORE the loop as batch queries, then accessed via Map lookup inside the loop.

**Allowed pattern (✅):**
```typescript
// 1. Collect IDs
const itemIds = [...new Set(lines.map(l => l.itemId))];
// 2. Batch fetch
const allItems = await db.select().from(items).where(inArray(items.id, itemIds));
// 3. Build Map
const itemMap = new Map(allItems.map(i => [i.id, i]));
// 4. Loop with O(1) lookup
for (const line of lines) { const item = itemMap.get(line.itemId); }
```

**Forbidden pattern (❌):**
```typescript
for (const line of lines) {
  const [item] = await db.select()... // N+1 — FORBIDDEN
}
```

**Exceptions (allowed reads inside loop):**
- `FOR UPDATE` locks with per-row dynamic conditions (FEFO lot selection)
- `existingLot` lookup with per-line varying expiry conditions (purchasing correction)

**Allowed writes inside loop:**
- `UPDATE` inventory_lots (business action — FEFO, costing, reversals)
- `INSERT` inventory_lot_movements (business action — audit trail)
These are business-required per-lot writes, not query inefficiencies.

**FOR UPDATE in transactions:**
- ALWAYS use `tx.execute(sql`...`)` — never `pool.query()` for `FOR UPDATE`
- `pool.query()` uses a different connection, making the lock ineffective

**Before/After Metrics (calculated from code analysis, pageSize=20, avg 10 lines/doc):**

| Endpoint | Before (queries) | After (queries) | Savings |
|---|---|---|---|
| GET /receivings (list, 20 docs) | 2 + 20×3 + 200×1 = **262** | 2 + 3 + 1 = **6** | **256 fewer** |
| GET /receivings/:id (10 lines) | 3 + 10 = **13** | 3 + 1 = **4** | **9 fewer** |
| GET /purchase-invoices (list, 20) | 2 + 20×2 = **42** | 2 + 2 = **4** | **38 fewer** |
| GET /purchase-invoices/:id (16 lines) | 3 + 16 = **20** | 3 + 1 = **5** | **15 fewer** |
| POST /purchase-invoices/:id/approve (16 lines) | 4 + 16×2 = **36** | 4 + 2 = **6** | **30 fewer** |
| GET /store-transfers (list, 100 transfers) | 3×100 + 200 = **500** | 3 + 1 = **4** | **496 fewer** |
| GET /store-transfers/:id (10 lines) | 3 + 10 = **13** | 3 + 1 = **4** | **9 fewer** |
| POST /sales-invoices/:id/finalize (N lines) | N (items) + FEFO | 1 + FEFO | **N-1 fewer** |
| POST /purchase-returns (N lines) | 2N (lot+lock) | 2 batch | **2N-2 fewer** |

**Remaining known N+1 (not yet fixed — lower priority):**
- `sales-invoices-core-storage.ts` L167, L246, L383: item fetch per draft-save validation
- `stock-count-storage.ts` L334, L351: lot/price per count-line entry (write-time only)
- `cashier-storage.ts` L810, L965: invoice fetch per SSE event (low frequency)
- Receiving correction reversal `existingLot` per line (complex per-row conditions — cannot batch)

### Key NPM Packages
- `drizzle-orm`
- `drizzle-kit`
- `express`
- `@tanstack/react-query`
- `zod`
- `xlsx`
- `shadcn/ui`
- `connect-pg-simple`