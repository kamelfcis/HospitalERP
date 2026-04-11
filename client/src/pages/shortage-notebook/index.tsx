/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  كشكول النواقص — Shortage Notebook Dashboard
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  لوحة تحليل شاملة للمدير الصيدلاني لمتابعة النواقص وقرارات الشراء.
 *
 *  الوضعان:
 *    shortage_driven  — الأصناف الناقصة فقط (الافتراضي)
 *    full_analysis    — تحليل كل الأصناف (لقرارات الشراء الاستباقية)
 *
 *  الأعمدة:
 *    الصنف | الرصيد (وحدة اختيارية) | طلبات النقص | طلبات 7 أيام |
 *    بيع الفترة | متوسط يومي | أيام التغطية | الحالة | إجراء
 *
 *  فلاتر:
 *    الوضع | الوحدة | الفترة | الحالة | المخزن | بحث | إظهار المحلول
 *
 *  قصور الكمية = lazy load عند الضغط على خلية الرصيد
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  NotebookPen,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Undo2,
} from "lucide-react";

import type {
  DashboardMode,
  DisplayUnit,
  StatusFilter,
  SortDir,
  DashboardResponse,
} from "./components/types";
import { todayStr, ago30dayStr } from "./components/helpers";
import { SortTh } from "./components/helpers";
import { FiltersBar } from "./components/FiltersBar";
import { ShortageRow } from "./components/ShortageRow";

function useResolveMutation(onSuccess: () => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiRequest("PATCH", `/api/shortage/resolve/${itemId}`, {}),
    onSuccess: () => {
      toast({ title: "✓ تم حل النقص", description: "تمت الإضافة إلى السجل." });
      onSuccess();
    },
    onError: () => {
      toast({ title: "خطأ", description: "تعذّر تحديث الحالة.", variant: "destructive" });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function ShortageNotebook() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  const canManage = hasPermission(PERMISSIONS.SHORTAGE_MANAGE);

  const [localOrderedIds, setLocalOrderedIds] = useState<Set<string>>(new Set());

  const [mode,         setMode]         = useState<DashboardMode>("shortage_driven");
  const [displayUnit,  setDisplayUnit]  = useState<DisplayUnit>("major");
  const [fromDate,     setFromDate]     = useState(ago30dayStr());
  const [toDate,       setToDate]       = useState(todayStr());
  const [status,       setStatus]       = useState<StatusFilter>("");
  const [search,       setSearch]       = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [page,         setPage]         = useState(1);
  const [sortBy,       setSortBy]       = useState("request_count");
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");

  const [selCategories, setSelCategories] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((cat: string) => {
    setSelCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setPage(1);
  }, []);

  const [excludeOrdered,   setExcludeOrdered]   = useState(true);
  const [showOrderedOnly,  setShowOrderedOnly]   = useState(false);
  const [orderedFromDate,  setOrderedFromDate]   = useState("");
  const [orderedToDate,    setOrderedToDate]     = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  const categoriesParam = selCategories.size > 0
    ? Array.from(selCategories).join(",")
    : "";

  const qParams = new URLSearchParams({
    mode, displayUnit, fromDate, toDate,
    categories:     categoriesParam,
    status:         status || "",
    search:         search.trim(),
    showResolved:   String(showResolved),
    excludeOrdered: String(excludeOrdered),
    showOrderedOnly:String(showOrderedOnly),
    orderedFromDate: orderedFromDate || "",
    orderedToDate:   orderedToDate   || "",
    page:    String(page),
    limit:   "50",
    sortBy,
    sortDir,
  }).toString();

  const { data, isLoading, isFetching, refetch } = useQuery<DashboardResponse>({
    queryKey: [`/api/shortage/dashboard?${qParams}`],
    staleTime: 30_000,
  });

  const rows  = data?.rows  ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const handleSort = useCallback((col: string) => {
    setSortBy((prev) => {
      if (prev === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      else { setSortDir("desc"); }
      return col;
    });
    setPage(1);
  }, []);

  const resolve = useResolveMutation(() => {
    qc.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        (query.queryKey[0] as string).startsWith("/api/shortage/dashboard"),
    });
  });

  const invalidateDashboard = useCallback(() => {
    qc.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        (query.queryKey[0] as string).startsWith("/api/shortage/dashboard"),
    });
  }, [qc]);

  const markOrdered = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest("POST", "/api/shortage/followup/order", { itemId })
        .then((r) => r.json()),
    onSuccess: (data: { success: boolean; alreadyActive?: boolean; followup: { id: string } }, itemId: string) => {
      if (!data.success && data.alreadyActive) {
        toast({ description: "هذا الصنف مطلوب من الشركة بالفعل ولم ينتهِ موعد المتابعة" });
        return;
      }
      if (!data.success) return;

      setLocalOrderedIds(prev => new Set([...prev, itemId]));

      const followupId = data.followup.id;

      let undone = false;

      const handleUndo = async () => {
        undone = true;
        setLocalOrderedIds(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        await apiRequest("DELETE", `/api/shortage/followup/${followupId}`, undefined);
        invalidateDashboard();
        toast({ description: "تم التراجع بنجاح" });
      };

      toast({
        description: "تم تسجيل طلب الصنف من الشركة — سيُستبعد حتى موعد المتابعة",
        action: (
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            data-testid="btn-undo-order"
          >
            <Undo2 className="h-3.5 w-3.5" />
            تراجع
          </button>
        ) as any,
        duration: 5000,
      });

      setTimeout(() => {
        if (!undone) invalidateDashboard();
      }, 5200);
    },
    onError: () => {
      toast({ variant: "destructive", description: "حدث خطأ أثناء تسجيل الطلب" });
    },
  });

  const markReceivedMut = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest("POST", "/api/shortage/followup/received", { itemId })
        .then((r) => r.json()),
    onSuccess: (_data, _itemId) => {
      toast({ description: "تم تسجيل توريد الصنف ✔" });
      invalidateDashboard();
    },
    onError: () => {
      toast({ variant: "destructive", description: "حدث خطأ أثناء تسجيل التوريد" });
    },
  });

  return (
    <div className="p-4 space-y-4" dir="rtl">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-gray-800">كشكول النواقص</h1>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>تحديث</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <FiltersBar
        mode={mode} setMode={setMode}
        displayUnit={displayUnit} setDisplayUnit={setDisplayUnit}
        fromDate={fromDate} setFromDate={setFromDate}
        toDate={toDate} setToDate={setToDate}
        status={status} setStatus={setStatus}
        search={search} setSearch={setSearch}
        searchInputRef={searchInputRef}
        showResolved={showResolved} setShowResolved={setShowResolved}
        selCategories={selCategories} toggleCategory={toggleCategory}
        clearCategories={() => { setSelCategories(new Set()); setPage(1); }}
        excludeOrdered={excludeOrdered} setExcludeOrdered={setExcludeOrdered}
        showOrderedOnly={showOrderedOnly} setShowOrderedOnly={setShowOrderedOnly}
        orderedFromDate={orderedFromDate} setOrderedFromDate={setOrderedFromDate}
        orderedToDate={orderedToDate} setOrderedToDate={setOrderedToDate}
        setPage={setPage}
      />

      {/* ── Summary stats bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span>
          <strong className="text-gray-800">{total.toLocaleString("ar-EG")}</strong> صنف
        </span>
        {total > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span>
              غير متوفر:{" "}
              <strong className="text-red-600">
                {rows.filter((r) => r.statusFlag === "not_available").length}
              </strong>
            </span>
            <span className="text-gray-300">|</span>
            <span>
              ضغط عالٍ:{" "}
              <strong className="text-orange-500">
                {rows.filter((r) => r.statusFlag === "high_demand").length}
              </strong>
            </span>
          </>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 text-xs">
                <SortTh col="item_code"        current={sortBy} dir={sortDir} onSort={handleSort} label="الكود"               className="w-24" />
                <SortTh col="item_name"        current={sortBy} dir={sortDir} onSort={handleSort} label="الصنف"               />
                <SortTh col="qty_display"      current={sortBy} dir={sortDir} onSort={handleSort} label="الرصيد"              className="w-28 text-center" />
                <SortTh col="request_count"    current={sortBy} dir={sortDir} onSort={handleSort} label="طلبات النقص"        className="w-28 text-center" />
                <SortTh col="recent_7d_requests" current={sortBy} dir={sortDir} onSort={handleSort} label="7 أيام"            className="w-20 text-center" />
                <SortTh col="last_requested_at" current={sortBy} dir={sortDir} onSort={handleSort} label="آخر طلب"           className="w-28 text-center" />
                <SortTh col="avg_daily_display" current={sortBy} dir={sortDir} onSort={handleSort} label="متوسط يومي"        className="w-28 text-center" />
                <SortTh col="days_of_coverage"  current={sortBy} dir={sortDir} onSort={handleSort} label="أيام التغطية"      className="w-28 text-center" />
                <SortTh col="status_flag"       current={sortBy} dir={sortDir} onSort={handleSort} label="الحالة"            className="w-36 text-center" />
                <TableHead className="w-20 text-center">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-gray-500 text-sm">
                    {mode === "shortage_driven"
                      ? "لا توجد نواقص مُسجَّلة"
                      : "لا توجد أصناف بهذا الفلتر"}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <ShortageRow
                    key={row.itemId}
                    row={row}
                    displayUnit={displayUnit}
                    onResolve={() => resolve.mutate(row.itemId)}
                    resolving={resolve.isPending}
                    onMarkOrdered={() => markOrdered.mutate(row.itemId)}
                    markingOrdered={markOrdered.isPending}
                    onMarkReceived={() => markReceivedMut.mutate(row.itemId)}
                    markingReceived={markReceivedMut.isPending}
                    localOrdered={localOrderedIds.has(row.itemId)}
                    canManage={canManage}
                    mode={mode}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline" size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            data-testid="btn-prev-page"
          >
            السابق
            <ChevronRight className="h-3 w-3" />
          </Button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline" size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="btn-next-page"
          >
            <ChevronLeft className="h-3 w-3" />
            التالي
          </Button>
        </div>
      )}

      {/* ── Alt+S hint banner ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-md p-2">
        <AlertTriangle className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <span>
          اضغط <kbd className="bg-blue-100 border border-blue-200 rounded px-1 py-0.5 text-blue-700">Alt+S</kbd>{" "}
          من أي شاشة بيع أو فاتورة مريض لتسجيل نقص الصنف المحدد تلقائياً.
        </span>
      </div>
    </div>
  );
}
