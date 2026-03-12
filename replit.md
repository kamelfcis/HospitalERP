# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, designed to manage accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). It provides a robust, user-friendly accounting solution tailored for the healthcare sector, featuring a classic accounting software UI. Key capabilities include comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting. The project aims to become the leading accounting solution for healthcare providers in the Middle East.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). PostgreSQL is the primary data store. The application is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger), and automatic journal entry generation.
- **Inventory & Sales**: Supplier Receiving, Sales Invoicing (barcode scanning, FEFO allocation), Sales Returns, Patient Invoicing (services, drugs, consumables), Patient Admissions, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, two-stage journal entry system for sales, and robust Role-Based Access Control (RBAC).
- **Outpatient Clinic Module**: Clinic booking, doctor consultations (diagnosis, prescription, services), doctor orders, integration with sales invoices and service orders, doctor-specific pricing, and clinic-scoped drug favorites.
- **Reporting & Audit**: Balanced financial reports, RBAC enforcement, comprehensive audit trail, and strict validation.
- **User Experience**: Professional UI with a collapsible sidebar, A4 print styles, and visual auto-save indicators.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine for patient accommodation, Bed Board with real-time updates, and Surgery Types System.

### Technical Implementations
- **API**: RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL.
- **Validation**: Zod with drizzle-zod.
- **Concurrency & Idempotency**: `FOR UPDATE` row locks, optimistic concurrency, and idempotent conversion processes.
- **Financial Accuracy**: Server-side recomputation of invoice totals with `HALF_UP` rounding.
- **System Settings**: Critical settings cached in memory.
- **Error Handling**: Centralized Arabic error messages with specific HTTP status codes.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO ordering.
- **Monitoring**: Slow request/query logging.
- **Backup & Restore**: Automated scripts.
- **Architectural Enforcement**: Route/finance helpers, custom frontend hooks, ESLint, and scaffold generators.
- **Stay Engine Billing Modes**: Supports `hours_24` and `hotel_noon` idempotent billing.
- **Stock Transfer Journal**: Generates a balanced journal entry within the same DB transaction, respecting warehouse GL accounts and fiscal periods.
- **Invoice & Discharge Rules**: Enforces payment before finalization and finalized invoices before discharge, with RBAC bypass options.
- **Journal Safety Net**: Sales invoice finalization attempts journal generation within the same DB transaction, with a retry mechanism.
- **HTTP Compression**: Express uses `compression` middleware.
- **Audit Trail**: Captures audit entries for critical financial and system operations.
- **Lot Recosting on Invoice Approval**: Performs final lot recosting within the same DB transaction.

### OPD Billing Workflow (Phase 3 — Final)

Reception is the sole financial entry point for outpatient consultations. The doctor consultation screen is purely clinical.

**Ownership of billing**
- `createAppointment` (called at booking) creates the consultation invoice, the service-order audit row, and — for cash — the payment and treasury transaction, all within a single atomic DB transaction.
- `saveConsultation` (called repeatedly by the doctor during the visit) writes only to `clinic_consultations`, `clinic_consultation_drugs`, and `clinic_orders` linked to the consultation record. It does not touch any invoice, payment, or treasury table.

**Invoice status mapping**
- `finalized` = paid in full (cash booking: `paid_amount = net_amount`, `finalized_at` is set)
- `draft` = unpaid / pending collection (insurance or contract booking)
- `cancelled` = voided

**Payment type behavior**

| Payment type | Invoice created | `patient_invoice_payments` | `treasury_transactions` | Invoice status |
|---|---|---|---|---|
| CASH | Yes | Yes (immediate) | Yes (immediate) | `finalized` |
| INSURANCE | Yes | No | No | `draft` |
| CONTRACT | Yes | No | No | `draft` |

For INSURANCE, `contract_name` = insurance company name; `patient_type = 'contract'`.
For CONTRACT, `contract_name` = payer/entity name; `patient_type = 'contract'`.

**Consultation-fee `clinic_orders` row**
One `clinic_orders` row is created at booking time with `status = 'executed'` and `consultation_id = NULL`. This row is for audit and financial linkage only. It is permanently excluded from every operational execution queue by the base filter in `getClinicOrders`:
```sql
(cl.consultation_service_id IS NULL OR o.service_id IS DISTINCT FROM cl.consultation_service_id)
```
Departments and pharmacy screens never see this row. It cannot be re-executed or re-billed.

**Duplicate-booking safeguard**
Before inserting a new appointment, `createAppointment` checks for any existing non-cancelled appointment with the same `patient_id + clinic_id + doctor_id + appointment_date`. If one exists, the transaction is aborted with an Arabic error message that includes the conflicting turn number. This prevents duplicate invoices from reception mistakes. Walk-in bookings (no `patient_id`) are exempt from this check.

**Doctor queue filtering**
- Users with `clinic.view_all` permission see all appointments for the selected clinic.
- Users with `doctor.consultation` but without `clinic.view_all` are filtered to their linked doctor record only (`clinic_user_doctor_assignments`).
- If a doctor-role user has no linked doctor record, the API returns `{ appointments: [], noDoctorLinked: true }` and the frontend displays an amber warning banner instead of the queue.

### Centralized Lookup Architecture
All shared-entity lookups (doctors, departments, accounts, treasuries, clinics, services) are handled by a unified architecture:
- **Hooks**: `client/src/hooks/lookups/` (one hook per entity)
- **Components**: `client/src/components/lookups/` (one combobox component per entity)
- **Types**: `client/src/lib/lookupTypes.ts` (shared `LookupItem` and `UseLookupResult` interfaces)
- **Base component**: `client/src/components/lookups/BaseLookupCombobox.tsx`
This architecture enforces consistent data fetching and display patterns, preventing direct `fetch()` calls or `useQuery` outside designated lookup modules for these entities.

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