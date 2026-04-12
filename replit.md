# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application designed for hospital general ledger (GL) accounting, specifically targeting the Middle East healthcare sector. Its primary purpose is to provide comprehensive financial management capabilities, including robust accounting, cost center management, and journal entry functionalities. The system is engineered to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). Beyond core accounting, it supports inventory and sales processing, patient and service invoicing, multi-pharmacy operations, and advanced security and reporting features. The overarching vision is to establish this system as the leading accounting software solution for healthcare providers in the region, driving efficiency and compliance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application. The frontend is built with React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS), ensuring a modern and responsive user experience. The backend leverages Node.js Express 5 (TypeScript) for robust API services, utilizing Drizzle ORM for database interactions. PostgreSQL serves as the primary database for data persistence. A key architectural decision is the comprehensive integration of full Arabic RTL localization throughout the entire system.

### UI/UX Decisions
The user interface is characterized by a professional design, featuring a collapsible sidebar for navigation, dedicated A4 print styles for financial reports, and visual auto-save indicators to enhance user confidence. The RTL architecture is deeply integrated, employing specific CSS utilities for components like toolbars, rows, and pagination to ensure a natural and correct reading flow for Arabic users.

### Technical Implementations
The system operates on a RESTful JSON API. Data validation is rigorously enforced using Zod and `drizzle-zod`. Concurrency and idempotency are managed through PostgreSQL's `FOR UPDATE` row locks and optimistic concurrency control. Financial calculations prioritize accuracy with server-side recomputation using `HALF_UP` rounding. Critical system settings are cached for performance, and a centralized error handling mechanism provides user-friendly Arabic messages. Performance optimizations include: in-memory caching for master data (departments, warehouses via `server/lib/master-data-cache.ts` with 60s TTL and cache invalidation on mutations), HTTP Cache-Control headers for static-ish API responses, optimized polling intervals (30-120s instead of 15-20s), Vite vendor chunk splitting (xlsx, charts, date-fns, form, zod), and covering DB indexes for report queries (inventory snapshots, lot movements). Admissions scalability hardening: `admission_number_seq` PostgreSQL sequence replaces MAX() to eliminate race conditions at concurrent intake; `idx_adm_created_at` for O(log n) ORDER BY sort; `idx_pih_adm_status_consolidated` covering index (admission_id, status, is_consolidated, created_at DESC) INCLUDE (invoice_number, id) for the inv_latest subquery; `idx_adm_patient_name_trgm` GIN/pg_trgm index for fast ILIKE search; deptId filter rewritten from COALESCE() to OR expression allowing index seeks. Inventory management includes features like expired batch blocking and First-Expiry, First-Out (FEFO) logic. An audit trail captures critical operations. Key features include OPD billing with IFRS revenue deferral, a centralized lookup architecture for master data, `React.memo` for UI performance optimization, and efficient data entry via grid navigation and a scanner pattern. A deferred cost issue mechanism addresses dispensing with insufficient stock, supported by a resolution engine. Department/Warehouse scope is enforced across multiple layers for patient invoices. The system includes a sophisticated Role-Based Access Control (RBAC) model where group permissions are the sole authority. An "Encounter Model" unifies patient visits and services, using an `EncounterRoutingService` to manage invoice lines. The "Doctor Cost System" automates doctor share calculations on patient invoices, integrating with GL. A "Unified Reception Module" consolidates patient intake processes. An "Invoice Aggregation Engine" provides comprehensive financial summaries for visits, with a `FinalizationGuardService` to validate invoice readiness for finalization.

### Feature Specifications
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant financial reports, automated journal entry generation, and account mappings with department-level scoping (patient_invoice mappings can be configured per-department for separate GL accounts per hospital department). Patient invoice GL uses a dedicated one-sided journal builder: cash/receivables need only debit account, revenue lines need only credit account (no intermediate/clearing accounts needed). Company GL auto-resolution for contract patient receivables. Treasury GL auto-resolution for cash patient payments (debit account resolved from treasury's glAccountId, supports multi-treasury splits when patient pays across different departments/cashiers).
- **Inventory & Sales**: Supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing, patient admissions, master data management, opening stock, and stock cycle count.
- **Services & Price Lists**: CRUD operations for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Operational isolation for invoicing and cashier operations.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, RBAC, and cashier shift lifecycle.
- **Outpatient Clinic Module**: Clinic booking, doctor consultations, orders, and integration with sales/service orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine, Bed Board, Surgery Types System, Patient File Workspace, Contracts Module, Customer Credit Payments, Supplier Payments, Purchase Returns, Delivery Payment Collection, Thermal Receipt Printing, Shortage Notebook, Item Movement Report, Internal Task Management System, Cost Center Auto-Assignment, Edit Posted Receiving, and Cash Transfer Between Treasuries (توريد نقدية بين الخزن): `cash_transfers` table with serial-sequence idempotency, dual treasury_transactions update, and automatic GL journal Dr. destination / Cr. source with printable receipt.
- **Patient Management**: Patient Master Linkage, Patient Audit Trail, Patient Financial Summary API, Business Classification for Patient Invoice Lines, Final Close for Patient Invoices (contract patients: patient share paid → remaining is company آجل; cash patients: zero balance required). Enhanced Admissions Inquiry Grid with patient type (cash/contract), company/patient share columns, equipment/gas revenue, outstanding balance, status filter (draft/finalized/final_closed), and instant response via rpt_patient_visit_summary.
- **Advanced Accounting**: Sales Return Accounting (two-stage GL), Unit Conversion Overhaul, Financial Integrity Hardening, Pharmacy Sales VAT Module.
- **Unified Reception**: Consolidated patient intake for bookings, admissions, lab, and radiology.
- **Encounter Model**: Unified `encounters` table for visit-centric lifecycle, with intelligent routing and reuse of encounters.
- **Invoice Aggregation**: Service for single-query visit financial summary and a robust finalization process with comprehensive validation.

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