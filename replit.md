# Hospital General Ledger System

## Overview
This project is an Arabic RTL web application for hospital general ledger (GL) accounting. Its primary purpose is to manage accounts, cost centers, and journal entries to generate IFRS-compliant financial reports in Egyptian Pounds (EGP). The system provides a robust, user-friendly accounting solution tailored for the healthcare sector in Arabic-speaking regions, featuring a classic accounting software UI. Key capabilities include comprehensive financial management, inventory and sales processing, patient and service invoicing, multi-pharmacy support, and advanced security and reporting. The project aims to become the leading accounting solution for healthcare providers in the Middle East.

## User Preferences
Preferred communication style: Simple, everyday language.

## آخر جلسة عمل — شاشة استعلام المرضى (Patient Inquiry)

### شاشة استعلام المرضى (`/patient-inquiry`)
**وصف**: شاشة استعلام آمنة تعرض بيانات المرضى + الخدمات + الأدوية + المستهلكات مع عزل صارم على مستوى الأقسام.

**الأمان (Server-Side Enforced)**:
- R1/R2: `forcedDeptId` دائماً من `req.user.departmentId` — لا من query params
- R3: فواتير بدون `department_id` مخفية لغير الأدمن
- R4: مطابقة المريض بـ `patient_id` أولاً ثم `patient_name` fallback
- R5: Admissions غير مدرجة لغير الأدمن (Phase 1)
- R6: HTTP 403 إذا المستخدم غير أدمن وليس له قسم

**Backend**:
- `getPatientInquiry()` في `patients-doctors-storage.ts` — CTE query مع aggregation منفصل للـ headers والـ lines
- `getPatientInquiryLines()` — بنود مريض محدد مع عزل القسم
- `GET /api/patient-inquiry` و `GET /api/patient-inquiry/lines` في `patients.ts`

**Frontend**:
- `client/src/pages/patient-inquiry/index.tsx`
- الأدمن: dropdown لاختيار القسم
- العيادات الخارجية: فلتر عيادة إضافي (`showClinicFilter` عند OPD dept)
- غير الأدمن: badge ثابت يعرض اسم قسمه فقط
- جدول مرضى مع ألوان: الباقي أحمر إذا > 0، أخضر إذا = 0
- Sheet تفاصيل مريض: 3 tabs (الخدمات / الأدوية / المستهلكات) + إجمالي كل tab

**Route**: `/patient-inquiry` — sidebar item "استعلام المرضى" بأيقونة ScanSearch

---

## جلسة سابقة — ما تم إنجازه (سجل المرضى وحجز العيادات)

### الشاشة الرئيسية: استقبال المرضى (`client/src/pages/patients/`)
**`PatientFormDialog.tsx`** — نافذة استقبال شاملة تحتوي على:
- **بيانات المريض**: حقل الاسم مع autocomplete — يبحث عن مرضى موجودين (`/api/patients?search=X`)، عند الاختيار يظهر badge بـ patientCode ويُقفل الحقول
- **نوع الدفع**: 3 أزرار (نقدي / تأمين / تعاقد) — عند تأمين يظهر حقل شركة التأمين
- **سبب الزيارة**: 4 بطاقات (كشف عيادة / تسكين / تحاليل / أشعة) — كل اختيار يكشف تفاصيل إضافية
  - كشف: بحث عيادة + أزرار سريعة من جدول العيادة + بحث حر للطبيب (fallback لعيادات بدون جدول) + تاريخ/وقت
  - تسكين: دور + غرفة + سرير (أسرة فارغة فقط) + بحث طبيب + نوع عملية
  - تحاليل/أشعة: textarea ملاحظات + إرشاد للانتقال لصفحة أوامر الخدمات
- **prop `prefilledPatient`**: عند فتحه من زر "تذكرة جديدة" يأتي مسبق الملء ببيانات المريض الموجود، ويحجز زيارة جديدة بدلاً من إنشاء مريض جديد
- **منطق الحفظ**: إذا مريض موجود → لا تنشئ patient جديد فقط استخدم الـ ID الموجود

**`types.ts`** — أُضيف:
- `PrefilledPatient` interface
- `patientCode` إلى `PatientStats`
- `prefilledPatient?` إلى `PatientFormDialogProps`
- حُذفت: `AdmissionValues`, `AdmissionSetters`, `AdmissionSectionProps`

**`patients/index.tsx`** — مبسّط:
- حُذف `NewVisitDialog` وحالة `newVisitPatient`
- `handleNewVisit` الآن يفتح `PatientFormDialog` مع `prefilledPatient`
- الزر الرئيسي أصبح "استقبال مريض"

### صفحة حجز العيادات (`client/src/pages/clinic-booking/`)
**`index.tsx`** — مبسّط:
- حُذف `BookingDialog`, `TurnReceipt`, `bookMutation`, `canBook`, `bookingOpen`
- الصفحة أصبحت للعرض وإدارة قائمة الانتظار فقط

**`QueueContent.tsx`** — حُذف زر "حجز جديد" + Props المرتبطة به
- يظهر رسالة توجيه: "لإضافة حجز جديد انتقل إلى سجل المرضى"

### ملفات محذوفة (تكرار):
- `patients/components/NewVisitDialog.tsx`
- `clinic-booking/components/BookingDialog.tsx`
- `patients/AdmissionSection.tsx`

### Backend:
- `getPatientStats` SQL: أُضيف `p.patient_code` إلى الـ SELECT

### Critical Notes للجلسة القادمة:
- **NO-TOUCH**: `server/routes/auth.ts`, `server/storage/treasuries-storage.ts`, `client/src/pages/doctor-orders/components/OrdersTable.tsx`
- عيادة الباطنة (`id: 2b11fc0b-1314-4b3d-8714-c7cbf273372c`) — لا يوجد جدول أطباء → يستخدم doctor search
- `patients.full_name` (not `name` or `nameAr`); `patient_code` format `P-00001`
- `patients/index.tsx` date filters: default `""` (empty) → LEFT JOIN = يعرض كل المرضى
- `PatientStats.patientCode` مُضاف حديثاً — متاح في الـ grid والـ prefill

## System Architecture

### Core Design
The system is a full-stack web application. The frontend uses React 18 (TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS), and the backend is built with Node.js Express 5 (TypeScript, Drizzle ORM). PostgreSQL is used as the primary data store. The application is designed for full Arabic RTL localization.

### Key Features
- **Financial Management**: Includes Chart of Accounts, Cost Centers, Journal Entries, Fiscal Period controls, and IFRS-compliant financial reports (Trial Balance, Income Statement, Balance Sheet, Cost Center Reports, Account Ledger). Supports automatic journal entry generation.
- **Inventory & Sales**: Manages Supplier Receiving, Sales Invoicing (with barcode scanning, FEFO allocation), Sales Returns, Patient Invoicing (services, drugs, consumables), Patient Admissions, and Master Data for items, patients, and doctors.
- **Services & Price Lists**: Provides CRUD for department-scoped services and price lists with inline editing and bulk adjustments.
- **Multi-Pharmacy Support**: Offers isolation for invoicing and cashier operations across multiple pharmacies.
- **Cashier & Security**: Features real-time SSE for invoice visibility, password-protected cash drawers, department-level invoice isolation, a two-stage journal entry system for sales, and robust Role-Based Access Control (RBAC).
- **Outpatient Clinic Module**: A self-contained module for clinic booking, doctor consultations (diagnosis, prescription, services), and doctor orders, integrating with sales invoices and service orders, and supporting doctor-specific pricing and clinic-scoped drug favorites.
- **Reporting & Audit**: Generates balanced financial reports, enforces RBAC, and maintains a comprehensive audit trail with strict validation.
- **User Experience**: Professional UI with a collapsible sidebar, A4 print styles, and visual auto-save indicators.
- **Department Services Orders**: A unified module for ordering medical services (lab, radiology) with single order and batch entry options, integrated with doctor orders.
- **Specialized Features**: Includes Doctor Payable Transfer, Doctor Settlement, a Stay Engine for patient accommodation, a Bed Board system with real-time updates, and a Surgery Types System.

### Technical Implementations
- **API**: RESTful JSON API.
- **ORM**: Drizzle ORM with PostgreSQL.
- **Validation**: Zod with drizzle-zod.
- **Concurrency & Idempotency**: Utilizes `FOR UPDATE` row locks, optimistic concurrency, and idempotent conversion processes.
- **Financial Accuracy**: Server-side recomputation of invoice totals with `HALF_UP` rounding.
- **System Settings**: Critical settings are cached in memory.
- **Error Handling**: Centralized Arabic error messages with specific HTTP status codes.
- **Inventory Strictness**: Enforces expired batch blocking and FEFO ordering.
- **Monitoring**: Includes slow request/query logging.
- **Backup & Restore**: Automated scripts for backup and restore.
- **Architectural Enforcement**: Uses route/finance helpers, custom frontend hooks, ESLint, and scaffold generators.
- **Stay Engine Billing Modes**: Supports `hours_24` and `hotel_noon` idempotent billing.
- **Stock Transfer Journal**: Generates a balanced journal entry inside the same DB transaction, respecting warehouse GL accounts and fiscal periods.
- **Invoice & Discharge Rules**: Enforces payment before finalization and finalized invoices before discharge, with RBAC bypass options.
- **Journal Safety Net**: Sales invoice finalization attempts journal generation within the same DB transaction, with a retry mechanism for failures.
- **HTTP Compression**: Express uses `compression` middleware.
- **Audit Trail**: Captures audit entries for critical financial and system operations.
- **Lot Recosting on Invoice Approval**: Performs final lot recosting within the same DB transaction, updating `provisionalPurchasePrice` and `costingStatus`.

## External Dependencies

### Database
- PostgreSQL
- `connect-pg-simple`

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