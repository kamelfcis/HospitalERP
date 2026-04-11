# فهرس الـ Hooks المشتركة — Client Hooks Index

## الوصف
هذا المجلد يحتوي على React hooks مشتركة بين أكثر من صفحة.
كل hook له مسؤولية واحدة فقط.
الـ hooks الخاصة بصفحة معينة توجد داخل مجلد تلك الصفحة (مثال: `pages/cashier/hooks/`).

## جدول الملفات

| الملف | الوظيفة (Purpose) |
|---|---|
| `index.ts` | Barrel: يصدّر الـ hooks الرئيسية المشتركة |
| `use-auth.tsx` | بيانات المستخدم الحالي (session)، تسجيل الدخول/الخروج |
| `useAccounts.ts` | جلب الحسابات من API مع cache — `useAccounts()` و `useRevenueAccounts()` |
| `use-api-mutation.ts` | Wrapper مبسط لـ `useMutation` مع toast تلقائي |
| `useSSE.ts` | إدارة اتصال SSE (Server-Sent Events) مع إعادة المحاولة |
| `use-toast.ts` | إظهار رسائل النجاح والخطأ (toast notifications) |
| `use-mobile.tsx` | كشف حجم الشاشة (mobile/desktop) |
| `useDebounce.ts` | تأخير القيمة (debounce) لتقليل الطلبات |
| `useStableRequestId.ts` | توليد request ID ثابت لمنع التكرار (idempotency) |
| `use-pharmacy-mode.ts` | كشف وضع الصيدلية للمستخدم الحالي |
| `use-receipt-print.ts` | طباعة الإيصالات مع جلب الإعدادات |
| `useShortageRequest.ts` | كشكول النواقص — اختصار Alt+S لتسجيل نقص صنف |
| `use-treasury-selector.ts` | اختيار الخزنة المشترك (تحصيل آجل، سداد موردين) |

## مجلد lookups/

| الملف | الوظيفة (Purpose) |
|---|---|
| `index.ts` | Barrel: يصدّر كل lookup hooks |
| `useLookup.ts` | Hook أساسي عام لجلب بيانات lookup مع بحث وcache |
| `useAccountsLookup.ts` | Lookup الحسابات |
| `useClinicsLookup.ts` | Lookup العيادات |
| `useCostCentersLookup.ts` | Lookup مراكز التكلفة |
| `useDepartmentsLookup.ts` | Lookup الأقسام |
| `useDoctorsLookup.ts` | Lookup الأطباء |
| `useServicesLookup.ts` | Lookup الخدمات |
| `useTreasuriesLookup.ts` | Lookup الخزن |
| `usePaymentTreasuries.ts` | Lookup خزن الدفع (للتحصيل والسداد) |

## Accounting Pending — المحاسبة المعلّقة

لا توجد hooks مباشرة مسؤولة عن توليد قيود محاسبية.
المنطق المحاسبي يقع في الـ backend (server/lib/ و server/storage/).
