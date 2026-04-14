# Hospital GL System — Complete Technical Context
## للمساعدة في حل المشاكل عبر ChatGPT أو أي AI

> أرسل هذا الملف كاملاً لأي AI بدون تعديل — يحتوي على كل ما يحتاجه لفهم النظام.

---

## 1. نظرة عامة على النظام

**النوع:** نظام محاسبة مستشفيات عربي RTL  
**Stack:** Node.js + Express 5 (TypeScript) + React 18 (TypeScript) + PostgreSQL + Drizzle ORM  
**المنفذ:** `npm run dev` → Express على port 5000 + Vite dev server  
**اللغة:** واجهة عربية RTL بالكامل  
**العملة:** جنيه مصري (EGP)  
**المعايير المحاسبية:** IFRS  

---

## 2. هيكل المشروع

```
/
├── server/
│   ├── index.ts              ← نقطة البداية: Express + workers
│   ├── routes/               ← 151+ ملف route
│   ├── storage/              ← طبقة قاعدة البيانات (Drizzle ORM)
│   ├── lib/                  ← خدمات مشتركة
│   └── startup/              ← كود يشتغل عند الإقلاع
├── client/src/
│   ├── pages/                ← 78+ صفحة React
│   └── components/           ← مكونات مشتركة
├── shared/
│   └── schema.ts             ← تعريف كل الجداول بـ Drizzle
└── .env                      ← DATABASE_URL, SESSION_SECRET
```

---

## 3. Authentication & Authorization

### المصادقة (Authentication)
- **نوع:** Session-based (connect-pg-simple → جدول `session` في PostgreSQL)
- **التحقق في Backend:** `req.session.userId` (ليس `req.user`)
- **كل route محمية:** إذا لا يوجد session → 401
- **المستخدم الافتراضي:** `admin` / `admin123`

### الصلاحيات (RBAC)
- **الجداول:** `users` → `permission_groups` → `group_permissions`
- **كل مستخدم له group واحد فقط**
- **التحقق في كل route:** `checkPermission(req, "permission.name")`
- **النطاق (Scope):** مستخدمون مقيدون بـ `department_id` و `warehouse_id`
- **المجموعات الافتراضية:** owner, admin, pharmacist, cashier, reception, accountant, doctor, warehouse

### جدول `users`
| العمود | النوع | الوصف |
|--------|-------|-------|
| id | varchar PK | UUID |
| username | varchar | اسم المستخدم (فريد) |
| password | varchar | مشفر (bcrypt) |
| full_name | text | الاسم الكامل |
| group_id | varchar | FK → permission_groups |
| department_id | varchar | القسم المخصص |
| warehouse_id | varchar | المخزن المخصص |
| pharmacy_id | varchar | الصيدلية المخصصة |
| is_active | boolean | نشط/موقوف |
| all_cashier_units | boolean | صلاحية كل وحدات الكاشير |

---

## 4. كل جداول قاعدة البيانات (139 جدول)

### 4.1 المحاسبة (Accounting)

#### `accounts` — شجرة الحسابات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| code | varchar(20) | رمز الحساب (فريد) |
| name | text | اسم الحساب |
| account_type | enum | asset/liability/equity/revenue/expense |
| parent_id | varchar | FK → accounts.id (شجرة) |
| level | integer | مستوى الشجرة |
| is_active | boolean | |
| requires_cost_center | boolean | يتطلب مركز تكلفة |
| opening_balance | numeric | رصيد افتتاحي |
| default_cost_center_id | varchar | FK → cost_centers |

#### `cost_centers` — مراكز التكلفة
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| code | varchar | رمز المركز |
| name | text | الاسم |
| parent_id | varchar | FK → cost_centers.id (شجرة) |
| is_active | boolean | |

#### `journal_entries` — القيود المحاسبية
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| entry_number | varchar | رقم القيد (تسلسلي) |
| entry_date | date | تاريخ القيد |
| description | text | البيان |
| status | enum | draft/posted/reversed |
| period_id | varchar | FK → fiscal_periods |
| reference | text | مرجع خارجي |
| source_type | text | نوع المصدر (invoice/receiving/...) |
| source_id | varchar | ID المصدر |
| created_by | varchar | FK → users |
| posted_by | varchar | FK → users |
| reversal_entry_id | varchar | FK → journal_entries (للعكس) |
| template_id | varchar | FK → journal_templates |

#### `journal_lines` — بنود القيود
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| journal_entry_id | varchar | FK → journal_entries |
| account_id | varchar | FK → accounts |
| cost_center_id | varchar | FK → cost_centers |
| debit | numeric | مدين |
| credit | numeric | دائن |
| description | text | البيان |

#### `fiscal_periods` — الفترات المالية
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name | text | اسم الفترة |
| start_date | date | بداية الفترة |
| end_date | date | نهاية الفترة |
| status | enum | open/closed |
| closed_by | varchar | FK → users |
| closed_at | timestamp | |

#### `account_mappings` — ربط الحسابات بالعمليات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| transaction_type | text | نوع العملية (sales/receiving/patient_invoice/...) |
| line_type | text | نوع البند (revenue/receivables/inventory/...) |
| debit_account_id | varchar | FK → accounts |
| credit_account_id | varchar | FK → accounts |
| department_id | varchar | نطاق القسم (NULL=كل الأقسام) |
| warehouse_id | varchar | نطاق المخزن |
| pharmacy_id | varchar | نطاق الصيدلية |
| is_active | boolean | |

**⚠️ مهم جداً:** إذا لم تُكوَّن account_mappings → القيود التلقائية تفشل صامتة.

#### `accounting_event_log` — سجل الأحداث المحاسبية
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| event_type | text | نوع الحدث |
| source_type | text | مصدر الحدث |
| source_id | text | ID المصدر |
| status | text | success/failed/pending |
| error_message | text | رسالة الخطأ لو فشل |
| journal_entry_id | varchar | القيد المُولَّد |
| attempt_count | integer | عدد المحاولات |
| next_retry_at | timestamp | موعد المحاولة التالية |

#### `journal_templates` — قوالب القيود
#### `audit_log` — سجل التغييرات

---

### 4.2 المخزون (Inventory)

#### `items` — الأصناف
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| code | varchar | رمز الصنف |
| name | text | الاسم العربي |
| name_en | text | الاسم الإنجليزي |
| category | text | الفئة |
| item_type | enum | medicine/supply/service/... |
| unit_major | text | الوحدة الكبيرة |
| unit_minor | text | الوحدة الصغيرة |
| conversion_factor | numeric | عامل التحويل (كبيرة ÷ صغيرة) |
| sell_price | numeric | سعر البيع (الوحدة الكبيرة) |
| min_stock | numeric | حد الطلب الدنى |
| is_active | boolean | |
| form_type_id | varchar | FK → item_form_types |
| vat_rate | numeric | نسبة الضريبة |
| requires_lot | boolean | يتطلب دفعة |
| is_controlled | boolean | دواء تحت رقابة |

#### `item_barcodes` — الباركود
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| item_id | varchar | FK → items |
| barcode | varchar | الباركود |
| unit_level | varchar | major/minor |

#### `warehouses` — المخازن
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name | text | اسم المخزن |
| name_ar | text | الاسم العربي |
| code | varchar | الرمز |
| is_active | boolean | |

#### `inventory_lots` — دفعات المخزون
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| item_id | varchar | FK → items |
| warehouse_id | varchar | FK → warehouses |
| lot_number | varchar | رقم الدفعة |
| expiry_date | date | تاريخ الانتهاء |
| quantity | numeric | الكمية المتاحة |
| cost | numeric | التكلفة لكل وحدة |
| created_at | timestamp | |

**⚠️ قاعدة FEFO:** عند السحب، دائماً الدفعة الأقرب للانتهاء تُسحب أولاً.

#### `inventory_lot_movements` — حركات الدفعات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| lot_id | varchar | FK → inventory_lots |
| warehouse_id | varchar | FK → warehouses |
| movement_type | text | receive/sale/return/transfer/adjustment |
| quantity | numeric | الكمية (موجبة أو سالبة) |
| reference_type | text | نوع المرجع |
| reference_id | varchar | ID المرجع |
| moved_at | timestamp | |

---

### 4.3 المشتريات (Purchasing)

#### `suppliers` — الموردين
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name | text | الاسم |
| code | varchar | الرمز |
| phone | text | التليفون |
| gl_account_id | varchar | حساب المورد في الدفتر |
| is_active | boolean | |

#### `receiving_headers` — رؤوس الاستلام
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| receiving_number | varchar | رقم الاستلام |
| supplier_id | varchar | FK → suppliers |
| warehouse_id | varchar | FK → warehouses |
| receiving_date | date | |
| status | enum | draft/posted |
| total_amount | numeric | |
| notes | text | |
| journal_entry_id | varchar | القيد المُولَّد |

#### `receiving_lines` — بنود الاستلام
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| header_id | varchar | FK → receiving_headers |
| item_id | varchar | FK → items |
| lot_number | varchar | رقم الدفعة |
| expiry_date | date | |
| quantity | numeric | الكمية |
| unit_cost | numeric | التكلفة لكل وحدة |
| total_cost | numeric | |
| lot_id | varchar | FK → inventory_lots (بعد الترحيل) |

#### `purchase_invoice_headers` — فواتير الشراء
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| invoice_number | varchar | |
| supplier_id | varchar | FK → suppliers |
| receiving_id | varchar | FK → receiving_headers |
| warehouse_id | varchar | FK → warehouses |
| invoice_date | date | |
| total_amount | numeric | |
| paid_amount | numeric | |
| status | enum | draft/posted/paid |
| journal_entry_id | varchar | |

#### `purchase_invoice_lines` — بنود فواتير الشراء
#### `purchase_return_headers` / `purchase_return_lines` — مردودات الشراء
#### `supplier_payments` — مدفوعات الموردين

---

### 4.4 المبيعات (Sales - Pharmacy)

#### `pharmacies` — الصيدليات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name | text | |
| name_ar | text | الاسم العربي |
| code | varchar | |
| warehouse_id | varchar | المخزن المرتبط |
| is_active | boolean | |

#### `sales_invoice_headers` — رؤوس فواتير المبيعات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| invoice_number | varchar | رقم الفاتورة |
| pharmacy_id | varchar | FK → pharmacies |
| shift_id | varchar | FK → cashier_shifts |
| customer_type | text | cash/credit |
| customer_id | varchar | FK → pharmacy_credit_customers (لو آجل) |
| status | enum | draft/finalized/cancelled |
| total_amount | numeric | |
| discount_amount | numeric | |
| net_amount | numeric | |
| paid_amount | numeric | |
| journal_entry_id | varchar | |
| invoice_date | date | |

#### `sales_invoice_lines` — بنود فواتير المبيعات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| header_id | varchar | FK → sales_invoice_headers |
| item_id | varchar | FK → items |
| lot_id | varchar | FK → inventory_lots (FEFO) |
| quantity | numeric | |
| unit_price | numeric | |
| unit_level | varchar | major/minor |
| discount_percent | numeric | |
| line_total | numeric | |

#### `sales_return_headers` / `sales_return_lines` — مردودات المبيعات
#### `pharmacy_credit_customers` — العملاء الآجلون
#### `customer_receipts` / `customer_receipt_lines` — تحصيلات العملاء

---

### 4.5 الكاشير (Cashier)

#### `cashier_shifts` — ورديات الكاشير
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| cashier_id | varchar | FK → users |
| cashier_name | text | |
| status | enum | open/closed/stale |
| opening_cash | numeric | نقدية الافتتاح |
| closing_cash | numeric | نقدية الإغلاق الفعلية |
| expected_cash | numeric | المتوقع |
| variance | numeric | الفرق |
| pharmacy_id | varchar | FK → pharmacies |
| department_id | varchar | FK → departments |
| unit_type | varchar | pharmacy/hospital |
| business_date | date | |
| opened_at | timestamp | |
| closed_at | timestamp | |

#### `cashier_receipts` — إيصالات التحصيل
#### `cashier_refund_receipts` — إيصالات الاسترداد
#### `cashier_audit_log` — سجل مراجعة الكاشير

---

### 4.6 فواتير المرضى (Patient Invoices)

#### `patients` — المرضى
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| full_name | text | **اسم العمود full_name وليس name** |
| phone | text | |
| national_id | varchar | الرقم القومي |
| date_of_birth | date | |
| gender | varchar | |
| address | text | |
| created_at | timestamp | |

#### `patient_visits` — الزيارات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| patient_id | varchar | FK → patients |
| visit_date | date | |
| visit_type | text | opd/ipd/emergency |
| department_id | varchar | FK → departments |
| status | text | active/closed |
| created_by | varchar | FK → users |

#### `encounters` — نقاط الخدمة (Encounter Model)
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| visit_id | varchar | FK → patient_visits |
| admission_id | varchar | FK → admissions |
| department_id | varchar | FK → departments |
| encounter_type | text | opd/ipd/emergency |
| status | text | active/closed |
| created_by | varchar | FK → users |

#### `patient_invoice_headers` — رؤوس فواتير المرضى
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| invoice_number | varchar | رقم الفاتورة (PI-XXXXXX) |
| patient_id | varchar | |
| patient_name | text | |
| department_id | varchar | FK → departments |
| warehouse_id | varchar | FK → warehouses |
| company_id | varchar | FK → companies (لو تأمين) |
| payment_type | varchar | CASH/CONTRACT |
| status | enum | draft/active/finalized/final_closed |
| journal_status | text | **none/pending/posted/failed** |
| total_amount | numeric | |
| patient_share | numeric | نصيب المريض |
| company_share | numeric | نصيب الشركة |
| discount_amount | numeric | |
| paid_amount | numeric | |
| remaining_amount | numeric | |
| final_closed_by | varchar | FK → users |
| final_closed_at | timestamp | |

**⚠️ المشكلة المعروفة:** 32 فاتورة بـ journal_status='none' رغم إقفالها.

#### `patient_invoice_lines` — بنود فواتير المرضى
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| header_id | varchar | FK → patient_invoice_headers |
| line_type | text | service/item/stay |
| service_id | varchar | FK → services |
| item_id | varchar | FK → items |
| quantity | numeric | |
| unit_price | numeric | |
| line_total | numeric | |
| patient_share | numeric | |
| company_share | numeric | |
| source_type | text | مصدر البند (manual/stay_engine/doctor_cost) |
| source_id | varchar | |
| voided | boolean | ملغي |
| voided_by | varchar | FK → users |

#### `patient_invoice_payments` — مدفوعات فواتير المرضى
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| header_id | varchar | FK → patient_invoice_headers |
| amount | numeric | |
| payment_method | text | cash/transfer/insurance |
| treasury_id | varchar | FK → treasuries |
| collected_by | varchar | |
| collected_at | timestamp | |

---

### 4.7 الإدخال والأسرّة (Admissions & Beds)

#### `admissions` — الإدخال
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| admission_number | varchar(30) | **تسلسل من sequence لا MAX()** |
| patient_id | varchar | FK → patients |
| patient_name | text | |
| admission_date | date | |
| discharge_date | date | |
| status | enum | active/discharged/cancelled |
| department_id | varchar | FK → departments |
| company_id | varchar | FK → companies |
| contract_id | varchar | FK → contracts |
| payment_type | varchar | CASH/CONTRACT |
| surgery_type_id | varchar | FK → surgery_types |

#### `beds` — الأسرّة
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| room_id | varchar | FK → rooms |
| bed_number | varchar(20) | |
| status | varchar(20) | EMPTY/OCCUPIED/MAINTENANCE |
| current_admission_id | varchar | FK → admissions |

#### `rooms` — الغرف
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| floor_id | varchar | FK → floors |
| room_number | varchar | |
| room_type | varchar | single/double/ward/icu |
| beds_count | integer | |

#### `floors` — الطوابق
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| department_id | varchar | FK → departments |
| floor_number | varchar | |
| name | text | |

#### `stay_segments` — أجزاء الإقامة (Stay Engine)
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| admission_id | varchar | FK → admissions |
| bed_id | varchar | FK → beds |
| room_type | varchar | |
| daily_rate | numeric | |
| start_at | timestamp | |
| end_at | timestamp | |
| status | text | **active/closed** |
| last_accrual_at | timestamp | |

**⚠️ مشكلة معروفة:** segment `0736e5eb` مجمّد (ACTIVE لكن الفاتورة ليست draft).

---

### 4.8 الأطباء (Doctors)

#### `doctors`
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name | text | اسم الطبيب |
| specialty | text | التخصص |
| payable_account_id | varchar | FK → accounts (حساب المستحقات) |
| receivable_account_id | varchar | FK → accounts (حساب الذمم) |
| is_active | boolean | |

#### `doctor_transfers` — نقل أتعاب الطبيب
#### `doctor_settlements` / `doctor_settlement_allocations` — تسويات الأطباء

---

### 4.9 العقود والتأمين (Contracts & Insurance)

#### `companies` — شركات التأمين
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name | text | |
| gl_account_id | varchar | FK → accounts (حساب الذمم) |
| is_active | boolean | |

#### `contracts` — العقود
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| company_id | varchar | FK → companies |
| name | text | |
| start_date | date | |
| end_date | date | |
| base_price_list_id | varchar | FK → price_lists |
| status | text | active/expired |

#### `contract_members` — أعضاء العقد (المرضى المؤمَّن عليهم)
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| contract_id | varchar | FK → contracts |
| patient_id | varchar | FK → patients |
| member_number | varchar | |
| coverage_percent | numeric | نسبة التغطية |

#### `contract_coverage_rules` — قواعد التغطية
#### `contract_approvals` — الموافقات المسبقة
#### `contract_claim_batches` — دفعات المطالبات
#### `contract_claim_lines` — بنود المطالبات
#### `contract_claim_settlements` — تسويات المطالبات

---

### 4.10 الخزائن (Treasuries)

#### `treasuries`
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name | text | |
| gl_account_id | varchar | FK → accounts |
| department_id | varchar | FK → departments |
| is_active | boolean | |

#### `treasury_transactions` — حركات الخزينة
#### `cash_transfers` — تحويلات نقدية بين الخزائن
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| serial_number | integer | تسلسلي |
| from_treasury_id | varchar | FK → treasuries |
| to_treasury_id | varchar | FK → treasuries |
| amount | numeric | |
| idempotency_key | varchar(100) | منع التكرار |
| journal_entry_id | varchar | القيد المُولَّد تلقائياً |

---

### 4.11 العيادات (Clinics / OPD)

#### `clinic_clinics` — العيادات
#### `clinic_appointments` — المواعيد
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| clinic_id | varchar | FK → clinic_clinics |
| doctor_id | varchar | FK → doctors |
| patient_id | varchar | FK → patients |
| appointment_date | date | |
| status | varchar | waiting/in_progress/done/cancelled |
| payment_type | varchar | CASH/CONTRACT |
| company_id | varchar | FK → companies |
| visit_id | varchar | FK → patient_visits |
| encounter_id | varchar | FK → encounters |

#### `clinic_consultations` — الكشوفات الطبية
#### `clinic_consultation_drugs` — الأدوية الموصوفة
#### `clinic_orders` — الأوامر (معمل/أشعة)
#### `clinic_doctor_schedules` — جداول الأطباء
#### `clinic_doctor_favorites` — المفضلات
#### `clinic_visit_intake` — بيانات الاستقبال

---

### 4.12 الخدمات والأسعار

#### `departments` — الأقسام
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name_ar | text | **اسم العمود name_ar وليس name** |
| code | varchar | |
| is_active | boolean | |

#### `services` — الخدمات
| العمود | النوع | ملاحظات |
|--------|-------|---------|
| id | varchar PK | UUID |
| name_ar | text | |
| code | varchar | |
| department_id | varchar | FK → departments |
| default_price | numeric | |
| is_active | boolean | |
| vat_rate | numeric | |

#### `price_lists` / `price_list_items` — قوائم الأسعار
#### `item_department_prices` — أسعار الأصناف بالقسم

---

### 4.13 جداول التقارير (rpt_* — خارج Drizzle)

> هذه الجداول تُملأ تلقائياً كل 15 دقيقة ولا تُعدَّل يدوياً.

| الجدول | المحتوى | يُحدَّث كل |
|--------|---------|------------|
| `rpt_patient_visit_summary` | ملخص الزيارة المالي | 15 دقيقة |
| `rpt_patient_visit_classification` | تصنيف الزيارات | 15 دقيقة |
| `rpt_inventory_snapshot` | لقطة المخزون الحالية | 15 دقيقة |
| `rpt_item_movements_summary` | ملخص حركة الأصناف | 15 دقيقة |
| `rpt_daily_revenue` | الإيرادات اليومية | 15 دقيقة |
| `rpt_department_activity` | نشاط الأقسام | 15 دقيقة |
| `rpt_doctor_revenue` | إيرادات الأطباء | 15 دقيقة |
| `rpt_patient_aging` | أعمار ذمم المرضى | 15 دقيقة |
| `rpt_stock_valuation` | تقييم المخزون | 15 دقيقة |
| `rpt_supplier_aging` | أعمار ذمم الموردين | 15 دقيقة |

---

### 4.14 جداول أخرى

| الجدول | الوصف |
|--------|-------|
| `announcements` | إعلانات النظام (خارج Drizzle) |
| `session` | جلسات المستخدمين (connect-pg-simple) |
| `permission_groups` | مجموعات الصلاحيات |
| `group_permissions` | صلاحيات كل مجموعة |
| `system_settings` | إعدادات النظام (key/value) |
| `task_notifications` | إشعارات المهام |
| `tasks` | المهام الداخلية |
| `chat_messages` | رسائل داخلية |
| `invoice_templates` | قوالب الفواتير |
| `surgery_types` | أنواع العمليات |
| `opening_stock_headers/lines` | مخزون الافتتاح |
| `stock_count_headers/lines` | جرد المخزون |
| `drawer_passwords` — كلمات مرور الكاشير |
| `pending_stock_allocations` | تحديدات مخزون معلقة |
| `oversell_resolution_batches/cost_resolutions` | حل البيع الزائد |
| `delivery_receipts/lines` | إيصالات التوصيل |
| `item_form_types` | أشكال الأدوية |
| `item_consumables` | مستهلكات الأصناف |
| `patient_aliases` | أسماء بديلة للمريض |

---

## 5. العلاقات الرئيسية بين الجداول

```
patients ─────────────────────────────────────────┐
    │                                              │
    ├── patient_visits                             │
    │       └── encounters                         │
    │                                              │
    ├── admissions ──── beds ──── rooms ── floors  │
    │       └── stay_segments                      │
    │                                              │
    ├── patient_invoice_headers ─── departments    │
    │       ├── patient_invoice_lines              │
    │       │       ├── services                   │
    │       │       └── items                      │
    │       └── patient_invoice_payments           │
    │               └── treasuries                 │
    │                                              │
    ├── clinic_appointments ─── clinic_clinics     │
    │       ├── clinic_consultations               │
    │       │       └── clinic_consultation_drugs  │
    │       └── clinic_orders                      │
    │                                              │
    └── contract_members ─── contracts ── companies

items ──────────────────────────────────────────────┐
    ├── inventory_lots ─── warehouses               │
    │       └── inventory_lot_movements             │
    ├── receiving_lines ─── receiving_headers       │
    │       └── suppliers                           │
    ├── sales_invoice_lines ─── sales_invoice_headers
    │       └── cashier_shifts ─── pharmacies      │
    └── patient_invoice_lines                       │

accounts (شجرة ذاتية parent_id) ──────────────────┐
    ├── journal_lines ─── journal_entries           │
    │       └── fiscal_periods                      │
    ├── account_mappings                            │
    └── accounting_event_log                        │
```

---

## 6. الأنماط التقنية المهمة

### 6.1 توليد القيود المحاسبية التلقائي
```
عملية (بيع/استلام/فاتورة مريض)
    → تبحث في account_mappings عن الحساب الصح
    → تُنشئ journal_entry + journal_lines
    → تُسجِّل في accounting_event_log
    → لو فشلت → status='failed' + يعيد المحاولة تلقائياً
```

### 6.2 نظام FEFO للمخزون
```
عند بيع صنف:
    SELECT من inventory_lots
    WHERE item_id = X AND warehouse_id = Y AND quantity > 0
    ORDER BY expiry_date ASC  ← الأقرب انتهاءً أولاً
    FOR UPDATE                ← قفل للتزامن
```

### 6.3 Stay Engine (حساب أيام الإقامة)
```
كل 5 دقايق:
    للكل segment (status='active'):
        يحسب الفرق بين last_accrual_at والآن
        يُنشئ patient_invoice_line بـ source_type='stay_engine'
        يُحدِّث last_accrual_at
```

### 6.4 SSE (إشعارات الكاشير الفورية)
```
صيدلية تُنشئ فاتورة مبيعات
    → POST /api/sales-invoices
    → Server يبث عبر SSE لكل الكاشيرات في نفس الصيدلية
    → الكاشير يستقبل الفاتورة فوراً
⚠️ لو في proxy (nginx/Apache): لازم proxy_buffering off
```

### 6.5 الـ Sequences (لمنع race conditions)
```sql
admission_number_seq    -- رقم الإدخال
journal_entry_number_seq -- رقم القيد
handover_receipt_num_seq -- إيصال التسليم
delivery_receipt_number_seq
customer_receipt_number_seq
```

---

## 7. Workers في الخلفية

| Worker | التردد | المهمة |
|--------|--------|--------|
| RPT_ORCH | كل 15 دقيقة | تحديث جداول rpt_* |
| STAY_ENGINE | كل 5 دقايق | حساب أيام الإقامة |
| ACCT_RETRY_WORKER | كل 7 دقايق | إعادة محاولة القيود الفاشلة |
| DAILY_CLEANUP | يومياً | تنظيف السجلات القديمة |

---

## 8. API Patterns

### URL Structure
```
GET    /api/[resource]          ← قائمة
GET    /api/[resource]/:id      ← تفاصيل
POST   /api/[resource]          ← إنشاء
PATCH  /api/[resource]/:id      ← تعديل
DELETE /api/[resource]/:id      ← حذف

أمثلة:
GET  /api/patient-invoices
POST /api/patient-invoices
POST /api/patient-invoices/:id/finalize
POST /api/patient-invoices/:id/final-close
```

### Request/Response
```json
// كل الطلبات تحتاج session (cookie تلقائي)
// الإجابات دائماً JSON
// الأخطاء:
{
  "error": "رسالة الخطأ بالعربي",
  "code": "ERROR_CODE"
}
```

---

## 9. أخطاء شائعة يجب تجنبها

```typescript
// ❌ خطأ — لا يوجد req.user
const userId = req.user?.id;
// ✅ الصحيح
const userId = req.session.userId;

// ❌ خطأ — query param كـ array element
useQuery({ queryKey: ["/api/items", { deptId }] })
// ✅ الصحيح
useQuery({ queryKey: ["/api/items"], queryFn: () => fetch(`/api/items?deptId=${id}`) })

// ❌ خطأ — SelectItem بدون value
<SelectItem value="">الكل</SelectItem>
// ✅ الصحيح
<SelectItem value="__all__">الكل</SelectItem>

// ❌ خطأ — roundMoney يعيد string وليس number
const total = roundMoney(a) + roundMoney(b);
// ✅ الصحيح
const total = parseFloat(roundMoney(a)) + parseFloat(roundMoney(b));

// ❌ خطأ — departments.name لا يوجد
WHERE d.name = 'قسم الطوارئ'
// ✅ الصحيح
WHERE d.name_ar = 'قسم الطوارئ'

// ❌ خطأ — patients.name لا يوجد
WHERE p.name LIKE '%أحمد%'
// ✅ الصحيح
WHERE p.full_name LIKE '%أحمد%'
```

---

## 10. المشاكل المعروفة الحالية

| # | المشكلة | التأثير | الحل |
|---|---------|---------|------|
| 1 | 32 فاتورة مريض مقفّلة بـ journal_status='none' | الميزانية ناقصة | ربط account_mappings ثم إعادة معالجة |
| 2 | PI-000108: قيد فشل (account mapping ناقص) | فاتورة واحدة بدون قيد | إضافة حساب الذمم في Account Mappings |
| 3 | stay_segment '0736e5eb' مجمّد | سرير لا يُحرَّر | تصريف المريض يدوياً |
| 4 | 3 أطباء غير مرتبطين: "د. أحمد", "د. أحمد السيد", "د. خالد" | أتعاب لا تُحسب | ربط الاسم بسجل الطبيب |

---

## 11. إعداد النظام من الصفر

```bash
# الطريقة السريعة (استيراد قاعدة بيانات كاملة):
npm install
cp .env.example .env    # ثم تعديل DATABASE_URL و SESSION_SECRET
psql $DATABASE_URL < database_export.sql
npm run dev

# الطريقة البديلة (قاعدة بيانات فارغة):
npm install
cp .env.example .env
npm run db:push                     # إنشاء الجداول عبر Drizzle
psql $DATABASE_URL < setup_manual_tables.sql  # الجداول خارج Drizzle
npm run dev
```

---

## 12. متغيرات البيئة المطلوبة

| المتغير | الوصف | مثال |
|---------|-------|-------|
| `DATABASE_URL` | رابط PostgreSQL | `postgresql://user:pass@localhost:5432/hospital_db` |
| `SESSION_SECRET` | مفتاح تشفير الجلسات | أي نص عشوائي طويل |
| `NODE_ENV` | بيئة التشغيل | `development` أو `production` |
| `PORT` | (اختياري) | `5000` |

---

*آخر تحديث: أبريل 2026 — النظام بني من الصفر بالكامل بـ TypeScript/PostgreSQL*
