# فهرس المكتبات المساعدة — Server Lib Index

## الوصف
هذا المجلد يحتوي على خدمات ودوال مساعدة مستقلة عن Express.
تُستخدم من المسارات وطبقة التخزين لتنفيذ منطق الأعمال المعقد.

## جدول الملفات

| الملف | الوظيفة (Purpose) |
|---|---|
| **البنية التحتية** | |
| `logger.ts` | Logger المركزي (pino): تسجيل آمن مع إخفاء البيانات الحساسة |
| **المحاسبة والمالية** | |
| `accounting-event-logger.ts` | سجل أحداث المحاسبة — upsert لكل حدث journal (pending/completed/failed) |
| `accounting-retry-worker.ts` | Worker خلفي لإعادة محاولة توليد القيود الفاشلة |
| `account-category-validator.ts` | قواعد التحقق من فئات الحسابات (revenue لا يُربط بـ inventory والعكس) |
| `cost-center-resolver.ts` | تحديد مركز التكلفة تلقائياً حسب القسم/المخزن |
| `doctor-cost-engine.ts` | محرك حساب تكلفة/أتعاب الطبيب |
| **المخزون** | |
| `inventory-snapshot-scheduler.ts` | جدولة تحديث لقطات المخزون (materialized views) |
| `oversell-guard.ts` | حارس منع البيع بالسالب |
| `oversell-resolution-engine.ts` | محرك تسوية حالات البيع بالسالب |
| `purchase-lot-kind.ts` | تصنيف نوع الدفعة (lot) عند الشراء |
| `warehouse-guard.ts` | التحقق من صلاحية المستخدم للمستودع |
| **العيادات والمرضى** | |
| `clinic-scope.ts` | عزل نطاق العيادات حسب صلاحيات المستخدم |
| `scope-guard.ts` | حارس نطاق الأقسام والمخازن لفاتورة المريض |
| `find-or-create-patient.ts` | البحث عن مريض أو إنشاؤه تلقائياً |
| `patient-invoice-helpers.ts` | دوال مساعدة لفواتير المرضى |
| `patient-invoice-coverage.ts` | حساب تغطية التأمين لفاتورة المريض |
| `service-price-resolver.ts` | محلّل السعر المركزي للخدمات (عقد > قائمة افتراضية > سعر أساسي) |
| `stay-engine.ts` | محرك الإقامة — بناء سطور STAY_ENGINE للأسرّة |
| **العقود والتأمين** | |
| `contract-rule-evaluator.ts` | تقييم قواعد التغطية التعاقدية لكل بند |
| `contract-approval-service.ts` | خدمة الموافقات المسبقة للعقود (آلة حالة) |
| `contract-claim-generator.ts` | مولّد مطالبات العقود تلقائياً عند اعتماد الفاتورة |
| `contract-claim-settlement-service.ts` | تسوية مطالبات التأمين وتتبع الذمم المدينة (AR) |
| `contracts-analytics-service.ts` | تحليلات العقود: أعمار ذمم، أداء، تنبيهات |
| **التقارير** | |
| `rpt-refresh-orchestrator.ts` | منسّق تحديث التقارير (materialized views) مع حماية التزامن |
| **الصلاحيات** | |
| `permission-groups-seed.ts` | بذر مجموعات الصلاحيات الافتراضية |
| **أدوات** | |
| `excel-helpers.ts` | دوال مساعدة لقراءة/كتابة ملفات Excel |
| `cashier-collection-amount.ts` | حساب مبلغ التحصيل المركزي من المريض |
| **الضرائب** | |
| `tax/pharmacy-vat-engine.ts` | محرك ضريبة القيمة المضافة للصيدلية |

## Accounting Pending — المحاسبة المعلّقة

| الملف | الوصف | الحالة |
|---|---|---|
| `accounting-retry-worker.ts` | يعيد محاولة القيود الفاشلة — يعتمد على وجود خريطة حسابات كاملة | يعمل لكن يحتاج مراجعة التغطية |
| `doctor-cost-engine.ts` | حساب تكلفة الطبيب — ربط GL قد يكون ناقصاً | Accounting Pending |
