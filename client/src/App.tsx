import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
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
import StoreTransfers from "@/pages/StoreTransfers";
import SupplierReceiving from "@/pages/SupplierReceiving";
import PurchaseInvoice from "@/pages/PurchaseInvoice";
import ServicesPricing from "@/pages/ServicesPricing";
import SalesInvoices from "@/pages/SalesInvoices";
import Warehouses from "@/pages/Warehouses";
import Departments from "@/pages/Departments";
import Patients from "@/pages/Patients";
import Doctors from "@/pages/Doctors";
import PatientInvoice from "@/pages/PatientInvoice";
import CashierCollection from "@/pages/CashierCollection";
import AccountMappings from "@/pages/AccountMappings";
import DrawerPasswords from "@/pages/DrawerPasswords";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/chart-of-accounts" component={ChartOfAccounts} />
        <Route path="/journal-entries" component={JournalEntries} />
        <Route path="/journal-entries/new" component={JournalEntryForm} />
        <Route path="/journal-entries/:id/edit" component={JournalEntryForm} />
        <Route path="/journal-entries/:id" component={JournalEntryForm} />
        <Route path="/cost-centers" component={CostCenters} />
        <Route path="/fiscal-periods" component={FiscalPeriods} />
        <Route path="/templates" component={Templates} />
        <Route path="/reports/trial-balance" component={TrialBalance} />
        <Route path="/reports/income-statement" component={IncomeStatement} />
        <Route path="/reports/balance-sheet" component={BalanceSheet} />
        <Route path="/reports/cost-centers" component={CostCenterReports} />
        <Route path="/reports/account-ledger" component={AccountLedger} />
        <Route path="/items" component={ItemsList} />
        <Route path="/items/new" component={ItemCard} />
        <Route path="/items/:id" component={ItemCard} />
        <Route path="/store-transfers" component={StoreTransfers} />
        <Route path="/supplier-receiving" component={SupplierReceiving} />
        <Route path="/purchase-invoices" component={PurchaseInvoice} />
        <Route path="/sales-invoices" component={SalesInvoices} />
        <Route path="/services-pricing" component={ServicesPricing} />
        <Route path="/warehouses" component={Warehouses} />
        <Route path="/departments" component={Departments} />
        <Route path="/patients" component={Patients} />
        <Route path="/doctors" component={Doctors} />
        <Route path="/patient-invoices" component={PatientInvoice} />
        <Route path="/audit-log" component={AuditLog} />
        <Route path="/cashier-collection" component={CashierCollection} />
        <Route path="/account-mappings" component={AccountMappings} />
        <Route path="/drawer-passwords" component={DrawerPasswords} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
