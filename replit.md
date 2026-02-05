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