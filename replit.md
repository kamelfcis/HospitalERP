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
- **Items Excel Import/Export**: Bulk management of items via xlsx. Export (template or full data), Import with upsert (200/chunk), auto-creates form types, handles barcodes via `item_barcodes`, deduplicates by `item_code`.

## Recent Session Progress — Supplier Payments Module (مكتمل ✓)

### ما تم في هذه الجلسة
- **DB Schema**: جدولا `supplier_payments` + `supplier_payment_lines` مع فهارس compound
- **Backend Storage** (`supplier-payments-storage.ts`):
  - `getSupplierBalance` — رصيد المورد (افتتاحي + مُفوتَر + مسدد + حالي)
  - `getSupplierInvoices` — فواتير مورد مع حالة السداد (CTE سريع)
  - `getNextPaymentNumber` — الرقم التسلسلي التالي
  - `createSupplierPayment` — إنشاء سداد atomic داخل transaction
  - `getSupplierPaymentReport` — تقرير تفصيلي بفلتر حالة
- **Backend Routes** (`/api/supplier-payments/*`): 5 مسارات مسجَّلة
- **Frontend** (`client/src/pages/supplier-payments/index.tsx`):
  - صفحة كاملة بتصميم compact: SupplierCombobox + BalanceStrip + ControlsBar + InvoiceTable hero + ReportTab
  - ترتيب تصاعدي/تنازلي بنقرة على رأس أي عمود (`SortHead` component)
  - Checkboxes لاسترشادية: تحديد صفوف وعرض إجمالي الباقي للمحدد في تذييل الجدول
  - ملاحة لوحة مفاتيح داخل خانات المبالغ (↑↓ Enter)
  - توزيع تلقائي للمبلغ على الفواتير بترتيب الشاشة
- **Navigation**: مسار `/supplier-payments` + عنصر "سداد الموردين" في القائمة الجانبية
- **GL Journal Integration**:
  - أُضيف `supplier_payment` لـ `transactionTypeLabels` + `mappingLineTypeLabels`
  - نوع سطر جديد `ap_settlement`: Dr ذمم موردين (liability) / Cr بنك-خزنة (asset)
  - أُضيف لـ `lineTypeSpecs`, `suggestedLineTypes`, `ACCOUNT_CATEGORY_RULES`, `NO_WAREHOUSE_SELECTOR_TYPES`
  - بعد كل حفظ: `generateJournalEntry` (fire-and-forget) يُنشئ القيد تلقائياً

### Critical Notes for Supplier Payments
- `paymentNumber` = MAX+1 داخل db.transaction (لا race condition)
- القيد: sourceType=`supplier_payment`, lineType=`ap_settlement`, amount=totalAmount
- لا warehouse selector في ربط الحسابات لهذا النوع (مضاف لـ NO_WAREHOUSE_SELECTOR_TYPES)
- `ap_settlement` في ACCOUNT_CATEGORY_RULES: `{ debit: ["liability"], credit: ["asset"] }`
- مختلف عن `payables` الموجود (الذي يُستخدم دائناً في فواتير الشراء)

## Recent Session Progress — Sales Return Accounting (مكتمل ✓)

### ما تم في هذه الجلسة
- **نظام قيد المرتجعات (مرحلتان)**:
  - **م1 (عند الإنشاء):** `generateSalesReturnJournal()` — Dr إيراد + Dr مخزون / Cr مدينون (وسيط) + Cr تكلفة
  - **م2 (عند صرف الكاشير):** `completeSalesReturnWithCash()` — يستبدل حساب المدينون بالخزنة ويرحّل القيد
- **`sales_return` في واجهة الحسابات**: أضيف لـ `transactionTypeLabels`, `lineTypeSpecs`, `DYNAMIC_LINE_SPECS`
- **حركات المخزون عند الإرجاع**: يُسجَّل `inventory_lot_movements` (txType='in') لكل سطر مرتجع أثناء التحديث داخل الـ transaction
- **الكاشير**: `refundInvoices()` يستدعي `completeSalesReturnWithCash` بدلاً من `completeSalesJournalsWithCash`
- **IStorage**: أضيف توقيعا `generateSalesReturnJournal` و`completeSalesReturnWithCash`
- **معاينة القيد في شاشة ربط الحسابات**: `SalesReturnJournalPreview` يعرض هيكل القيد المرئي بالمرحلتين عند اختيار `sales_return`

### Critical Notes for Sales Return Accounting
- `generateSalesReturnJournal` = DRAFT journal عند الإنشاء (source_type='sales_return')
- `completeSalesReturnWithCash` = يستبدل سطر مدينون بالخزنة ويُغيّر الحالة لـ posted
- استدعاء `generateSalesReturnJournal` يتم خارج الـ db.transaction كـ fire-and-forget (غير حاسم)
- `inventory_lot_movements.referenceType = 'sales_return'` للإرجاع (txType='in')

## Recent Session Progress — Items Import/Export (مكتمل ✓)

### ما تم في هذه الجلسة
- **Excel Export**: `GET /api/items/export-template?includeData=true|false`
  - خيار 1: نموذج فارغ (18 عمود بالعربي بما فيهم باركود)
  - خيار 2: تصدير كل الأصناف الحالية مع بياناتها
- **Excel Import**: `POST /api/items/import`
  - يقبل ملف xlsx ويعالج بشرائح 200 صنف
  - upsert بـ `ON CONFLICT (item_code) DO UPDATE`
  - ينشئ أنواع الأشكال الجديدة تلقائياً (جدول `item_form_types`، عمود `name_ar`)
  - يحفظ الباركود في `item_barcodes` مع `ON CONFLICT (barcode_value) DO NOTHING`
  - يزيل المكررات تلقائياً قبل الإدراج (Deduplicate by item_code)
- **Frontend** (`ItemsList.tsx`): زر "تصدير" (Dropdown) + زر "استيراد" مع file picker وspinner
- **Route Ordering Fix**: export-template وimport يأتيان قبل `/:id` لمنع التعارض
- **Bugs Fixed**: `form_type_name` → `name_ar` (اسم العمود الصحيح في item_form_types)

### Critical Notes for Next Session
- `item_form_types` column = `name_ar` (NOT `form_type_name`)
- `item_barcodes` is a separate table (FK to items.id, unique on barcode_value)
- Import route is at line ~240 in `server/routes/items-crud.ts`
- Route order: export-template(177) → import(240) → /:id(422+)

## Previous Session Progress (OPD Steps 7+)

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