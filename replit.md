# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, tailored for the Middle East healthcare sector. It offers comprehensive financial management, including accounts, cost centers, and journal entries, generating IFRS-compliant financial reports in EGP. The system also supports inventory and sales processing, patient and service invoicing, multi-pharmacy operations, and advanced security and reporting. The primary goal is to establish this solution as the leading accounting software for healthcare providers in the region.

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
- **Service + Consumables Tree View in Invoices**: Sales invoice line table renders service/service-item rows (blue badge, price) with consumable sub-rows (├──/└── connectors, no price) via a grouped tree view. Services from the services module use `service_consumables`; items with `category=service` in the item master use `item_consumables`. Adding a service-category item via barcode or search auto-injects its consumables as sub-rows.
- **Item Card Consumables Panel**: Service-category items in the item card show a dedicated "المستهلكات الافتراضية" panel using the shared `ConsumablesGrid` component. Consumables are stored in `item_consumables` table (backed by `GET/PUT /api/items/:id/consumables` endpoints) and are auto-injected when the service item is scanned into a sales invoice. `ConsumablesGrid` is a shared controlled component used in both `ServiceDialog` (services module) and the Item Card.
- **Multi-Pharmacy Support**: Isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), Dynamic Account Resolution, and a complete cashier shift lifecycle. GL journal status matrix details automated posting for various invoice types.
- **Outpatient Clinic Module**: Clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, clinic-scoped drug favorites, structured consultation fields (SOAP), doctor templates, and patient history optimization.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation billing), Bed Board with real-time updates, and a Surgery Types System.
- **Opening Stock**: Draft-to-posted document flow with per-line lot entry, Excel import/export, and GL journal generation upon posting.
- **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions with individual user overrides. Includes discount limits and default route settings for groups.
- **Contracts Module**: Master data for insurance/contract companies, contracts, and member cards, including a 5-pass rule evaluator for contract coverage, claims GL accounting, and an approval workflow.
- **Account Mappings Module**: Dedicated UI for bulk updates of all automatic journal transaction types, including `cashier_shift_close` with configurable treasury line types and sales invoice receivables keys.
- **Items Excel Import/Export**: Bulk management of items via xlsx with upsert functionality and barcode handling.
- **Customer Credit Payments Module**: Manages customer credit, integrating with cashier handover summaries.
- **Supplier Payments Module**: Manages supplier payments with dedicated database schemas, backend storage for balances, payment processing routes, and GL journal integration.
- **Sales Return Accounting**: Two-stage journal entry system for sales returns, integrating with inventory movements and cashier refunds, with specific rules for credit invoice returns and cashier screen visibility.
- **Purchase Returns Module**: Full module for returning purchased items to suppliers, including invoice-linked returns, atomic lot decrement, and GL journal reversal.
- **Delivery Payment Collection**: Full module for collecting delivery invoices, featuring atomic receipt creation with GL journal, shift totals integration, and cashier handover report columns.
- **Thermal Receipt Printing**: Full 80mm thermal receipt system for the cashier module, with auto-printing, customizable settings, and a reprint function.
- **Shortage Notebook**: Procurement decision dashboard for pharmacy managers, logging shortage events and providing aggregated statistics.
- **Pharmacy Mode**: A toggle (`pharmacy_mode`) that restricts access to hospital-specific modules for non-owner users, enforced via sidebar filtering, route-level guards, and backend middleware.
- **Item Movement Report**: Detailed per-item inventory movement report with search, filters, unit-level toggle, signed quantities, running balance, and Excel export/print functionality, implemented with server-side pagination.
- **Unit Conversion Overhaul**: Centralized unit conversion logic with `QTY_MINOR_TOLERANCE=0.0005`, supporting various unit configurations and server-side re-verification.
- **Financial Integrity Hardening**: Includes measures for GL safety, inventory integrity, and accounting for returns, with a `returns_mode` system setting to define sales return accounting behavior.
- **Pharmacy Sales VAT Module**: Per-item VAT configuration, a pure VAT engine, service layer, per-line tax snapshot on sales invoice lines, header-level tax totals, GL journal `vat_output` line injection with proportional revenue split, and returns reversal via `Dr vat_output`.
- **Internal Task Management System**: Replaces the internal chat system. Staff can create tasks assigned to one or more users, with priorities (normal/important/urgent), due dates, status lifecycle (new → in_progress → done / deferred / needs_clarification / cancelled), timeline comments, and real-time Facebook-style notification bell (🔔 red badge). SSE channel `taskNotifSseClients` in `_sse.ts`. Tables: `tasks`, `task_assignees`, `task_comments`, `task_notifications`. Routes in `server/routes/tasks.ts`. Frontend: `NotificationBell` in header, `/tasks` page with inbox/sent tabs and status filters. Chat system backend is preserved but UI removed.
- **Cost Center Auto-Assignment**: Added `default_cost_center_id` (nullable FK) to `accounts` table. Central resolver `server/lib/cost-center-resolver.ts` auto-fills `cost_center_id` on journal lines based on account defaults. All 10+ journal line insertion points updated (sales, purchases, transfers, payments, stock count, etc.). Chart of Accounts UI updated with cost center dropdown per account. Retroactive backfill endpoint `POST /api/admin/backfill-cost-centers` + button in Cost Center Report page to fix existing journal lines.
- **Edit Posted Receiving**: Allows editing quantity/items on a posted (but not costed) supplier receiving. Backend `PATCH /api/receivings/:id/edit-posted` reverses old lot movements (blocks if items sold/dispensed), deletes old lines, re-applies new inventory, fires GL reversal + new journal. Frontend shows amber warning banner + "تعديل الاستلام" button; header fields are locked during edit (lines only); "حفظ التعديلات"/"إلغاء التعديل" buttons manage state. Only available for `posted_qty_only` status.

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