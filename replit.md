# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting. Its primary purpose is to manage accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). It aims to provide a robust, user-friendly accounting solution specifically tailored for the healthcare sector in Arabic-speaking regions, featuring a classic accounting software UI aesthetic. Key capabilities include comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting features. The project envisions becoming the leading accounting solution for healthcare providers in the Middle East.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design
The system is a full-stack web application. The frontend is built with React 18, TypeScript, Wouter, TanStack React Query, shadcn/ui, and Tailwind CSS. The backend uses Node.js Express 5 with TypeScript and Drizzle ORM. PostgreSQL serves as the primary data store. The application is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Includes a Chart of Accounts, Cost Centers (with Excel import), a comprehensive Journal Entry system (create, post, reverse, templates), Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger). Automatic Journal Entries are generated based on configurable account mappings.
- **Inventory & Sales**: Features Supplier Receiving, Sales Invoicing (with barcode scanning, FEFO allocation, customer types, atomic stock deduction), Patient Invoicing (services, drugs, consumables, payments, "Distribute to Cases" feature, linked to admissions), Patient Admissions management, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: CRUD operations for department-scoped services, price lists with inline editing and bulk adjustments, and integration with sales invoices.
- **Multi-Pharmacy Support**: The system supports multiple pharmacies with isolation for invoicing and cashier operations.
- **Cashier & Security**: Includes real-time SSE for instant invoice visibility, password-protected cash drawers with GL account selection for shifts, department-level invoice isolation, a two-stage journal entry system for sales, and robust role-based access control (RBAC) with granular permissions. Close-shift validation and cashier scope enforcement are in place.
- **Reporting & Audit**: Generates balanced financial reports, incorporates full RBAC, and maintains a comprehensive audit trail with strict validation and conflict resolution.
- **User Experience**: Emphasizes a professional UI with a collapsible sidebar, A4 print styles, focus management, and visual auto-save indicators.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, a Stay Engine for managing and accruing patient accommodation costs, a Bed Board system with real-time updates and smart bed transfer, and a Surgery Types System. An announcements ticker provides streaming updates.

### Technical Implementations
- **API**: Utilizes a RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL dialect and Drizzle Kit for database interactions.
- **Validation**: Zod with drizzle-zod for schema validation.
- **Concurrency & Idempotency**: Employs `FOR UPDATE` row locks, optimistic concurrency with versioning, and idempotent conversion processes to ensure data integrity.
- **Financial Accuracy**: Invoice totals are recomputed server-side with `HALF_UP` decimal rounding.
- **System Settings**: Critical system settings are cached in memory for performance optimization.
- **Error Handling**: Centralized Arabic error messages are provided with specific HTTP status codes.
- **Printing Safety**: Implements print tracking for cashier and refund receipts.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO (First-Expired, First-Out) ordering for inventory.
- **Monitoring**: Includes slow request/query logging and basic operations endpoints.
- **Backup & Restore**: Automated backup and restore scripts are in place with retention policies.
- **Architectural Enforcement**: Uses route helpers for error handling and validation, finance helpers for consistent money operations, a custom frontend mutation hook, ESLint rules, test templates, and a scaffold generator.
- **Stay Engine Billing Modes**: Supports `hours_24` and `hotel_noon` idempotent billing modes for patient stays.
- **Invoice & Discharge Business Rules**: Enforces payment before finalization and finalized invoices before discharge, with role-based bypass options.
- **Audit Trail**: Captures audit entries for critical financial operations.
- **Room Management**: Provides a dedicated page for CRUD operations on floors, rooms, and beds, including grade assignment.
- **Surgery Types Integration**: Allows linking surgery types to admissions, impacting OR_ROOM line items and invoice totals.
- **Admissions Management**: Enhanced admissions list with invoice status, department filtering, and financial totals.
- **Refactored Pages**: `PatientInvoicePage`, `SalesInvoices`, and `CashierCollection` have been significantly refactored into modular, hook-based compound components for improved maintainability and readability, adhering to strict business rules and validation logic.

## External Dependencies

### Database
- PostgreSQL
- `connect-pg-simple` (for session store)

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

---

## آخر تحديث — جلسة 2026-03-04

### ما تم إنجازه (فاتورة المبيعات — منطق الوحدات والبحث السريع)

#### 1. إصلاح مفتاح Enter في ItemFastSearch
- **المشكلة**: `handleKeyDown` كان `async` → race condition مع React state
- **الحل**: إزالة `async`، استدعاء `loadBatches` كـ fire-and-forget
- **السلوك الحالي**:
  - صنف **بدون صلاحية** → Enter واحدة = إضافة فورية
  - صنف **بصلاحية** → Enter أولى = تُظهر الدُفعات، Enter ثانية = إضافة للفاتورة
  - ESC في وضع الدُفعات = رجوع للقائمة

#### 2. إصلاح حساب الأسعار (`computeUnitPriceRaw`)
- `baseSalePrice` = سعر الوحدة الكبرى دائماً
- سعر الشريط = `baseSalePrice ÷ majorToMedium` (بدون تقريب مبكر)
- `computeLineTotal` يضرب بالسعر الخام → يمنع `3 × 166.67 = 500.01`
- الصح: `3 × 166.666... = 500.00`

#### 3. قواعد منطق الوحدات (مُثبَّتة ومُوثَّقة)

```
qty_in_minor:
  - يُخزَّن بالوحدة الكبرى إذا majorToMinor = null
    (1 علبة = 1 وحدة صغرى)
  - يُخزَّن بالوحدة الصغرى الفعلية إذا majorToMinor محدد

getEffectiveMediumToMinor(item):
  mediumToMinor محدد    → يستخدمه مباشرة
  كلاهما محدد           → majorToMinor / majorToMedium
  وإلا (null/null)      → (1||1) / (majorToMedium||1)
                         مثال: majorToMedium=3 → 1/3=0.333
  هذا صحيح! لأن qty مخزّن بالعلبة، فالشريط = 1/3 علبة

computeUnitPriceRaw:
  major  → baseSalePrice
  medium → baseSalePrice ÷ majorToMedium (أو مشتق)
  minor  → baseSalePrice ÷ majorToMinor (أو مشتق أو majorToMedium)
  إذا لم يوجد معامل → نفس السعر (لا نقسم على null)

مثال عملي:
  علبة = 3 شرائط | qty_in_minor=22 (علبة) | baseSalePrice=500
  ├── عرض كبرى:   22 علبة   | سعر 500     | إجمالي 500
  ├── FEFO لشريط: يطلب 0.333 وحدة صغرى
  └── عرض وسطى:  66 شريط   | سعر 166.67  | إجمالي 500.00
```

#### 4. Refactor — useInvoiceLines.ts
- استخراج `runFefo()` → دالة خالصة تتعامل مع كل منطق FEFO
- استخراج `resolvePricing()` → دالة خالصة لجلب السعر
- `addItemToLines` و `handleQtyConfirm` يستدعيان الدالتين المشتركتين
- تعريف `FefoOptions` / `FefoResult` كـ interfaces واضحة
- أي تعديل في FEFO يتم في **مكان واحد فقط**

### الملفات المعدَّلة
| الملف | التغيير |
|-------|---------|
| `client/src/components/ItemFastSearch/ItemFastSearch.tsx` | إزالة async من handleKeyDown |
| `client/src/pages/sales-invoices/utils.ts` | computeUnitPriceRaw محسَّن، منطق مُوثَّق |
| `client/src/pages/sales-invoices/hooks/useInvoiceLines.ts` | Refactor كامل — إزالة تكرار FEFO |

### ملاحظات مهمة للجلسة القادمة
- الأخطاء في `SurgeryTypeBar.tsx` و `routes.ts` موجودة قبل جلسة اليوم (pre-existing)
- `salePriceCurrent` دائماً سعر الوحدة **الكبرى**
- إذا لم يكن `majorToMedium` محدداً في كارت الصنف → الشريط يأخذ نفس سعر العلبة (المستخدم يحتاج يحدد المعامل)
- `db:push` يتعطل → استخدم `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` مباشرة
- Session: `req.session.userId` و `req.session.role`
