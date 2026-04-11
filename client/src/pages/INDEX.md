# فهرس صفحات الواجهة — Client Pages Index

## الوصف
هذا المجلد يحتوي على جميع صفحات التطبيق.
الصفحات البسيطة في ملف واحد، والمعقدة في مجلد فرعي يحتوي `components/` و `hooks/`.

## جدول الملفات والمجلدات

| الملف/المجلد | الوظيفة (Purpose) |
|---|---|
| **الرئيسية والتنقل** | |
| `Dashboard.tsx` | لوحة التحكم الرئيسية — إحصائيات عامة |
| `Login.tsx` | شاشة تسجيل الدخول |
| `not-found.tsx` | صفحة 404 |
| `PerfDiagnostics.tsx` | أدوات تشخيص الأداء |
| **المحاسبة والمالية** | |
| `chart-of-accounts/` | دليل الحسابات: شجرة، إضافة، تعديل |
| `ChartOfAccounts.tsx` | دليل الحسابات (نسخة قديمة/بديلة) |
| `journal-entry-form/` | نموذج القيد اليومي: سطور، أرصدة، قوالب |
| `JournalEntries.tsx` | قائمة القيود اليومية |
| `Templates.tsx` | قوالب القيود |
| `FiscalPeriods.tsx` | الفترات المالية |
| `TrialBalance.tsx` | ميزان المراجعة |
| `IncomeStatement.tsx` | قائمة الدخل |
| `BalanceSheet.tsx` | الميزانية العمومية |
| `CostCenters.tsx` | مراكز التكلفة |
| `CostCenterReports.tsx` | تقارير مراكز التكلفة |
| `AccountLedger.tsx` | كشف حساب |
| `AuditLog.tsx` | سجل المراجعة |
| `account-mappings/` | خريطة ربط الحسابات المحاسبية |
| `accounting-events/` | أحداث المحاسبة المعلّقة/الفاشلة |
| **الأصناف والمخزون** | |
| `ItemsList.tsx` | قائمة الأصناف |
| `item-card/` | بطاقة الصنف: بيانات، باركود، أسعار، إحصائيات |
| `Warehouses.tsx` | إدارة المستودعات |
| `store-transfers/` | تحويلات المخازن |
| `transfer-preparation/` | تحضير التحويلات |
| `opening-stock/` | أرصدة افتتاحية |
| `stock-count/` | الجرد الدوري |
| `warehouse-balance-report/` | تقرير أرصدة المستودعات |
| `item-movement-report/` | تقرير حركة الأصناف |
| `unit-integrity/` | تقرير سلامة وحدات القياس |
| `shortage-notebook/` | كشكول النواقص |
| `oversell-resolution/` | معالجة البيع بالسالب |
| **المبيعات** | |
| `sales-invoices/` | فواتير المبيعات: إنشاء، تعديل، اعتماد |
| `SalesInvoices.tsx` | فواتير المبيعات (نسخة بديلة) |
| `sales-returns/` | مرتجعات المبيعات |
| **المشتريات** | |
| `purchase-invoices/` | فواتير الشراء: محرر، سطور، إجماليات |
| `purchase-returns/` | مرتجعات المشتريات |
| `supplier-receiving/` | استلام البضائع من الموردين |
| `suppliers/` | إدارة الموردين |
| **فواتير المرضى** | |
| `patient-invoice/` | فاتورة المريض: سطور، مدفوعات، إقامات، موحدة |
| `PatientInvoice.tsx` | فاتورة المريض (wrapper) |
| `patient-file/` | ملف المريض الموحد: فواتير، مدفوعات، تاريخ، كشف حساب |
| `patient-inquiry/` | استعلام المرضى |
| **المرضى والأطباء** | |
| `patients/` | إدارة المرضى: بحث، إضافة، تعديل، عقود |
| `Doctors.tsx` | إدارة الأطباء |
| `DoctorStatement.tsx` | كشف حساب الطبيب |
| `DoctorSettlements.tsx` | تسويات الأطباء |
| `duplicate-patients/` | دمج المرضى المكررين |
| **الأقسام والخدمات** | |
| `Departments.tsx` | إدارة الأقسام |
| `dept-services/` | طلبات خدمات الأقسام |
| `services-pricing/` | تسعير الخدمات |
| `ServicesPricing.tsx` | تسعير الخدمات (نسخة بديلة) |
| **الكاشير والخزن** | |
| `cashier/` | شاشة الكاشير: وردية، تحصيل، إغلاق |
| `cashier-handover/` | تسليم الدرج وتقارير الورديات |
| `treasuries/` | إدارة الخزن وحركاتها |
| `DrawerPasswords.tsx` | كلمات سر الأدراج |
| `supplier-payments/` | سداد الموردين |
| `customer-payments/` | تحصيل الآجل |
| `delivery-payments/` | تحصيل التوصيل |
| **المستشفى** | |
| `bed-board/` | لوحة الأسرة: طوابق، غرف، إدخال، خروج |
| `reception/` | شاشة الاستقبال |
| `RoomManagement.tsx` | إدارة الغرف والطوابق |
| `SurgeryTypes.tsx` | أنواع الجراحات |
| **العيادات الخارجية** | |
| `clinic-booking/` | حجز العيادات: مواعيد، استشارات، لوحة المتابعة |
| `doctor-consultation/` | استشارة الطبيب: شكوى، تشخيص، وصفة، خدمات |
| `doctor-orders/` | طلبات الطبيب: أدوية، خدمات، تنفيذ |
| **العقود والتأمين** | |
| `contracts/` | إدارة العقود وشركات التأمين |
| `contracts-analytics/` | تحليلات العقود: ذمم، أداء، تنبيهات |
| `contract-claims/` | مطالبات التأمين وتسويتها |
| `approvals/` | الموافقات المسبقة |
| **الإعدادات والنظام** | |
| `users-management/` | إدارة المستخدمين |
| `permission-groups/` | مجموعات الصلاحيات |
| `SystemSettings.tsx` | إعدادات النظام |
| `receipt-settings/` | إعدادات الإيصالات |
| `invoice-templates/` | قوالب الفواتير |
| `announcements/` | الإعلانات |
| `tasks/` | المهام والإشعارات |

## Accounting Pending — المحاسبة المعلّقة

الشاشات التالية تتعامل مع حركات مالية لكنها تفتقر إلى ربط كامل بقيود GL:

| الشاشة | الوصف | الحالة |
|---|---|---|
| `patient-invoice/` (ConsolidatedTab) | اعتماد الفاتورة الموحدة — توليد GL موجود لكن خريطة الحسابات قد تكون ناقصة | Accounting Pending |
| `customer-payments/` | تحصيل الآجل — journal_status قد يكون 'none' | Accounting Pending |
| `delivery-payments/` | تحصيل التوصيل — لا يولّد journal في كل الحالات | Accounting Pending |
| `opening-stock/` | أرصدة افتتاحية — لا يولّد قيد GL تلقائي | Accounting Pending |
| `oversell-resolution/` | تسوية البيع بالسالب — تعديل مخزون بدون قيد عكسي مؤكد | Accounting Pending |
