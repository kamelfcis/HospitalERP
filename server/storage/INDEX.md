# فهرس طبقة التخزين — Storage Layer Index

## الوصف
هذا المجلد يحتوي على طبقة تخزين البيانات (Storage Layer).
نقطة الدخول هي `index.ts` التي تُعرّف واجهة `IStorage` وتُدمج جميع الملفات على `DatabaseStorage.prototype`.

## جدول الملفات

| الملف | الوظيفة (Purpose) |
|---|---|
| `index.ts` | Barrel: تعريف IStorage، إنشاء DatabaseStorage، دمج جميع الملفات |
| **المستخدمون والصلاحيات** | |
| `users-storage.ts` | CRUD المستخدمين، RBAC، نطاقات الأقسام/المخازن/العيادات |
| `permission-groups-storage.ts` | مجموعات الصلاحيات: CRUD، التعيين، الأعضاء |
| **المحاسبة والمالية** | |
| `finance-storage.ts` | Barrel: يجمع finance-accounts + finance-journal + finance-reports |
| `finance-accounts-storage.ts` | CRUD الحسابات، مراكز التكلفة، الفترات المالية |
| `finance-journal-storage.ts` | القيود اليومية: إنشاء، ترحيل، عكس، قوالب |
| `finance-reports-storage.ts` | التقارير المالية: ميزان المراجعة، قائمة الدخل، الميزانية |
| `sales-journal-storage.ts` | توليد قيود فواتير المبيعات |
| **الأصناف والمخزون** | |
| `items-storage.ts` | CRUD الأصناف، وحدات القياس، باركود، أشكال صيدلانية، أسعار الأقسام |
| `opening-stock-storage.ts` | أرصدة افتتاحية للمخزون |
| `stock-count-storage.ts` | الجرد الدوري |
| `item-movement-report-storage.ts` | تقرير حركة الأصناف |
| **التحويلات** | |
| `transfers-storage.ts` | Barrel: يجمع ملفات التحويلات الفرعية |
| `transfers-core-storage.ts` | إنشاء وتعديل وترحيل تحويلات المخازن |
| `transfers-inventory-storage.ts` | حركة المخزون للتحويلات (FEFO) |
| `transfers-logistics-storage.ts` | بحث وتصفية التحويلات |
| `transfers-search-storage.ts` | بحث الأصناف للتحويلات والصيدليات |
| `transfers-utils-storage.ts` | Barrel فرعي: يجمع inventory + search + logistics |
| `transfer-suggestion-storage.ts` | اقتراحات التحويل التلقائي |
| **المشتريات والموردين** | |
| `purchasing-storage.ts` | Barrel: يجمع ملفات المشتريات الفرعية |
| `purchasing-receivings-storage.ts` | استلام البضائع من الموردين |
| `purchasing-invoices-storage.ts` | Barrel: فواتير الشراء |
| `purchasing-invoices-core-storage.ts` | CRUD فواتير الشراء وتحويل الاستلام لفاتورة |
| `purchasing-invoices-journal-storage.ts` | توليد قيود فواتير الشراء |
| `purchase-returns-storage.ts` | مرتجعات المشتريات |
| `supplier-payments-storage.ts` | سداد الموردين |
| **الخدمات** | |
| `services-storage.ts` | CRUD الخدمات، قوائم الأسعار، مستهلكات الخدمات |
| **فواتير المبيعات** | |
| `sales-invoices-storage.ts` | Barrel: فواتير المبيعات |
| `sales-invoices-core-storage.ts` | CRUD فواتير المبيعات |
| `sales-invoices-finalize-storage.ts` | اعتماد فواتير المبيعات وخصم المخزون |
| **فواتير المرضى** | |
| `patient-invoices-storage.ts` | Barrel: فواتير المرضى |
| `patient-invoices-core-storage.ts` | CRUD فواتير المرضى، اعتماد، حساب نصيب الشركة/المريض |
| `patient-invoices-distribution-storage.ts` | توزيع فاتورة على عدة مرضى |
| `patient-invoices-returns-storage.ts` | مرتجعات فواتير المرضى |
| **الكاشير** | |
| `cashier-storage.ts` | دورة حياة وردية الكاشير: فتح/إغلاق/تحصيل |
| `cashier-pending.ts` | تعريف "المستند المعلّق" في نظام الكاشير |
| `cashier-handover-storage.ts` | تسليم الدرج وتقارير الورديات |
| **المرضى والأطباء** | |
| `patients-doctors-storage.ts` | CRUD المرضى والأطباء والإقامات |
| **لوحة الأسرة والإقامة** | |
| `bedboard-stay-storage.ts` | Barrel: يجمع beds + stays |
| `bedboard-beds-storage.ts` | لوحة الأسرة: عرض، إدخال، خروج، تحويل |
| `bedboard-stays-storage.ts` | مقاطع الإقامة وأنواع الجراحات |
| **الخزن والتسويات** | |
| `treasuries-storage.ts` | CRUD الخزن، حركات الخزنة، تسويات الأطباء |
| `customer-payments-storage.ts` | تحصيل الآجل من العملاء |
| `delivery-payments-storage.ts` | تحصيل فواتير التوصيل |
| **العيادات الخارجية** | |
| `clinic-storage.ts` | Barrel: يجمع ملفات العيادات الفرعية |
| `clinic-master-storage.ts` | إدارة العيادات والمواعيد والاستشارات |
| `clinic-orders-storage.ts` | طلبات العيادات والأسعار والأدوية المفضلة |
| `clinic-intake-storage.ts` | بيانات الاستقبال والقياسات الحيوية |
| `clinic-dashboard-storage.ts` | لوحات المتابعة التشغيلية (read-only) |
| **العقود والتأمين** | |
| `contracts-core-storage.ts` | CRUD العقود |
| `contracts-companies-storage.ts` | CRUD شركات التأمين |
| `contracts-rules-storage.ts` | قواعد التغطية |
| `contracts-claims-storage.ts` | دفعات المطالبات وسطورها |
| `contracts-approvals-storage.ts` | طلبات الموافقة المسبقة |
| **التقارير والمراقبة** | |
| `rpt-refresh-storage.ts` | سجل تحديث التقارير (materialized views) |
| **النواقص والتسويات** | |
| `shortage-storage.ts` | كشكول النواقص |
| `invoice-templates-storage.ts` | قوالب الفواتير |

## Accounting Pending — المحاسبة المعلّقة

| الملف | الوصف | الحالة |
|---|---|---|
| `patient-invoices-core-storage.ts` | اعتماد الفاتورة الموحدة — توليد GL موجود لكن خريطة الحسابات قد تكون ناقصة | Accounting Pending |
| `customer-payments-storage.ts` | تحصيل الآجل — قد لا يولّد قيد GL في كل الحالات | Accounting Pending |
| `delivery-payments-storage.ts` | تحصيل التوصيل — حركة مالية بدون journal كامل | Accounting Pending |
| `opening-stock-storage.ts` | أرصدة افتتاحية — لا يولّد قيد GL تلقائي | Accounting Pending |
