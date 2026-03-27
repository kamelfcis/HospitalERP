// ============================================================
//  CashierCollection — شاشة تحصيل الكاشير (orchestrator)
//
//  هذا الملف orchestrator فقط — لا يحتوي على منطق عمل.
//  كل منطق موزّع على الـ hooks والمكوّنات المتخصصة:
//
//  useCashierShift     → دورة حياة الوردية (فتح / إغلاق / تحقق)
//  usePendingInvoices  → جلب البيانات + SSE
//  useInvoiceTab       → حالة كل تاب (بحث + اختيار + تفاصيل)
//  useCashierActions   → mutations التحصيل والصرف + اختصارات
//  InvoiceWorkArea     → compound component لكل تاب
// ============================================================
import { useState } from "react";
import { AlertTriangle, DollarSign, Loader2, Receipt, Undo2, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { formatNumber } from "@/lib/formatters";

import { useCashierShift }    from "./hooks/useCashierShift";
import { usePendingInvoices } from "./hooks/usePendingInvoices";
import { useInvoiceTab }      from "./hooks/useInvoiceTab";
import { useCashierActions }  from "./hooks/useCashierActions";
import { useReceiptPrint }    from "@/hooks/use-receipt-print";

import { UnitSelector }                 from "./components/UnitSelector";
import { ShiftOpenForm }                from "./components/ShiftOpenForm";
import { ShiftStatusBar }               from "./components/ShiftStatusBar";
import { InvoiceWorkArea }              from "./components/InvoiceWorkArea";
import { ShiftTotalsWidget }            from "./components/ShiftTotalsWidget";
import { CloseShiftDialog }             from "./components/CloseShiftDialog";
import { CloseShiftValidationDialog }   from "./components/CloseShiftValidationDialog";

// ============================================================
export default function CashierCollection() {
  const { user, hasPermission } = useAuth();
  const canViewTotals = hasPermission("cashier.view_shift_totals");
  const [activeTab, setActiveTab] = useState<"sales" | "returns">("sales");

  // ── الوردية ───────────────────────────────────────────────
  const shift = useCashierShift();
  const {
    selectedUnitType, setSelectedUnitType,
    selectedUnitId,   setSelectedUnitId,
    unitConfirmed,    setUnitConfirmed,
    unitsData,        resolveUnitName, activeUnitName,
    openingCash,      setOpeningCash,
    drawerPassword,   setDrawerPassword,
    userGlAccount,    canOpenShift,
    openShiftMutation,
    activeShift,      shiftLoading, hasActiveShift, isStale,
    shiftId,          shiftUnitType, shiftUnitId,
    shiftTotals,      expectedCash, varianceCalc,
    closeDialogOpen,      setCloseDialogOpen,
    closingCash,          setClosingCash,
    validationDialogOpen, setValidationDialogOpen,
    validation,           isValidating,
    closeShiftMutation,
    handleCloseShiftClick, handleProceedFromValidation,
  } = shift;

  // ── جلب البيانات + SSE ────────────────────────────────────
  const { pendingSales, salesLoading, pendingReturns, returnsLoading } = usePendingInvoices({
    hasActiveShift, shiftUnitType, shiftUnitId, shiftId,
  });

  // ── تاب المبيعات ──────────────────────────────────────────
  const salesTab = useInvoiceTab({
    invoices:        pendingSales,
    hasActiveShift,
    detailsEndpoint: (id) => `/api/cashier/invoice/${id}/details`,
  });

  // ── تاب المرتجعات ─────────────────────────────────────────
  const returnsTab = useInvoiceTab({
    invoices:        pendingReturns,
    hasActiveShift,
    detailsEndpoint: (id) => `/api/cashier/invoice/${id}/details`,
  });

  // ── مسح الاختيار في كلا التابين معاً ─────────────────────
  const clearAllSelections = () => { salesTab.clearSelection(); returnsTab.clearSelection(); };

  // ── طباعة الإيصالات ───────────────────────────────────────
  const { printInvoiceReceipts } = useReceiptPrint();

  // ── mutations التحصيل والصرف + اختصارات لوحة المفاتيح ───
  const { collectMutation, refundMutation } = useCashierActions({
    shiftId, shiftUnitType, shiftUnitId,
    salesSelected:   salesTab.selected,
    returnsSelected: returnsTab.selected,
    cashierName:     user?.fullName || "",
    hasActiveShift,  activeTab,
    clearSelection:  clearAllSelections,
    onPrintReceipts: printInvoiceReceipts,
  });

  // ── handlers اختيار الوحدة ────────────────────────────────
  const handleUnitSelect = (type: "pharmacy" | "department", id: string) => {
    setSelectedUnitType(type);
    setSelectedUnitId(id);
    setUnitConfirmed(true);
    clearAllSelections();
  };

  const handleBack = () => {
    setUnitConfirmed(false);
    setSelectedUnitType(null);
    setSelectedUnitId("");
    clearAllSelections();
  };

  // ============================================================
  return (
    <div className="p-3 space-y-3 overflow-x-hidden" dir="rtl" data-testid="page-cashier-collection">
      <h1 className="text-lg font-bold text-right">شاشة تحصيل الكاشير</h1>

      {/* ── كارت الوردية (فتح / حالة) ── */}
      <Card>
        <CardContent className="p-3">
          {shiftLoading ? (
            <Skeleton className="h-10 w-full" />

          ) : hasActiveShift && activeShift ? (
            <ShiftStatusBar
              activeShift={activeShift}
              unitName={activeUnitName}
              unitType={activeShift.unitType}
              onCloseShift={() => { setClosingCash("0"); handleCloseShiftClick(); }}
              isClosing={isValidating}
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
                <p className="text-xs text-muted-foreground">أدخل رصيد الخزنة لبدء التحصيل</p>
              </div>
              <ShiftOpenForm
                unitType={selectedUnitType!}
                unitName={resolveUnitName(selectedUnitType, selectedUnitId)}
                cashierName={user?.fullName || ""}
                userGlAccount={userGlAccount}
                openingCash={openingCash}
                setOpeningCash={setOpeningCash}
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

      {/* ── تحذير الوردية المنتهية (stale) ── */}
      {isStale && activeShift && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-amber-800 dark:text-amber-300"
          data-testid="banner-stale-shift">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">وردية منتهية الصلاحية</p>
            <p className="text-xs mt-0.5">
              تجاوزت هذه الوردية {24} ساعة منذ الفتح. يرجى إغلاقها من قِبَل المشرف لاستئناف العمل.
            </p>
          </div>
        </div>
      )}

      {/* ── تابات التحصيل (تظهر فقط عند وجود وردية) ── */}
      {hasActiveShift && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "sales" | "returns")} dir="rtl">
          <TabsList className="w-full justify-start gap-2">

            {/* تاب المبيعات */}
            <TabsTrigger value="sales" data-testid="tab-sales">
              <Receipt className="ml-2 h-4 w-4" />
              تحصيل فواتير البيع
              <CountBadge count={pendingSales?.length} color="primary" />
            </TabsTrigger>

            {/* تاب المرتجعات */}
            <TabsTrigger value="returns" data-testid="tab-returns">
              <Undo2 className="ml-2 h-4 w-4" />
              رد مرتجعات
              <CountBadge count={pendingReturns?.length} color="destructive" />
            </TabsTrigger>
          </TabsList>

          {/* ── محتوى تاب المبيعات ── */}
          <TabsContent value="sales">
            <InvoiceWorkArea
              invoices={salesTab.filtered}
              loading={salesLoading}
              search={salesTab.search}
              setSearch={salesTab.setSearch}
              selected={salesTab.selected}
              toggleOne={salesTab.toggleOne}
              toggleAll={salesTab.toggleAll}
              shiftUnitId={shiftUnitId}
              details={salesTab.details}
              detailsLoading={salesTab.detailsLoading}
              aggregated={salesTab.aggregated}
              testPrefix="sales"
              actionBar={
                <>
                  <Button
                    size="sm"
                    onClick={() => collectMutation.mutate()}
                    disabled={salesTab.selected.size === 0 || !hasActiveShift || isStale || collectMutation.isPending}
                    data-testid="button-collect"
                  >
                    {collectMutation.isPending
                      ? <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                      : <DollarSign className="ml-1 h-3 w-3" />}
                    تحصيل ({salesTab.selected.size})
                  </Button>

                  {salesTab.selected.size > 0 && salesTab.aggregated && (
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      الصافي: {formatNumber(salesTab.aggregated.netTotal)} ج.م
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">Ctrl+Enter / F9</span>
                </>
              }
            />
          </TabsContent>

          {/* ── محتوى تاب المرتجعات ── */}
          <TabsContent value="returns">
            <InvoiceWorkArea
              invoices={returnsTab.filtered}
              loading={returnsLoading}
              search={returnsTab.search}
              setSearch={returnsTab.setSearch}
              selected={returnsTab.selected}
              toggleOne={returnsTab.toggleOne}
              toggleAll={returnsTab.toggleAll}
              shiftUnitId={shiftUnitId}
              details={returnsTab.details}
              detailsLoading={returnsTab.detailsLoading}
              aggregated={returnsTab.aggregated}
              testPrefix="returns"
              actionBar={
                <>
                  <Button
                    size="sm"
                    onClick={() => refundMutation.mutate()}
                    disabled={returnsTab.selected.size === 0 || !hasActiveShift || isStale || refundMutation.isPending}
                    data-testid="button-refund"
                  >
                    {refundMutation.isPending
                      ? <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                      : <Undo2 className="ml-1 h-3 w-3" />}
                    صرف المرتجع ({returnsTab.selected.size})
                  </Button>

                  {returnsTab.selected.size > 0 && returnsTab.aggregated && (
                    <span className="text-xs font-medium text-red-700 dark:text-red-400">
                      الصافي: {formatNumber(returnsTab.aggregated.netTotal)} ج.م
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">Ctrl+Enter / F9</span>
                </>
              }
            />
          </TabsContent>
        </Tabs>
      )}

      {/* ── ويدجت إجماليات الوردية (أسفل يسار) ── */}
      {hasActiveShift && shiftTotals && canViewTotals && (
        <ShiftTotalsWidget totals={shiftTotals} />
      )}

      {/* ── dialogs إغلاق الوردية ── */}
      <CloseShiftValidationDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        validation={validation}
        isValidating={isValidating}
        onProceed={handleProceedFromValidation}
      />

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

// ── CountBadge — عدداد صغير على الـ tab ──────────────────────
function CountBadge({ count, color }: { count: number | undefined; color: "primary" | "destructive" }) {
  if (!count) return null;
  const cls = color === "primary"
    ? "bg-primary text-primary-foreground"
    : "bg-destructive text-destructive-foreground";
  return (
    <span className={`mr-1.5 ${cls} rounded-full text-[10px] px-1.5 py-0 min-w-[18px] text-center`}>
      {count}
    </span>
  );
}
