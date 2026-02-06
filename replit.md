# Hospital General Ledger System

## Overview

This project is a production-ready Arabic RTL web application for hospital general ledger (GL) accounting. It is designed to manage 500+ accounts, cost centers, and journal entries, and generate financial reports compliant with IFRS standards. The system uses Egyptian Pound (EGP) as its currency and features a classic accounting software UI aesthetic inspired by Peachtree/Sage. The ambition is to provide a robust, user-friendly accounting solution tailored for the healthcare sector in Arabic-speaking regions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS (custom accounting theme)
- **Localization**: Full Arabic RTL layout with Cairo and Tajawal fonts; all UI text in Arabic.

### Backend
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript
- **API**: RESTful JSON API (`/api/*`)
- **ORM**: Drizzle ORM (PostgreSQL dialect)
- **Validation**: Zod with drizzle-zod

### Data Storage
- **Database**: PostgreSQL (configured via `DATABASE_URL`)
- **Connection Pooling**: pg Pool
- **Schema Management**: Drizzle Kit (`db:push` for migrations)
- **Key Entities**: Users, Accounts (hierarchical), Cost Centers (hierarchical), Fiscal Periods, Journal Entries/Lines, Journal Templates, Audit Log, Receiving Headers/Lines, Purchase Invoice Headers/Lines.

### Core Features
- Dashboard with financial statistics.
- Chart of Accounts and Cost Center management, including Excel import for accounts.
- Comprehensive journal entry system (creation, posting, reversal, templates).
- Fiscal period controls with closing functionalities.
- Financial reports: Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, and Account Ledger.
- Full audit trail logging.
- Advanced search with wildcard support.
- Receiving Register: smart search (debounced 300ms, supplier name + invoice number), date defaults (today), status filter (All/Draft/Posted/Converted), reset button, combined AND filters with pagination.
- Dedicated /api/suppliers/search endpoint with smart detection (numeric queries prioritize exact code match, text queries search all fields), returns minimal fields only, includes AbortController for request cancellation, LRU cache (50 entries), keyboard navigation (↑↓ Enter), and loading indicator.
- Collapsible sidebar for improved workspace.
- Professional print styles optimized for A4.
- Department-based pricing for items.
- Expiry management using month/year format (MM/YYYY) for inventory lots, receiving, and transfers.
- Barcode management for inventory items.
- Supplier Receiving with quantity-only workflow: editable selling price, read-only purchase price hints from last posted receiving, per-line warehouse stock display, per-line statistics popup showing item availability across all warehouses.
- Bonus quantity (free units) tracking in receiving lines with automatic minor unit conversion.
- Sale price mismatch warnings (orange) and near-expiry warnings (red, ≤6 months) in receiving entry.
- Receiving-to-invoice conversion flow: posted_qty_only receivings can be converted to purchase invoices.
- Purchase Invoice management with bidirectional price/discount calculations (discountPct = 1 - purchasePrice/sellingPrice).
- VAT handling where base includes quantity + bonus quantity; invoice-level discount applied proportionally before VAT.
- Invoice approval/costing workflow (draft → approved_costed status).
- Multi-line, scan-first UX for store-to-store transfers with FEFO allocation (month/year based).
- Strict line-level validation: salePrice required (>0) for all non-rejected lines, expiry validation (month 1-12, year 2000-2100) for items with hasExpiry. Backend returns structured lineErrors array with lineIndex/field/messageAr. Validation runs at both save and post time.
- Receiving correction workflow: POST /api/receivings/:id/correct creates draft correction from posted doc with correctionOfId link. postReceivingCorrection reverses original inventory movements and posts new ones in single transaction with negative stock protection. Fields: correctionOfId, correctedById, correctionStatus (corrected/correction).
- Frontend validation UI: red highlights on invalid fields, error banner, disabled expiry inputs for non-expiry items, focus-to-first-error, client-side validation mirrors backend.
- Frontend correction UI: correction button for posted docs, CORRECTED (orange) and correction (purple) badges in register, correction info banners, CORRECTED status filter option.

### Build and Deployment
- **Development**: `npm run dev` with `tsx` and hot reload.
- **Production**: Custom script for `esbuild` (server) and Vite (client).
- **Serving**: Express serves static client assets.

## External Dependencies

### Database
- PostgreSQL (via `DATABASE_URL`)
- `connect-pg-simple` for session storage.

### Key NPM Packages
- `drizzle-orm`, `drizzle-kit`
- `express`
- `@tanstack/react-query`
- `zod`
- `xlsx`
- `shadcn/ui` (via Radix UI)

### Development Tools
- Replit-specific Vite plugins
- TypeScript (strict mode)
- Path aliases (`@/`, `@shared/`)
- Vitest for unit and integration testing (`vitest.config.ts`, `tests/` directory)

### Backend Safety Patterns
- HTTP 409 (Conflict) for immutability violations on posted/approved documents, with error codes: DOCUMENT_POSTED, INVOICE_APPROVED, ALREADY_APPROVED.
- FOR UPDATE row locks in postReceiving for concurrency safety (raw SQL returns snake_case fields).
- Idempotent conversion: convertReceivingToInvoice returns existing invoice if already converted.
- Stricter validation in postReceiving: supplier, invoice number, and warehouse are mandatory.
- Receiving POST validates required header fields (supplierId, receiveDate) and non-empty lines array before saving.
- Purchase Invoice DELETE endpoint with status guard (draft only, 409 for approved).
- postReceiving route returns 400 for validation errors (not 500).
- Transfer delete/post routes return proper HTTP status codes (400 for validation, 409 for immutability).

### Reusable UI Components
- ExpiryInput (`client/src/components/ui/expiry-input.tsx`): Single text input for MM/YYYY format with auto-slash, supports MMYY/MMYYYY/MM/YY/MM/YYYY parsing. Exports `parseExpiryFinal` for testability. Key design: onChange only fires on blur/Enter/Tab, never during typing, to prevent premature year expansion (e.g., "12/20" → 2020 bug).

### Focus Management
- SupplierReceiving uses `lineFieldFocusedRef` to track when any inline line input (bonus, sale price, expiry, batch, qty) has focus.
- All barcode auto-focus calls go through `safeFocusBarcode()` which checks `lineFieldFocusedRef` before focusing, preventing focus stealing during field editing.
- Qty inputs are always-visible `<input>` elements in draft mode (no click-to-edit pattern), using `qtyInputRefs` (Map-based ref) for per-line focus control. `focusedLineIdx` provides row highlighting only, not edit gating.