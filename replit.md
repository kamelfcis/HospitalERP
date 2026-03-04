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
- **Cashier & Security**: Includes real-time SSE for instant invoice visibility, password-protected cash drawers with GL account selection for shifts, and a two-stage journal entry system for sales.
- **Reporting & Audit**: Generates balanced financial reports, incorporates full role-based access control (RBAC) with granular permissions, and maintains a comprehensive audit trail with strict validation and conflict resolution.
- **User Experience**: Emphasizes a professional UI with collapsible sidebar, A4 print styles, focus management, and visual auto-save indicators.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, a Stay Engine for managing and accruing costs for patient accommodation, a Bed Board system for hospital bed management with atomic operations, real-time SSE updates, smart bed transfer with instant accommodation billing, and a Surgery Types System.

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
- **Source Field Preservation**: Ensures `sourceType`/`sourceId` fields are preserved across all frontend line pipelines.
- **Room Management**: Provides a dedicated page for CRUD operations on floors, rooms, and beds, including grade assignment.
- **Surgery Types Integration**: Allows linking surgery types to admissions, impacting OR_ROOM line items and invoice totals.
- **Admissions Management**: Enhanced admissions list with invoice status, department filtering, and financial totals.
- **Admissions API**: SQL now includes fallback joins to link manually created invoices to patient admissions.

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