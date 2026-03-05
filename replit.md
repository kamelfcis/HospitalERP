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

## آخر تحديث — جلسة 2026-03-05

### ما تم إنجازه (جلسة 2026-03-04) — فاتورة المبيعات، منطق الوحدات

#### 1. إصلاح Enter في ItemFastSearch + إصلاح حساب الأسعار + استقلالية سطور FEFO
- `handleKeyDown` غير async — QtyCell controlled — كل سطر يتحدث بشكل مستقل

#### 2. قواعد منطق الوحدات (ثابتة)
```
qty_in_minor يُخزَّن بالكبرى إذا majorToMinor=null
baseSalePrice = سعر الوحدة الكبرى دائماً
computeLineTotal يستخدم السعر الخام (بدون تقريب مبكر)
getEffectiveMediumToMinor: mediumToMinor → (1||1)/(majorToMedium||1) إذا null
```

---

### ما تم إنجازه (جلسة 2026-03-05 — الجزء الثاني) — إذن الاستلام + ItemFastSearch

#### 1. شرط إضافة الأصناف في إذن الاستلام
- `canAddItems` = مستودع + **مورد** + رقم فاتورة — الثلاثة مطلوبين قبل إضافة أي صنف
- Placeholder الباركود يتغير حسب الناقص: "اختر المستودع أولاً..." / "اختر المورد أولاً..." / "أدخل رقم فاتورة المورد أولاً..."
- Global barcode scanner يُحجب أيضاً لو أي من الثلاثة ناقص

#### 2. عمود سعر الشراء (التكلفة)
- أضيف عمود **"سعر الشراء"** editable في جدول الأسطر (بين هدية وسعر البيع)
- يُحمَّل تلقائياً بآخر سعر شراء من السجل عند إضافة الصنف
- `lineTotal` يُحسب تلقائياً عند تغيير سعر الشراء أو الكمية: `purchasePrice × (qtyInMinor + bonusQtyInMinor)`
- حقل يتحول أحمر عند وجود خطأ validation

#### 3. Validation الجديدة عند الترحيل
```
- سعر البيع = 0       → "سعر البيع مطلوب ويجب أن يكون أكبر من صفر"
- سعر الشراء = 0      → "سعر الشراء (التكلفة) مطلوب ويجب أن يكون أكبر من صفر"
- سعر الشراء > بيع    → "سعر الشراء أعلى من سعر البيع"
- hasExpiry بلا تاريخ → "تاريخ الصلاحية مطلوب"
```

#### 4. ItemFastSearch — اتجاه الكتابة حسب الوضع
- `dir="ltr"` + `lang="en"` + Placeholder إنجليزي عند اختيار "اسم إنجليزي"
- `dir="rtl"` + `lang="ar"` + Placeholder عربي باقي الأوضاع
- بادج `EN` أزرق يظهر جنب الحقل تذكيراً لوضع الإنجليزي
- الفوكس يرجع تلقائياً لحقل البحث بعد تغيير الوضع
- التغيير في ملف واحد مشترك (يؤثر على استلام الموردين + فاتورة المبيعات)

#### ملاحظات مهمة
- تغيير لغة الكيبورد الفعلية (EN/AR) مستحيل برمجياً من المتصفح — قرار OS
- عمود "تنبيه": مثلث برتقالي (سعر بيع مختلف عن آخر سعر) + مثلث أحمر (صلاحية < 6 أشهر)

---

### ما تم إنجازه (جلسة 2026-03-05) — Compound Component Refactor الكامل

#### الهدف: إعادة هيكلة صفحة المبيعات لتكون مقروءة ومشتركة

#### الملفات الجديدة
| الملف | الغرض |
|-------|--------|
| `client/src/lib/invoice-lines.ts` | **مكتبة مشتركة**: وحدات + تسعير + FEFO utils — تُستخدم في كل الشاشات |
| `client/src/components/StockStatsDialog/index.tsx` | **مكوّن مشترك**: نافذة أرصدة المخازن (مبيعات + مريض + أي شاشة) |
| `client/src/pages/sales-invoices/hooks/useLoadInvoice.ts` | تحميل الفاتورة وتعبئة السطور + الأرصدة + الصلاحيات |
| `client/src/pages/sales-invoices/hooks/useBarcodeScanner.ts` | قراءة الباركود وحل الصنف وإضافته |
| `client/src/pages/sales-invoices/SalesInvoiceEditor.tsx` | Compound component للمحرر (UI خالص) |

#### التغييرات على الملفات الموجودة
| الملف | التغيير |
|-------|---------|
| `utils.ts` | أصبح re-export خالص من `lib/invoice-lines.ts` |
| `useInvoiceLines.ts` | imports من `@/lib/invoice-lines` |
| `InvoiceLineTable.tsx` | imports من `@/lib/invoice-lines` |
| `useInvoiceForm.ts` | أضاف `InvoiceFormHandlers` type export |
| `index.tsx` | orchestrator نظيف: Router فقط |
| `components/StockStatsDialog.tsx` | re-export للمكوّن المشترك |

#### البنية الجديدة لـ index.tsx
```
SalesInvoices (index.tsx)
  ├── جميع الـ hooks (useInvoiceForm, useInvoiceLines, useAutoSave, ...)
  ├── useLoadInvoice   ← تحميل الفاتورة
  ├── useBarcodeScanner ← الباركود
  ├── إذا editId → SalesInvoiceEditor (compound component)
  └── إلا      → InvoiceRegistry (قائمة الفواتير)

SalesInvoiceEditor (SalesInvoiceEditor.tsx)
  ├── InvoiceHeaderBar
  ├── InvoiceLineTable
  ├── InvoiceTotals
  └── Dialogs (ItemFastSearch | ServiceSearchDialog | StockStatsDialog)
```

### ملاحظات مهمة
- الأخطاء في `SurgeryTypeBar.tsx` و `routes.ts` → pre-existing (ليست من هذا الـ refactor)
- `salePriceCurrent` دائماً سعر الوحدة **الكبرى**
- `db:push` يتعطل → استخدم `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` مباشرة
- Session: `req.session.userId` و `req.session.role`
- لإضافة شاشة جديدة تستخدم مخزون: استورد من `@/lib/invoice-lines` مباشرة
- StockStatsDialog المشترك: `{ open, onClose, itemName?, data, isLoading }`
