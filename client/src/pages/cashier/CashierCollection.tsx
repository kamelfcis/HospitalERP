import { useState, useMemo } from "react";
import { DollarSign, Loader2, Receipt, Undo2, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useCashierShift, UnitType } from "./hooks/useCashierShift";
import { usePendingInvoices } from "./hooks/usePendingInvoices";
import { useCashierActions } from "./hooks/useCashierActions";
import { UnitSelector } from "./components/UnitSelector";
import { ShiftOpenForm } from "./components/ShiftOpenForm";
import { ShiftStatusBar } from "./components/ShiftStatusBar";
import { InvoiceTable } from "./components/InvoiceTable";
import { InvoiceDetailsPanel } from "./components/InvoiceDetailsPanel";
import { CloseShiftDialog } from "./components/CloseShiftDialog";
import { ShiftTotalsWidget } from "./components/ShiftTotalsWidget";
import { formatNumber } from "@/lib/formatters";

export default function CashierCollection() {
  const { hasPermission } = useAuth();
  const canViewTotals = hasPermission("cashier.view_shift_totals");
  const [activeTab, setActiveTab] = useState("sales");
  const [unitConfirmed, setUnitConfirmed] = useState(false);

  const shift = useCashierShift();
  const {
    selectedUnitType, setSelectedUnitType,
    selectedUnitId, setSelectedUnitId,
    unitsData, staffList,
    filteredGlAccounts, glAccountSearch, setGlAccountSearch,
    shiftGlAccountId, setShiftGlAccountId,
    selectedDrawerHasPassword, drawerPassword, setDrawerPassword,
    cashierName, setCashierName, openingCash, setOpeningCash,
    closeDialogOpen, setCloseDialogOpen, closingCash, setClosingCash,
    activeShift, shiftLoading, hasActiveShift,
    shiftId, shiftUnitType, shiftUnitId,
    shiftTotals, expectedCash, varianceCalc,
    openShiftMutation, closeShiftMutation, canOpenShift,
  } = shift;

  const invoices = usePendingInvoices(hasActiveShift, shiftUnitType, shiftUnitId, shiftId);
  const {
    salesSearch, setSalesSearch, salesSelected, setSalesSelected,
    returnsSearch, setReturnsSearch, returnsSelected, setReturnsSelected,
    pendingSales, salesLoading, pendingReturns, returnsLoading,
    salesDetails, returnsDetails, clearSelection,
  } = invoices;

  const actions = useCashierActions({
    shiftId, shiftUnitType, shiftUnitId,
    salesSelected, returnsSelected, cashierName, hasActiveShift,
    activeTab, clearSelection,
  });
  const { collectMutation, refundMutation } = actions;

  const salesAggregated = useMemo(() => {
    if (salesSelected.size <= 1) return null;
    const items = (pendingSales || []).filter(inv => salesSelected.has(inv.id));
    return { count: items.length, subtotal: items.reduce((s, i) => s + parseFloat(i.subtotal || "0"), 0), netTotal: items.reduce((s, i) => s + parseFloat(i.netTotal || "0"), 0) };
  }, [salesSelected, pendingSales]);

  const returnsAggregated = useMemo(() => {
    if (returnsSelected.size <= 1) return null;
    const items = (pendingReturns || []).filter(inv => returnsSelected.has(inv.id));
    return { count: items.length, subtotal: items.reduce((s, i) => s + parseFloat(i.subtotal || "0"), 0), netTotal: items.reduce((s, i) => s + parseFloat(i.netTotal || "0"), 0) };
  }, [returnsSelected, pendingReturns]);

  const resolveUnitName = (type: string | null, id: string) => {
    if (!unitsData || !id) return id;
    if (type === "pharmacy") return unitsData.pharmacies.find(p => p.id === id)?.nameAr || id;
    return unitsData.departments.find(d => d.id === id)?.nameAr || id;
  };

  const activeUnitName = resolveUnitName(
    activeShift?.unitType || selectedUnitType,
    shiftUnitId,
  );

  const handleUnitSelect = (type: UnitType, id: string) => {
    setSelectedUnitType(type);
    setSelectedUnitId(id);
    setUnitConfirmed(true);
    clearSelection();
  };

  const handleBack = () => {
    setUnitConfirmed(false);
    setSelectedUnitType(null);
    setSelectedUnitId("");
    clearSelection();
  };

  return (
    <div className="p-3 space-y-3 overflow-x-hidden" dir="rtl" data-testid="page-cashier-collection">
      <h1 className="text-lg font-bold text-right">شاشة تحصيل الكاشير</h1>

      <Card>
        <CardContent className="p-3">
          {shiftLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : hasActiveShift && activeShift ? (
            <ShiftStatusBar
              activeShift={activeShift}
              unitName={activeUnitName}
              unitType={activeShift.unitType}
              onCloseShift={() => { setClosingCash("0"); setCloseDialogOpen(true); }}
            />
          ) : !unitConfirmed ? (
            <div className="py-4">
              <UnitSelector unitsData={unitsData} onSelect={handleUnitSelect} />
            </div>
          ) : (
            <div className="py-4 space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto">
                  <Wallet className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-base font-semibold">لا توجد وردية مفتوحة</h2>
                <p className="text-xs text-muted-foreground">أدخل بياناتك وارصيد الخزنة لبدء التحصيل</p>
              </div>
              <ShiftOpenForm
                unitType={selectedUnitType!}
                unitName={resolveUnitName(selectedUnitType, selectedUnitId)}
                staffList={staffList}
                cashierName={cashierName}
                setCashierName={setCashierName}
                openingCash={openingCash}
                setOpeningCash={setOpeningCash}
                filteredGlAccounts={filteredGlAccounts}
                shiftGlAccountId={shiftGlAccountId}
                setShiftGlAccountId={setShiftGlAccountId}
                glAccountSearch={glAccountSearch}
                setGlAccountSearch={setGlAccountSearch}
                selectedDrawerHasPassword={selectedDrawerHasPassword}
                drawerPassword={drawerPassword}
                setDrawerPassword={setDrawerPassword}
                onBack={handleBack}
                onSubmit={() => openShiftMutation.mutate()}
                isPending={openShiftMutation.isPending}
                canSubmit={canOpenShift}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {hasActiveShift && (
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList className="w-full justify-start gap-2">
            <TabsTrigger value="sales" data-testid="tab-sales">
              <Receipt className="ml-2 h-4 w-4" />
              تحصيل فواتير البيع
              {(pendingSales?.length ?? 0) > 0 && (
                <span className="mr-1.5 bg-primary text-primary-foreground rounded-full text-[10px] px-1.5 py-0 min-w-[18px] text-center">
                  {pendingSales!.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="returns" data-testid="tab-returns">
              <Undo2 className="ml-2 h-4 w-4" />
              رد مرتجعات
              {(pendingReturns?.length ?? 0) > 0 && (
                <span className="mr-1.5 bg-destructive text-destructive-foreground rounded-full text-[10px] px-1.5 py-0 min-w-[18px] text-center">
                  {pendingReturns!.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <div className="flex flex-row-reverse gap-3 overflow-hidden">
              <div className="w-[60%] min-w-0 overflow-hidden space-y-2">
                <InvoiceTable
                  invoices={pendingSales || []}
                  loading={salesLoading}
                  search={salesSearch}
                  setSearch={setSalesSearch}
                  selected={salesSelected}
                  setSelected={setSalesSelected}
                  shiftUnitId={shiftUnitId}
                  testPrefix="sales"
                />
                <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => collectMutation.mutate()}
                    disabled={salesSelected.size === 0 || !hasActiveShift || collectMutation.isPending}
                    data-testid="button-collect"
                  >
                    {collectMutation.isPending ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : <DollarSign className="ml-1 h-3 w-3" />}
                    تحصيل ({salesSelected.size})
                  </Button>
                  {salesSelected.size > 0 && salesAggregated && (
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      الصافي: {formatNumber(salesAggregated.netTotal)} ج.م
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">Ctrl+Enter / F9</span>
                </div>
              </div>
              <div className="w-[40%] min-w-0">
                <InvoiceDetailsPanel selected={salesSelected} details={salesDetails} aggregated={salesAggregated} testPrefix="sales" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="returns">
            <div className="flex flex-row-reverse gap-3 overflow-hidden">
              <div className="w-[60%] min-w-0 overflow-hidden space-y-2">
                <InvoiceTable
                  invoices={pendingReturns || []}
                  loading={returnsLoading}
                  search={returnsSearch}
                  setSearch={setReturnsSearch}
                  selected={returnsSelected}
                  setSelected={setReturnsSelected}
                  shiftUnitId={shiftUnitId}
                  testPrefix="returns"
                />
                <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => refundMutation.mutate()}
                    disabled={returnsSelected.size === 0 || !hasActiveShift || refundMutation.isPending}
                    data-testid="button-refund"
                  >
                    {refundMutation.isPending ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : <Undo2 className="ml-1 h-3 w-3" />}
                    صرف المرتجع ({returnsSelected.size})
                  </Button>
                  {returnsSelected.size > 0 && returnsAggregated && (
                    <span className="text-xs font-medium text-red-700 dark:text-red-400">
                      الصافي: {formatNumber(returnsAggregated.netTotal)} ج.م
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">Ctrl+Enter / F9</span>
                </div>
              </div>
              <div className="w-[40%] min-w-0">
                <InvoiceDetailsPanel selected={returnsSelected} details={returnsDetails} aggregated={returnsAggregated} testPrefix="returns" />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {hasActiveShift && shiftTotals && canViewTotals && <ShiftTotalsWidget totals={shiftTotals} />}

      <CloseShiftDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        expectedCash={expectedCash}
        closingCash={closingCash}
        setClosingCash={setClosingCash}
        varianceCalc={varianceCalc}
        onConfirm={() => closeShiftMutation.mutate()}
        isPending={closeShiftMutation.isPending}
      />
    </div>
  );
}
