/**
 * screen-definitions.ts
 *
 * نموذج بيانات الشاشات والإجراءات — طبقة دلالية فوق سجل الصلاحيات.
 * يعرض كل شاشة في التطبيق مع:
 *  - مفتاح الصلاحية الذي يتحكم في الوصول للشاشة وظهورها في القائمة
 *  - الإجراءات المتاحة (إنشاء، تعديل، حذف، ترحيل، اعتماد...)
 *
 * مصدر الحقيقة الوحيد هو PERMISSIONS في shared/permissions.ts.
 * هذا الملف لا يُنشئ صلاحيات جديدة — فقط ينظّمها دلالياً.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  أنواع البيانات
// ─────────────────────────────────────────────────────────────────────────────

export type ActionType =
  | "create" | "edit" | "delete"
  | "post" | "finalize" | "approve" | "execute" | "reverse"
  | "manage"
  | "collect" | "refund" | "view_totals" | "all_units" | "open_shift"
  | "discount" | "payments" | "transfer_doctor"
  | "view_all" | "view_own" | "book" | "consult" | "view_statement"
  | "pharmacy_orders" | "batch" | "intake"
  | "merge" | "registry_view"
  | "settle" | "override";

export const ACTION_LABELS: Record<ActionType, string> = {
  create:           "إنشاء",
  edit:             "تعديل",
  delete:           "حذف",
  post:             "ترحيل",
  finalize:         "اعتماد",
  approve:          "موافقة",
  execute:          "تنفيذ",
  reverse:          "عكس",
  manage:           "إدارة",
  collect:          "تحصيل",
  refund:           "مرتجع",
  view_totals:      "ملخص الوردية",
  all_units:        "كل الوحدات",
  open_shift:       "فتح وردية",
  discount:         "خصم",
  payments:         "مدفوعات",
  transfer_doctor:  "تحويل طبيب",
  view_all:         "كل العيادات",
  view_own:         "عيادته فقط",
  book:             "حجز",
  consult:          "كشف وروشتة",
  view_statement:   "كشف الطبيب",
  pharmacy_orders:  "أوامر صيدلية",
  batch:            "إدخال جماعي",
  intake:           "استقبال وقياسات",
  merge:            "دمج",
  registry_view:    "سجل الفواتير",
  settle:           "تسوية",
  override:         "تجاوز / استثناء",
};

export interface ScreenActionDef {
  type:    ActionType;
  permKey: string;   // مفتاح الصلاحية الفعلي من PERMISSIONS
}

export interface ScreenDef {
  id:          string;
  label:       string;
  menuPermKey: string;    // الصلاحية التي تُظهر الشاشة في القائمة وتسمح بفتحها
  actions:     ScreenActionDef[];
}

export interface ScreenCategoryDef {
  id:            string;
  label:         string;
  actionColumns: ActionType[];   // أعمدة الإجراءات التي تظهر لهذه الفئة
  screens:       ScreenDef[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCREEN_MATRIX — تعريف كل الشاشات مقسّمة بالفئات
// ─────────────────────────────────────────────────────────────────────────────

export const SCREEN_MATRIX: ScreenCategoryDef[] = [

  // ── المحاسبة ────────────────────────────────────────────────────────────────
  {
    id:            "accounting",
    label:         "المحاسبة",
    actionColumns: ["create", "edit", "delete", "post", "reverse", "manage"],
    screens: [
      {
        id:          "dashboard",
        label:       "لوحة التحكم",
        menuPermKey: "dashboard.view",
        actions:     [],
      },
      {
        id:          "chart-of-accounts",
        label:       "دليل الحسابات",
        menuPermKey: "accounts.view",
        actions: [
          { type: "create", permKey: "accounts.create" },
          { type: "edit",   permKey: "accounts.edit" },
          { type: "delete", permKey: "accounts.delete" },
        ],
      },
      {
        id:          "journal-entries",
        label:       "القيود اليومية",
        menuPermKey: "journal.view",
        actions: [
          { type: "create",  permKey: "journal.create" },
          { type: "edit",    permKey: "journal.edit" },
          { type: "post",    permKey: "journal.post" },
          { type: "reverse", permKey: "journal.reverse" },
        ],
      },
      {
        id:          "cost-centers",
        label:       "مراكز التكلفة",
        menuPermKey: "cost_centers.view",
        actions: [
          { type: "create", permKey: "cost_centers.create" },
          { type: "edit",   permKey: "cost_centers.edit" },
          { type: "delete", permKey: "cost_centers.delete" },
        ],
      },
      {
        id:          "fiscal-periods",
        label:       "الفترات المحاسبية",
        menuPermKey: "fiscal_periods.view",
        actions: [
          { type: "manage", permKey: "fiscal_periods.manage" },
        ],
      },
      {
        id:          "templates",
        label:       "نماذج القيود",
        menuPermKey: "templates.view",
        actions: [
          { type: "manage", permKey: "templates.manage" },
        ],
      },
    ],
  },

  // ── المخزون والمشتريات ────────────────────────────────────────────────────
  {
    id:            "inventory",
    label:         "المخزون والمشتريات",
    actionColumns: ["create", "edit", "delete", "post", "approve", "execute", "manage"],
    screens: [
      {
        id:          "items",
        label:       "الأصناف",
        menuPermKey: "items.view",
        actions: [
          { type: "create", permKey: "items.create" },
          { type: "edit",   permKey: "items.edit" },
          { type: "delete", permKey: "items.delete" },
        ],
      },
      {
        id:          "warehouses",
        label:       "المخازن",
        menuPermKey: "warehouses.view",
        actions: [
          { type: "manage", permKey: "warehouses.manage" },
        ],
      },
      {
        id:          "suppliers",
        label:       "إدارة الموردين",
        menuPermKey: "receiving.view",
        actions:     [],
      },
      {
        id:          "supplier-receiving",
        label:       "استلام من مورد",
        menuPermKey: "receiving.view",
        actions: [
          { type: "create", permKey: "receiving.create" },
          { type: "edit",   permKey: "receiving.edit" },
          { type: "post",   permKey: "receiving.post" },
        ],
      },
      {
        id:          "purchase-invoices",
        label:       "فواتير الشراء",
        menuPermKey: "purchase_invoices.view",
        actions: [
          { type: "create",  permKey: "purchase_invoices.create" },
          { type: "edit",    permKey: "purchase_invoices.edit" },
          { type: "approve", permKey: "purchase_invoices.approve" },
        ],
      },
      {
        id:          "supplier-payments",
        label:       "سداد الموردين",
        menuPermKey: "supplier_payments.view",
        actions:     [],
      },
      {
        id:          "store-transfers",
        label:       "التحويلات المخزنية",
        menuPermKey: "transfers.view",
        actions: [
          { type: "create",  permKey: "transfers.create" },
          { type: "execute", permKey: "transfers.execute" },
        ],
      },
      {
        id:          "opening-stock",
        label:       "الرصيد الافتتاحي للمخزن",
        menuPermKey: "opening_stock.manage",
        actions: [
          { type: "manage", permKey: "opening_stock.manage" },
        ],
      },
      {
        id:          "stock-count",
        label:       "جرد الأصناف",
        menuPermKey: "stock_count.view",
        actions: [
          { type: "create", permKey: "stock_count.create" },
          { type: "post",   permKey: "stock_count.post" },
        ],
      },
      {
        id:          "shortage-notebook",
        label:       "كشكول النواقص",
        menuPermKey: "shortage.view",
        actions: [
          { type: "manage", permKey: "shortage.manage" },
        ],
      },
      {
        id:          "oversell-resolution",
        label:       "صرف بدون رصيد (معلّق)",
        menuPermKey: "oversell.view",
        actions: [
          { type: "manage",  permKey: "oversell.manage" },
          { type: "approve", permKey: "oversell.approve" },
        ],
      },
    ],
  },

  // ── المبيعات والتحصيل ─────────────────────────────────────────────────────
  {
    id:            "sales-collection",
    label:         "المبيعات والتحصيل",
    actionColumns: ["create", "finalize", "collect", "refund", "view_totals", "all_units", "open_shift", "registry_view"],
    screens: [
      {
        id:          "sales-invoices",
        label:       "فواتير البيع",
        menuPermKey: "sales.view",
        actions: [
          { type: "create",        permKey: "sales.create" },
          { type: "finalize",      permKey: "sales.finalize" },
          { type: "registry_view", permKey: "sales.registry_view" },
        ],
      },
      {
        id:          "customer-payments",
        label:       "تحصيل الآجل",
        menuPermKey: "credit_payment.view",
        actions: [
          { type: "collect", permKey: "credit_payment.manage" },
        ],
      },
      {
        id:          "delivery-payments",
        label:       "تحصيل التوصيل المنزلي",
        menuPermKey: "delivery_payment.view",
        actions: [
          { type: "collect", permKey: "delivery_payment.manage" },
        ],
      },
      {
        id:          "cashier-collection",
        label:       "شاشة تحصيل الكاشير",
        menuPermKey: "cashier.view",
        actions: [
          { type: "open_shift",  permKey: "cashier.open_shift" },
          { type: "collect",     permKey: "cashier.collect" },
          { type: "refund",      permKey: "cashier.refund" },
          { type: "view_totals", permKey: "cashier.view_shift_totals" },
          { type: "all_units",   permKey: "cashier.all_units" },
        ],
      },
      {
        id:          "cashier-handover",
        label:       "تقرير تسليم الدرج",
        menuPermKey: "cashier.handover_view",
        actions:     [],
      },
    ],
  },

  // ── المستشفى والمرضى ──────────────────────────────────────────────────────
  {
    id:            "hospital-patients",
    label:         "المستشفى والمرضى",
    actionColumns: ["create", "edit", "delete", "finalize", "approve", "discount", "payments", "transfer_doctor", "merge", "registry_view"],
    screens: [
      {
        id:          "reception",
        label:       "الاستقبال الموحد",
        menuPermKey: "reception.view",
        actions: [
          { type: "create", permKey: "patients.create" },
        ],
      },
      {
        id:          "patient-invoices",
        label:       "فواتير المرضى",
        menuPermKey: "patient_invoices.view",
        actions: [
          { type: "create",          permKey: "patient_invoices.create" },
          { type: "edit",            permKey: "patient_invoices.edit" },
          { type: "finalize",        permKey: "patient_invoices.finalize" },
          { type: "payments",        permKey: "patient_invoices.payments" },
          { type: "discount",        permKey: "patient_invoices.discount" },
          { type: "transfer_doctor", permKey: "patient_invoices.transfer_doctor" },
          { type: "approve",         permKey: "invoice.approve_zero_price" },
        ],
      },
      {
        id:          "patients",
        label:       "حالات دخول المستشفى",
        menuPermKey: "patients.view",
        actions: [
          { type: "create", permKey: "patients.create" },
          { type: "edit",   permKey: "patients.edit" },
          { type: "merge",  permKey: "patients.merge" },
        ],
      },
      {
        id:          "doctors",
        label:       "سجل الأطباء",
        menuPermKey: "doctors.view",
        actions: [
          { type: "create", permKey: "doctors.create" },
          { type: "edit",   permKey: "doctors.edit" },
        ],
      },
      {
        id:          "services-pricing",
        label:       "الخدمات والأسعار",
        menuPermKey: "services.view",
        actions: [
          { type: "manage", permKey: "services.manage" },
        ],
      },
      {
        id:          "doctor-settlements",
        label:       "تسويات الأطباء",
        menuPermKey: "patient_invoices.view",
        actions: [
          { type: "create", permKey: "doctor_settlements.create" },
        ],
      },
    ],
  },

  // ── العيادات الخارجية ─────────────────────────────────────────────────────
  {
    id:            "clinic",
    label:         "العيادات الخارجية",
    actionColumns: ["view_all", "book", "manage", "consult", "view_statement", "execute", "pharmacy_orders", "batch", "discount", "intake"],
    screens: [
      {
        id:          "clinic-booking",
        label:       "حجز العيادات",
        menuPermKey: "clinic.view_own",
        actions: [
          { type: "view_all", permKey: "clinic.view_all" },
          { type: "book",     permKey: "clinic.book" },
          { type: "manage",   permKey: "clinic.manage" },
        ],
      },
      {
        id:          "doctor-consultation",
        label:       "كشف الطبيب",
        menuPermKey: "doctor.consultation",
        actions: [
          { type: "consult",        permKey: "doctor.consultation" },
          { type: "view_statement", permKey: "doctor.view_statement" },
          { type: "view_all",       permKey: "clinic.intake.view" },
          { type: "intake",         permKey: "clinic.intake.manage" },
          { type: "manage",         permKey: "clinic.favorites.manage" },
        ],
      },
      {
        id:          "doctor-orders",
        label:       "أوامر الطبيب",
        menuPermKey: "doctor_orders.view",
        actions: [
          { type: "execute", permKey: "doctor_orders.execute" },
        ],
      },
      {
        id:          "dept-services-lab",
        label:       "خدمات المعمل",
        menuPermKey: "dept_services.create",
        actions: [
          { type: "batch",    permKey: "dept_services.batch" },
          { type: "discount", permKey: "dept_services.discount" },
        ],
      },
      {
        id:          "dept-services-rad",
        label:       "خدمات الأشعة",
        menuPermKey: "dept_services.create",
        actions: [
          { type: "batch",    permKey: "dept_services.batch" },
          { type: "discount", permKey: "dept_services.discount" },
        ],
      },
      {
        id:          "pharmacy-orders",
        label:       "أوامر أدوية الصيدلية",
        menuPermKey: "clinic.pharmacy_orders",
        actions:     [],
      },
    ],
  },

  // ── إدارة الإقامة والأسرّة ─────────────────────────────────────────────────
  {
    id:            "admissions",
    label:         "إدارة الإقامة والأسرّة",
    actionColumns: ["create", "manage"],
    screens: [
      {
        id:          "bed-board",
        label:       "لوحة الأسرّة",
        menuPermKey: "patient_invoices.view",
        actions:     [],
      },
      {
        id:          "room-management",
        label:       "إدارة الأدوار والغرف",
        menuPermKey: "patient_invoices.view",
        actions:     [],
      },
      {
        id:          "surgery-types",
        label:       "أنواع العمليات الجراحية",
        menuPermKey: "patient_invoices.view",
        actions:     [],
      },
      {
        id:          "admissions",
        label:       "حالات الدخول",
        menuPermKey: "admissions.view",
        actions: [
          { type: "create", permKey: "admissions.create" },
          { type: "manage", permKey: "admissions.manage" },
        ],
      },
    ],
  },

  // ── العقود والتأمين ───────────────────────────────────────────────────────
  {
    id:            "contracts",
    label:         "العقود والتأمين",
    actionColumns: ["create", "manage", "approve", "settle", "override"],
    screens: [
      {
        id:          "contracts",
        label:       "العقود والشركات",
        menuPermKey: "contracts.view",
        actions: [
          { type: "manage", permKey: "contracts.manage" },
        ],
      },
      {
        id:          "contract-claims",
        label:       "مطالبات التأمين",
        menuPermKey: "contracts.claims.view",
        actions: [
          { type: "manage", permKey: "contracts.claims.manage" },
          { type: "settle", permKey: "contracts.claims.settle" },
        ],
      },
      {
        id:          "approvals",
        label:       "طلبات الموافقة المسبقة",
        menuPermKey: "approvals.view",
        actions: [
          { type: "approve",  permKey: "approvals.manage" },
          { type: "override", permKey: "approvals.override" },
        ],
      },
    ],
  },

  // ── التقارير المالية ──────────────────────────────────────────────────────
  {
    id:            "reports",
    label:         "التقارير المالية",
    actionColumns: [],
    screens: [
      {
        id:          "trial-balance",
        label:       "ميزان المراجعة",
        menuPermKey: "reports.trial_balance",
        actions:     [],
      },
      {
        id:          "income-statement",
        label:       "قائمة الدخل",
        menuPermKey: "reports.income_statement",
        actions:     [],
      },
      {
        id:          "balance-sheet",
        label:       "الميزانية العمومية",
        menuPermKey: "reports.balance_sheet",
        actions:     [],
      },
      {
        id:          "cost-center-reports",
        label:       "تقارير مراكز التكلفة",
        menuPermKey: "reports.cost_centers",
        actions:     [],
      },
      {
        id:          "account-ledger",
        label:       "كشف حساب / حركة صنف",
        menuPermKey: "reports.account_ledger",
        actions:     [],
      },
    ],
  },

  // ── إعدادات النظام ────────────────────────────────────────────────────────
  {
    id:            "system",
    label:         "النظام والإعدادات",
    actionColumns: ["create", "edit", "delete", "manage"],
    screens: [
      {
        id:          "departments",
        label:       "الأقسام",
        menuPermKey: "departments.view",
        actions: [
          { type: "manage", permKey: "departments.manage" },
        ],
      },
      {
        id:          "pharmacies",
        label:       "الصيدليات",
        menuPermKey: "pharmacies.manage",
        actions: [
          { type: "manage", permKey: "pharmacies.manage" },
        ],
      },
      {
        id:          "system-settings",
        label:       "إعدادات النظام",
        menuPermKey: "settings.account_mappings",
        actions:     [],
      },
      {
        id:          "account-mappings",
        label:       "ربط الحسابات",
        menuPermKey: "settings.account_mappings",
        actions:     [],
      },
      {
        id:          "treasuries",
        label:       "الخزن",
        menuPermKey: "settings.account_mappings",
        actions:     [],
      },
      {
        id:          "drawer-passwords",
        label:       "كلمات سر الخزن",
        menuPermKey: "settings.drawer_passwords",
        actions:     [],
      },
      {
        id:          "audit-log",
        label:       "سجل التدقيق",
        menuPermKey: "audit_log.view",
        actions:     [],
      },
      {
        id:          "users",
        label:       "إدارة المستخدمين",
        menuPermKey: "users.view",
        actions: [
          { type: "create", permKey: "users.create" },
          { type: "edit",   permKey: "users.edit" },
          { type: "delete", permKey: "users.delete" },
        ],
      },
      {
        id:          "permission-groups",
        label:       "مجموعات الصلاحيات",
        menuPermKey: "permission_groups.view",
        actions: [
          { type: "manage", permKey: "permission_groups.manage" },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: كل مفاتيح الصلاحيات المُستخدمة في المصفوفة
// ─────────────────────────────────────────────────────────────────────────────
export function getAllMatrixPermKeys(): string[] {
  const keys = new Set<string>();
  for (const cat of SCREEN_MATRIX) {
    for (const screen of cat.screens) {
      keys.add(screen.menuPermKey);
      for (const a of screen.actions) keys.add(a.permKey);
    }
  }
  return [...keys];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: صلاحيات موجودة في PERMISSIONS لكن غير مُسجَّلة في المصفوفة
//  استخدام: أي صلاحية جديدة تُضاف لـ shared/permissions.ts دون تسجيلها هنا
//  ستظهر كتحذير في شاشة مجموعات الصلاحيات تلقائياً.
// ─────────────────────────────────────────────────────────────────────────────
export function getUncoveredPermissions(allDefinedKeys: string[]): string[] {
  const covered = new Set(getAllMatrixPermKeys());
  return allDefinedKeys.filter(k => !covered.has(k));
}
