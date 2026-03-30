# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting, specifically designed for the Middle East healthcare sector. It offers comprehensive financial management, including accounts, cost centers, and journal entries, generating IFRS-compliant financial reports in EGP. The system also supports inventory and sales processing, patient and service invoicing, multi-pharmacy operations, and advanced security and reporting. The primary objective is to establish this solution as the leading accounting software for healthcare providers in the region.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is a full-stack web application. The frontend is built with React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS), and the backend uses Node.js Express 5 (TypeScript, Drizzle ORM). PostgreSQL is the primary database. The application fully supports Arabic RTL localization.

### UI/UX Decisions
The user interface features a professional design, a collapsible sidebar, A4 print styles for reports, and visual auto-save indicators.

### Technical Implementations
The system uses a RESTful JSON API. Drizzle ORM manages PostgreSQL interactions, with Zod and `drizzle-zod` for validation. Concurrency and idempotency are handled via `FOR UPDATE` row locks and optimistic concurrency. Financial accuracy is ensured by server-side recomputation with `HALF_UP` rounding. Critical system settings are cached. Centralized error handling provides Arabic messages and specific HTTP status codes. Inventory management includes expired batch blocking and FEFO. An audit trail tracks critical operations, and automated backup/restore is supported. OPD billing implements IFRS revenue deferral. A centralized lookup architecture ensures consistent data fetching.

Performance optimizations include `React.memo` for table rows and vendor chunking. Efficient data entry is facilitated by mandatory grid navigation and a scanner pattern, featuring uncontrolled quantity cells for zero re-renders, early exit in quantity confirmation, and a global scanner listener.

### Feature Specifications
- **Financial Management**: Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, IFRS-compliant reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger), and automatic journal entry generation.
- **Inventory & Sales**: Supplier receiving, sales invoicing (barcode, FEFO), sales returns, patient invoicing (services, drugs, consumables), patient admissions, and master data.
- **Services & Price Lists**: CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, robust Role-Based Access Control (RBAC), Dynamic Account Resolution, and a complete cashier shift lifecycle with business date management and concurrent collection protection.
- **Outpatient Clinic Module**: Clinic booking, doctor consultations, orders, integration with sales/service orders, doctor-specific pricing, clinic-scoped drug favorites, structured consultation fields (SOAP), doctor templates, and patient history optimization.
- **Reporting & Audit**: Balanced financial reports, RBAC enforcement, comprehensive audit trails, and strict validation.
- **Department Services Orders**: Unified module for ordering medical services (lab, radiology) with single and batch entry, integrated with doctor orders.
- **Specialized Features**: Doctor Payable Transfer, Doctor Settlement, Stay Engine (patient accommodation billing), Bed Board with real-time updates, and a Surgery Types System.
- **Opening Stock**: Draft-to-posted document flow with per-line lot entry, Excel import/export, and GL journal generation upon posting.
- **Stock Cycle Count**: Full inventory reconciliation with atomic GL journal generation and lot adjustments.
- **Permission Groups Management**: Admin UI for managing groups, members, and per-module permissions with individual user overrides.
- **Contracts Module**: Master data for insurance/contract companies, contracts, and member cards, including a 5-pass rule evaluator for contract coverage, claims GL accounting, and an approval workflow.
- **Account Mappings Module**: Dedicated UI and transactional backend for bulk updates.
- **Items Excel Import/Export**: Bulk management of items via xlsx with upsert functionality and barcode handling.
- **Customer Credit Payments Module**: Manages customer credit, integrating with cashier handover summaries.
- **Supplier Payments Module**: Manages supplier payments with dedicated database schemas, backend storage for balances, payment processing routes, and GL journal integration.
- **Sales Return Accounting**: Two-stage journal entry system for sales returns, integrating with inventory movements and cashier refunds.
- **Purchase Returns Module**: Full module for returning purchased items to suppliers, including invoice-linked returns, atomic lot decrement, and GL journal reversal.
- **Delivery Payment Collection**: Full module for collecting delivery invoices, featuring atomic receipt creation with GL journal, shift totals integration, and cashier handover report columns.
- **Thermal Receipt Printing**: Full 80mm thermal receipt system for the cashier module, with auto-printing, customizable settings, and a reprint function.
- **Shortage Notebook**: Procurement decision dashboard for pharmacy managers, logging shortage events and providing aggregated statistics.
- **Pharmacy Mode**: A toggle (`pharmacy_mode`) that restricts access to hospital-specific modules for non-owner users, enforced via sidebar filtering, route-level guards, and backend middleware.
- **Item Movement Report**: Detailed per-item inventory movement report with search, filters, unit-level toggle, signed quantities, running balance, and Excel export/print functionality, implemented with server-side pagination.
- **Unit Conversion Overhaul**: Centralized unit conversion logic with `QTY_MINOR_TOLERANCE=0.0005`, supporting various unit configurations and server-side re-verification. Unit name changes are protected after transactions, and a Data Integrity Report page is available.

## Financial Integrity Hardening

### Phase 2 — GL Safety (2026-03-30)

**TASK-FIN-01: Stay Engine UNIQUE index**
- startup migration في `server/index.ts` ينشئ `uq_pil_source_type_id` على `patient_invoice_lines(source_type, source_id) WHERE is_void=false AND source_type IS NOT NULL`
- يفحص duplicates أولاً — لا ينشئ الـ index إذا وُجدت
- النتيجة: Stay Engine ينجح في upsert بعد 272h صمت (33 سطر في أول tick)

**TASK-FIN-02: منع journal بـ period_id=null**
- `generateJournalEntry` في `finance-journal-storage.ts` يُعيد `null` بدلاً من إنشاء قيد يتيم
- 62 قيد قديم بـ `period_id=null` موجود من قبل الإصلاح (انظر Data Repair Queries)

**TASK-FIN-03/04: Supplier Payment + Opening Stock GL logging**
- catch blocks تُسجّل `logAcctEvent(needs_retry)` بدلاً من console.warn
- retry handlers جديدة في `accounting-retry-worker.ts`

**TASK-FIN-05: Sales Return Phase-2 Idempotency**
- guard صريح في `completeSalesReturnWithCash` — `journal.status==='posted'` → skip مع log

### Phase 3 — Inventory Integrity + Additional GL Safety (2026-03-30)

**TASK-INV-01: FOR UPDATE lock على inventory_lots في postReceiving**
- **الملف:** `server/storage/purchasing-receivings-storage.ts`
- **المشكلة المُكتشفة:** SELECT على `inventory_lots` بدون `FOR UPDATE` يسمح بـ lost-update عند استلامين متوازيين
- **الدليل:** 2 حالة duplicate lots موجودة في البيانات (نفس الصنف/المستودع/الصلاحية)
- **الإصلاح:** استبدال Drizzle ORM SELECT بـ `raw SQL SELECT ... FOR UPDATE` داخل نفس transaction
- **ملاحظة:** raw SQL rows تعطي snake_case — يُقرأ `lot.qty_in_minor` وليس `lot.qtyInMinor`

**TASK-INV-02: Receiving GL catch → needs_retry**
- **الملف:** `server/storage/purchasing-receivings-storage.ts`
- catch block يُسجّل `status: "needs_retry"` (كان `"failed"`) ويضبط `journalStatus` بنفس القيمة

**TASK-INV-03a: Supplier Payment legacy catch → logAcctEvent**
- **الملف:** `server/routes/supplier-payments.ts`
- `.catch()` في legacy GL path يُسجّل `logAcctEvent(needs_retry)` الآن

**TASK-INV-03b/c: CRITICAL — إصلاح contracts GL (is_posted يتعطل منذ البداية)**
- **الملفات:** `contracts-claims-storage.ts`, `contract-claim-settlement-service.ts`
- **الخلل المُكتشف:** كلا المسارين استخدما `is_posted: true` في INSERT — هذا العمود لا وجود له في `journal_entries`! كل GL للعقود كان يفشل بصمت منذ البداية
- **الإصلاح:**
  1. استبدال `is_posted: true` → `status: 'posted'`
  2. إضافة `period_id` lookup قبل INSERT
  3. إضافة `logAcctEvent(completed/needs_retry)` في try/catch
  4. إضافة `line_number` في `journal_lines` INSERT (كان مفقوداً)

**TASK-INV-04/05: نتائج فحص البيانات الحالية**

| الفحص | النتيجة | التصنيف |
|---|---|---|
| Duplicate lots (item/warehouse/expiry) | **2 حالة** | Confirmed corruption |
| Duplicate movements (same doc + lot) | **12 سطر** | من multi-line entry — مقصود |
| Posted receivings بدون journal trace | **18 من 18** | Pre-fix — no corruption |
| is_posted GL contracts (كان مكسوراً) | **لا يوجد** كان يفشل بصمت | Confirmed bug - fixed |
| delivery_receipt failed events | **4** | يحتاج retry يدوي |

### Data Repair Queries (يُنفَّذ يدوياً بعد مراجعة)

```sql
-- فحص 62 قيد قديم بـ period_id=null (Phase 2)
SELECT COUNT(*) FROM journal_entries WHERE period_id IS NULL AND status = 'posted';

-- إصلاح القيود القديمة التي بلا period_id
UPDATE journal_entries je
SET period_id = (
  SELECT fp.id FROM fiscal_periods fp
  WHERE fp.start_date <= je.entry_date AND fp.end_date >= je.entry_date
  LIMIT 1
)
WHERE je.period_id IS NULL AND je.status = 'posted'
  AND EXISTS (SELECT 1 FROM fiscal_periods fp WHERE fp.start_date <= je.entry_date AND fp.end_date >= je.entry_date);

-- فحص الـ duplicate lots (Phase 3)
SELECT il.id, i.name_ar, il.expiry_month, il.expiry_year, il.qty_in_minor::numeric AS qty,
       (SELECT COUNT(*) FROM inventory_lot_movements m WHERE m.lot_id = il.id) AS moves
FROM inventory_lots il JOIN items i ON i.id = il.item_id
WHERE (il.item_id, il.warehouse_id, il.expiry_month, il.expiry_year) IN (
  SELECT item_id, warehouse_id, expiry_month, expiry_year FROM inventory_lots
  GROUP BY item_id, warehouse_id, expiry_month, expiry_year HAVING COUNT(*) > 1
) ORDER BY il.item_id, il.qty_in_minor::numeric DESC;

-- إصلاح الـ duplicate lots: دمج القديم (qty=0) في الجديد
-- خطوة 1: نقل الحركات للـ lot الأحدث (غيّر '16af958b...' و '74d57e77...' للقيم الفعلية)
-- UPDATE inventory_lot_movements SET lot_id = '<newer_lot_id>' WHERE lot_id = '<older_zero_lot_id>';
-- خطوة 2: حذف الـ lot القديم (بعد التحقق من عدم وجود حركات)
-- DELETE FROM inventory_lots WHERE id = '<older_zero_lot_id>' AND qty_in_minor = '0.0000';
```

### Deferred Financial Hardening (Phase لاحقة)
- `clinic-master-storage.ts` — OPD GL جاهز ✅ (period check + status='posted') — FROZEN لا تلمس
- `customer-payments-storage.ts` — GL داخل transaction مع period check وlogAcctEvent ✅ — لا يحتاج

### Critical Notes
- **accounting_event_log** (وليس `accounting_events`) هو اسم الجدول الفعلي
- **inventory_lots raw SQL**: يُعطي snake_case — اقرأ `qty_in_minor` و `id` مباشرة
- **contracts GL was NEVER posting journals** قبل Phase 3 بسبب is_posted غير موجود
- **18 posted receivings** بـ `journal_status='none'` — كلها سابقة للإصلاح، تحتاج account mappings لإعادة المحاولة

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