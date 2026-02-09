# Hospital General Ledger System

## Overview

This project is a production-ready Arabic RTL web application for hospital general ledger (GL) accounting. It is designed to manage 500+ accounts, cost centers, and journal entries, and generate IFRS-compliant financial reports. The system uses Egyptian Pound (EGP) and features a classic accounting software UI aesthetic. Its purpose is to provide a robust, user-friendly accounting solution tailored for the healthcare sector in Arabic-speaking regions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design
The system is a full-stack web application with a React 18 frontend (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS) and a Node.js Express 5 backend (TypeScript, Drizzle ORM). It uses PostgreSQL for data storage and is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Chart of Accounts, Cost Centers (with Excel import), comprehensive Journal Entry system (create, post, reverse, templates), Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger).
- **Inventory & Sales**:
    - **Receiving**: Supplier Receiving with quantity-only workflow, editable selling price, bonus quantity tracking, sale price/near-expiry warnings, and receiving-to-invoice conversion. Includes an auto-save mechanism.
    - **Sales Invoicing**: Barcode scanning, item search, editable lines with FEFO allocation, bidirectional discount editing, customer types (Cash/Credit/Contract), and atomic stock deduction. Auto-save is implemented.
    - **Patient Invoicing**: Patient information, services, drugs, consumables, equipment, payments, and consolidated invoices with status tracking and payment methods.
- **Master Data & Pricing**: Item Master Data with Unit of Measure (UOM) management, department-based pricing, lot-level sale price tracking, expiry management (MM/YYYY), and barcode management.
- **Services & Price Lists**: CRUD for services, price lists with inline editing, bulk price adjustment, and integration of service consumables into sales invoices.
- **Audit & Validation**: Full audit trail, advanced search, strict line-level validation (frontend and backend), and HTTP 409 conflict responses for immutability violations.
- **User Experience**: Collapsible sidebar, professional A4 print styles, focus management for barcode scanning and inline editing, and visual auto-save indicators.

### Technical Implementations
- **API**: RESTful JSON API (`/api/*`).
- **ORM**: Drizzle ORM with PostgreSQL dialect, Drizzle Kit for schema management.
- **Validation**: Zod with drizzle-zod.
- **Concurrency Safety**: `FOR UPDATE` row locks for critical inventory operations.
- **Idempotency**: Conversion processes are idempotent.
- **Error Handling**: Specific HTTP status codes (400 for validation, 409 for conflicts) are consistently used.
- **Auto-Save**: Document entry forms feature auto-save every 15 seconds, using temporary IDs and `navigator.sendBeacon` for final saves.
- **Reusable Components**: Custom `ExpiryInput` for MM/YYYY date handling.

## External Dependencies

### Database
- PostgreSQL (configured via `DATABASE_URL`)
- `connect-pg-simple` for session storage

### Key NPM Packages
- `drizzle-orm`, `drizzle-kit`
- `express`
- `@tanstack/react-query`
- `zod`
- `xlsx`
- `shadcn/ui` (built on Radix UI)

### Development Tools
- TypeScript
- Vitest for testing
- `esbuild` and Vite for production builds