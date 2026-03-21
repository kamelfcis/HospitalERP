/*
 * تسليم الدرج — Cash Drawer Handover Report
 * ─────────────────────────────────────────────
 * ملخص الورديات وحركة التسليم للخزنة الرئيسية
 *
 * Architecture:
 *   hooks.ts         — useCashierNames, useHandoverData
 *   FilterBar        — filter controls (dates, cashier dropdown, status)
 *   SummaryCards     — totals strip
 *   SummaryTable     — per-shift detail table
 */

import { useState, useCallback } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FilterBar, type HandoverFilters } from "./components/FilterBar";
import { SummaryCards } from "./components/SummaryCards";
import { SummaryTable } from "./components/SummaryTable";
import { useHandoverData } from "./hooks";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: HandoverFilters = {
  from: todayISO(),
  to: todayISO(),
  cashierName: "",
  status: "all",
};

export default function CashierHandoverPage() {
  const [appliedFilters, setAppliedFilters] = useState<HandoverFilters>(DEFAULT_FILTERS);
  const page = 1;

  const { data, isLoading, isError, error, refetch } = useHandoverData(appliedFilters, page);

  const handleApply   = useCallback((f: HandoverFilters) => setAppliedFilters(f), []);
  const handleRefresh = useCallback(() => refetch(), [refetch]);

  const rows   = data?.rows   ?? [];
  const totals = data?.totals ?? {
    totalCashSales: 0,
    totalCreditSales: 0,
    totalSalesInvoiceCount: 0,
    totalReturns: 0,
    totalReturnInvoiceCount: 0,
    totalNet: 0,
    totalTransferredToTreasury: 0,
    rowCount: 0,
  };

  return (
    <div className="p-4 max-w-full" dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">تسليم الدرج</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          ملخص الورديات وحركة التسليم للخزنة الرئيسية
        </p>
      </div>

      <FilterBar
        filters={appliedFilters}
        onApply={handleApply}
        onRefresh={handleRefresh}
        isLoading={isLoading}
      />

      {isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{(error as Error)?.message ?? "حدث خطأ أثناء تحميل البيانات"}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              className="mr-2"
            >
              إعادة المحاولة
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isError && (
        <>
          <SummaryCards totals={totals} />
          <SummaryTable rows={rows} isLoading={isLoading} />
          {data?.pagination && (
            <p className="text-xs text-muted-foreground mt-2 text-left">
              إجمالي النتائج: {data.pagination.total} وردية
            </p>
          )}
        </>
      )}
    </div>
  );
}
