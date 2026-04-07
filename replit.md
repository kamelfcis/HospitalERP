# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application designed for hospital general ledger (GL) accounting, specifically for the Middle East healthcare sector. It provides comprehensive financial management, including accounts, cost centers, and journal entries, and generates IFRS-compliant financial reports in EGP. The system also integrates inventory and sales processing, patient and service invoicing, multi-pharmacy operations, and advanced security and reporting features. The project aims to become the leading accounting software solution for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application. The frontend is built with React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS), and the backend uses Node.js Express 5 (TypeScript, Drizzle ORM). PostgreSQL serves as the primary database. Full Arabic RTL localization is supported throughout the application.

### UI/UX Decisions
The user interface features a professional design, a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators.

### Technical Implementations
The system uses a RESTful JSON API. Database interactions are managed by Drizzle ORM, with Zod and `drizzle-zod` for validation. Concurrency and idempotency are handled using `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy is maintained through server-side recomputation with `HALF_UP` rounding. Critical system settings are cached for performance. Centralized error handling provides Arabic messages and specific HTTP status codes. Inventory management includes expired batch blocking and FEFO. An audit trail tracks critical operations, and automated backup/restore functionality is supported. OPD billing implements IFRS revenue deferral. A centralized lookup architecture ensures consistent data fetching. Performance optimizations include `React.memo` for table rows and vendor chunking. Efficient data entry is achieved through mandatory grid navigation and a scanner pattern. The system also includes a feature for dispensing items with insufficient stock in patient invoices, with a resolution engine for managing oversold items.

### Feature Specifications
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant financial reports, and automatic journal entry generation.
- **Inventory & Sales**: Supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing, patient admissions, and master data management.
- **Services & Price Lists**: CRUD operations for department-scoped services and price lists with inline editing and bulk adjustments.
- **Service + Consumables Tree View in Invoices**: Sales invoice line items display services with their consumable sub-rows in a grouped tree view.
- **Item Card Consumables Panel**: Service-category items in the item card have a dedicated panel for managing default consumables.
- **Multi-Pharmacy Support**: Provides isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), Dynamic Account Resolution, and a complete cashier shift lifecycle.
- **Outpatient Clinic Module**: Features clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, clinic-scoped drug favorites, structured consultation fields (SOAP), doctor templates, and patient history optimization.
- **Department Services Orders**: A unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation billing), Bed Board with real-time updates, and a Surgery Types System.
- **Opening Stock**: Draft-to-posted document flow with per-line lot entry, Excel import/export, and GL journal generation upon posting.
- **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions with individual user overrides.
- **Contracts Module**: Master data for insurance/contract companies, contracts, and member cards, including a 5-pass rule evaluator for contract coverage, claims GL accounting, and an approval workflow.
- **Account Mappings Module**: Dedicated UI for bulk updates of all automatic journal transaction types.
- **Items Excel Import/Export**: Bulk management of items via xlsx with upsert functionality and barcode handling.
- **Customer Credit Payments Module**: Manages customer credit and integrates with cashier handover summaries.
- **Supplier Payments Module**: Manages supplier payments with dedicated database schemas, backend storage for balances, payment processing routes, and GL journal integration.
- **Sales Return Accounting**: Two-stage journal entry system for sales returns, integrating with inventory movements and cashier refunds.
- **Purchase Returns Module**: Full module for returning purchased items to suppliers, including invoice-linked returns, atomic lot decrement, and GL journal reversal.
- **Delivery Payment Collection**: Full module for collecting delivery invoices, featuring atomic receipt creation with GL journal, shift totals integration, and cashier handover report columns.
- **Thermal Receipt Printing**: Full 80mm thermal receipt system for the cashier module, with auto-printing, customizable settings, and a reprint function.
- **Shortage Notebook**: Procurement decision dashboard for pharmacy managers, logging shortage events and providing aggregated statistics.
- **Pharmacy Mode**: A toggle that restricts access to hospital-specific modules for non-owner users.
- **Item Movement Report**: Detailed per-item inventory movement report with search, filters, unit-level toggle, signed quantities, running balance, and Excel export/print functionality.
- **Unit Conversion Overhaul**: Centralized unit conversion logic with `QTY_MINOR_TOLERANCE=0.0005`, supporting various unit configurations and server-side re-verification.
- **Financial Integrity Hardening**: Includes measures for GL safety, inventory integrity, and accounting for returns, with a `returns_mode` system setting to define sales return accounting behavior.
- **Pharmacy Sales VAT Module**: Per-item VAT configuration, a pure VAT engine, service layer, per-line tax snapshot on sales invoice lines, header-level tax totals, GL journal `vat_output` line injection with proportional revenue split, and returns reversal via `Dr vat_output`.
- **Internal Task Management System**: Allows staff to create tasks assigned to users, with priorities, due dates, status lifecycle, timeline comments, and real-time notifications.
- **Cost Center Auto-Assignment**: Automatically assigns cost centers to journal lines based on account defaults, with a UI for updating account defaults and a backfill endpoint for existing journal lines.
- **Edit Posted Receiving**: Allows editing quantity/items on a posted (but not costed) supplier receiving, with backend logic for reversals and re-application of inventory.
- **Patient Master Linkage (Upgrade)**: Unifies patient identity across all modules by adding `patient_id` to `sales_invoice_headers` and enforcing `PATIENT_REQUIRED` for non-cash invoices. Includes backend auto-resolution and a backfill endpoint.
- **Patient Audit Trail**: Tracks who linked a patient and when for internal audit and tamper detection.
- **Patient Financial Summary API**: Provides aggregated financial data for patients including total amounts, outstanding balances, invoice counts, and a breakdown by invoice type.
- **Business Classification for Patient Invoice Lines**: Introduces a separate `business_classification` field for items, services, and patient invoice lines, decoupled from other categorizations, with a central resolver for auto-derivation.
- **Deferred Cost Issue (الصرف بدون رصيد)**: Allows dispensing items with insufficient stock in patient invoices (feature flag enabled), creating pending allocations that are resolved by a dedicated engine.

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