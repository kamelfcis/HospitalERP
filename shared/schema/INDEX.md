# فهرس مخطط قاعدة البيانات — Database Schema Index

## الوصف
هذا المجلد يحتوي على تعريفات جداول قاعدة البيانات باستخدام Drizzle ORM.
الملف الرئيسي `shared/schema.ts` (في المجلد الأب) هو Barrel يُعيد تصدير كل شيء.

## جدول الملفات

| الملف | الوظيفة (Purpose) | الجداول الرئيسية |
|---|---|---|
| `enums.ts` | تعريف الأنواع المعدّدة (pgEnum) | account_type, journal_status, admission_status, cashier_shift_status, encounter_type, encounter_status, mapping_line_type, transaction_type, user_role |
| `users.ts` | المستخدمون والصلاحيات | permission_groups, group_permissions, users, role_permissions, user_departments, user_warehouses, user_clinics, user_account_scope |
| `finance.ts` | المحاسبة والمالية (Core Accounting) | fiscal_periods, accounts, cost_centers, journal_entries, journal_lines, journal_templates, template_lines, account_mappings, audit_logs |
| `inventory.ts` | الأصناف والمخزون | item_form_types, item_uoms, departments, pharmacies, warehouses, items, item_department_prices, inventory_lots, inventory_lot_movements, item_barcodes, stock_movement_headers, stock_movement_allocations |
| `purchasing.ts` | المشتريات والموردين | suppliers, receiving_headers, receiving_lines, purchase_invoice_headers, purchase_invoice_lines |
| `invoicing.ts` | الخدمات والفواتير | services, price_lists, price_list_items, service_consumables, sales_invoice_headers, sales_invoice_lines, patient_invoice_headers, patient_invoice_lines, patient_invoice_payments, sales_return_headers, sales_return_lines |
| `hospital.ts` | المستشفى والإقامة | doctors, patients, admissions, doctor_transfers, doctor_settlements, doctor_settlement_allocations, surgery_types, surgery_category_prices, floors, rooms, beds, stay_segments, cashier_shifts, cashier_receipts, cashier_refund_receipts, drawer_passwords, treasuries, treasury_transactions, encounters |
| `system.ts` | إعدادات النظام | system_settings, announcements, chat_messages, tasks |
| `companies.ts` | شركات التأمين | companies |
| `contracts.ts` | العقود والتأمين | contracts, contract_members, coverage_rules, claim_batches, claim_lines, approval_requests |
| `clinic.ts` | العيادات الخارجية | clinic_clinics, clinic_appointments, clinic_consultations, clinic_consultation_templates, clinic_orders, doctor_favorites, doctor_favorite_drugs, clinic_intake |
| `intake.ts` | بيانات الاستقبال | clinic_intake (امتداد) |
| `shortage.ts` | كشكول النواقص | shortage_events, shortage_agg |
| `oversell.ts` | البيع بالسالب | oversell_cases |

## Accounting Pending — المحاسبة المعلّقة

الجداول التالية مرتبطة مباشرة بالمحاسبة ويجب عدم تعديلها بدون مراجعة محاسبية:

| الجدول | الملف | ملاحظة |
|---|---|---|
| `journal_entries` | `finance.ts` | Core Accounting — DO NOT MODIFY without accounting review |
| `journal_lines` | `finance.ts` | Core Accounting — DO NOT MODIFY without accounting review |
| `account_mappings` | `finance.ts` | Core Accounting — DO NOT MODIFY without accounting review |
| `accounts` | `finance.ts` | Core Accounting — DO NOT MODIFY without accounting review |
| `fiscal_periods` | `finance.ts` | Core Accounting — DO NOT MODIFY without accounting review |
| `cashier_shifts` | `hospital.ts` | مرتبط بالتحصيل والقيود — مراجعة مطلوبة عند التعديل |
| `treasury_transactions` | `hospital.ts` | حركات الخزنة — مرتبطة بالقيود |
| `claim_batches` / `claim_lines` | `contracts.ts` | مطالبات التأمين — مرتبطة بالذمم المدينة |
