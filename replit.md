# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, designed for the Middle East healthcare sector. It provides comprehensive financial management, including accounts, cost centers, and journal entries, generating IFRS-compliant financial reports in EGP. Key capabilities extend to inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting. The overarching vision is to establish this solution as the leading accounting software for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). PostgreSQL serves as the primary database. The application is fully localized for Arabic RTL.

### UI/UX Decisions
The user interface features a professional design, a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators.

### Technical Implementations
The system utilizes a RESTful JSON API. Drizzle ORM manages PostgreSQL interactions, and Zod with `drizzle-zod` handles validation. Concurrency and idempotency are managed using `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy is maintained through server-side recomputation with `HALF_UP` rounding. Critical system settings are cached. Centralized error handling provides Arabic messages and specific HTTP status codes. Inventory management includes expired batch blocking and FEFO. An audit trail covers critical operations, and automated backup/restore is supported. OPD billing implements IFRS revenue deferral. A centralized lookup architecture ensures consistent data fetching.

### Performance Optimizations
- **React.memo on table rows**: `ReturnLineRow` (purchase-returns) and `LineRow` (stock-count) are memoized. Uses `filteredLinesRef` pattern so `onEnterAtRow` callback stays stable. Stable props: `localCount` (string from Map), `isFocused` (bool), `shouldActivate` (bool); callbacks stable via `useCallback`.
- **Vendor chunking** (`vite.config.ts`): `manualChunks` splits `vendor-react`, `vendor-query`, `vendor-radix`, `vendor-icons`, `vendor-router` for better browser caching on repeat visits.
- **xlsx**: Server-side only; no client import needed.

### Feature Specifications
-   **Financial Management**: Includes Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger), and automatic journal entry generation.
-   **Inventory & Sales**: Manages supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing (services, drugs, consumables), patient admissions, and master data.
-   **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
-   **Multi-Pharmacy Support**: Provides isolation for invoicing and cashier operations across multiple pharmacies.
-   **Cashier & Security**: Features real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), Dynamic Account Resolution, and a complete cashier shift lifecycle with business date management and concurrent collection protection.
-   **Outpatient Clinic Module**: Covers clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, clinic-scoped drug favorites. Includes structured consultation fields (SOAP), doctor templates, quick follow-up helpers, patient history optimization, contract FK stamping and validation, and read-only operational dashboards.
-   **Reporting & Audit**: Ensures balanced financial reports, RBAC enforcement, comprehensive audit trails, and strict validation.
-   **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
-   **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation with `hours_24`/`hotel_noon` billing), Bed Board with real-time updates, and a Surgery Types System.
-   **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation and lot adjustments.
-   **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions.
-   **Contracts Module**: Supports master data for insurance/contract companies, contracts, and member cards. Includes a 5-pass rule evaluator for contract coverage, a claims GL accounting system, and an approval workflow.
-   **Account Mappings Module**: Dedicated UI and transactional backend route for bulk updates.
-   **Items Excel Import/Export**: Bulk management of items via xlsx. Export (template or full data), Import with upsert, auto-creates form types, handles barcodes via `item_barcodes`, deduplicates by `item_code`.
-   **Customer Credit Payments Module**: Manages customer credit, including `customerId` handling for credit-type customers, restoration of `customerId` on invoice load, and integration into cashier handover summaries.
-   **Supplier Payments Module**: Manages supplier payments with dedicated database schemas, backend storage for balances and invoices, routes for payment creation and reporting, and a comprehensive frontend for payment processing and GL journal integration.
-   **Sales Return Accounting**: Implements a two-stage journal entry system for sales returns, integrating with inventory movements and cashier refunds, with visual journal preview in account mapping.
-   **Purchase Returns Module (مرتجع مشتريات)**: Full module for returning purchased items to suppliers. Features: invoice-linked returns (`purchase_return_headers` + `purchase_return_lines`), free lot selection from the invoice's warehouse, atomic lot decrement with `inventory_lot_movements (tx_type='out', reference_type='purchase_return')`, GL journal reversal (Dr AP / Cr Inventory + Cr VAT Input) reusing `purchase_invoice` account mappings, and live `totalReturns` in the Supplier Payments balance strip. UI: two-tab page (create + history), supplier combobox, invoice selector, line editor with lot selector, confirmation dialog, print view. Route: `/purchase-returns`.

## External Dependencies

### Database
-   PostgreSQL

### Key NPM Packages
-   `drizzle-orm`
-   `drizzle-kit`
-   `express`
-   `@tanstack/react-query`
-   `zod`
-   `xlsx`
-   `shadcn/ui`
-   `connect-pg-simple`