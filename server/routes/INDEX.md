# فهرس مسارات API — Server Routes Index

## الوصف
هذا المجلد يحتوي على جميع مسارات API مقسمة حسب المجال الوظيفي.
نقطة الدخول الرئيسية هي `index.ts` التي تسجّل كل المسارات.

## جدول الملفات

| الملف | الوظيفة (Purpose) |
|---|---|
| `index.ts` | نقطة الدخول — يسجّل جميع مسارات API على Express app |
| `_shared.ts` | البنية المشتركة: middleware, SSE broadcast, validation schemas |
| `_auth.ts` | Middleware التحقق من الهوية والصلاحيات (requireAuth, checkPermission) |
| `_utils.ts` | دوال مساعدة وثوابت مشتركة بين المسارات |
| `_validation.ts` | أنماط Zod للتحقق من البيانات المدخلة |
| `_sse.ts` | إدارة اتصالات Server-Sent Events |
| `auth.ts` | تسجيل الدخول، إدارة المستخدمين، الصلاحيات، الأدوار |
| `finance.ts` | Barrel: يجمع مسارات الحسابات والقيود وإعداد الحسابات |
| `accounts.ts` | CRUD دليل الحسابات، استيراد Excel |
| `account-setup.ts` | إعداد الحسابات وربط الخريطة المحاسبية |
| `journal-entries.ts` | القيود اليومية: إنشاء، ترحيل، عكس، قوالب |
| `reports.ts` | التقارير المالية: ميزان المراجعة، قائمة الدخل، الميزانية، كشف حساب |
| `inventory.ts` | Barrel: الأصناف والمخازن والتحويلات والموردين |
| `items.ts` | Barrel: يجمع items-crud و items-master |
| `items-crud.ts` | CRUD الأصناف: إنشاء، تعديل، حذف، بحث |
| `items-master.ts` | بيانات الأصناف الرئيسية: وحدات، باركود، أشكال صيدلانية |
| `warehouses.ts` | CRUD المستودعات والمخازن |
| `purchasing.ts` | Barrel: الموردين والاستلام وفواتير الشراء |
| `opening-stock.ts` | أرصدة افتتاحية للمخزون |
| `stock-count.ts` | الجرد الدوري للمخزون |
| `unit-integrity.ts` | تقرير سلامة وحدات القياس |
| `invoicing.ts` | Barrel: فواتير البيع وفواتير المرضى والخدمات |
| `services.ts` | CRUD الخدمات وقوائم الأسعار |
| `sales-invoices.ts` | فواتير المبيعات: إنشاء، تعديل، اعتماد، إلغاء |
| `patient-invoices.ts` | فواتير المرضى: إنشاء، تعديل، اعتماد، توزيع، إلغاء |
| `hospital.ts` | Barrel: الأسرّة والكاشير والغرف |
| `hospital-bedboard.ts` | لوحة الأسرة: إدخال، تحويل، خروج، محرك الإقامة |
| `hospital-cashier.ts` | الكاشير: فتح/إغلاق الوردية، التحصيل، الإيصالات |
| `hospital-rooms.ts` | إدارة الطوابق والغرف والأسرّة |
| `patients.ts` | CRUD المرضى والأطباء والإقامات |
| `admissions.ts` | إدارة الإقامات وربط الزيارات |
| `encounters.ts` | لقاءات المرضى (encounters) |
| `clinic.ts` | العيادات الخارجية: مواعيد، استشارات، طلبات |
| `clinic-intake.ts` | استقبال العيادات: قياسات حيوية، مفضلات الطبيب |
| `contracts.ts` | العقود وشركات التأمين وقواعد التغطية والمنتسبين |
| `contracts-analytics.ts` | تحليلات العقود: أعمار الذمم، الأداء، التنبيهات |
| `cashier-handover.ts` | تسليم الدرج وتقارير الورديات |
| `supplier-payments.ts` | سداد الموردين |
| `customer-payments.ts` | تحصيل الآجل من العملاء |
| `delivery-payments.ts` | تحصيل فواتير التوصيل المنزلي |
| `purchase-returns.ts` | مرتجعات المشتريات |
| `receipt-settings.ts` | إعدادات الإيصالات والطباعة |
| `shortage.ts` | كشكول النواقص (Alt+S) |
| `oversell.ts` | معالجة حالات البيع بالسالب (oversell) |
| `permission-groups.ts` | إدارة مجموعات الصلاحيات |
| `accounting-events.ts` | عرض وإعادة محاولة أحداث المحاسبة المعلّقة/الفاشلة |
| `invoice-templates.ts` | قوالب الفواتير |
| `tasks.ts` | نظام المهام الداخلية والإشعارات |
| `system.ts` | إعدادات النظام والإعلانات والمحادثات |

## Accounting Pending — المحاسبة المعلّقة

المسارات التالية تُنشئ حركات مالية لكنها تفتقر إلى ربط كامل بقيود GL:

| المسار | الوصف | الحالة |
|---|---|---|
| `patient-invoices.ts` | اعتماد الفاتورة الموحدة (consolidated finalize) — توليد القيود موجود لكن خريطة الحسابات قد تكون ناقصة | Accounting Pending |
| `supplier-payments.ts` | سداد الموردين — يولّد قيود journal لكن يحتاج مراجعة شمولية | Accounting Pending |
| `customer-payments.ts` | تحصيل الآجل — يولّد قيود لكن journal_status قد يكون 'none' في بعض الحالات | Accounting Pending |
| `delivery-payments.ts` | تحصيل التوصيل — حركة مالية بدون ربط journal كامل | Accounting Pending |
| `oversell.ts` | تسوية البيع بالسالب — تعديل مخزون بدون قيد عكسي مؤكد | Accounting Pending |
| `opening-stock.ts` | أرصدة افتتاحية — لا يولّد قيد GL تلقائي | Accounting Pending |
