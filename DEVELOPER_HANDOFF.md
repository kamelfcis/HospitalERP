# دليل تسليم المشروع — Hospital General Ledger System
## وثيقة مرجعية شاملة للمطور الجديد

**تاريخ الإعداد:** أبريل 2026  
**الإصدار:** 1.1.0  
**بيانات الدخول الافتراضية:** admin / admin123

---

## 1. نظرة عامة

نظام محاسبة مستشفيات متكامل (Hospital ERP) مبني بواجهة عربية RTL كاملة، موجّه للمستشفيات والمراكز الطبية في الشرق الأوسط. يعمل على متصفح الويب ويغطي المحاسبة المالية وإدارة المخزون والفواتير والمرضى والعيادات الخارجية.

---

## 2. حزمة التقنيات (Tech Stack)

| الطبقة | التقنية | التفاصيل |
|--------|---------|----------|
| **Frontend** | React 18 + TypeScript | Vite، Wouter (routing)، TanStack Query v5 |
| **UI Components** | shadcn/ui + Tailwind CSS | RTL كامل، A4 print styles |
| **Backend** | Node.js + Express 5 + TypeScript | |
| **Database** | PostgreSQL | Drizzle ORM + drizzle-zod |
| **Auth** | express-session + connect-pg-simple | sessions في DB |
| **Real-time** | SSE (Server-Sent Events) | للكاشير والـ Bed Board |
| **Validation** | Zod | client + server |

---

## 3. هيكل الملفات

```
/
├── client/src/
│   ├── App.tsx                   ← router كل الشاشات
│   ├── pages/                    ← 78+ شاشة
│   ├── components/               ← مكونات مشتركة
│   ├── hooks/                    ← custom hooks
│   └── lib/queryClient.ts        ← TanStack Query + apiRequest
├── server/
│   ├── routes/                   ← 151+ ملف route
│   ├── services/                 ← 12 service file
│   ├── lib/                      ← 30+ helper library
│   ├── storage.ts                ← IStorage interface (كل CRUD)
│   ├── db.ts                     ← اتصال PostgreSQL
│   └── index.ts                  ← entry point
├── shared/
│   ├── schema/                   ← 15 ملف schema منقسمين بالدومين
│   │   ├── finance.ts            ← accounts, journals, fiscal periods
│   │   ├── inventory.ts          ← items, warehouses, departments
│   │   ├── invoicing.ts          ← sales, patient invoices, services
│   │   ├── hospital.ts           ← patients, doctors, admissions, beds
│   │   ├── purchasing.ts         ← suppliers, receivings, purchase invoices
│   │   ├── contracts.ts          ← insurance contracts, claims, settlements
│   │   ├── clinic.ts             ← OPD clinics, appointments, consultations
│   │   ├── users.ts              ← users, permission groups
│   │   ├── system.ts             ← settings, tasks, announcements
│   │   ├── shortage.ts           ← shortage notebook
│   │   ├── oversell.ts           ← oversell resolution
│   │   ├── intake.ts             ← clinic intake / triage
│   │   ├── companies.ts          ← company master
│   │   └── enums.ts              ← كل الـ enums
│   ├── schema.ts                 ← re-exports كل الـ schema
│   └── permissions.ts            ← كل ثوابت الصلاحيات
└── drizzle.config.ts
```

---

## 4. قاعدة البيانات — جدول كامل بكل الجداول

### 4.1 المالية والمحاسبة (schema/finance.ts)
| الجدول | الوصف |
|--------|-------|
| `fiscal_periods` | السنوات والفترات المحاسبية |
| `cost_centers` | مراكز التكلفة مع hierarchy |
| `accounts` | شجرة الحسابات (Chart of Accounts) |
| `user_account_scopes` | ربط المستخدمين بحسابات محددة |
| `journal_templates` | قوالب القيود المحاسبية |
| `journal_entries` | رؤوس القيود (draft/posted/reversed) |
| `journal_lines` | سطور القيود (مدين/دائن) |
| `template_lines` | سطور قوالب القيود |
| `audit_log` | سجل مراجعة كل العمليات |
| `account_mappings` | ربط الأحداث المالية بالحسابات (تلقائي) |
| `accounting_event_log` | سجل أحداث المحاسبة وحالاتها |

### 4.2 المخزون (schema/inventory.ts)
| الجدول | الوصف |
|--------|-------|
| `item_form_types` | أشكال الدواء (أقراص، شراب...) |
| `item_uoms` | وحدات القياس مع سلسلة التحويل |
| `items` | كارت الصنف الرئيسي |
| `departments` | الأقسام (يعمل كـ pharmacy/clinic/etc.) |
| `user_departments` | ربط المستخدم بأقسامه |
| `user_clinics` | ربط المستخدم بعياداته |
| `item_department_prices` | أسعار الصنف لكل قسم |
| `pharmacies` | سجل الصيدليات |
| `warehouses` | المخازن |
| `user_warehouses` | ربط المستخدم بمخازنه |
| `inventory_lots` | دفعات المخزون (lot tracking) |
| `inventory_lot_movements` | حركات كل دفعة (FEFO) |
| `store_transfers` | رؤوس أوامر التحويل بين مخازن |
| `transfer_lines` | سطور التحويل |
| `transfer_line_allocations` | تخصيص دفعات للتحويل |
| `item_barcodes` | باركودات متعددة للصنف الواحد |
| `stock_movement_headers` | رؤوس جرد الحركة |
| `stock_movement_allocations` | تخصيص الجرد للدفعات |
| `stock_count_sessions` | جلسات جرد المخزون |
| `stock_count_lines` | سطور الجرد |
| `opening_stock_headers` | رؤوس الأرصدة الافتتاحية |
| `opening_stock_lines` | سطور الأرصدة الافتتاحية |

### 4.3 الفواتير والمبيعات (schema/invoicing.ts)
| الجدول | الوصف |
|--------|-------|
| `services` | الخدمات الطبية (كشف، أشعة، تحاليل...) |
| `price_lists` | قوائم الأسعار |
| `price_list_items` | بنود قوائم الأسعار |
| `price_adjustments_log` | سجل تعديلات الأسعار |
| `service_consumables` | مستلزمات الخدمة التلقائية |
| `item_consumables` | مستلزمات الصنف |
| `pharmacy_credit_customers` | عملاء الصيدلية الآجلين |
| `sales_invoice_headers` | رؤوس فواتير المبيعات |
| `sales_invoice_lines` | سطور فواتير المبيعات |
| `customer_receipts` | سندات قبض من العملاء |
| `customer_receipt_lines` | سطور سندات القبض |
| `delivery_receipts` | إيصالات التوصيل |
| `delivery_receipt_lines` | سطور إيصالات التوصيل |
| `patient_invoice_headers` | رؤوس فواتير المرضى |
| `patient_invoice_lines` | سطور فواتير المرضى |
| `patient_invoice_payments` | مدفوعات فواتير المرضى |
| `invoice_templates` | قوالب فواتير قابلة للطباعة |
| `invoice_template_lines` | سطور قوالب الفواتير |

### 4.4 المستشفى والمرضى (schema/hospital.ts)
| الجدول | الوصف |
|--------|-------|
| `patients` | ملف المريض (full_name, phone, type) |
| `patient_merge_audit` | سجل دمج ملفات المرضى المكررة |
| `patient_aliases` | الأسماء المستعارة بعد الدمج |
| `doctors` | الأطباء مع التخصص والنسبة |
| `cashier_shifts` | ورديات الكاشير |
| `cashier_transfer_log` | سجل تحويلات الكاشير |
| `cashier_receipts` | إيصالات الكاشير |
| `cashier_refund_receipts` | إيصالات استرداد الكاشير |
| `cashier_audit_log` | سجل مراجعة عمليات الكاشير |
| `surgery_types` | أنواع العمليات الجراحية |
| `surgery_category_prices` | أسعار فئات العمليات |
| `admissions` | طلبات الإدخال (الإقامة) |
| `patient_visits` | زيارات المريض (OPD/IPD) |
| `encounters` | نقطة اللقاء الموحدة (Encounter Model) |
| `visit_aggregation_cache` | cache للملخص المالي للزيارة |
| `stay_segments` | شرائح الإقامة للأسرّة (Stay Engine) |
| `floors` | الطوابق |
| `rooms` | الغرف |
| `beds` | الأسرّة |
| `doctor_transfers` | تحويلات نصيب الطبيب |
| `doctor_settlements` | تسويات أتعاب الأطباء |
| `doctor_settlement_allocations` | تخصيصات التسوية |
| `drawer_passwords` | كلمات مرور درج الكاشير |
| `treasuries` | الخزائن المالية |
| `user_treasuries` | ربط المستخدم بالخزائن |
| `treasury_transactions` | حركات الخزائن |
| `cash_transfers` | تحويلات النقدية بين الخزائن |

### 4.5 المشتريات (schema/purchasing.ts)
| الجدول | الوصف |
|--------|-------|
| `suppliers` | الموردون |
| `receiving_headers` | رؤوس أوامر الاستلام |
| `receiving_lines` | سطور الاستلام |
| `purchase_invoice_headers` | رؤوس فواتير الشراء |
| `purchase_invoice_lines` | سطور فواتير الشراء |
| `supplier_payments` | مدفوعات الموردين |
| `supplier_payment_lines` | سطور مدفوعات الموردين |
| `purchase_return_headers` | رؤوس مردودات المشتريات |
| `purchase_return_lines` | سطور مردودات المشتريات |

### 4.6 العقود والتأمين (schema/contracts.ts)
| الجدول | الوصف |
|--------|-------|
| `contracts` | العقود مع شركات التأمين |
| `contract_members` | أعضاء/مستفيدو العقد |
| `contract_coverage_rules` | قواعد التغطية (نسبة، سقف، خصومات) |
| `contract_claim_batches` | دفعات المطالبات |
| `contract_claim_lines` | بنود المطالبات |
| `contract_approvals` | الموافقات المسبقة |
| `contract_claim_settlements` | تسويات المطالبات |
| `contract_claim_settlement_lines` | سطور تسويات المطالبات |

### 4.7 العيادات الخارجية (schema/clinic.ts)
| الجدول | الوصف |
|--------|-------|
| `clinic_clinics` | العيادات (OPD) |
| `clinic_doctor_schedules` | جداول عمل الأطباء |
| `clinic_appointments` | مواعيد المرضى |
| `clinic_user_clinic_assignments` | ربط الموظفين بالعيادات |
| `clinic_user_doctor_assignments` | ربط الموظفين بالأطباء |
| `clinic_consultations` | ملف الكشف (تشخيص، روشتة) |
| `clinic_consultation_drugs` | أدوية الكشف |
| `clinic_doctor_favorite_drugs` | الأدوية المفضلة للطبيب |
| `clinic_service_doctor_prices` | أسعار خاصة لكل طبيب |
| `clinic_orders` | أوامر الطبيب للأقسام (معمل/أشعة) |

### 4.8 النظام والمستخدمون
| الجدول | الوصف |
|--------|-------|
| `users` | المستخدمون |
| `permission_groups` | مجموعات الصلاحيات |
| `group_permissions` | صلاحيات كل مجموعة |
| `role_permissions` | صلاحيات الأدوار الافتراضية |
| `user_permissions` | صلاحيات استثنائية لمستخدم |
| `system_settings` | إعدادات النظام (key-value) |
| `tasks` | المهام الداخلية |
| `task_assignees` | منسوبو المهمة |
| `task_comments` | تعليقات المهمة |
| `task_notifications` | إشعارات المهام |
| `companies` | الشركة/المستشفى الرئيسي |
| `shortage_events` | أحداث نقص المخزون |
| `shortage_agg` | تجميع سجلات النقص |
| `shortage_followups` | متابعة حالات النقص |
| `pending_stock_allocations` | تخصيصات المخزون المعلّقة (Oversell) |
| `oversell_resolution_batches` | دفعات تسوية البيع بالسالب |
| `oversell_cost_resolutions` | تسويات تكلفة البيع بالسالب |
| `clinic_visit_intake` | بيانات الاستقبال والقياسات |
| `clinic_doctor_favorites` | نصوص الطبيب المفضلة |

### 4.9 Materialized Views (تقارير)
| الـ View | الوصف |
|---------|-------|
| `rpt_patient_visit_summary` | ملخص كل زيارة مريض (لاستفسار المرضى) |
| (snapshot JSON في `patient_invoice_headers`) | لقطة القيد المالي عند الإقفال |

---

## 5. فهرس الشاشات — كل شاشة وما تفعله

### 5.1 الصفحة الرئيسية
| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/` | لوحة التحكم | — | يُعيد التوجيه لأول شاشة مناسبة حسب صلاحيات المستخدم |
| `/tasks` | المهام | — | قائمة المهام الداخلية وإنشاء/تعيين مهام |

---

### 5.2 محور المحاسبة

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/chart-of-accounts` | شجرة الحسابات | `accounts.view` | عرض وإنشاء وتعديل حسابات الموازنة العمومية بشكل شجري (أصول/خصوم/إيرادات/مصاريف) |
| `/journal-entries` | القيود المحاسبية | `journal.view` | قائمة كل القيود مع فلترة بالحالة والتاريخ |
| `/journal-entries/new` | إنشاء قيد | `journal.create` | نموذج إدخال قيد جديد مع سطور مدين/دائن وحفظ كقالب |
| `/journal-entries/:id` | عرض قيد | `journal.view` | عرض تفاصيل قيد قائم (قراءة فقط) |
| `/journal-entries/:id/edit` | تعديل قيد | `journal.edit` | تعديل قيد draft قبل الترحيل |
| `/cost-centers` | مراكز التكلفة | `cost_centers.view` | إدارة هيكل مراكز التكلفة الهرمي |
| `/fiscal-periods` | الفترات المحاسبية | `fiscal_periods.view` | فتح/إغلاق السنوات والفترات المحاسبية |
| `/templates` | قوالب القيود | `templates.view` | قوالب قيود محاسبية جاهزة للاستخدام المتكرر |
| `/invoice-templates` | قوالب الفواتير | — | تصميم قوالب طباعة الفواتير والإيصالات |
| `/account-mappings` | ربط الحسابات | `settings.account_mappings` | ربط الأحداث المالية التلقائية بالحسابات (مبيعات، مشتريات، كاشير...) |
| `/accounting-events` | أحداث المحاسبة | `journal.post` | مراجعة وإعادة معالجة القيود التلقائية الفاشلة |

---

### 5.3 التقارير المالية

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/reports/trial-balance` | ميزان المراجعة | `reports.trial_balance` | ميزان تفصيلي بكل الحسابات لأي فترة |
| `/reports/income-statement` | قائمة الدخل | `reports.income_statement` | الإيرادات والمصاريف وصافي الربح (IFRS) |
| `/reports/balance-sheet` | الميزانية العمومية | `reports.balance_sheet` | الأصول والخصوم وحقوق الملكية |
| `/reports/cost-centers` | تقرير مراكز التكلفة | `reports.cost_centers` | تحليل الإيرادات والمصاريف لكل مركز |
| `/reports/account-ledger` | كشف حساب | `reports.account_ledger` | حركة أي حساب بين تاريخين |
| `/reports/item-movement` | تقرير حركة الأصناف | `reports.account_ledger` | حركة الأصناف دخول وخروج وأرصدة |
| `/reports/warehouse-balance` | تقرير رصيد المخازن | `reports.account_ledger` | الأرصدة الحالية لكل مخزن حسب الصنف |

---

### 5.4 المخزون والمستودعات

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/items` | قائمة الأصناف | `items.view` | قائمة كل الأصناف مع بحث وفلترة |
| `/items/new` | إنشاء صنف | `items.create` | نموذج إنشاء صنف جديد مع وحدات وباركودات |
| `/items/:id` | بطاقة الصنف | `items.view` | تفاصيل صنف: معلومات، مستهلكات، مستودعات، حركة |
| `/warehouses` | المخازن | `warehouses.view` | إدارة المخازن ومحتوياتها |
| `/store-transfers` | التحويلات بين المخازن | `transfers.view` | طلبات وتنفيذ تحويل أصناف بين مخازن |
| `/transfer-preparation` | إعداد التحويل | `transfers.view` | تجهيز أوامر التحويل قبل التنفيذ |
| `/opening-stock` | الأرصدة الافتتاحية | `opening_stock.manage` | إدخال أرصدة افتتاحية للمخزون |
| `/stock-count` | جرد المخزون | `stock_count.view` | إنشاء وإدارة جلسات الجرد الدوري |
| `/stock-count/:id` | تفاصيل جلسة الجرد | `stock_count.view` | إدخال وتأكيد كميات الجرد الفعلية |
| `/shortage-notebook` | دفتر النقص | `shortage.view` | سجل حالات نقص المخزون ومتابعتها |
| `/oversell-resolution` | تسوية البيع بالسالب | `oversell.view` | حل حالات بيع أكثر من المتوفر |
| `/unit-integrity` | سلامة وحدات القياس | `items.edit` | فحص وإصلاح تعارضات وحدات القياس |

---

### 5.5 المشتريات

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/suppliers` | الموردون | `receiving.view` | قائمة وإدارة الموردين |
| `/supplier-receiving` | استلام المشتريات | `receiving.view` | تسجيل استلام بضاعة من موردين مع دفعات وتواريخ انتهاء |
| `/purchase-invoices` | فواتير الشراء | `purchase_invoices.view` | مطابقة فواتير الموردين مع أوامر الاستلام |
| `/supplier-payments` | مدفوعات الموردين | `supplier_payments.view` | تسجيل المدفوعات للموردين وإدارة أرصدتهم |
| `/purchase-returns` | مردودات المشتريات | `receiving.view` | إرجاع أصناف للموردين مع تأثيرات مخزون ومحاسبية |

---

### 5.6 المبيعات

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/sales-invoices` | فواتير المبيعات | `sales.view` | إنشاء وإدارة فواتير بيع الصيدلية والمستلزمات |
| `/sales-invoices/contract-report` | تقرير مبيعات العقود | `sales.view` | تقرير مبيعات العملاء الآجلين (عقود) |
| `/sales-returns` | مردودات المبيعات | `sales.create` | إرجاع مبيعات مع استعادة المخزون |
| `/customer-payments` | مدفوعات العملاء | `sales.view` | تحصيل مدفوعات العملاء الآجلين وكشف حساباتهم |
| `/delivery-payments` | مدفوعات التوصيل | `delivery_payment.view` | تسوية مبالغ التوصيل من موظفي التوصيل |
| `/services-pricing` | الخدمات والأسعار | `services.view` | إدارة الخدمات الطبية وقوائم الأسعار بالجملة |

---

### 5.7 المرضى والكاشير

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/patients` | قاعدة بيانات المرضى | `patients.view` | بحث وإدارة ملفات المرضى |
| `/patients/:id/file` | ملف المريض | `patients.view` | سجل كامل: فواتير، زيارات، حركات مالية، تحليل بالتصنيف |
| `/patient-inquiry` | استفسار المرضى | `patients.view` | بحث سريع بحالة الإدخالات والفواتير |
| `/duplicate-patients` | المرضى المكررون | `patients.merge` | اكتشاف ودمج الملفات المكررة |
| `/reception` | الاستقبال الموحد | `patients.view` | استقبال مريض جديد (حجز/إدخال/معمل/أشعة) في نافذة واحدة |
| `/patient-invoices` | فاتورة المريض | `patient_invoices.view` | فاتورة إقامة مريض: خدمات، أدوية، عمليات، دفعات، إقفال |
| `/cashier-collection` | شاشة الكاشير | `cashier.view` | SSE live — استلام مدفوعات فواتير المرضى، فتح/إغلاق الوردية |
| `/cashier-handover` | تسليم الكاشير | `cashier.handover_view` | تقرير تسليم نهاية الوردية مع الملخص المالي |
| `/cash-transfers` | تحويل النقدية | `cash_transfer.view` | نقل مبالغ بين الخزائن مع قيد محاسبي تلقائي |
| `/drawer-passwords` | كلمات مرور الدرج | `settings.drawer_passwords` | إعداد كلمات مرور أدراج النقود |
| `/treasuries` | الخزائن | `settings.account_mappings` | إدارة الخزائن وحساباتها في شجرة الحسابات |

---

### 5.8 المستشفى (إدخال المرضى والأسرّة)

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/bed-board` | لوحة الأسرّة | `bed_board.view` | خريطة حية للأسرّة (شاغل/متاح/محجوز) مع SSE |
| `/room-management` | إدارة الغرف | `rooms.manage` | إنشاء وتعديل الطوابق والغرف والأسرّة |
| `/surgery-types` | أنواع العمليات | `surgery_types.manage` | قائمة أنواع العمليات الجراحية وأسعار الفئات |
| `/departments` | الأقسام | `departments.view` | إدارة الأقسام الطبية وربطها بالمخازن والعيادات |

---

### 5.9 الأطباء والعيادات الخارجية

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/doctors` | الأطباء | `doctors.view` | قائمة الأطباء مع التخصص ونسبة الأتعاب |
| `/doctor-settlements` | تسويات الأطباء | `patient_invoices.view` | حساب وإقفال مستحقات الأطباء |
| `/doctor-statement/:name` | كشف حساب طبيب | `doctors.view` | تقرير مفصل بكل مستحقات طبيب محدد |
| `/clinic-booking` | حجز مواعيد | `clinic.view_own` | حجز مواعيد للمرضى في العيادات الخارجية |
| `/doctor-consultation/:id` | كشف الطبيب | `doctor.consultation` | واجهة الطبيب: تشخيص، روشتة، أوامر للأقسام |
| `/doctor-orders` | أوامر الطبيب | `doctor_orders.view` | قسم يرى أوامره المعلقة وينفذها (تحويل لفاتورة) |
| `/dept-services/:deptCode` | خدمات القسم | — | إدارة خدمات قسم معين (معمل/أشعة) |

---

### 5.10 العقود والتأمين

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/contracts` | العقود | `contracts.view` | إدارة عقود التأمين ومعايير التغطية |
| `/contract-claims` | المطالبات | `contracts.claims.view` | إنشاء ومتابعة دفعات المطالبات لشركات التأمين |
| `/approvals` | الموافقات المسبقة | `approvals.view` | طلبات الموافقة المسبقة قبل تقديم الخدمة |
| `/contracts-analytics` | تحليلات العقود | `contracts.claims.view` | لوحة تحليل: أعمار الذمم، نسب القبول، أداء العقود |

---

### 5.11 الإدارة والنظام

| URL | الشاشة | الصلاحية | ما تفعله |
|-----|--------|----------|----------|
| `/users` | المستخدمون | `users.view` | إدارة حسابات المستخدمين وربطهم بالأقسام والمخازن |
| `/permission-groups` | مجموعات الصلاحيات | `permission_groups.view` | إنشاء مجموعات صلاحيات مخصصة وتعيين أعضاء |
| `/system-settings` | إعدادات النظام | `settings.account_mappings` | إعدادات عامة: اسم المنشأة، العملة، السنة المالية |
| `/receipt-settings` | إعدادات الإيصالات | `settings.account_mappings` | تخصيص رأس وتذييل الإيصالات الحرارية |
| `/announcements` | الإعلانات | `settings.account_mappings` | إدارة الإعلانات الداخلية للمستخدمين |
| `/audit-log` | سجل المراجعة | `audit_log.view` | سجل كامل بكل عمليات المستخدمين |
| `/perf-diagnostics` | تشخيص الأداء | `settings.account_mappings` | مؤشرات أداء الـ API والـ cache (للتطوير) |

---

## 6. معمارية الـ Backend

### 6.1 تسلسل معالجة الطلب
```
HTTP Request
    ↓
Express Middleware (session, CORS, body-parser)
    ↓
checkPermission(req, "permission.code")   ← دائماً هنا لا "requirePermission"
    ↓
Zod validation (insertSchema.parse or z.object)
    ↓
storage.method() | db.select/insert/update    ← لا raw SQL إلا للضرورة
    ↓
Service layer (server/services/ أو server/lib/)
    ↓
JSON Response | ServiceError
```

### 6.2 نمط الخطأ الموحّد
```typescript
// server/lib/ لديها:
throw new ServiceError(400, "رسالة للمستخدم بالعربي");

// في الـ route:
} catch (err) {
  if (err instanceof ServiceError) {
    return res.status(err.status).json({ error: err.message });
  }
  throw err; // يمرر للـ Express error handler
}
```

### 6.3 Auth — نقاط حرجة
```typescript
// ✅ صحيح دائماً
const userId = req.session.userId;

// ❌ خطأ — لا يوجد req.user في هذا المشروع
const userId = req.user?.id;
```

### 6.4 الـ SSE (Server-Sent Events)
- `server/routes/_sse.ts` — البنية التحتية للـ SSE
- `/api/sse/pharmacy/:pharmacyId` — كاشير الصيدلية
- `/api/sse/bed-board` — لوحة الأسرّة
- يُستخدم `broadcastToPharmacy()` و `broadcastBedBoardUpdate()` من routes أخرى

### 6.5 الـ Background Workers
- `server/lib/accounting-retry-worker.ts` — يعيد محاولة القيود الفاشلة كل 5 دقائق
- `server/lib/inventory-snapshot-scheduler.ts` — يحدّث الـ materialized views
- `server/lib/rpt-refresh-orchestrator.ts` — يحدّث `rpt_patient_visit_summary` كل 15 دقيقة + cleanup يومي

---

## 7. معمارية الـ Frontend

### 7.1 Fetch + Cache
```typescript
// ✅ صحيح — الـ queryKey يُصبح URL تلقائياً بـ join("/")
useQuery({ queryKey: ["/api/items"] })
useQuery({ queryKey: ["/api/items", id] })   // → /api/items/undefined إذا id=undefined!

// ✅ للمتغيرات
useQuery({ queryKey: ["/api/items"], queryFn: () => apiRequest(`/api/items?deptId=${id}`) })

// ❌ لا تضع params كـ second array element إذا الـ default fetcher يعمل
```

### 7.2 Mutations
```typescript
import { apiRequest, queryClient } from "@/lib/queryClient";

const mutation = useMutation({
  mutationFn: (data) => apiRequest("POST", "/api/endpoint", data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/endpoint"] });
  },
});
```

### 7.3 SelectItem — قاعدة ذهبية
```tsx
// ❌ خطأ يُسبب throw في runtime
<SelectItem value="">-- اختر --</SelectItem>

// ✅ صحيح دائماً
<SelectItem value="__all__">-- الكل --</SelectItem>
<SelectItem value="__none__">-- بلا --</SelectItem>
```

### 7.4 الحسابات المالية
```typescript
// roundMoney() يعيد STRING وليس NUMBER
const result = roundMoney(price * qty);      // "123.45" ← string
const num = parseFloat(roundMoney(price * qty)); // ✅ للجمع/الطرح
```

### 7.5 أسماء أعمدة قاعدة البيانات الحرجة
```typescript
// ✅ صحيح
departments.name_ar   // وليس .name
patients.full_name    // وليس .name
```

---

## 8. نظام الصلاحيات (RBAC)

### 8.1 المبدأ
- كل مستخدم ينتمي لـ **مجموعة صلاحيات** — المجموعة هي المرجع الوحيد
- يمكن إضافة استثناءات فردية في `user_permissions`
- الصلاحيات موجودة في `shared/permissions.ts` كـ constants

### 8.2 تطبيق الصلاحية في Backend
```typescript
// في أي route
import { checkPermission } from "../routes/_shared";
checkPermission(req, "items.create");  // throws 403 إذا لم تتوفر الصلاحية
```

### 8.3 تطبيق الصلاحية في Frontend
```tsx
// App.tsx — مكوّن <G> يُغلّف كل شاشة
<Route path="/items/new">{() => <G p="items.create"><ItemCard /></G>}</Route>

// داخل المكونات
import { usePermissions } from "@/hooks/use-permissions";
const { can } = usePermissions();
if (can("items.edit")) { /* ... */ }
```

---

## 9. محرك التأمين (Encounter Model)

### 9.1 التسلسل
```
Reception → Encounter (الزيارة) → PatientInvoice (الفاتورة)
                ↓
    EncounterRoutingService يوجّه السطور:
    - OPD → فاتورة زيارة
    - IPD → فاتورة إقامة
    - DEPT_ORDER → فاتورة القسم
```

### 9.2 حياة الفاتورة
```
draft → finalized → final_closed
  ↑         ↑
  إضافة   assertInvoiceCanBeFinalized()
  خدمات   + recordFinalizeSnapshot()
```

### 9.3 قيود GL للفواتير
- **نقدي:** مدين الخزينة / دائن الإيراد
- **عقد:** مدين ذمم شركة التأمين / دائن الإيراد
- الحسابات تُحل من `account_mappings` حسب نوع الحدث والقسم

---

## 10. ما ينقص المشروع (Gaps)

### 10.1 ثغرات حرجة
| الثغرة | الوصف | الأثر |
|--------|-------|-------|
| **لا تكامل مع المعمل** | نتائج التحاليل تُدخل يدوياً، لا LIS integration | المعمل كـ "blackbox" — الأوامر تُنشأ لكن النتائج خارج النظام |
| **لا تكامل مع الأشعة** | PACS/RIS غير مربوط | نفس المعمل |
| **لا اتمتة مطالبات التأمين** | المطالبات تُنشأ في النظام لكن لا إرسال إلكتروني | يعمل manually |
| **لا automated tests** | لا Jest/Playwright/Vitest | أي تعديل يحمل خطر regression |
| **لا CI/CD pipeline** | لا GitHub Actions / deployment pipeline | deploy يدوي |

### 10.2 بيانات مفقودة / إعدادات مطلوبة
| الإعداد | الوصف |
|---------|-------|
| **Account Mappings غير مكتملة** | إذا لم يُربط نوع حدث بحساب، يفشل قيد GL ويُخزَّن في `accounting_event_log` كـ `failed` — مثال: PI-000108 فشل لأن ذمم مدينة عقد غير مضبوطة |
| **GL Account للخزينة** | كل خزينة يجب ربطها بـ `glAccountId` في إعدادات الخزائن |
| **قالب الإيصال** | يجب إعداده من `/receipt-settings` قبل الطباعة الحرارية |
| **Stay Engine segment** | `0736e5eb` يظهر كـ warning عند بدء التشغيل — سلوك متوقع ومعروف |

### 10.3 ميزات مبدوءة لكن ناقصة
| الميزة | الحالة |
|--------|--------|
| Doctor Cost Engine GL | الحساب يعمل لكن قيد GL قد يكون ناقصاً في بعض السيناريوهات |
| Pharmacy VAT | الخدمة موجودة لكن التطبيق الشامل يحتاج مراجعة |
| Duplicate Patients merger | الاكتشاف يعمل، إجراء الدمج يحتاج اختبار شامل |
| `visit_aggregation_cache` | تُستخدم كـ cache لكن invalidation logic تحتاج مراجعة |

---

## 11. دليل البدء السريع للمطور

### 11.1 متطلبات البيئة
```bash
Node.js 20+
PostgreSQL 15+
npm install
cp .env.example .env  # أضف DATABASE_URL + SESSION_SECRET
npm run db:push       # تطبيق الـ schema
npm run dev           # يشغل Backend + Frontend معاً
```

### 11.2 متغيرات البيئة المطلوبة
| المتغير | الوصف |
|---------|-------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | سر جلسات Express (عشوائي، طويل) |

### 11.3 أوامر المشروع
```bash
npm run dev        # تشغيل development
npm run build      # بناء للإنتاج
npm run db:push    # تحديث schema في DB
npm run db:studio  # Drizzle Studio (GUI للـ DB)
```

### 11.4 أين تجد ماذا
| احتجت تعديل | اذهب لـ |
|-------------|---------|
| شاشة جديدة | `client/src/pages/` + سجّل في `client/src/App.tsx` |
| API جديد | `server/routes/` + أضف في الـ register function المناسبة |
| حقل DB جديد | `shared/schema/[domain].ts` ثم `npm run db:push` |
| صلاحية جديدة | `shared/permissions.ts` + أضف لـ `permission-groups-seed.ts` |
| خدمة منطق أعمال | `server/services/` أو `server/lib/` |

---

## 12. أنماط يجب الالتزام بها

### 12.1 Backend
```typescript
// نمط Route صحيح
app.post("/api/something", async (req, res) => {
  checkPermission(req, "something.create");
  const data = schema.parse(req.body);
  const result = await storage.createSomething(data, req.session.userId!);
  res.json(result);
});

// نمط Service Error
if (!item) throw new ServiceError(404, "الصنف غير موجود");
```

### 12.2 Frontend
```typescript
// نمط Query
const { data, isLoading } = useQuery<Item[]>({
  queryKey: ["/api/items"],
});

// نمط Mutation
const { mutate, isPending } = useMutation({
  mutationFn: (data: InsertItem) => apiRequest("POST", "/api/items", data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/items"] }),
  onError: () => toast({ title: "خطأ", variant: "destructive" }),
});
```

### 12.3 قواعد SQL
```typescript
// ✅ للقوائم الديناميكية
import { sql } from "drizzle-orm";  // وليس drizzle-orm/pg-core
const result = await db.select().from(items)
  .where(sql`${items.id} = ANY(${ids})`);

// ✅ Optimistic Locking
.where(and(
  eq(table.id, id),
  eq(table.version, expectedVersion)
))
```

---

## 13. الملفات الأهم للفهم السريع

| الملف | لماذا مهم |
|-------|-----------|
| `shared/schema/enums.ts` | كل حالات النظام (status enums) |
| `shared/permissions.ts` | كل كودات الصلاحيات |
| `server/routes/index.ts` | نقطة تسجيل كل الـ routes |
| `server/lib/INDEX.md` | شرح كل library في server/lib |
| `server/lib/patient-invoice-gl-generator.ts` | أعقد منطق أعمال: توليد قيود فواتير المرضى |
| `server/services/patient-invoice-finalize-service.ts` | إقفال الفاتورة والـ snapshot |
| `server/lib/stay-engine.ts` | محرك الإقامة (أعقد ملف في المشروع) |
| `client/src/App.tsx` | كل الشاشات ومسارات التنقل |
| `client/src/lib/queryClient.ts` | إعدادات TanStack Query والـ fetcher الافتراضي |

---

## 14. ملاحظات ختامية للمطور

1. **الـ RTL ليس مجرد `dir="rtl"`** — مكونات الـ toolbar والـ pagination والـ combobox فيها CSS خاص، راجع `client/src/index.css`
2. **الـ caching طبقات متعددة** — HTTP Cache-Control + in-memory master-data-cache + TanStack Query — تأكد من invalidation عند أي mutation
3. **الأحداث المحاسبية fire-and-forget** — توليد القيود في route يكون async غير blocking، الفشل يُخزَّن في `accounting_event_log` ويُعاد تلقائياً
4. **المخزون FEFO** — أي بيع/صرف يسير حسب First Expiry First Out تلقائياً من `inventory_lots`
5. **Multi-pharmacy** — كل صيدلية عندها scope منفصل، `scope-guard.ts` يمنع تسرب البيانات بين الأقسام
6. **الـ Print styles** — استخدم class `print:` في Tailwind للشاشات القابلة للطباعة، الملفات الكبيرة فيها `A4` page classes جاهزة

---

*وثيقة تلقائية — أُعدّت من تحليل 151+ ملف route، 78+ شاشة، 15 ملف schema، 30+ library*
