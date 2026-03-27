export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  ACCOUNTS_VIEW: "accounts.view",
  ACCOUNTS_CREATE: "accounts.create",
  ACCOUNTS_EDIT: "accounts.edit",
  ACCOUNTS_DELETE: "accounts.delete",

  COST_CENTERS_VIEW: "cost_centers.view",
  COST_CENTERS_CREATE: "cost_centers.create",
  COST_CENTERS_EDIT: "cost_centers.edit",
  COST_CENTERS_DELETE: "cost_centers.delete",

  JOURNAL_VIEW: "journal.view",
  JOURNAL_CREATE: "journal.create",
  JOURNAL_EDIT: "journal.edit",
  JOURNAL_POST: "journal.post",
  JOURNAL_REVERSE: "journal.reverse",

  FISCAL_PERIODS_VIEW: "fiscal_periods.view",
  FISCAL_PERIODS_MANAGE: "fiscal_periods.manage",

  TEMPLATES_VIEW: "templates.view",
  TEMPLATES_MANAGE: "templates.manage",

  ITEMS_VIEW: "items.view",
  ITEMS_CREATE: "items.create",
  ITEMS_EDIT: "items.edit",
  ITEMS_DELETE: "items.delete",

  RECEIVING_VIEW: "receiving.view",
  RECEIVING_CREATE: "receiving.create",
  RECEIVING_EDIT: "receiving.edit",
  RECEIVING_POST: "receiving.post",

  PURCHASE_INVOICES_VIEW: "purchase_invoices.view",
  PURCHASE_INVOICES_CREATE: "purchase_invoices.create",
  PURCHASE_INVOICES_EDIT: "purchase_invoices.edit",
  PURCHASE_INVOICES_APPROVE: "purchase_invoices.approve",

  TRANSFERS_VIEW: "transfers.view",
  TRANSFERS_CREATE: "transfers.create",
  TRANSFERS_EXECUTE: "transfers.execute",

  SALES_VIEW: "sales.view",
  SALES_CREATE: "sales.create",
  SALES_FINALIZE: "sales.finalize",
  SALES_REGISTRY_VIEW: "sales.registry_view",

  PATIENT_INVOICES_VIEW: "patient_invoices.view",
  PATIENT_INVOICES_CREATE: "patient_invoices.create",
  PATIENT_INVOICES_EDIT: "patient_invoices.edit",
  PATIENT_INVOICES_FINALIZE: "patient_invoices.finalize",
  PATIENT_PAYMENTS: "patient_invoices.payments",
  PATIENT_INVOICES_DISCOUNT: "patient_invoices.discount",
  PATIENT_INVOICES_TRANSFER_DOCTOR: "patient_invoices.transfer_doctor",

  DOCTOR_SETTLEMENTS_CREATE: "doctor_settlements.create",

  CASHIER_VIEW: "cashier.view",
  CASHIER_COLLECT: "cashier.collect",
  CASHIER_REFUND: "cashier.refund",
  CASHIER_VIEW_TOTALS: "cashier.view_shift_totals",
  CASHIER_ALL_UNITS: "cashier.all_units",
  CASHIER_HANDOVER_VIEW: "cashier.handover_view",

  DELIVERY_PAYMENT_VIEW:   "delivery_payment.view",
  DELIVERY_PAYMENT_MANAGE: "delivery_payment.manage",

  CREDIT_PAYMENT_VIEW:   "credit_payment.view",
  CREDIT_PAYMENT_MANAGE: "credit_payment.manage",

  SERVICES_VIEW: "services.view",
  SERVICES_MANAGE: "services.manage",

  WAREHOUSES_VIEW: "warehouses.view",
  WAREHOUSES_MANAGE: "warehouses.manage",

  DEPARTMENTS_VIEW: "departments.view",
  DEPARTMENTS_MANAGE: "departments.manage",

  PATIENTS_VIEW: "patients.view",
  PATIENTS_CREATE: "patients.create",
  PATIENTS_EDIT: "patients.edit",
  PATIENTS_MERGE: "patients.merge",

  DOCTORS_VIEW: "doctors.view",
  DOCTORS_CREATE: "doctors.create",
  DOCTORS_EDIT: "doctors.edit",

  ADMISSIONS_VIEW: "admissions.view",
  ADMISSIONS_CREATE: "admissions.create",
  ADMISSIONS_MANAGE: "admissions.manage",

  REPORTS_TRIAL_BALANCE: "reports.trial_balance",
  REPORTS_INCOME_STATEMENT: "reports.income_statement",
  REPORTS_BALANCE_SHEET: "reports.balance_sheet",
  REPORTS_COST_CENTERS: "reports.cost_centers",
  REPORTS_ACCOUNT_LEDGER: "reports.account_ledger",

  SETTINGS_ACCOUNT_MAPPINGS: "settings.account_mappings",
  SETTINGS_DRAWER_PASSWORDS: "settings.drawer_passwords",

  AUDIT_LOG_VIEW: "audit_log.view",

  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_EDIT: "users.edit",
  USERS_DELETE: "users.delete",

  // ── موديول العيادات الخارجية ──────────────────────────────────────────
  CLINIC_VIEW_ALL:       "clinic.view_all",       // admin/owner: كل العيادات
  CLINIC_VIEW_OWN:       "clinic.view_own",        // موظف استقبال: عيادته فقط
  CLINIC_BOOK:           "clinic.book",             // حجز موعد
  CLINIC_MANAGE:         "clinic.manage",           // إدارة العيادات والجداول
  DOCTOR_CONSULTATION:   "doctor.consultation",     // كتابة كشف وروشتة
  DOCTOR_VIEW_STATEMENT: "doctor.view_statement",   // الطبيب يرى كشف حسابه
  DOCTOR_ORDERS_VIEW:    "doctor_orders.view",      // قسم يرى أوامره
  DOCTOR_ORDERS_EXECUTE: "doctor_orders.execute",   // تنفيذ أمر → فاتورة
  PHARMACY_DRUG_ORDERS:  "clinic.pharmacy_orders",  // الصيدلاني يرى أوامر الأدوية
  // ── استقبال وقياسات ───────────────────────────────────────────────────
  CLINIC_INTAKE_VIEW:    "clinic.intake.view",    // عرض بيانات الاستقبال والقياسات
  CLINIC_INTAKE_MANAGE:  "clinic.intake.manage",  // تسجيل/تعديل الاستقبال (استقبال / تمريض)
  CLINIC_FAVORITES_MANAGE: "clinic.favorites.manage", // حفظ وإدارة النصوص المفضلة للطبيب

  // ── خدمات الأقسام (معمل / أشعة) ──────────────────────────────────────
  DEPT_SERVICES_CREATE:  "dept_services.create",
  DEPT_SERVICES_BATCH:   "dept_services.batch",
  DEPT_SERVICES_DISCOUNT: "dept_services.discount",

  // ── جرد الأصناف ────────────────────────────────────────────────────────
  STOCK_COUNT_VIEW:   "stock_count.view",
  STOCK_COUNT_CREATE: "stock_count.create",
  STOCK_COUNT_POST:   "stock_count.post",

  // ── مجموعات الصلاحيات ─────────────────────────────────────────────────
  PERMISSION_GROUPS_VIEW:   "permission_groups.view",
  PERMISSION_GROUPS_MANAGE: "permission_groups.manage",

  // ── فواتير: موافقة سعر الصفر ──────────────────────────────────────────
  INVOICE_APPROVE_ZERO_PRICE: "invoice.approve_zero_price",

  // ── موديول العقود والشركات ─────────────────────────────────────────────
  CONTRACTS_VIEW:          "contracts.view",          // عرض الشركات والعقود والمنتسبين
  CONTRACTS_MANAGE:        "contracts.manage",        // إنشاء/تعديل/إلغاء تفعيل
  CONTRACTS_CLAIMS_VIEW:   "contracts.claims.view",   // عرض دفعات المطالبات وسطورها
  CONTRACTS_CLAIMS_MANAGE: "contracts.claims.manage", // إرسال / قبول / رفض المطالبات
  CONTRACTS_CLAIMS_SETTLE: "contracts.claims.settle", // تسوية دفعة مطالبة (قيد محاسبي)
  // Phase 4 — Approval Workflow
  APPROVALS_VIEW:          "approvals.view",          // عرض طلبات الموافقة المسبقة
  APPROVALS_MANAGE:        "approvals.manage",        // قبول / رفض طلبات الموافقة
  APPROVALS_OVERRIDE:      "approvals.override",      // تجاوز القيود (بعد اعتماد الفاتورة)
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_LABELS: Record<string, string> = {
  owner: "أونر",
  admin: "أدمن",
  accounts_manager: "مدير حسابات",
  purchase_manager: "مدير مشتريات",
  data_entry: "مدخل بيانات",
  pharmacist: "صيدلي",
  pharmacy_assistant: "مساعد صيدلي",
  warehouse_assistant: "مساعد مخزن",
  cashier: "كاشير",
  department_admin: "إداري قسم",
  reception: "استقبال",
  doctor: "طبيب",
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ACCOUNTS_VIEW,
    PERMISSIONS.COST_CENTERS_VIEW,
    PERMISSIONS.JOURNAL_VIEW,
    PERMISSIONS.FISCAL_PERIODS_VIEW,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.RECEIVING_VIEW,
    PERMISSIONS.PURCHASE_INVOICES_VIEW,
    PERMISSIONS.TRANSFERS_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_REGISTRY_VIEW,
    PERMISSIONS.PATIENT_INVOICES_VIEW,
    PERMISSIONS.PATIENT_INVOICES_DISCOUNT,
    PERMISSIONS.CASHIER_VIEW,
    PERMISSIONS.CASHIER_VIEW_TOTALS,
    PERMISSIONS.CASHIER_HANDOVER_VIEW,
    PERMISSIONS.DELIVERY_PAYMENT_VIEW,
    PERMISSIONS.DELIVERY_PAYMENT_MANAGE,
    PERMISSIONS.CREDIT_PAYMENT_VIEW,
    PERMISSIONS.CREDIT_PAYMENT_MANAGE,
    PERMISSIONS.SERVICES_VIEW,
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.DEPARTMENTS_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.DOCTORS_VIEW,
    PERMISSIONS.ADMISSIONS_VIEW,
    PERMISSIONS.REPORTS_TRIAL_BALANCE,
    PERMISSIONS.REPORTS_INCOME_STATEMENT,
    PERMISSIONS.REPORTS_BALANCE_SHEET,
    PERMISSIONS.REPORTS_COST_CENTERS,
    PERMISSIONS.REPORTS_ACCOUNT_LEDGER,
    PERMISSIONS.AUDIT_LOG_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.CLINIC_VIEW_ALL,
    PERMISSIONS.CLINIC_BOOK,
    PERMISSIONS.CLINIC_MANAGE,
    PERMISSIONS.DOCTOR_CONSULTATION,
    PERMISSIONS.DOCTOR_VIEW_STATEMENT,
    PERMISSIONS.DOCTOR_ORDERS_VIEW,
    PERMISSIONS.DOCTOR_ORDERS_EXECUTE,
    PERMISSIONS.PHARMACY_DRUG_ORDERS,
    PERMISSIONS.CLINIC_INTAKE_VIEW,
    PERMISSIONS.CLINIC_INTAKE_MANAGE,
    PERMISSIONS.CLINIC_FAVORITES_MANAGE,
    PERMISSIONS.DEPT_SERVICES_CREATE,
    PERMISSIONS.DEPT_SERVICES_BATCH,
    PERMISSIONS.DEPT_SERVICES_DISCOUNT,
    PERMISSIONS.STOCK_COUNT_VIEW,
    PERMISSIONS.STOCK_COUNT_CREATE,
    PERMISSIONS.STOCK_COUNT_POST,
    PERMISSIONS.PERMISSION_GROUPS_VIEW,
    PERMISSIONS.PERMISSION_GROUPS_MANAGE,
    PERMISSIONS.INVOICE_APPROVE_ZERO_PRICE,
    PERMISSIONS.CONTRACTS_VIEW,
    PERMISSIONS.CONTRACTS_MANAGE,
  ],

  admin: Object.values(PERMISSIONS),

  accounts_manager: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ACCOUNTS_VIEW,
    PERMISSIONS.ACCOUNTS_CREATE,
    PERMISSIONS.ACCOUNTS_EDIT,
    PERMISSIONS.ACCOUNTS_DELETE,
    PERMISSIONS.COST_CENTERS_VIEW,
    PERMISSIONS.COST_CENTERS_CREATE,
    PERMISSIONS.COST_CENTERS_EDIT,
    PERMISSIONS.COST_CENTERS_DELETE,
    PERMISSIONS.JOURNAL_VIEW,
    PERMISSIONS.JOURNAL_CREATE,
    PERMISSIONS.JOURNAL_EDIT,
    PERMISSIONS.JOURNAL_POST,
    PERMISSIONS.JOURNAL_REVERSE,
    PERMISSIONS.FISCAL_PERIODS_VIEW,
    PERMISSIONS.FISCAL_PERIODS_MANAGE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_REGISTRY_VIEW,
    PERMISSIONS.CREDIT_PAYMENT_VIEW,
    PERMISSIONS.CREDIT_PAYMENT_MANAGE,
    PERMISSIONS.REPORTS_TRIAL_BALANCE,
    PERMISSIONS.REPORTS_INCOME_STATEMENT,
    PERMISSIONS.REPORTS_BALANCE_SHEET,
    PERMISSIONS.REPORTS_COST_CENTERS,
    PERMISSIONS.REPORTS_ACCOUNT_LEDGER,
    PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS,
    PERMISSIONS.AUDIT_LOG_VIEW,
  ],

  purchase_manager: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.ITEMS_CREATE,
    PERMISSIONS.ITEMS_EDIT,
    PERMISSIONS.RECEIVING_VIEW,
    PERMISSIONS.RECEIVING_CREATE,
    PERMISSIONS.RECEIVING_EDIT,
    PERMISSIONS.RECEIVING_POST,
    PERMISSIONS.PURCHASE_INVOICES_VIEW,
    PERMISSIONS.PURCHASE_INVOICES_CREATE,
    PERMISSIONS.PURCHASE_INVOICES_EDIT,
    PERMISSIONS.PURCHASE_INVOICES_APPROVE,
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.TRANSFERS_VIEW,
    PERMISSIONS.TRANSFERS_CREATE,
    PERMISSIONS.TRANSFERS_EXECUTE,
    PERMISSIONS.STOCK_COUNT_VIEW,
    PERMISSIONS.STOCK_COUNT_CREATE,
    PERMISSIONS.STOCK_COUNT_POST,
  ],

  data_entry: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.ITEMS_CREATE,
    PERMISSIONS.ITEMS_EDIT,
    PERMISSIONS.PURCHASE_INVOICES_VIEW,
    PERMISSIONS.PURCHASE_INVOICES_EDIT,
    PERMISSIONS.RECEIVING_VIEW,
    PERMISSIONS.RECEIVING_EDIT,
  ],

  pharmacist: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_FINALIZE,
    PERMISSIONS.CREDIT_PAYMENT_VIEW,
    PERMISSIONS.CREDIT_PAYMENT_MANAGE,
    PERMISSIONS.PATIENT_INVOICES_VIEW,
    PERMISSIONS.PATIENT_INVOICES_CREATE,
    PERMISSIONS.PATIENT_INVOICES_EDIT,
    PERMISSIONS.PATIENT_INVOICES_FINALIZE,
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.PHARMACY_DRUG_ORDERS,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.DOCTORS_VIEW,
  ],

  pharmacy_assistant: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.TRANSFERS_VIEW,
    PERMISSIONS.TRANSFERS_CREATE,
    PERMISSIONS.TRANSFERS_EXECUTE,
    PERMISSIONS.WAREHOUSES_VIEW,
  ],

  warehouse_assistant: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.ITEMS_CREATE,
    PERMISSIONS.ITEMS_EDIT,
    PERMISSIONS.RECEIVING_VIEW,
    PERMISSIONS.RECEIVING_CREATE,
    PERMISSIONS.RECEIVING_EDIT,
    PERMISSIONS.RECEIVING_POST,
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.TRANSFERS_VIEW,
    PERMISSIONS.STOCK_COUNT_VIEW,
    PERMISSIONS.STOCK_COUNT_CREATE,
    PERMISSIONS.STOCK_COUNT_POST,
  ],

  cashier: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CASHIER_VIEW,
    PERMISSIONS.CASHIER_COLLECT,
    PERMISSIONS.CASHIER_REFUND,
    PERMISSIONS.CASHIER_VIEW_TOTALS,
    PERMISSIONS.CASHIER_HANDOVER_VIEW,
    PERMISSIONS.DELIVERY_PAYMENT_VIEW,
    PERMISSIONS.DELIVERY_PAYMENT_MANAGE,
  ],

  department_admin: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENT_INVOICES_VIEW,
    PERMISSIONS.PATIENT_INVOICES_CREATE,
    PERMISSIONS.PATIENT_INVOICES_EDIT,
    PERMISSIONS.PATIENT_INVOICES_FINALIZE,
    PERMISSIONS.PATIENT_PAYMENTS,
    PERMISSIONS.ADMISSIONS_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.DOCTORS_VIEW,
    PERMISSIONS.SERVICES_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.DOCTOR_ORDERS_VIEW,
    PERMISSIONS.DOCTOR_ORDERS_EXECUTE,
    PERMISSIONS.DEPT_SERVICES_CREATE,
    PERMISSIONS.DEPT_SERVICES_BATCH,
    PERMISSIONS.DEPT_SERVICES_DISCOUNT,
  ],

  reception: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.PATIENTS_CREATE,
    PERMISSIONS.PATIENTS_EDIT,
    PERMISSIONS.DOCTORS_VIEW,
    PERMISSIONS.DOCTORS_CREATE,
    PERMISSIONS.DOCTORS_EDIT,
    PERMISSIONS.ADMISSIONS_VIEW,
    PERMISSIONS.ADMISSIONS_CREATE,
    PERMISSIONS.ADMISSIONS_MANAGE,
    PERMISSIONS.CLINIC_VIEW_OWN,
    PERMISSIONS.CLINIC_BOOK,
    PERMISSIONS.CLINIC_INTAKE_VIEW,
    PERMISSIONS.CLINIC_INTAKE_MANAGE,
  ],

  doctor: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.DOCTORS_VIEW,
    PERMISSIONS.ADMISSIONS_VIEW,
    PERMISSIONS.SERVICES_VIEW,
    PERMISSIONS.ITEMS_VIEW,
    PERMISSIONS.DOCTOR_CONSULTATION,
    PERMISSIONS.DOCTOR_VIEW_STATEMENT,
    PERMISSIONS.CLINIC_INTAKE_VIEW,
    PERMISSIONS.CLINIC_FAVORITES_MANAGE,
  ],
};

export const PERMISSION_GROUPS: { label: string; permissions: { key: string; label: string }[] }[] = [
  {
    label: "لوحة التحكم",
    permissions: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: "عرض لوحة التحكم" },
    ],
  },
  {
    label: "دليل الحسابات",
    permissions: [
      { key: PERMISSIONS.ACCOUNTS_VIEW, label: "عرض" },
      { key: PERMISSIONS.ACCOUNTS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.ACCOUNTS_EDIT, label: "تعديل" },
      { key: PERMISSIONS.ACCOUNTS_DELETE, label: "حذف" },
    ],
  },
  {
    label: "القيود اليومية",
    permissions: [
      { key: PERMISSIONS.JOURNAL_VIEW, label: "عرض" },
      { key: PERMISSIONS.JOURNAL_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.JOURNAL_EDIT, label: "تعديل" },
      { key: PERMISSIONS.JOURNAL_POST, label: "ترحيل" },
      { key: PERMISSIONS.JOURNAL_REVERSE, label: "عكس" },
    ],
  },
  {
    label: "مراكز التكلفة",
    permissions: [
      { key: PERMISSIONS.COST_CENTERS_VIEW, label: "عرض" },
      { key: PERMISSIONS.COST_CENTERS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.COST_CENTERS_EDIT, label: "تعديل" },
      { key: PERMISSIONS.COST_CENTERS_DELETE, label: "حذف" },
    ],
  },
  {
    label: "الفترات المحاسبية",
    permissions: [
      { key: PERMISSIONS.FISCAL_PERIODS_VIEW, label: "عرض" },
      { key: PERMISSIONS.FISCAL_PERIODS_MANAGE, label: "إدارة" },
    ],
  },
  {
    label: "نماذج القيود",
    permissions: [
      { key: PERMISSIONS.TEMPLATES_VIEW, label: "عرض" },
      { key: PERMISSIONS.TEMPLATES_MANAGE, label: "إدارة" },
    ],
  },
  {
    label: "الأصناف",
    permissions: [
      { key: PERMISSIONS.ITEMS_VIEW, label: "عرض" },
      { key: PERMISSIONS.ITEMS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.ITEMS_EDIT, label: "تعديل" },
      { key: PERMISSIONS.ITEMS_DELETE, label: "حذف" },
    ],
  },
  {
    label: "استلام من مورد",
    permissions: [
      { key: PERMISSIONS.RECEIVING_VIEW, label: "عرض" },
      { key: PERMISSIONS.RECEIVING_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.RECEIVING_EDIT, label: "تعديل" },
      { key: PERMISSIONS.RECEIVING_POST, label: "ترحيل" },
    ],
  },
  {
    label: "فواتير الشراء",
    permissions: [
      { key: PERMISSIONS.PURCHASE_INVOICES_VIEW, label: "عرض" },
      { key: PERMISSIONS.PURCHASE_INVOICES_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.PURCHASE_INVOICES_EDIT, label: "تعديل" },
      { key: PERMISSIONS.PURCHASE_INVOICES_APPROVE, label: "اعتماد" },
    ],
  },
  {
    label: "التحويلات المخزنية",
    permissions: [
      { key: PERMISSIONS.TRANSFERS_VIEW, label: "عرض" },
      { key: PERMISSIONS.TRANSFERS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.TRANSFERS_EXECUTE, label: "تنفيذ" },
    ],
  },
  {
    label: "فواتير البيع",
    permissions: [
      { key: PERMISSIONS.SALES_VIEW, label: "عرض" },
      { key: PERMISSIONS.SALES_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.SALES_FINALIZE, label: "اعتماد" },
      { key: PERMISSIONS.SALES_REGISTRY_VIEW, label: "عرض قائمة الفواتير" },
    ],
  },
  {
    label: "فواتير المرضى",
    permissions: [
      { key: PERMISSIONS.PATIENT_INVOICES_VIEW, label: "عرض" },
      { key: PERMISSIONS.PATIENT_INVOICES_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.PATIENT_INVOICES_EDIT, label: "تعديل" },
      { key: PERMISSIONS.PATIENT_INVOICES_FINALIZE, label: "اعتماد" },
      { key: PERMISSIONS.PATIENT_PAYMENTS, label: "مدفوعات" },
      { key: PERMISSIONS.PATIENT_INVOICES_DISCOUNT, label: "خصم على الفاتورة" },
      { key: PERMISSIONS.PATIENT_INVOICES_TRANSFER_DOCTOR, label: "تحويل مستحقات طبيب" },
    ],
  },
  {
    label: "تسويات الأطباء",
    permissions: [
      { key: PERMISSIONS.DOCTOR_SETTLEMENTS_CREATE, label: "إنشاء تسوية" },
    ],
  },
  {
    label: "الكاشير",
    permissions: [
      { key: PERMISSIONS.CASHIER_VIEW, label: "عرض" },
      { key: PERMISSIONS.CASHIER_COLLECT, label: "تحصيل" },
      { key: PERMISSIONS.CASHIER_REFUND, label: "مرتجع" },
      { key: PERMISSIONS.CASHIER_VIEW_TOTALS, label: "عرض ملخص الوردية" },
      { key: PERMISSIONS.CASHIER_HANDOVER_VIEW, label: "تقرير تسليم الدرج" },
    ],
  },
  {
    label: "تحصيل التوصيل المنزلي",
    permissions: [
      { key: PERMISSIONS.DELIVERY_PAYMENT_VIEW,   label: "عرض" },
      { key: PERMISSIONS.DELIVERY_PAYMENT_MANAGE, label: "تحصيل" },
    ],
  },
  {
    label: "تحصيل الآجل",
    permissions: [
      { key: PERMISSIONS.CREDIT_PAYMENT_VIEW,   label: "عرض" },
      { key: PERMISSIONS.CREDIT_PAYMENT_MANAGE, label: "تحصيل" },
    ],
  },
  {
    label: "الخدمات والأسعار",
    permissions: [
      { key: PERMISSIONS.SERVICES_VIEW, label: "عرض" },
      { key: PERMISSIONS.SERVICES_MANAGE, label: "إدارة" },
    ],
  },
  {
    label: "المخازن",
    permissions: [
      { key: PERMISSIONS.WAREHOUSES_VIEW, label: "عرض" },
      { key: PERMISSIONS.WAREHOUSES_MANAGE, label: "إدارة" },
    ],
  },
  {
    label: "الأقسام",
    permissions: [
      { key: PERMISSIONS.DEPARTMENTS_VIEW, label: "عرض" },
      { key: PERMISSIONS.DEPARTMENTS_MANAGE, label: "إدارة" },
    ],
  },
  {
    label: "المرضى",
    permissions: [
      { key: PERMISSIONS.PATIENTS_VIEW, label: "عرض" },
      { key: PERMISSIONS.PATIENTS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.PATIENTS_EDIT, label: "تعديل" },
      { key: PERMISSIONS.PATIENTS_MERGE, label: "دمج المرضى" },
    ],
  },
  {
    label: "الأطباء",
    permissions: [
      { key: PERMISSIONS.DOCTORS_VIEW, label: "عرض" },
      { key: PERMISSIONS.DOCTORS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.DOCTORS_EDIT, label: "تعديل" },
    ],
  },
  {
    label: "حالات الدخول",
    permissions: [
      { key: PERMISSIONS.ADMISSIONS_VIEW, label: "عرض" },
      { key: PERMISSIONS.ADMISSIONS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.ADMISSIONS_MANAGE, label: "إدارة" },
    ],
  },
  {
    label: "التقارير",
    permissions: [
      { key: PERMISSIONS.REPORTS_TRIAL_BALANCE, label: "ميزان المراجعة" },
      { key: PERMISSIONS.REPORTS_INCOME_STATEMENT, label: "قائمة الدخل" },
      { key: PERMISSIONS.REPORTS_BALANCE_SHEET, label: "الميزانية" },
      { key: PERMISSIONS.REPORTS_COST_CENTERS, label: "تقارير مراكز التكلفة" },
      { key: PERMISSIONS.REPORTS_ACCOUNT_LEDGER, label: "كشف حساب" },
    ],
  },
  {
    label: "النظام",
    permissions: [
      { key: PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS, label: "ربط الحسابات" },
      { key: PERMISSIONS.SETTINGS_DRAWER_PASSWORDS, label: "كلمات سر الخزن" },
      { key: PERMISSIONS.AUDIT_LOG_VIEW, label: "سجل التدقيق" },
    ],
  },
  {
    label: "المستخدمين",
    permissions: [
      { key: PERMISSIONS.USERS_VIEW, label: "عرض" },
      { key: PERMISSIONS.USERS_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.USERS_EDIT, label: "تعديل" },
      { key: PERMISSIONS.USERS_DELETE, label: "حذف" },
    ],
  },
  {
    label: "العيادات الخارجية",
    permissions: [
      { key: PERMISSIONS.CLINIC_VIEW_ALL,       label: "عرض كل العيادات" },
      { key: PERMISSIONS.CLINIC_VIEW_OWN,        label: "عرض عيادته" },
      { key: PERMISSIONS.CLINIC_BOOK,            label: "حجز مواعيد" },
      { key: PERMISSIONS.CLINIC_MANAGE,          label: "إدارة العيادات" },
      { key: PERMISSIONS.DOCTOR_CONSULTATION,    label: "كتابة كشف وروشتة" },
      { key: PERMISSIONS.DOCTOR_VIEW_STATEMENT,  label: "كشف حساب الطبيب" },
      { key: PERMISSIONS.DOCTOR_ORDERS_VIEW,     label: "عرض الأوامر الطبية" },
      { key: PERMISSIONS.DOCTOR_ORDERS_EXECUTE,  label: "تنفيذ الأوامر" },
      { key: PERMISSIONS.PHARMACY_DRUG_ORDERS,   label: "أوامر الأدوية للصيدلية" },
      { key: PERMISSIONS.CLINIC_INTAKE_VIEW,     label: "عرض بيانات الاستقبال" },
      { key: PERMISSIONS.CLINIC_INTAKE_MANAGE,   label: "تسجيل/تعديل الاستقبال" },
      { key: PERMISSIONS.CLINIC_FAVORITES_MANAGE, label: "إدارة النصوص المفضلة" },
    ],
  },
  {
    label: "خدمات الأقسام (معمل/أشعة)",
    permissions: [
      { key: PERMISSIONS.DEPT_SERVICES_CREATE,  label: "إنشاء طلب خدمة" },
      { key: PERMISSIONS.DEPT_SERVICES_BATCH,   label: "إدخال جماعي" },
      { key: PERMISSIONS.DEPT_SERVICES_DISCOUNT, label: "خصم على الخدمات" },
    ],
  },
  {
    label: "جرد الأصناف",
    permissions: [
      { key: PERMISSIONS.STOCK_COUNT_VIEW,   label: "عرض" },
      { key: PERMISSIONS.STOCK_COUNT_CREATE, label: "إنشاء" },
      { key: PERMISSIONS.STOCK_COUNT_POST,   label: "ترحيل" },
    ],
  },
  {
    label: "مجموعات الصلاحيات",
    permissions: [
      { key: PERMISSIONS.PERMISSION_GROUPS_VIEW,   label: "عرض" },
      { key: PERMISSIONS.PERMISSION_GROUPS_MANAGE, label: "إدارة" },
    ],
  },
  {
    label: "العقود والشركات",
    permissions: [
      { key: PERMISSIONS.CONTRACTS_VIEW,          label: "عرض الشركات والعقود" },
      { key: PERMISSIONS.CONTRACTS_MANAGE,        label: "إنشاء وتعديل" },
      { key: PERMISSIONS.CONTRACTS_CLAIMS_VIEW,   label: "عرض المطالبات" },
      { key: PERMISSIONS.CONTRACTS_CLAIMS_MANAGE, label: "إرسال / قبول / رفض" },
      { key: PERMISSIONS.CONTRACTS_CLAIMS_SETTLE, label: "تسوية مالية" },
    ],
  },
  {
    label: "الموافقات المسبقة",
    permissions: [
      { key: PERMISSIONS.APPROVALS_VIEW,     label: "عرض طلبات الموافقة" },
      { key: PERMISSIONS.APPROVALS_MANAGE,   label: "قبول / رفض" },
      { key: PERMISSIONS.APPROVALS_OVERRIDE, label: "تجاوز القيود" },
    ],
  },
];
