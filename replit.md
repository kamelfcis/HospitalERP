# Hospital General Ledger System

## Overview

A production-ready Arabic RTL web application for hospital general ledger (GL) accounting. The system is designed to handle 500+ accounts, cost centers, journal entries, and financial reporting compliant with IFRS standards. Currency is Egyptian Pound (EGP). The UI follows a classic accounting software aesthetic inspired by Peachtree/Sage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration for accounting-style design
- **Build Tool**: Vite with React plugin and custom Replit plugins for development

The frontend enforces Arabic RTL layout throughout with Cairo and Tajawal fonts. All text, labels, and messages must remain in Arabic.

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript compiled with tsx
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Validation**: Zod with drizzle-zod for type-safe schema validation

The server handles all business logic including journal entry management, fiscal period controls, audit logging, and financial report generation.

### Data Storage
- **Database**: PostgreSQL (connection via `DATABASE_URL` environment variable)
- **Connection Pooling**: pg Pool for connection management
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

Key entities include:
- Users (authentication and roles)
- Accounts (chart of accounts with hierarchical structure)
- Cost Centers (hierarchical cost tracking)
- Fiscal Periods (accounting period management with closing)
- Journal Entries and Lines (double-entry bookkeeping)
- Journal Templates (reusable entry patterns)
- Audit Log (change tracking)

### Application Features
- Dashboard with financial statistics
- Chart of Accounts management with Excel import capability
- Journal entry creation, posting, and reversal
- Cost center tracking with required assignment for revenue/expense accounts
- Fiscal period management with closing controls
- Financial reports: Trial Balance, Income Statement, Balance Sheet, Cost Center Reports
- Full audit trail logging

### Build and Deployment
- Development: `npm run dev` runs tsx with hot reload
- Production build: Custom script bundles server with esbuild and client with Vite
- Static serving: Express serves built client from `dist/public`
- Output format: Server compiles to CommonJS (`dist/index.cjs`)

## Recent Changes (February 2026)
- Completed full frontend implementation with 12 pages
- Backend API fully implemented with all CRUD operations
- Database seeded with 47 accounts, 10 cost centers, 12 fiscal periods, and 5 sample journal entries
- All financial reports functional (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports)
- Arabic RTL layout verified and working across all pages
- **Journal Entry Templates Feature** (Feb 5, 2026):
  - Save complete journal entries as templates with all lines, accounts, and amounts
  - Load/recall templates when creating new journal entries via dropdown menu
  - Templates page shows expandable rows to view all template lines with account details
  - Template lines stored with decimal(15,2) precision for large amounts
  - Note: Template line schema uses debitPercent/creditPercent columns but stores actual amounts (not percentages)
- **Account Ledger Report** (Feb 5, 2026):
  - كشف حساب - view all transactions for any account
  - Filter by date range (from/to)
  - Shows: date, entry number, description, debit, credit, running balance
  - Opening balance, total debits/credits, and closing balance summary
  - Both posted AND reversed entries appear in ledger (correct accounting behavior)
  - Print functionality included
- **Advanced Search with Wildcards** (Feb 5, 2026):
  - Use % wildcard for multi-part searches (e.g., "خصم%مكتسب")
  - Search displays up to 50 results with result count indicator
  - Results sorted by relevance (code matches first, then name matches)
  - Implemented in: Journal Entry form, Cost Centers, Account Ledger
- **Collapsible Sidebar** (Feb 5, 2026):
  - Toggle button in header to show/hide sidebar
  - Collapses to icon-only mode for more workspace
  - Click again to expand back to full menu
- **Professional Print Styles** (Feb 5, 2026):
  - Sidebar and header hidden during printing
  - Report content expands to full page width
  - Compact Peachtree-style table formatting
  - Optimized for A4 paper with proper margins
  - CSS classes available: print-header, print-summary, no-print
- **Department-Based Pricing** (Feb 5, 2026):
  - Hospital departments table for different pricing tiers (صيدلية خارجية, صيدلية داخلية, عناية مركزة, غرفة عمليات, طوارئ, معمل تحاليل, أشعة)
  - Items can have custom sale prices per department
  - If no department-specific price, the default item sale price is used
  - ItemCard includes "أسعار حسب القسم" section to manage department prices
  - Add/edit/delete department prices via modal dialog
  - API endpoint: GET /api/pricing?itemId=X&departmentId=Y returns effective price
- **Expiry & Barcode Foundation** (Feb 6, 2026):
  - `hasExpiry` flag on items: drugs default to enabled, supplies default to disabled, services locked (always false)
  - Backend enforces category-based defaults: POST /api/items auto-sets hasExpiry based on category
  - PUT /api/items/:id/expiry-settings toggles hasExpiry with safety checks (cannot disable if active lots with expiry exist)
  - Services cannot enable expiry (400 error) and cannot create inventory lots (400 error)
  - Inventory lots system: inventoryLots table with batch_number, expiry_date, qty tracking
  - Lot movements: inventoryLotMovements table tracks IN/OUT/ADJ transactions per lot
  - FEFO allocation: GET /api/fefo/preview returns allocations ordered by earliest expiry first
  - Barcode management: multiple barcodes per item, unique constraint on barcode_value
  - Barcode CRUD: POST /api/items/:id/barcodes, DELETE /api/barcodes/:id (soft-delete via isActive)
  - Barcode resolution: GET /api/barcode/resolve?value=X tries barcode table first, falls back to item code
  - Alphanumeric validation on barcode values (frontend + backend)
  - Duplicate barcode returns HTTP 409 with Arabic error message
  - ItemCard UI: hasExpiry checkbox with CalendarClock icon, barcode grid with add/delete dialogs
- **Store-to-Store Transfer (تحويل مخزني) - Multi-Line Redesign** (Feb 6, 2026):
  - Architecture: Header+Lines model (storeTransfers → transferLines → transferLineAllocations)
  - storeTransfers is now header-only (no itemId/qtyInMinor) with draft/executed status
  - transferLines table: itemId, unitLevel (major/medium/minor), qtyEntered, qtyInMinor, notes per line
  - transferLineAllocations table: audit trail of FEFO lot allocations per line during posting
  - Draft/Post workflow: save as مسودة (draft), then ترحيل (post/execute) separately
  - Inline editable grid: per-row item search (barcode/code/name), unit dropdown, qty input
  - Auto-add empty row on item selection; row locks after item is picked
  - Unit conversion: calculateQtyInMinor() handles major/medium/minor with conversion factors
  - FEFO allocation per-line during posting, ordered by earliest expiry first
  - Transfer execution wrapped in DB transaction for atomicity across multiple lines
  - Real-time availability display per row from source warehouse
  - Transfer history with draft actions (ترحيل/حذف buttons)
  - API: POST /api/transfers (create draft), POST /api/transfers/:id/post, DELETE /api/transfers/:id
  - API: GET /api/items/lookup (search with availability), GET /api/items/:itemId/availability
  - Lines reset when source warehouse changes (prevents stale availability data)
  - Sidebar nav item "تحويل مخزني" with ArrowLeftRight icon
- **Transfer Enhancements Pack (Feb 6, 2026)**:
  - RTL grid column order: اسم الصنف first (rightmost), then كود, 📊, الوحدة, الكمية, الصلاحية, الرصيد, ملاحظات, حذف
  - Sticky search modal: stays open after adding item, soft-resets details panel (qty=1, unit=major), focus returns to search input
  - Availability insight icon (📊): click shows popup with item stock across all active warehouses in major unit
  - API: GET /api/items/:id/availability-summary?asOfDate=&excludeExpired=1 (lazy-loaded, 60s client cache)
  - Popup shows warehouseNameAr + qtyMajor, "إرشادي فقط" footer, closes on click-outside or Esc
- **Compact Rows + Barcode Fast Add + FEFO Auto-Split (Feb 6, 2026)**:
  - Compact row height: table base 12px, item name 14px bold with 2-line clamp + ellipsis + tooltip
  - Barcode fast-add: scan input (data-testid="input-barcode-scan") on form tab, type barcode/code + Enter → instant add
  - Barcode resolves via /api/barcode/resolve, then fetches item via /api/items/search, then adds with FEFO
  - FEFO auto-split: addItemWithFefo() helper calls /api/transfer/fefo-preview for hasExpiry=1 items
  - Creates multiple TransferLineLocal entries (one per lot allocation) when qty spans multiple lots
  - Non-expiry items always create single line
  - Both modal "موافق" and barcode scan use the same addItemWithFefo flow
  - Toast shows lot count when FEFO split occurs (e.g., "تم التوزيع على 3 دفعات")
  - Shortage validation with Arabic error messages
- **Real-World Pilot Test (Feb 6, 2026)**:
  - Seed endpoint: POST /api/seed/pilot-test (idempotent, creates/updates TEST- prefixed data)
  - Test warehouses: WH-PH-IN (صيدلية داخلية), WH-OR (مخزن غرفة العمليات)
  - Test items: TEST-DRUG-1 (HasExpiry=1, علبة/شريط, factor=10), TEST-DRUG-2 (HasExpiry=1, علبة/قرص, factor=20), TEST-SUP-1 (HasExpiry=0, علبة/قطعة, factor=50)
  - Lot scenarios: FEFO split (multiple lots with different expiry), expired lot (excluded automatically), non-expiry lot (NULL expiry)
  - HasExpiry enforcement: HasExpiry=0 items only use NULL-expiry lots, HasExpiry=1 items exclude expired lots
  - Default unit = Major (علبة) in UI, conversion to minor for DB operations
  - Availability display: shows in selected unit (e.g., "5 علبة + 3 شريط") not raw minor
  - FEFO column header: "توزيع الصلاحية" (Arabic)
  - Search dropdown: shows "متاح: X علبة" in major unit
  - Shortage rejection: Arabic error "الكمية غير متاحة" with details
  - Verified: FEFO split, non-expiry transfer, shortage rejection, destination lot creation
  - To remove test data: DELETE items/lots/warehouses WHERE code LIKE 'TEST-%'
- **Database Integrity & Performance Audit** (Feb 5, 2026):
  - Added self-referencing FKs: accounts.parentId → accounts.id, costCenters.parentId → costCenters.id
  - Added FK: journalEntries.reversalEntryId → journalEntries.id, journalEntries.templateId → journalTemplates.id
  - Added unique constraint on journalEntries.entryNumber (global unique numbering system)
  - Added composite unique index on itemDepartmentPrices(itemId, departmentId)
  - Changed deletion policy to RESTRICT on items, accounts, cost centers with dependent data (prevents accidental data loss)
  - Items with purchase/sales transactions cannot be hard-deleted (use isActive soft-delete instead)
  - Delete operations return HTTP 409 with Arabic error messages when FK constraints prevent deletion
  - Added 22 performance indexes on frequently queried columns across all tables
  - Audit log uses polymorphic design (table_name + record_id) without FK constraints by design

## Pre-Release Testing Checklist
Before publishing as final product, test the following:
- [ ] Chart of Accounts: Create, edit, delete accounts
- [ ] Chart of Accounts: Excel import with headers (الكود, اسم الحساب, كود مركز التكلفة, تصنيف الحساب, قائمة العرض)
- [ ] Cost Centers: Create hierarchical cost centers
- [ ] Journal Entries: Create, post, and reverse entries
- [ ] Journal Entries: Load templates and save new templates
- [ ] Account Ledger: View transactions with date range filter
- [ ] Account Ledger: Verify reversed entries appear correctly
- [ ] All Reports: Trial Balance, Income Statement, Balance Sheet, Cost Center Reports
- [ ] Print: All reports print correctly without sidebar
- [ ] Fiscal Periods: Open and close periods
- [ ] Audit Log: Verify all actions are logged
- [ ] Department Pricing: Add/edit/delete department-specific prices for items

## External Dependencies

### Database
- PostgreSQL database required via `DATABASE_URL` environment variable
- Session storage uses `connect-pg-simple` for persistent sessions

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migration tooling
- `express`: HTTP server framework
- `@tanstack/react-query`: Data fetching and caching
- `zod`: Runtime type validation
- `xlsx`: Excel file parsing for account imports
- Full shadcn/ui component suite via Radix UI primitives

### Development Tools
- Replit-specific Vite plugins for development experience
- TypeScript with strict mode enabled
- Path aliases configured: `@/*` for client, `@shared/*` for shared code