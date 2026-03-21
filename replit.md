# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting in the Middle East healthcare sector. It manages accounts, cost centers, and journal entries, generating IFRS-compliant financial reports in EGP. Key capabilities include comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting. The vision is to be the leading accounting solution for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application. The frontend uses React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and the backend uses Node.js Express 5 (TypeScript, Drizzle ORM). PostgreSQL is the primary database. The application is fully localized for Arabic RTL.

### UI/UX Decisions
The user interface features a professional design with a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators.

### Technical Implementations
The system uses a RESTful JSON API. Drizzle ORM interacts with PostgreSQL, and Zod with `drizzle-zod` handles validation. Concurrency and idempotency use `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy is ensured by server-side recomputation with `HALF_UP` rounding. Critical system settings are cached. Error handling is centralized with Arabic messages and specific HTTP status codes. Inventory enforces expired batch blocking and FEFO. An audit trail covers critical operations, and automated backup/restore is supported. OPD billing implements IFRS revenue deferral. A centralized lookup architecture ensures consistent data fetching.

### Feature Specifications
- **Financial Management**: Includes Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger), and automatic journal entry generation.
- **Inventory & Sales**: Manages supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing (services, drugs, consumables), patient admissions, and master data.
- **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Provides isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Features real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), Dynamic Account Resolution, and a complete cashier shift lifecycle with business date management and concurrent collection protection.
- **Outpatient Clinic Module**: Covers clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, clinic-scoped drug favorites. Includes structured consultation fields (SOAP), doctor templates, quick follow-up helpers, patient history optimization with pagination, contract FK stamping and validation, and read-only operational dashboards for doctors and secretaries.
- **Reporting & Audit**: Ensures balanced financial reports, RBAC enforcement, comprehensive audit trails, and strict validation.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation with `hours_24`/`hotel_noon` billing), Bed Board with real-time updates, and a Surgery Types System.
- **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions.
- **Contracts Module**: Supports master data for insurance/contract companies, contracts, and member cards. Includes a 5-pass rule evaluator for contract coverage, a claims GL accounting system, and an approval workflow.
- **Account Mappings Module**: Dedicated UI and transactional backend route for bulk updates.

## Recent Session Progress (OPD Steps 7+)

### OPD Step 7 — Doctor Orders Grouped View (مكتمل ✓)
- Backend `getGroupedClinicOrders()` — groups by `(appointmentId, orderType, targetId||targetName)`
- Route `GET /api/clinic-orders/grouped` — placed before `/:id` to avoid route shadowing
- Frontend: `GroupedOrderRow`, `useGroupedOrders`, `OrdersFilterBar`, SSE-scoped hook
- `orderType→targetType` mapping fix (pharmacy→pharmacy, service→department)
- Popup trigger buttons (`PharmacyGroupPopup`, `ServiceGroupPopup`) with live detail view
- Cancelled lines: strikethrough + "ملغي — مستثنى من العدد" in drill-down

### Patient History for Cash Patients (مكتمل ✓)
- New storage function `getConsultationsByPatientName()` — exact LOWER/TRIM match, no fuzzy
- New route `GET /api/clinic/consultations/by-name` — requires `doctor.consultation` permission, clinic-scoped
- `usePatientHistory` hook updated: supports both `patientId` (FK) and `patientName` (cash fallback)
- Returns `matchType: 'id' | 'name'` for UI disambiguation
- Tab label: "تاريخ المريض" (registered) vs "سجل بالاسم" (cash)
- Amber warning note shown inside panel when match is name-based

### Intake Form Bug Fix (مكتمل ✓)
- **Bug 1 (400 error):** Zod schema `upsertIntakeSchema` was rejecting `null` for optional fields (only accepted `undefined`). Fixed by adding `.nullable()` to all string/enum fields.
- **Bug 2 (404 on complete):** `handleComplete()` was calling the `/complete` endpoint even when `handleSave()` failed silently. Fixed by extracting `doSaveApi()` that always throws, so `/complete` only runs if save succeeds.
- Files: `server/routes/clinic-intake.ts`, `client/src/pages/clinic-booking/components/IntakeFormModal.tsx`

### Key Technical Rules (DO NOT BREAK)
- **Route ordering:** `/api/clinic-orders/sse` → `/api/clinic-orders` → `/appointment/:id` → `/grouped` → `/:id`
- **Grouping key:** `${appointmentId}_${orderType}_${targetId || targetName || ""}`
- **`useClinicOrders`** = mutations only (execute, cancel); SSE lives in `useGroupedOrders`
- **Both mutations invalidate** `["/api/clinic-orders/grouped"]` query key
- **`saveConsultation`** uses raw pool — new fields need both INSERT and ON CONFLICT UPDATE SET
- **`clinic_orders`** has no `clinic_id` — scoping via JOIN through `clinic_appointments`
- **FROZEN:** OPD accounting/IFRS 15 logic — DO NOT TOUCH
- **Pre-existing TS errors** (ignore): auth.ts, OrdersTable.tsx, lookup hooks, patients.ts, suppliers/index.tsx

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