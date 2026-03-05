import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import DateChangeGuard from "@/components/DateChangeGuard";
import Login from "@/pages/Login";
import { Loader2, ShieldAlert } from "lucide-react";

import Dashboard from "@/pages/Dashboard";
import ChartOfAccounts from "@/pages/ChartOfAccounts";
import JournalEntries from "@/pages/JournalEntries";
import JournalEntryForm from "@/pages/JournalEntryForm";
import CostCenters from "@/pages/CostCenters";
import FiscalPeriods from "@/pages/FiscalPeriods";
import Templates from "@/pages/Templates";
import TrialBalance from "@/pages/TrialBalance";
import IncomeStatement from "@/pages/IncomeStatement";
import BalanceSheet from "@/pages/BalanceSheet";
import CostCenterReports from "@/pages/CostCenterReports";
import AccountLedger from "@/pages/AccountLedger";
import AuditLog from "@/pages/AuditLog";
import ItemsList from "@/pages/ItemsList";
import ItemCard from "@/pages/ItemCard";
import StoreTransfers from "@/pages/store-transfers";
import TransferPreparation from "@/pages/transfer-preparation";
import SupplierReceiving from "@/pages/supplier-receiving";
import PurchaseInvoice from "@/pages/purchase-invoices";
import ServicesPricing from "@/pages/ServicesPricing";
import SalesInvoices from "@/pages/SalesInvoices";
import Warehouses from "@/pages/Warehouses";
import Departments from "@/pages/Departments";
import Patients from "@/pages/Patients";
import Doctors from "@/pages/Doctors";
import PatientInvoice from "@/pages/PatientInvoice";
import CashierCollection from "@/pages/cashier/CashierCollection";
import AccountMappings from "@/pages/AccountMappings";
import DrawerPasswords from "@/pages/DrawerPasswords";
import UsersManagement from "@/pages/users-management";
import BedBoard from "@/pages/bed-board";
import RoomManagement from "@/pages/RoomManagement";
import DoctorSettlements from "@/pages/DoctorSettlements";
import DoctorStatement from "@/pages/DoctorStatement";
import SystemSettings from "@/pages/SystemSettings";
import SurgeryTypes from "@/pages/SurgeryTypes";
import TreasuriesPage from "@/pages/treasuries/TreasuriesPage";
import AnnouncementsPage from "@/pages/announcements/AnnouncementsPage";
import NotFound from "@/pages/not-found";

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

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/">{() => <G p="dashboard.view"><Dashboard /></G>}</Route>
        <Route path="/chart-of-accounts">{() => <G p="accounts.view"><ChartOfAccounts /></G>}</Route>
        <Route path="/journal-entries">{() => <G p="journal.view"><JournalEntries /></G>}</Route>
        <Route path="/journal-entries/new">{() => <G p="journal.create"><JournalEntryForm /></G>}</Route>
        <Route path="/journal-entries/:id/edit">{(params) => <G p="journal.edit"><JournalEntryForm /></G>}</Route>
        <Route path="/journal-entries/:id">{(params) => <G p="journal.view"><JournalEntryForm /></G>}</Route>
        <Route path="/cost-centers">{() => <G p="cost_centers.view"><CostCenters /></G>}</Route>
        <Route path="/fiscal-periods">{() => <G p="fiscal_periods.view"><FiscalPeriods /></G>}</Route>
        <Route path="/templates">{() => <G p="templates.view"><Templates /></G>}</Route>
        <Route path="/reports/trial-balance">{() => <G p="reports.trial_balance"><TrialBalance /></G>}</Route>
        <Route path="/reports/income-statement">{() => <G p="reports.income_statement"><IncomeStatement /></G>}</Route>
        <Route path="/reports/balance-sheet">{() => <G p="reports.balance_sheet"><BalanceSheet /></G>}</Route>
        <Route path="/reports/cost-centers">{() => <G p="reports.cost_centers"><CostCenterReports /></G>}</Route>
        <Route path="/reports/account-ledger">{() => <G p="reports.account_ledger"><AccountLedger /></G>}</Route>
        <Route path="/items">{() => <G p="items.view"><ItemsList /></G>}</Route>
        <Route path="/items/new">{() => <G p="items.create"><ItemCard /></G>}</Route>
        <Route path="/items/:id">{(params) => <G p="items.view"><ItemCard /></G>}</Route>
        <Route path="/store-transfers">{() => <G p="transfers.view"><StoreTransfers /></G>}</Route>
        <Route path="/transfer-preparation">{() => <G p="transfers.view"><TransferPreparation /></G>}</Route>
        <Route path="/supplier-receiving">{() => <G p="receiving.view"><SupplierReceiving /></G>}</Route>
        <Route path="/purchase-invoices">{() => <G p="purchase_invoices.view"><PurchaseInvoice /></G>}</Route>
        <Route path="/sales-invoices">{() => <G p="sales.view"><SalesInvoices /></G>}</Route>
        <Route path="/services-pricing">{() => <G p="services.view"><ServicesPricing /></G>}</Route>
        <Route path="/warehouses">{() => <G p="warehouses.view"><Warehouses /></G>}</Route>
        <Route path="/departments">{() => <G p="departments.view"><Departments /></G>}</Route>
        <Route path="/patients">{() => <G p="patients.view"><Patients /></G>}</Route>
        <Route path="/doctors">{() => <G p="doctors.view"><Doctors /></G>}</Route>
        <Route path="/patient-invoices">{() => <G p="patient_invoices.view"><ErrorBoundary fallbackLabel="خطأ في صفحة فاتورة المريض"><PatientInvoice /></ErrorBoundary></G>}</Route>
        <Route path="/bed-board">{() => <G p="patient_invoices.view"><BedBoard /></G>}</Route>
        <Route path="/room-management">{() => <G p="patient_invoices.view"><RoomManagement /></G>}</Route>
        <Route path="/surgery-types">{() => <G p="patient_invoices.view"><SurgeryTypes /></G>}</Route>
        <Route path="/doctor-settlements">{() => <G p="patient_invoices.view"><DoctorSettlements /></G>}</Route>
        <Route path="/doctor-statement/:name">{() => <G p="doctors.view"><DoctorStatement /></G>}</Route>
        <Route path="/audit-log">{() => <G p="audit_log.view"><AuditLog /></G>}</Route>
        <Route path="/cashier-collection">{() => <G p="cashier.view"><CashierCollection /></G>}</Route>
        <Route path="/system-settings">{() => <G p="settings.account_mappings"><SystemSettings /></G>}</Route>
        <Route path="/account-mappings">{() => <G p="settings.account_mappings"><AccountMappings /></G>}</Route>
        <Route path="/drawer-passwords">{() => <G p="settings.drawer_passwords"><DrawerPasswords /></G>}</Route>
        <Route path="/treasuries">{() => <G p="settings.account_mappings"><TreasuriesPage /></G>}</Route>
        <Route path="/users">{() => <G p="users.view"><UsersManagement /></G>}</Route>
        <Route path="/announcements">{() => <G p="settings.account_mappings"><AnnouncementsPage /></G>}</Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

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
