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

  SERVICES_VIEW: "services.view",
  SERVICES_MANAGE: "services.manage",

  WAREHOUSES_VIEW: "warehouses.view",
  WAREHOUSES_MANAGE: "warehouses.manage",

  DEPARTMENTS_VIEW: "departments.view",
  DEPARTMENTS_MANAGE: "departments.manage",

  PATIENTS_VIEW: "patients.view",
  PATIENTS_CREATE: "patients.create",
  PATIENTS_EDIT: "patients.edit",

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
    PERMISSIONS.PATIENT_INVOICES_VIEW,
    PERMISSIONS.PATIENT_INVOICES_DISCOUNT,
    PERMISSIONS.CASHIER_VIEW,
    PERMISSIONS.CASHIER_VIEW_TOTALS,
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
    PERMISSIONS.PATIENT_INVOICES_VIEW,
    PERMISSIONS.PATIENT_INVOICES_CREATE,
    PERMISSIONS.PATIENT_INVOICES_EDIT,
    PERMISSIONS.PATIENT_INVOICES_FINALIZE,
    PERMISSIONS.WAREHOUSES_VIEW,
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
  ],

  cashier: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CASHIER_VIEW,
    PERMISSIONS.CASHIER_COLLECT,
    PERMISSIONS.CASHIER_REFUND,
    PERMISSIONS.CASHIER_VIEW_TOTALS,
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
    PERMISSIONS.SERVICES_VIEW,
    PERMISSIONS.ITEMS_VIEW,
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
];
