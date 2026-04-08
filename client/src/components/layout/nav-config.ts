/**
 * nav-config.ts
 * ────────────────────────────────────────────────────────────────────────────
 * مصدر الحقيقة الوحيد لكل بنود تنقل الشريط الجانبي.
 * الفئات منطقية ومصنّفة؛ إضافة صفحة جديدة تتم هنا فقط.
 */
import {
  LayoutDashboard, BookOpen, FileText, Building2, Calendar, ClipboardList,
  Package, ArrowLeftRight, Truck, Receipt, Stethoscope, ShoppingCart,
  Warehouse, UserRound, Banknote, Users, Scale, TrendingUp, BarChart3,
  PieChart, History, Settings, Shield, BedDouble, DoorOpen, Scissors,
  Megaphone, FileSpreadsheet, Undo2, Gauge, ScanSearch, GitMerge,
  KeyRound, AlertCircle, CreditCard, Printer, NotebookPen, PackagePlus,
  ListTodo, Heart, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  hospitalOnly?: true;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

// ─── المجموعات المنظّمة ────────────────────────────────────────────────────────
export const NAV_GROUPS: NavGroup[] = [

  // ── 1. الرئيسية ─────────────────────────────────────────────────────────
  {
    id: "main",
    label: "الرئيسية",
    icon: LayoutDashboard,
    items: [
      { title: "لوحة التحكم",    href: "/",      icon: LayoutDashboard, permission: "dashboard.view" },
      { title: "المهام الداخلية", href: "/tasks", icon: ListTodo },
    ],
  },

  // ── 2. المحاسبة ─────────────────────────────────────────────────────────
  {
    id: "accounting",
    label: "المحاسبة",
    icon: BookOpen,
    items: [
      { title: "دليل الحسابات",    href: "/chart-of-accounts", icon: BookOpen,       permission: "accounts.view" },
      { title: "القيود اليومية",    href: "/journal-entries",   icon: FileText,       permission: "journal.view" },
      { title: "مراكز التكلفة",    href: "/cost-centers",      icon: Building2,      permission: "cost_centers.view" },
      { title: "الفترات المحاسبية", href: "/fiscal-periods",    icon: Calendar,       permission: "fiscal_periods.view" },
      { title: "نماذج القيود",     href: "/templates",         icon: ClipboardList,  permission: "templates.view" },
    ],
  },

  // ── 3. المخزون والمشتريات ────────────────────────────────────────────────
  {
    id: "inventory",
    label: "المخزون والمشتريات",
    icon: Package,
    items: [
      { title: "الأصناف",               href: "/items",                icon: Package,        permission: "items.view" },
      { title: "إدارة الموردين",         href: "/suppliers",            icon: Building2,      permission: "receiving.view" },
      { title: "استلام من مورد",         href: "/supplier-receiving",   icon: Truck,          permission: "receiving.view" },
      { title: "فواتير الشراء",          href: "/purchase-invoices",    icon: Receipt,        permission: "purchase_invoices.view" },
      { title: "سداد الموردين",          href: "/supplier-payments",    icon: Banknote,       permission: "supplier_payments.view" },
      { title: "مرتجعات المشتريات",      href: "/purchase-returns",     icon: Undo2,          permission: "receiving.view" },
      { title: "تحويل مخزني",           href: "/store-transfers",      icon: ArrowLeftRight, permission: "transfers.view" },
      { title: "إعداد إذن تحويل",        href: "/transfer-preparation", icon: FileSpreadsheet, permission: "transfers.view" },
      { title: "الرصيد الافتتاحي",      href: "/opening-stock",        icon: PackagePlus,    permission: "opening_stock.manage" },
      { title: "جرد الأصناف",           href: "/stock-count",          icon: ClipboardList,  permission: "stock_count.view" },
      { title: "كشكول النواقص",          href: "/shortage-notebook",    icon: NotebookPen,    permission: "shortage.view" },
      { title: "صرف بدون رصيد",         href: "/oversell-resolution",  icon: AlertCircle,    permission: "oversell.view" },
    ],
  },

  // ── 4. المبيعات والتحصيل ────────────────────────────────────────────────
  {
    id: "sales",
    label: "المبيعات والتحصيل",
    icon: ShoppingCart,
    items: [
      { title: "فواتير البيع",        href: "/sales-invoices",       icon: ShoppingCart, permission: "sales.view" },
      { title: "مردودات المبيعات",    href: "/sales-returns",        icon: Undo2,        permission: "sales.create" },
      { title: "تحصيل الآجل",        href: "/customer-payments",    icon: CreditCard,   permission: "credit_payment.view" },
      { title: "تحصيل التوصيل",      href: "/delivery-payments",    icon: Truck,        permission: "delivery_payment.view" },
      { title: "شاشة تحصيل الكاشير", href: "/cashier-collection",   icon: Banknote,     permission: "cashier.view" },
      { title: "تقرير تسليم الدرج",   href: "/cashier-handover",     icon: ClipboardList, permission: "cashier.handover_view" },
    ],
  },

  // ── 5. المستشفى والمرضى ──────────────────────────────────────────────────
  {
    id: "hospital",
    label: "المستشفى والمرضى",
    icon: Heart,
    items: [
      { title: "الاستقبال",               href: "/reception",           icon: ClipboardList, permission: "patients.view",          hospitalOnly: true },
      { title: "فاتورة مريض",             href: "/patient-invoices",    icon: UserRound,     permission: "patient_invoices.view",  hospitalOnly: true },
      { title: "نماذج الفواتير",          href: "/invoice-templates",   icon: FileText,      permission: "patient_invoices.view",  hospitalOnly: true },
      { title: "حالات دخول المستشفى",    href: "/patients",             icon: Users,         permission: "patients.view",          hospitalOnly: true },
      { title: "استعلام المرضى",          href: "/patient-inquiry",      icon: ScanSearch,    permission: "patients.view",          hospitalOnly: true },
      { title: "مراجعة المرضى المكررين",  href: "/duplicate-patients",   icon: GitMerge,      permission: "patients.merge",         hospitalOnly: true },
      { title: "لوحة الأسرّة",            href: "/bed-board",            icon: BedDouble,     permission: "patient_invoices.view",  hospitalOnly: true },
      { title: "إدارة الأدوار والغرف",    href: "/room-management",      icon: DoorOpen,      permission: "patient_invoices.view",  hospitalOnly: true },
      { title: "أنواع العمليات الجراحية", href: "/surgery-types",        icon: Scissors,      permission: "patient_invoices.view",  hospitalOnly: true },
      { title: "تسوية مستحقات الأطباء",   href: "/doctor-settlements",   icon: Banknote,      permission: "patient_invoices.view",  hospitalOnly: true },
      { title: "سجل الأطباء",            href: "/doctors",              icon: Stethoscope,   permission: "doctors.view",           hospitalOnly: true },
    ],
  },

  // ── 6. الخدمات والعيادات ─────────────────────────────────────────────────
  {
    id: "clinic",
    label: "الخدمات والعيادات",
    icon: Stethoscope,
    items: [
      { title: "الخدمات والأسعار", href: "/services-pricing",     icon: Stethoscope,   permission: "services.view",         hospitalOnly: true },
      { title: "حجز العيادات",     href: "/clinic-booking",       icon: Calendar,      permission: "clinic.view_own",       hospitalOnly: true },
      { title: "أوامر الطبيب",    href: "/doctor-orders",        icon: ClipboardList, permission: "doctor_orders.view",    hospitalOnly: true },
      { title: "خدمات المعمل",    href: "/dept-services/LAB",   icon: FileText,      permission: "dept_services.create",  hospitalOnly: true },
      { title: "خدمات الأشعة",   href: "/dept-services/RAD",   icon: FileText,      permission: "dept_services.create",  hospitalOnly: true },
    ],
  },

  // ── 7. التقارير المالية ──────────────────────────────────────────────────
  {
    id: "reports",
    label: "التقارير المالية",
    icon: BarChart3,
    items: [
      { title: "ميزان المراجعة",       href: "/reports/trial-balance",     icon: Scale,         permission: "reports.trial_balance" },
      { title: "قائمة الدخل",         href: "/reports/income-statement",  icon: TrendingUp,    permission: "reports.income_statement" },
      { title: "الميزانية العمومية",    href: "/reports/balance-sheet",     icon: BarChart3,     permission: "reports.balance_sheet" },
      { title: "تقارير مراكز التكلفة", href: "/reports/cost-centers",      icon: PieChart,      permission: "reports.cost_centers" },
      { title: "كشف حساب",            href: "/reports/account-ledger",    icon: FileText,      permission: "reports.account_ledger" },
      { title: "حركة صنف",            href: "/reports/item-movement",     icon: ClipboardList, permission: "reports.account_ledger" },
      { title: "رصيد مخزن بتاريخ",    href: "/reports/warehouse-balance", icon: Warehouse,     permission: "reports.account_ledger" },
    ],
  },

  // ── 8. البيانات الأساسية ─────────────────────────────────────────────────
  {
    id: "master",
    label: "البيانات الأساسية",
    icon: Building2,
    items: [
      { title: "المخازن", href: "/warehouses",  icon: Warehouse, permission: "warehouses.view" },
      { title: "الأقسام", href: "/departments", icon: Building2, permission: "departments.view" },
    ],
  },

  // ── 9. النظام ────────────────────────────────────────────────────────────
  {
    id: "system",
    label: "النظام والإعدادات",
    icon: Settings,
    items: [
      { title: "إعدادات النظام",     href: "/system-settings",       icon: Settings,      permission: "settings.account_mappings" },
      { title: "إعدادات الإيصالات",  href: "/receipt-settings",      icon: Printer,       permission: "settings.account_mappings" },
      { title: "ربط الحسابات",      href: "/account-mappings",      icon: Settings,      permission: "settings.account_mappings" },
      { title: "الخزن",             href: "/treasuries",            icon: Banknote,      permission: "settings.account_mappings" },
      { title: "سجل التدقيق",       href: "/audit-log",             icon: History,       permission: "audit_log.view" },
      { title: "إدارة المستخدمين",  href: "/users",                 icon: Shield,        permission: "users.view" },
      { title: "مجموعات الصلاحيات", href: "/permission-groups",     icon: KeyRound,      permission: "permission_groups.view" },
      { title: "العقود والشركات",   href: "/contracts",             icon: Building2,     permission: "contracts.view",          hospitalOnly: true },
      { title: "مطالبات التأمين",   href: "/contract-claims",       icon: Building2,     permission: "contracts.claims.view",   hospitalOnly: true },
      { title: "طلبات الموافقة",    href: "/approvals",             icon: ClipboardList, permission: "approvals.view",          hospitalOnly: true },
      { title: "تحليلات العقود",    href: "/contracts-analytics",   icon: BarChart3,     permission: "contracts.claims.view",   hospitalOnly: true },
      { title: "شريط الإعلانات",    href: "/announcements",         icon: Megaphone,     permission: "settings.account_mappings" },
      { title: "أحداث المحاسبة",   href: "/accounting-events",     icon: AlertCircle,   permission: "journal.post" },
      { title: "تشخيص الأداء",     href: "/perf-diagnostics",      icon: Gauge,         permission: "settings.account_mappings" },
      { title: "سلامة الوحدات",    href: "/unit-integrity",        icon: ScanSearch,    permission: "items.edit" },
    ],
  },
];

/** كل بنود التنقل في قائمة مسطّحة — للبحث السريع */
export function getAllNavItems(): NavItem[] {
  return NAV_GROUPS.flatMap(g => g.items);
}
