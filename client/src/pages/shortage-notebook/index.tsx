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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  NotebookPen,
  Search,
  RefreshCw,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Warehouse,
  Calendar,
  AlertTriangle,
  TrendingDown,
  PackageX,
  ArrowLeftRight,
  Flame,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardMode  = "shortage_driven" | "full_analysis";
type DisplayUnit    = "major" | "medium" | "minor";
type StatusFilter   = "not_available" | "available_elsewhere" | "low_stock" | "high_demand" | "normal" | "";
type SortDir        = "asc" | "desc";

interface DashboardRow {
  itemId:              string;
  itemCode:            string;
  itemName:            string;
  category:            string;
  displayUnitName:     string | null;
  salePriceCurrent:    number;
  requestCount:        number;
  recent7dRequests:    number;
  firstRequestedAt:    string | null;
  lastRequestedAt:     string | null;
  isResolved:          boolean;
  totalQtyMinor:       number;
  warehousesWithStock: number;
  qtyDisplay:          number;
  totalIssuedMinor:    number;
  activeSalesDays:     number;
  avgDailyMinor:       number;
  avgDailyDisplay:     number;
  daysOfCoverage:      number | null;
  statusFlag:          string;
  totalCount:          number;
}

interface DashboardResponse {
  rows:  DashboardRow[];
  total: number;
  page:  number;
  limit: number;
}

interface WarehouseStockRow {
  warehouseId:   string;
  warehouseName: string;
  qtyInMinor:    number;
  qtyDisplay:    number;
  displayUnit:   string | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: typeof PackageX }> = {
  not_available:      { label: "غير متوفر",       color: "bg-red-100 text-red-700 border-red-200",     icon: PackageX },
  available_elsewhere:{ label: "متوفر بمخزن آخر",  color: "bg-blue-100 text-blue-700 border-blue-200",  icon: ArrowLeftRight },
  high_demand:        { label: "ضغط عالٍ",         color: "bg-orange-100 text-orange-700 border-orange-200", icon: Flame },
  low_stock:          { label: "مخزون منخفض",     color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: TrendingDown },
  normal:             { label: "طبيعي",            color: "bg-green-100 text-green-700 border-green-200",  icon: CheckCircle2 },
};

function StatusBadge({ flag }: { flag: string }) {
  const meta = STATUS_META[flag] ?? STATUS_META.normal;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

// ─── Coverage indicator ───────────────────────────────────────────────────────

function CoveragePill({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-400 text-xs">—</span>;
  const color =
    days < 7  ? "text-red-600 font-bold" :
    days < 14 ? "text-orange-500 font-semibold" :
    days < 30 ? "text-yellow-600" :
                "text-green-600";
  return <span className={`text-sm ${color}`}>{days.toFixed(1)} يوم</span>;
}

// ─── Warehouse stock popover (lazy) ──────────────────────────────────────────

function WarehouseStockPopover({
  itemId,
  displayUnit,
  trigger,
}: {
  itemId:      string;
  displayUnit: DisplayUnit;
  trigger:     React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<WarehouseStockRow[]>({
    queryKey: [`/api/shortage/item/${itemId}/stock?displayUnit=${displayUnit}`],
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Warehouse className="h-4 w-4" />
          رصيد المخازن
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-2">لا يوجد رصيد في أي مخزن</p>
        ) : (
          <div className="space-y-1">
            {data.map((w) => (
              <div key={w.warehouseId} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{w.warehouseName}</span>
                <span className="font-semibold">
                  {w.qtyDisplay.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                  {w.displayUnit ? ` ${w.displayUnit}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── SortHeader ───────────────────────────────────────────────────────────────

function SortTh({
  col, current, dir, label, onSort, className = "",
}: {
  col: string; current: string; dir: SortDir;
  label: string; onSort: (c: string) => void; className?: string;
}) {
  const active = current === col;
  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-20" />
        )}
      </span>
    </TableHead>
  );
}

// ─── Resolve mutation ─────────────────────────────────────────────────────────

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

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr()    { return new Date().toISOString().slice(0, 10); }
function ago30dayStr() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function fmtDateAr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function ShortageNotebook() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Filters ───────────────────────────────────────────────────────────────
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

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Build query key ───────────────────────────────────────────────────────
  const qParams = new URLSearchParams({
    mode, displayUnit, fromDate, toDate,
    status: status || "",
    search: search.trim(),
    showResolved: String(showResolved),
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

  // ── Sort handler ──────────────────────────────────────────────────────────
  const handleSort = useCallback((col: string) => {
    setSortBy((prev) => {
      if (prev === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      else { setSortDir("desc"); }
      return col;
    });
    setPage(1);
  }, []);

  // ── Resolve ───────────────────────────────────────────────────────────────
  const resolve = useResolveMutation(() => {
    qc.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        (query.queryKey[0] as string).startsWith("/api/shortage/dashboard"),
    });
  });

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* ── Filters Bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 border rounded-lg p-3">

        {/* Mode */}
        <Select value={mode} onValueChange={(v) => { setMode(v as DashboardMode); setPage(1); }}>
          <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shortage_driven">النواقص فقط</SelectItem>
            <SelectItem value="full_analysis">تحليل شامل</SelectItem>
          </SelectContent>
        </Select>

        {/* Display Unit */}
        <Select value={displayUnit} onValueChange={(v) => { setDisplayUnit(v as DisplayUnit); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="major">وحدة كبرى</SelectItem>
            <SelectItem value="medium">وحدة وسطى</SelectItem>
            <SelectItem value="minor">وحدة صغرى</SelectItem>
          </SelectContent>
        </Select>

        {/* Date from */}
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">من</span>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36"
            data-testid="input-from-date"
          />
        </div>

        {/* Date to */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">إلى</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36"
            data-testid="input-to-date"
          />
        </div>

        {/* Status */}
        <Select value={status || "__all__"} onValueChange={(v) => { setStatus(v === "__all__" ? "" : v as StatusFilter); setPage(1); }}>
          <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-status">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الحالات</SelectItem>
            <SelectItem value="not_available">غير متوفر</SelectItem>
            <SelectItem value="available_elsewhere">متوفر بمخزن آخر</SelectItem>
            <SelectItem value="high_demand">ضغط عالٍ</SelectItem>
            <SelectItem value="low_stock">مخزون منخفض</SelectItem>
            <SelectItem value="normal">طبيعي</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="بحث بالاسم أو الكود..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 text-sm pr-8"
            data-testid="input-search"
          />
        </div>

        {/* Show resolved toggle */}
        {mode === "shortage_driven" && (
          <Button
            variant={showResolved ? "default" : "outline"}
            size="sm"
            onClick={() => { setShowResolved(!showResolved); setPage(1); }}
            data-testid="btn-show-resolved"
            className="h-8 text-sm"
          >
            {showResolved ? "إخفاء المحلول" : "إظهار المحلول"}
          </Button>
        )}
      </div>

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

// ═══════════════════════════════════════════════════════════════════════════════
//  ShortageRow — مُذكَّرة بـ memo للأداء
// ═══════════════════════════════════════════════════════════════════════════════

import { memo } from "react";

const ShortageRow = memo(function ShortageRow({
  row,
  displayUnit,
  onResolve,
  resolving,
  mode,
}: {
  row:         DashboardRow;
  displayUnit: DisplayUnit;
  onResolve:   () => void;
  resolving:   boolean;
  mode:        DashboardMode;
}) {
  const unitLabel = row.displayUnitName ?? "";

  return (
    <TableRow
      className={`text-sm hover:bg-gray-50 ${row.isResolved ? "opacity-50" : ""}`}
      data-testid={`row-shortage-${row.itemId}`}
    >
      {/* كود */}
      <TableCell className="font-mono text-xs text-gray-500">{row.itemCode}</TableCell>

      {/* اسم الصنف */}
      <TableCell className="font-medium max-w-48">
        <div className="truncate" title={row.itemName}>{row.itemName}</div>
        {row.category && (
          <div className="text-xs text-gray-400">{row.category}</div>
        )}
      </TableCell>

      {/* الرصيد — lazy popover */}
      <TableCell className="text-center">
        <WarehouseStockPopover
          itemId={row.itemId}
          displayUnit={displayUnit}
          trigger={
            <button
              className="group inline-flex items-center gap-1 hover:underline cursor-pointer"
              data-testid={`btn-stock-${row.itemId}`}
            >
              <span
                className={`font-semibold ${
                  row.totalQtyMinor === 0 ? "text-red-600" :
                  row.warehousesWithStock > 1 ? "text-blue-600" :
                  "text-gray-800"
                }`}
              >
                {row.qtyDisplay.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
              </span>
              {unitLabel && <span className="text-xs text-gray-400">{unitLabel}</span>}
              {row.warehousesWithStock > 1 && (
                <span className="text-xs text-blue-400">({row.warehousesWithStock} مخازن)</span>
              )}
            </button>
          }
        />
      </TableCell>

      {/* طلبات النقص */}
      <TableCell className="text-center">
        <span className="font-bold text-gray-800">{row.requestCount}</span>
      </TableCell>

      {/* طلبات 7 أيام */}
      <TableCell className="text-center">
        {row.recent7dRequests > 0 ? (
          <Badge variant="secondary" className="text-xs">
            {row.recent7dRequests}
          </Badge>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </TableCell>

      {/* آخر طلب */}
      <TableCell className="text-center text-xs text-gray-500">
        {fmtDateAr(row.lastRequestedAt)}
      </TableCell>

      {/* متوسط يومي */}
      <TableCell className="text-center text-xs">
        {row.avgDailyDisplay > 0 ? (
          <span className="text-gray-700">
            {row.avgDailyDisplay.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
            {unitLabel && <span className="text-gray-400"> {unitLabel}</span>}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </TableCell>

      {/* أيام التغطية */}
      <TableCell className="text-center">
        <CoveragePill days={row.daysOfCoverage} />
      </TableCell>

      {/* الحالة */}
      <TableCell className="text-center">
        <StatusBadge flag={row.statusFlag} />
      </TableCell>

      {/* إجراء */}
      <TableCell className="text-center">
        {mode === "shortage_driven" && !row.isResolved ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onResolve}
                disabled={resolving}
                data-testid={`btn-resolve-${row.itemId}`}
                className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
              >
                {resolving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>تحديد كمحلول</TooltipContent>
          </Tooltip>
        ) : row.isResolved ? (
          <span className="text-xs text-gray-400">محلول</span>
        ) : null}
      </TableCell>
    </TableRow>
  );
});
