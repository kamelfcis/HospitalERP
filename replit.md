# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting. Its primary purpose is to manage accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). It aims to provide a robust, user-friendly accounting solution specifically tailored for the healthcare sector in Arabic-speaking regions, featuring a classic accounting software UI aesthetic. Key capabilities include comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting features. The project envisions becoming the leading accounting solution for healthcare providers in the Middle East.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). PostgreSQL is the primary data store. The application is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Includes Chart of Accounts, Cost Centers, a comprehensive Journal Entry system, Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger). Automatic Journal Entries are generated based on configurable account mappings.
- **Inventory & Sales**: Features Supplier Receiving, Sales Invoicing (with barcode scanning, FEFO allocation, customer types, atomic stock deduction), Sales Returns (search by invoice#/receipt barcode/item, server-validated return quantities, transactional stock restoration), Patient Invoicing (services, drugs, consumables, payments, "Distribute to Cases" feature, linked to admissions), Patient Admissions management, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: CRUD operations for department-scoped services, price lists with inline editing and bulk adjustments, and integration with sales invoices.
- **Multi-Pharmacy Support**: Supports multiple pharmacies with isolation for invoicing and cashier operations.
- **Cashier & Security**: Includes real-time SSE for instant invoice visibility, password-protected cash drawers, department-level invoice isolation, a two-stage journal entry system for sales, and robust role-based access control (RBAC).
- **Outpatient Clinic Module**: A self-contained module (all tables prefixed `clinic_`, all routes `/api/clinic-*`) with 3 screens: (1) Clinic Booking (`/clinic-booking`) — appointment queue with RBAC filtering by clinic assignment, auto-incrementing turn numbers in transactions, printable turn receipt, doctor statement tab (restricted to admin + doctors only); (2) Doctor Consultation (`/doctor-consultation/:id`) — 2×2 grid layout with chief complaint, diagnosis, prescription (using `ItemFastSearch drugsOnly=true` with unit/qty/price), services, debounced auto-save, prescription printing, smart favorites suggestion, doctor statement tab showing all consultations, "إنهاء الكشف" button (saves + marks done + navigates back); (3) Doctor Orders (`/doctor-orders`) — view pending service/pharmacy orders, execute services (creates patient invoice), pharmacy orders open PharmacyDrugPopup with "open in sales invoice" or "suggest alternative" via ItemFastSearch. Pharmacy prefill: `/sales-invoices?clinicOrderId=xxx&pharmacyId=yyy` auto-fills with exact unit/quantity from prescription, validates stock availability, shows warnings for insufficient stock. Prescription drugs auto-default to major unit with dynamic price calculation based on unit level. Doctor Statement shows consultation fee (from linked service), drugs total broken down by department (dynamic columns per department, e.g., Lab, Radiology), secretary fee (configurable per clinic as percentage or fixed), with consultation fee total for doctor commission calculation. Each clinic has a configurable `consultation_service_id` linking to a service for fee tracking. Consultation service auto-injects as a service order when a doctor starts a consultation. Doctor-specific pricing supported via `clinic_service_doctor_prices` table — each service can have a custom price per doctor (managed in ServiceDialog). When executing clinic orders, the order's stored `unit_price` takes priority over the service's `base_price`. Module can be removed by dropping `clinic_*` tables + 3 page folders + `/api/clinic-*` routes with zero impact on existing system.
- **Reporting & Audit**: Generates balanced financial reports, incorporates full RBAC, and maintains a comprehensive audit trail with strict validation and conflict resolution.
- **User Experience**: Emphasizes a professional UI with a collapsible sidebar, A4 print styles, focus management, and visual auto-save indicators.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, a Stay Engine for managing and accruing patient accommodation costs, a Bed Board system with real-time updates and smart bed transfer, and a Surgery Types System.

### Technical Implementations
- **API**: Utilizes a RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL dialect and Drizzle Kit.
- **Validation**: Zod with drizzle-zod for schema validation.
- **Concurrency & Idempotency**: Employs `FOR UPDATE` row locks, optimistic concurrency with versioning, and idempotent conversion processes.
- **Financial Accuracy**: Invoice totals are recomputed server-side with `HALF_UP` decimal rounding.
- **System Settings**: Critical system settings are cached in memory.
- **Error Handling**: Centralized Arabic error messages with specific HTTP status codes.
- **Printing Safety**: Implements print tracking for cashier and refund receipts.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO ordering.
- **Monitoring**: Includes slow request/query logging.
- **Backup & Restore**: Automated backup and restore scripts.
- **Architectural Enforcement**: Uses route helpers, finance helpers, custom frontend mutation hooks, ESLint rules, and scaffold generators.
- **Stay Engine Billing Modes**: Supports `hours_24` and `hotel_noon` idempotent billing modes.
- **Invoice & Discharge Business Rules**: Enforces payment before finalization and finalized invoices before discharge, with role-based bypass options.
- **Audit Trail**: Captures audit entries for critical financial operations.
- **Room Management**: Dedicated page for CRUD operations on floors, rooms, and beds, including grade assignment.
- **Surgery Types Integration**: Allows linking surgery types to admissions, impacting OR_ROOM line items and invoice totals.
- **Admissions Management**: Enhanced admissions list with invoice status, department filtering, and financial totals.
- **Refactored Pages**: `PatientInvoicePage`, `SalesInvoices`, `CashierCollection`, `StoreTransfers`, and `SalesReturns` are refactored into modular, hook-based compound components.
- **Shared ItemSearchDialog**: `@/components/ItemSearchDialog.tsx` is a shared, configurable search dialog used across pages. `ItemFastSearch` (`@/components/ItemFastSearch/`) is the primary fast-search component shared between sales invoices and store transfers.
- **Transfer Preparation**: A smart preparation screen (`/transfer-preparation`) that queries sales data for a destination warehouse over a date range, shows source/destination stock levels in **major units** (e.g., علبة), allows bulk filtering/exclusion, suggested quantity fill in major units, and converts the prepared list into a store transfer with **auto FEFO distribution split into separate lines per expiry batch**. Refactored into compound components: `types.ts`, `hooks/usePreparationData.ts`, `SetupForm`, `FilterBar`, `PrepTable`, `ActionFooter`.

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