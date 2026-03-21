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
- **Outpatient Clinic Module**: Covers clinic booking, doctor consultations, doctor orders, integration with sales invoices and service orders, doctor-specific pricing, and clinic-scoped drug favorites. Step 2 adds a compact PatientSnapshot header (demographics, vitals, payer, latest diagnosis, chronic flags), SOAP structured encounter fields (subjectiveSummary, objectiveSummary, assessmentSummary, planSummary, followUpPlan — all nullable/backward-compatible), quick specialty templates (5 groups: general, pediatrics, orthopedics, gynecology, ENT), quick follow-up buttons, and a StructuredConsultationPanel in the consultation tab.
- **Reporting & Audit**: Ensures balanced financial reports, RBAC enforcement, comprehensive audit trails, and strict validation.
- **Department Services Orders**: A unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, Stay Engine for patient accommodation (with `hours_24` and `hotel_noon` billing modes), Bed Board with real-time updates, and a Surgery Types System.
- **Stock Cycle Count**: A full inventory reconciliation module with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: An admin UI for creating and editing groups, managing members, and controlling per-module permissions via a full matrix view.
- **Contracts Module**: Supports master data for insurance/contract companies, contracts, and member cards. It includes a pure 5-pass rule evaluator for contract coverage rules (e.g., service inclusion/exclusion, discounts, approvals), and a claims GL accounting system for generating claim batches upon patient invoice finalization. The module also features an approval workflow for contract-related services.
- **Account Mappings Module**: Provides a dedicated module for managing account mappings with a specialized UI and transactional backend route for bulk updates.

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