/*
 * تسليم الدرج — Cash Drawer Handover Report
 * ─────────────────────────────────────────
 * ملخص الورديات وحركة التسليم للخزنة الرئيسية
 *
 * Architecture:
 *   - page owns filter state + query params + fetch hook
 *   - FilterBar    — filter controls only
 *   - SummaryCards — totals summary only
 *   - SummaryTable — results table only
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FilterBar, type HandoverFilters } from "./components/FilterBar";
import { SummaryCards } from "./components/SummaryCards";
import { SummaryTable } from "./components/SummaryTable";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: HandoverFilters = {
  from: todayISO(),
  to: todayISO(),
  cashierName: "",
  status: "all",
};

function buildQueryKey(filters: HandoverFilters, page: number) {
  return [
    "/api/cashier-shifts/drawer-handover-summary",
    filters.from,
    filters.to,
    filters.cashierName,
    filters.status,
    page,
  ] as const;
}

function buildUrl(filters: HandoverFilters, page: number) {
  const p = new URLSearchParams();
  if (filters.from)         p.set("from", filters.from);
  if (filters.to)           p.set("to", filters.to);
  if (filters.cashierName)  p.set("cashierName", filters.cashierName);
  if (filters.status !== "all") p.set("status", filters.status);
  p.set("page", String(page));
  p.set("pageSize", "100");
  return `/api/cashier-shifts/drawer-handover-summary?${p.toString()}`;
}

export default function CashierHandoverPage() {
  const [appliedFilters, setAppliedFilters] = useState<HandoverFilters>(DEFAULT_FILTERS);
  const [page] = useState(1);

  const queryKey = buildQueryKey(appliedFilters, page);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(buildUrl(appliedFilters, page), { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      return res.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const handleApply = useCallback((filters: HandoverFilters) => {
    setAppliedFilters(filters);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const rows   = data?.rows   ?? [];
  const totals = data?.totals ?? {
    totalCashSales: 0, totalCreditSales: 0, totalSalesInvoiceCount: 0,
    totalReturns: 0, totalReturnInvoiceCount: 0, totalNet: 0,
    totalTransferredToTreasury: 0, rowCount: 0,
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
            <Button size="sm" variant="outline" onClick={handleRefresh} className="mr-2">
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
            <div className="text-xs text-muted-foreground mt-2 text-left">
              إجمالي النتائج: {data.pagination.total} وردية
            </div>
          )}
        </>
      )}
    </div>
  );
}
