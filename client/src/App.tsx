import { Switch, Route, Redirect, useLocation } from "wouter";
import { useRef, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { usePharmacyMode } from "@/hooks/use-pharmacy-mode";
import { isHospitalOnlyRoute } from "@/lib/pharmacy-config";
import DateChangeGuard from "@/components/DateChangeGuard";
import Login from "@/pages/Login";
import { Loader2, ShieldAlert } from "lucide-react";
import { lazy, Suspense } from "react";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ChartOfAccounts = lazy(() => import("@/pages/ChartOfAccounts"));
const JournalEntries = lazy(() => import("@/pages/JournalEntries"));
const JournalEntryForm = lazy(() => import("@/pages/journal-entry-form"));
const CostCenters = lazy(() => import("@/pages/CostCenters"));
const FiscalPeriods = lazy(() => import("@/pages/FiscalPeriods"));
const Templates = lazy(() => import("@/pages/Templates"));
const TrialBalance = lazy(() => import("@/pages/TrialBalance"));
const IncomeStatement = lazy(() => import("@/pages/IncomeStatement"));
const BalanceSheet = lazy(() => import("@/pages/BalanceSheet"));
const CostCenterReports = lazy(() => import("@/pages/CostCenterReports"));
const AccountLedger = lazy(() => import("@/pages/AccountLedger"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const ItemsList = lazy(() => import("@/pages/ItemsList"));
const ItemCard = lazy(() => import("@/pages/item-card"));
const StoreTransfers = lazy(() => import("@/pages/store-transfers"));
const TransferPreparation = lazy(() => import("@/pages/transfer-preparation"));
const SupplierReceiving = lazy(() => import("@/pages/supplier-receiving"));
const PurchaseInvoice = lazy(() => import("@/pages/purchase-invoices"));
const PurchaseReturns = lazy(() => import("@/pages/purchase-returns"));
const ServicesPricing = lazy(() => import("@/pages/ServicesPricing"));
const SalesInvoices = lazy(() => import("@/pages/SalesInvoices"));
const ContractReport = lazy(() => import("@/pages/sales-invoices/ContractReport"));
const SalesReturns = lazy(() => import("@/pages/sales-returns"));
const Warehouses = lazy(() => import("@/pages/Warehouses"));
const Departments = lazy(() => import("@/pages/Departments"));
const Patients = lazy(() => import("@/pages/patients"));
const PatientInquiry = lazy(() => import("@/pages/patient-inquiry"));
const Doctors = lazy(() => import("@/pages/Doctors"));
const PatientInvoice = lazy(() => import("@/pages/PatientInvoice"));
const CashierCollection = lazy(() => import("@/pages/cashier/CashierCollection"));
const AccountMappings = lazy(() => import("@/pages/account-mappings/index"));
const DrawerPasswords = lazy(() => import("@/pages/DrawerPasswords"));
const UsersManagement = lazy(() => import("@/pages/users-management"));
const BedBoard = lazy(() => import("@/pages/bed-board"));
const RoomManagement = lazy(() => import("@/pages/RoomManagement"));
const DoctorSettlements = lazy(() => import("@/pages/DoctorSettlements"));
const DoctorStatement = lazy(() => import("@/pages/DoctorStatement"));
const SystemSettings = lazy(() => import("@/pages/SystemSettings"));
const SurgeryTypes = lazy(() => import("@/pages/SurgeryTypes"));
const TreasuriesPage = lazy(() => import("@/pages/treasuries/TreasuriesPage"));
const AnnouncementsPage = lazy(() => import("@/pages/announcements/AnnouncementsPage"));
const ClinicBooking = lazy(() => import("@/pages/clinic-booking"));
const DoctorConsultation = lazy(() => import("@/pages/doctor-consultation"));
const PatientFilePage = lazy(() => import("@/pages/patient-file"));
const DoctorOrders = lazy(() => import("@/pages/doctor-orders"));
const DeptServicesPage = lazy(() => import("@/pages/dept-services"));
const PerfDiagnostics = lazy(() => import("@/pages/PerfDiagnostics"));
const DuplicatePatients = lazy(() => import("@/pages/duplicate-patients"));
const OpeningStockList = lazy(() => import("@/pages/opening-stock/index"));
const OpeningStockForm = lazy(() => import("@/pages/opening-stock/form"));
const StockCount = lazy(() => import("@/pages/stock-count/index"));
const StockCountDetail = lazy(() => import("@/pages/stock-count/session-detail"));
const ShortageNotebook = lazy(() => import("@/pages/shortage-notebook/index"));
const OversellResolution = lazy(() => import("@/pages/oversell-resolution/index"));
const UnitIntegrityPage = lazy(() => import("@/pages/unit-integrity/index"));
const SuppliersPage = lazy(() => import("@/pages/suppliers/index"));
const ReceptionPage = lazy(() => import("@/pages/reception/ReceptionPage"));
const SupplierPaymentsPage  = lazy(() => import("@/pages/supplier-payments/index"));
const CustomerPaymentsPage  = lazy(() => import("@/pages/customer-payments/index"));
const DeliveryPaymentsPage  = lazy(() => import("@/pages/delivery-payments/index"));
const PermissionGroupsPage = lazy(() => import("@/pages/permission-groups/index"));
const AccountingEventsPage = lazy(() => import("@/pages/accounting-events/index"));
const ContractsPage = lazy(() => import("@/pages/contracts/index"));
const ContractClaimsPage       = lazy(() => import("@/pages/contract-claims/index"));
const ApprovalsPage            = lazy(() => import("@/pages/approvals/index"));
const ContractsAnalyticsPage   = lazy(() => import("@/pages/contracts-analytics/index"));
const CashierHandoverPage      = lazy(() => import("@/pages/cashier-handover/index"));
const CashTransfersPage        = lazy(() => import("@/pages/cash-transfers/index"));
const ItemMovementReport       = lazy(() => import("@/pages/item-movement-report/index"));
const WarehouseBalanceReport   = lazy(() => import("@/pages/warehouse-balance-report/index"));
const ReceiptSettings          = lazy(() => import("@/pages/receipt-settings/index"));
const TasksPage                = lazy(() => import("@/pages/tasks/index"));
const InvoiceTemplatesPage     = lazy(() => import("@/pages/invoice-templates/InvoiceTemplatesPage"));
import NotFound from "@/pages/not-found";

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" dir="rtl" data-testid="access-denied">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-1">غير مصرح</h2>
        <p className="text-muted-foreground text-sm">لا تملك صلاحية للوصول إلى هذه الصفحة</p>
      </div>
    );
  }
  return <>{children}</>;
}

function G({ p, children }: { p: string; children: React.ReactNode }) {
  return <RequirePermission permission={p}>{children}</RequirePermission>;
}

function RequireHospitalAccess({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { pharmacyMode, isOwner } = usePharmacyMode();

  if (pharmacyMode && !isOwner && isHospitalOnlyRoute(location)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" dir="rtl" data-testid="pharmacy-access-denied">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-1">غير مسموح في وضع الصيدلية</h2>
        <p className="text-muted-foreground text-sm">هذه الصفحة متاحة فقط في وضع المستشفى</p>
      </div>
    );
  }

  return <>{children}</>;
}

function DefaultLanding() {
  const { user } = useAuth();
  if (user?.defaultRoute && user.defaultRoute !== "/") {
    return <Redirect to={user.defaultRoute} />;
  }
  return <G p="dashboard.view"><Dashboard /></G>;
}

function Router() {
  return (
    <AppLayout>
      <RequireHospitalAccess>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/">{() => <DefaultLanding />}</Route>
          <Route path="/tasks">{() => <TasksPage />}</Route>
          <Route path="/chart-of-accounts">{() => <G p="accounts.view"><ChartOfAccounts /></G>}</Route>
          <Route path="/journal-entries">{() => <G p="journal.view"><JournalEntries /></G>}</Route>
          <Route path="/journal-entries/new">{() => <G p="journal.create"><JournalEntryForm /></G>}</Route>
          <Route path="/journal-entries/:id/edit">{(params) => <G p="journal.edit"><JournalEntryForm /></G>}</Route>
          <Route path="/journal-entries/:id">{(params) => <G p="journal.view"><JournalEntryForm /></G>}</Route>
          <Route path="/cost-centers">{() => <G p="cost_centers.view"><CostCenters /></G>}</Route>
          <Route path="/fiscal-periods">{() => <G p="fiscal_periods.view"><FiscalPeriods /></G>}</Route>
          <Route path="/templates">{() => <G p="templates.view"><Templates /></G>}</Route>
          <Route path="/invoice-templates">{() => <InvoiceTemplatesPage />}</Route>
          <Route path="/reports/trial-balance">{() => <G p="reports.trial_balance"><TrialBalance /></G>}</Route>
          <Route path="/reports/income-statement">{() => <G p="reports.income_statement"><IncomeStatement /></G>}</Route>
          <Route path="/reports/balance-sheet">{() => <G p="reports.balance_sheet"><BalanceSheet /></G>}</Route>
          <Route path="/reports/cost-centers">{() => <G p="reports.cost_centers"><CostCenterReports /></G>}</Route>
          <Route path="/reports/account-ledger">{() => <G p="reports.account_ledger"><AccountLedger /></G>}</Route>
          <Route path="/reports/item-movement">{() => <G p="reports.account_ledger"><ItemMovementReport /></G>}</Route>
          <Route path="/reports/warehouse-balance">{() => <G p="reports.account_ledger"><WarehouseBalanceReport /></G>}</Route>
          <Route path="/items">{() => <G p="items.view"><ItemsList /></G>}</Route>
          <Route path="/items/new">{() => <G p="items.create"><ItemCard /></G>}</Route>
          <Route path="/items/:id">{(params) => <G p="items.view"><ItemCard /></G>}</Route>
          <Route path="/store-transfers">{() => <G p="transfers.view"><StoreTransfers /></G>}</Route>
          <Route path="/transfer-preparation">{() => <G p="transfers.view"><TransferPreparation /></G>}</Route>
          <Route path="/opening-stock">{() => <G p="opening_stock.manage"><OpeningStockList /></G>}</Route>
          <Route path="/opening-stock/new">{() => <G p="opening_stock.manage"><OpeningStockForm /></G>}</Route>
          <Route path="/opening-stock/:id">{() => <G p="opening_stock.manage"><OpeningStockForm /></G>}</Route>
          <Route path="/stock-count">{() => <G p="stock_count.view"><StockCount /></G>}</Route>
          <Route path="/stock-count/:id">{() => <G p="stock_count.view"><StockCountDetail /></G>}</Route>
          <Route path="/shortage-notebook">{() => <G p="shortage.view"><ShortageNotebook /></G>}</Route>
          <Route path="/oversell-resolution">{() => <G p="oversell.view"><OversellResolution /></G>}</Route>
          <Route path="/unit-integrity">{() => <G p="items.edit"><UnitIntegrityPage /></G>}</Route>
          <Route path="/suppliers">{() => <G p="receiving.view"><SuppliersPage /></G>}</Route>
          <Route path="/supplier-receiving">{() => <G p="receiving.view"><SupplierReceiving /></G>}</Route>
          <Route path="/purchase-invoices">{() => <G p="purchase_invoices.view"><PurchaseInvoice /></G>}</Route>
          <Route path="/supplier-payments">{() => <G p="supplier_payments.view"><SupplierPaymentsPage /></G>}</Route>
          <Route path="/purchase-returns">{() => <G p="receiving.view"><PurchaseReturns /></G>}</Route>
          <Route path="/customer-payments">{() => <G p="sales.view"><CustomerPaymentsPage /></G>}</Route>
          <Route path="/delivery-payments">{() => <G p="delivery_payment.view"><DeliveryPaymentsPage /></G>}</Route>
          <Route path="/sales-invoices/contract-report">{() => <G p="sales.view"><ContractReport /></G>}</Route>
          <Route path="/sales-invoices">{() => <G p="sales.view"><SalesInvoices /></G>}</Route>
          <Route path="/sales-returns">{() => <G p="sales.create"><SalesReturns /></G>}</Route>
          <Route path="/services-pricing">{() => <G p="services.view"><ServicesPricing /></G>}</Route>
          <Route path="/warehouses">{() => <G p="warehouses.view"><Warehouses /></G>}</Route>
          <Route path="/departments">{() => <G p="departments.view"><Departments /></G>}</Route>
          <Route path="/patients">{() => <G p="patients.view"><Patients /></G>}</Route>
          <Route path="/patients/:id/file">{() => <G p="patients.view"><PatientFilePage /></G>}</Route>
          <Route path="/patient-inquiry">{() => <G p="patients.view"><PatientInquiry /></G>}</Route>
          <Route path="/reception">{() => <G p="patients.view"><ReceptionPage /></G>}</Route>
          <Route path="/duplicate-patients">{() => <G p="patients.merge"><DuplicatePatients /></G>}</Route>
          <Route path="/doctors">{() => <G p="doctors.view"><Doctors /></G>}</Route>
          <Route path="/patient-invoices">{() => <G p="patient_invoices.view"><ErrorBoundary fallbackLabel="خطأ في صفحة فاتورة المريض"><PatientInvoice /></ErrorBoundary></G>}</Route>
          <Route path="/bed-board">{() => <G p="bed_board.view"><BedBoard /></G>}</Route>
          <Route path="/room-management">{() => <G p="rooms.manage"><RoomManagement /></G>}</Route>
          <Route path="/surgery-types">{() => <G p="surgery_types.manage"><SurgeryTypes /></G>}</Route>
          <Route path="/doctor-settlements">{() => <G p="patient_invoices.view"><DoctorSettlements /></G>}</Route>
          <Route path="/doctor-statement/:name">{() => <G p="doctors.view"><DoctorStatement /></G>}</Route>
          <Route path="/audit-log">{() => <G p="audit_log.view"><AuditLog /></G>}</Route>
          <Route path="/cashier-collection">{() => <G p="cashier.view"><CashierCollection /></G>}</Route>
          <Route path="/cashier-handover">{() => <G p="cashier.handover_view"><CashierHandoverPage /></G>}</Route>
          <Route path="/cash-transfers">{() => <G p="cash_transfer.view"><CashTransfersPage /></G>}</Route>
          <Route path="/system-settings">{() => <G p="settings.account_mappings"><SystemSettings /></G>}</Route>
          <Route path="/account-mappings">{() => <G p="settings.account_mappings"><AccountMappings /></G>}</Route>
          <Route path="/drawer-passwords">{() => <G p="settings.drawer_passwords"><DrawerPasswords /></G>}</Route>
          <Route path="/treasuries">{() => <G p="settings.account_mappings"><TreasuriesPage /></G>}</Route>
          <Route path="/users">{() => <G p="users.view"><UsersManagement /></G>}</Route>
          <Route path="/permission-groups">{() => <G p="permission_groups.view"><PermissionGroupsPage /></G>}</Route>
          <Route path="/accounting-events">{() => <G p="journal.post"><AccountingEventsPage /></G>}</Route>
          <Route path="/contracts">{() => <G p="contracts.view"><ContractsPage /></G>}</Route>
          <Route path="/contract-claims">{() => <G p="contracts.claims.view"><ContractClaimsPage /></G>}</Route>
          <Route path="/approvals">{() => <G p="approvals.view"><ApprovalsPage /></G>}</Route>
          <Route path="/contracts-analytics">{() => <G p="contracts.claims.view"><ContractsAnalyticsPage /></G>}</Route>
          <Route path="/announcements">{() => <G p="settings.account_mappings"><AnnouncementsPage /></G>}</Route>
          <Route path="/clinic-booking">{() => <G p="clinic.view_own"><ClinicBooking /></G>}</Route>
          <Route path="/doctor-consultation/:id">{() => <G p="doctor.consultation"><DoctorConsultation /></G>}</Route>
          <Route path="/doctor-orders">{() => <G p="doctor_orders.view"><DoctorOrders /></G>}</Route>
          <Route path="/dept-services/:deptCode">{() => <DeptServicesPage />}</Route>
          <Route path="/perf-diagnostics">{() => <G p="settings.account_mappings"><PerfDiagnostics /></G>}</Route>
          <Route path="/receipt-settings">{() => <G p="settings.account_mappings"><ReceiptSettings /></G>}</Route>
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      </RequireHospitalAccess>
    </AppLayout>
  );
}

/**
 * خريطة الصلاحية الدنيا لكل شاشة افتتاحية ممكنة.
 * null = لا تحتاج صلاحية خاصة (يكفي أن يكون المستخدم مسجّلاً).
 * undefined = مسار غير معروف → يُسمح بالتوجيه إليه دون تحقق.
 */
const ROUTE_REQUIRED_PERMISSION: Record<string, string | null> = {
  "/":                       null,
  "/sales-invoices":         "sales.view",
  "/cashier-collection":     "cashier.view",
  "/cashier-handover":       "cashier.handover_view",
  "/cash-transfers":         "cash_transfer.view",
  "/patient-invoices":       "patient_invoices.view",
  "/clinic-booking":         "clinic.book",
  "/bed-board":              "bed_board.view",
  "/doctor-orders":          "doctor_orders.view",
  "/store-transfers":        "transfers.view",
  "/transfer-preparation":   "transfers.view",
  "/supplier-receiving":     "receiving.view",
  "/purchase-invoices":      "purchase_invoices.view",
  "/items":                  "items.view",
  "/customer-payments":      "credit_payment.view",
  "/supplier-payments":      "supplier_payments.view",
  "/delivery-payments":      "delivery_payment.view",
  "/stock-count":            "stock_count.view",
  "/shortage-notebook":      "shortage.view",
  "/oversell-resolution":    "oversell.view",
  "/journal-entries":        "journal.view",
  "/chart-of-accounts":      "accounts.view",
  "/reports/trial-balance":  "reports.trial_balance",
  "/dept-services/LAB":      "dept_services.create",
  "/dept-services/RAD":      "dept_services.create",
  "/sales-returns":          "sales.view",
  "/patient-inquiry":        "patients.view",
  "/reception":              "patients.view",
  "/doctor-settlements":     "doctor_settlements.create",
  "/system-settings":        null,
  // ── إضافات (شاشات افتتاحية مدعومة) ────────────────────────────────────
  "/tasks":                  null,
  "/cost-centers":           "cost_centers.view",
  "/fiscal-periods":         "fiscal_periods.view",
  "/reports/income-statement":   "reports.income_statement",
  "/reports/balance-sheet":      "reports.balance_sheet",
  "/reports/cost-centers":       "reports.cost_centers",
  "/reports/account-ledger":     "reports.account_ledger",
  "/reports/item-movement":      "reports.account_ledger",
  "/reports/warehouse-balance":  "reports.account_ledger",
  "/opening-stock":          "opening_stock.manage",
  "/purchase-returns":       "receiving.view",
  "/suppliers":              "receiving.view",
  "/services-pricing":       "services.view",
  "/warehouses":             "warehouses.view",
  "/departments":            "departments.view",
  "/doctors":                "doctors.view",
  "/room-management":        "rooms.manage",
  "/audit-log":              "audit_log.view",
  "/account-mappings":       "settings.account_mappings",
  "/users":                  "users.view",
  "/permission-groups":      "permission_groups.view",
  "/contracts":              "contracts.view",
  "/contract-claims":        "contracts.claims.view",
  "/contracts-analytics":    "contracts.claims.view",
  "/approvals":              "approvals.view",
  "/patients":               "patients.view",
};

function AuthenticatedApp() {
  const { isAuthenticated, isLoading, user, permissions } = useAuth();
  const [, navigate] = useLocation();
  const didInitialRedirectRef = useRef(false);

  useEffect(() => {
    // ─── الشرط 1: انتظر اكتمال بيانات المستخدم والصلاحيات ──────────────────
    if (!isAuthenticated || !user || isLoading) return;
    if (didInitialRedirectRef.current) return;
    didInitialRedirectRef.current = true;

    const target = user.defaultRoute;
    if (!target || target === "/") return;

    // ─── الشرط 3: فرّق بين تسجيل دخول طازج وتحديث صفحة ────────────────────
    // "__plr" يوضعه use-auth بعد نجاح تسجيل الدخول مباشرةً
    const isFreshLogin = !!sessionStorage.getItem("__plr");
    const shouldRedirect = isFreshLogin || window.location.pathname === "/";
    if (!shouldRedirect) return;

    // ─── الشرط 2: تحقق من صلاحية الوصول للشاشة الافتتاحية ─────────────────
    const required = ROUTE_REQUIRED_PERMISSION[target];
    const hasAccess =
      required === undefined || // مسار غير مُعرَّف في الخريطة → نثق فيه
      required === null ||       // لا صلاحية خاصة مطلوبة
      permissions.includes(required);

    // احذف العلامة قبل الـ navigate (مهم: يحدث قبل أي async)
    if (isFreshLogin) sessionStorage.removeItem("__plr");

    // ─── الـ Prefetch حدث بالفعل (في AuthProvider) قبل هذا الـ effect ────────
    // الـ redirect فوري — لا ينتظر اكتمال الـ prefetch
    if (hasAccess) {
      navigate(target);
    }
    // إذا لم يكن لديه صلاحية: Fallback آمن — يبقى حيث هو
  }, [isAuthenticated, user, isLoading, permissions]); // eslint-disable-line react-hooks/exhaustive-deps

  // إعادة التعيين عند تسجيل الخروج حتى يعمل التوجيه في الجلسة القادمة
  useEffect(() => {
    if (!isAuthenticated) {
      didInitialRedirectRef.current = false;
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <>
      <DateChangeGuard />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
