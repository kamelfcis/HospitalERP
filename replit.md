# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application designed for hospital general ledger (GL) accounting, focusing on the healthcare sector in the Middle East. It manages accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). The system provides comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting features. The project's vision is to become the leading accounting solution for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application. The frontend uses React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS), and the backend is built with Node.js Express 5 (TypeScript, Drizzle ORM). PostgreSQL serves as the primary data store. The application is fully localized for Arabic RTL.

### UI/UX Decisions
The user interface features a professional design with a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators.

### Technical Implementations
The system utilizes a RESTful JSON API. Drizzle ORM manages interactions with PostgreSQL, and Zod with `drizzle-zod` handles validation. Concurrency and idempotency are managed through `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy is maintained with server-side recomputation of invoice totals using `HALF_UP` rounding. Critical system settings are cached in memory. Error handling is centralized with Arabic messages and specific HTTP status codes. Inventory management enforces expired batch blocking and FEFO ordering. The system includes an audit trail for critical financial and system operations and supports automated backup and restore. OPD billing implements IFRS revenue deferral, treating consultation payments as deferred revenue until service completion. A centralized lookup architecture ensures consistent data fetching for shared entities.

### Key Features
- **Financial Management**: Includes Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger). It also supports automatic journal entry generation.
- **Inventory & Sales**: Manages supplier receiving, sales invoicing (with barcode scanning and FEFO allocation), sales returns, patient invoicing (services, drugs, consumables), patient admissions, and master data for items, patients, and doctors.
- **Services & Price Lists**: Provides CRUD operations for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Offers isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Features real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), and Dynamic Account Resolution. It includes a complete cashier shift lifecycle with business date management, stale detection, atomic close with transfer logs, and concurrent collection protection.
- **Outpatient Clinic Module**: Covers clinic booking, doctor consultations, doctor orders, integration with sales invoices and service orders, doctor-specific pricing, and clinic-scoped drug favorites. Step 2 adds PatientSnapshot header, SOAP structured fields, specialty templates, and quick follow-up text helpers. Step 3 adds doctor-facing order execution tracking tab (متابعة الطلبات) with real-time order status. Step 4 adds follow-up planning fields (followUpAfterDays, followUpReason, suggestedFollowUpDate — nullable, UTC-safe), fixes patient history N+1 query, adds offset pagination with backend hasMore indicator, visit history now shows drugs + orders summary, excludes current appointment from history, and extracts PatientHistoryPanel to hook+component architecture. Step 5 activates real contract FK stamping on clinic_appointments (companyId, contractId, contractMemberId), adds OPD-scoped member lookup endpoint (clinic.book permission), replaces free-text payer fields with ContractMemberLookup component + useContractResolution hook, enforces FK chain validation on booking POST, shows resolved contract context in PatientSnapshot.
- **Reporting & Audit**: Ensures balanced financial reports, RBAC enforcement, comprehensive audit trails, and strict validation.
- **Department Services Orders**: A unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, Stay Engine for patient accommodation (with `hours_24` and `hotel_noon` billing modes), Bed Board with real-time updates, and a Surgery Types System.
- **Stock Cycle Count**: A full inventory reconciliation module with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: An admin UI for creating and editing groups, managing members, and controlling per-module permissions via a full matrix view.
- **Contracts Module**: Supports master data for insurance/contract companies, contracts, and member cards. It includes a pure 5-pass rule evaluator for contract coverage rules (e.g., service inclusion/exclusion, discounts, approvals), and a claims GL accounting system for generating claim batches upon patient invoice finalization. The module also features an approval workflow for contract-related services.
- **Account Mappings Module**: Provides a dedicated module for managing account mappings with a specialized UI and transactional backend route for bulk updates.

## Outpatient Improvement — Step 2 (Stable)

**Tag:** `outpatient-step2-stable`

- **Patient snapshot header** — compact collapsible read-only block above consultation showing: patient name, age, gender, visit type, intake completion/lock status, chronic flags, payer chip, latest vitals, latest diagnosis from previous visits, intake notes. Defaults expanded so doctors see intake data without extra clicks.
- **Structured consultation (SOAP fields)** — five nullable text columns added to `clinic_consultations` (`subjective_summary`, `objective_summary`, `assessment_summary`, `plan_summary`, `follow_up_plan`). Displayed as a "الكشف الهيكلي" tab with labelled textareas. Old `chiefComplaint`, `diagnosis`, `notes` fields fully preserved.
- **Safe doctor templates** — 5 specialty groups (general, pediatrics, orthopedics, gynecology, ENT), 2 templates each. Code-based config only, no DB admin UI. Doctor must explicitly select a template; all inserted text is editable.
- **Quick follow-up helpers** — text-only insertion buttons (أسبوع / أسبوعان / شهر / 3 أشهر / عند الحاجة). No auto-scheduling, no backend side-effects.
- **Backward compatibility preserved** — all new columns nullable, existing saves continue unchanged, old records load without SOAP fields without error.
- **No diagnosis automation** — templates insert plain text phrases only; no medical decision logic.

> This milestone is production-ready within the implemented scope.
> All changes are backward-compatible and medically safe (no automated decision logic).

## Outpatient Improvement — Step 3 (Stable)

**Tag:** `outpatient-step3-stable`

- **Order execution tracking tab** — "متابعة الطلبات" tab in doctor consultation page. Shows all clinic orders for the current appointment (pharmacy + service) with live status badges. Single aggregated SQL query, zero N+1.
- **Scope-guarded route** — `GET /api/clinic-orders/appointment/:appointmentId` enforces clinic assignment before returning data.
- **OrderStatusBadge, OrdersTrackingPanel, useOrderExecutionTracking** — 3 new frontend files, fully isolated from billing/IFRS logic.

> Production-ready. Backward-compatible. No accounting side effects.

## Outpatient Improvement — Step 4 (Stable)

**Tag:** `outpatient-step4-stable`

- **Follow-up planning fields** — 3 new nullable columns on `clinic_consultations`: `follow_up_after_days` (integer), `follow_up_reason` (text), `suggested_follow_up_date` (varchar ISO). Saved via existing consultation upsert (ON CONFLICT SET). UTC-safe date arithmetic (`setUTCDate` on UTC-anchored Date).
- **FollowUpActions component** — quick day buttons (3/7/14/30/90) + custom number input + date display with manual override + clear button + reason textarea. Embedded in "الكشف الهيكلي" tab below SOAP fields. No auto-scheduling, no backend side-effects.
- **Patient history N+1 eliminated** — `getPatientPreviousConsultations` rewritten: single SQL with `json_agg` subquery for drugs + aggregated subquery for service/pharmacy order counts. Zero per-row queries.
- **Offset pagination** — `limit+1` technique returns backend `hasMore` boolean. Route accepts `?limit=5&offset=0&excludeId=`. Max limit capped at 20.
- **Current visit excluded** — `excludeId` param strips the active appointment from history results.
- **Visit ordering** — `COALESCE(appointment_date, created_at::date) DESC, created_at DESC` — real visit chronology, null-safe.
- **Refactored architecture** — `PatientHistoryPanel` reduced to thin wrapper. `usePatientHistory` hook owns pagination state + accumulation. `PatientVisitHistoryTable` is pure render component.
- **credentials: "include"** — both `fetch()` calls in `usePatientHistory` match `apiRequest` behavior.
- **Backward compatibility** — all 3 new columns nullable; old saves unchanged; old records load without follow-up fields; offset=0 default preserves existing callers.

> This milestone is production-ready within the implemented scope.
> All changes are backward-compatible, medically safe, and access-scoped server-side.

## Outpatient Improvement — Step 5 (Stable)

**Tag:** `outpatient-step5-stable`

- **OPD-scoped member lookup** — `GET /api/clinic-opd/member-lookup?cardNumber=&date=` with `clinic.book` permission (no CONTRACTS_VIEW required). Card must be >= 3 chars. Date defaults to server today if missing or malformed.
- **Real FK stamping** — `createAppointment()` INSERT now stamps `company_id`, `contract_id`, `contract_member_id` on `clinic_appointments`. All three columns were pre-existing and nullable.
- **FK chain validation** — booking POST validates member → contract → company chain via single SQL query before INSERT. Invalid chain rejected with Arabic error.
- **INSURANCE fallback preserved** — if no card number provided, free-text `insurance_company` accepted (legacy compat). If card entered but invalid → rejected.
- **CONTRACT: FK required** — new CONTRACT bookings require resolved member card. No free-text fallback.
- **`useContractResolution` hook** — isolated state (cardNumber, resolved, isLooking, error). Abort-controller prevents stale responses. Resets on paymentType change.
- **`ContractMemberLookup` component** — card input + search button + error display. Renders only for INSURANCE/CONTRACT. Delegates display to `ResolvedContractSummary`.
- **`ResolvedContractSummary` component** — read-only card: member name, card number, company, contract, coverage-until date. Shows "تنتهي قريباً" badge when <= 30 days remaining. Clear button resets state.
- **PatientSnapshot updated** — payer chip shows FK-resolved company name when available, safe fallback to text field. Expanded section shows company + contract details. Never crashes on missing FK data.
- **Consultation query enriched** — both paths in `getConsultationByAppointment` LEFT JOIN companies + contracts to populate `company_name`, `contract_name` for the snapshot.
- **No duplicate contract logic** — contracts module remains single source of truth. OPD only consumes via service layer.
- **Backward compatibility** — old appointments with null FK fields load normally. Old INSURANCE/CONTRACT text records unchanged.
- **Indexes** — all needed indexes pre-existed. No new indexes added (verified no redundancy).

> Production-ready. FK-first for new records. Legacy-safe for old records. Architecture-clean (thin routes, isolated hook/components).

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