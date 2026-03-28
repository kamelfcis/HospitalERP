# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, tailored for the Middle East healthcare sector. It provides comprehensive financial management, including accounts, cost centers, and journal entries, generating IFRS-compliant financial reports in EGP. Key capabilities extend to inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting. The overarching vision is to establish this solution as the leading accounting software for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). PostgreSQL serves as the primary database. The application is fully localized for Arabic RTL.

### UI/UX Decisions
The user interface features a professional design, a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators.

### Technical Implementations
The system utilizes a RESTful JSON API. Drizzle ORM manages PostgreSQL interactions, and Zod with `drizzle-zod` handles validation. Concurrency and idempotency are managed using `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy is maintained through server-side recomputation with `HALF_UP` rounding. Critical system settings are cached. Centralized error handling provides Arabic messages and specific HTTP status codes. Inventory management includes expired batch blocking and FEFO. An audit trail covers critical operations, and automated backup/restore is supported. OPD billing implements IFRS revenue deferral. A centralized lookup architecture ensures consistent data fetching.

Performance optimizations include `React.memo` on table rows and vendor chunking. A mandatory grid navigation and scanner pattern, refined in sales invoices, ensures efficient data entry across all relevant screens, featuring uncontrolled quantity cells for zero re-renders, early exit in quantity confirmation to avoid unnecessary network calls, and a global scanner listener for flexible input.

### Feature Specifications
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger), and automatic journal entry generation.
- **Inventory & Sales**: Supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing (services, drugs, consumables), patient admissions, and master data.
- **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), Dynamic Account Resolution, and a complete cashier shift lifecycle with business date management and concurrent collection protection.
- **Outpatient Clinic Module**: Clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, clinic-scoped drug favorites, structured consultation fields (SOAP), doctor templates, and patient history optimization.
- **Reporting & Audit**: Balanced financial reports, RBAC enforcement, comprehensive audit trails, and strict validation.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation billing), Bed Board with real-time updates, and a Surgery Types System.
- **Opening Stock (الرصيد الافتتاحي)**: Draft→posted document with per-line lot entry (barcode, unit level, qty, price, batch, expiry). Excel import/export via `/api/opening-stock/:id/import|export`. On post: creates `inventory_lots` rows (FEFO-safe) + fires GL journal (`inventory` debit / `opening_equity` credit) via `setImmediate`. One posted header per warehouse enforced. Permission: `opening_stock.manage`. Routes: `/opening-stock`, `/opening-stock/new`, `/opening-stock/:id`. Sidebar icon: `PackagePlus`.
- **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions with individual user overrides.
- **Contracts Module**: Master data for insurance/contract companies, contracts, and member cards, including a 5-pass rule evaluator for contract coverage, claims GL accounting, and an approval workflow.
- **Account Mappings Module**: Dedicated UI and transactional backend for bulk updates.
- **Items Excel Import/Export**: Bulk management of items via xlsx with upsert functionality and barcode handling.
- **Customer Credit Payments Module**: Manages customer credit, integrating with cashier handover summaries and dedicated permissions.
- **Supplier Payments Module**: Manages supplier payments with dedicated database schemas, backend storage for balances, payment processing routes, and GL journal integration.
- **Sales Return Accounting**: Two-stage journal entry system for sales returns, integrating with inventory movements and cashier refunds.
- **Purchase Returns Module**: Full module for returning purchased items to suppliers, including invoice-linked returns, atomic lot decrement, GL journal reversal, and live `totalReturns` display.
- **Delivery Payment Collection**: Full module for collecting delivery invoices, featuring atomic receipt creation with GL journal, shift totals integration, and cashier handover report columns.
- **Thermal Receipt Printing**: Full 80mm thermal receipt system for the cashier module, with auto-printing after collection, customizable settings, and a reprint function.
- **Shortage Notebook**: Procurement decision dashboard for pharmacy managers, logging shortage events and providing aggregated statistics with two analysis modes and server-side filtering.
- **Pharmacy Mode**: Single-system dual-view toggle (`pharmacy_mode` in system_settings). When active, hides all hospital-specific modules (patients, doctors, clinics, contracts, etc.) from non-owner users via sidebar filtering + route-level 403 guard. Owner always sees everything. Central config in `client/src/lib/pharmacy-config.ts`; central hook `usePharmacyMode()`; single `RequireHospitalAccess` component in App.tsx for all route protection. Backend enforced via `checkHospitalAccess` middleware on all 38 hospital-specific API endpoints (bed-board, rooms, admissions, surgery types). **CRITICAL OPERATIONAL RULE: `pharmacy_mode` must only be changed via `PUT /api/settings/pharmacy_mode` — never directly in the DB. Direct SQL edits bypass the in-memory settings cache and the change will not take effect until the next server restart. The API path (`setSetting()`) updates both DB and cache atomically and takes effect immediately.**
- **Item Movement Report**: Detailed per-item inventory movement report with search, filters, unit-level toggle, signed quantities, running balance, and Excel export/print functionality.
- **Unit Conversion Overhaul (Task #34)**: Centralized unit conversion logic in `server/inventory-helpers.ts` — single source of truth for all conversion functions. `QTY_MINOR_TOLERANCE=0.0005`. Allowed configurations: major-only | major+medium | major+minor | major+medium+minor (minor without medium now supported). Auto-compute `majorToMinor = majorToMedium × mediumToMinor` for 3-unit items. Throw (never silent fallback) for missing ratios. Server-side re-verification in `postReceiving` and `finalizeSalesInvoice`. Unit name changes protected after transactions (409). Data Integrity Report page at `/unit-integrity` (GET /api/admin/unit-integrity-report) showing blocking/legacy/ok items.

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