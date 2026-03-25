import { useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, Wand2, Search, Filter, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { Warehouse } from "@shared/schema";
import type { TransferLineLocal } from "../types";

type SuggestionReason = "sales_gap" | "destination_zero" | "covered";

interface SuggestionRow {
  itemId: string;
  itemCode: string;
  nameAr: string;
  majorUnitName: string | null;
  minorUnitName: string | null;
  majorToMinor: number;
  sourceQtyMinor: number;
  destQtyMinor: number;
  destSalesMinor: number;
  /** الاحتياج = max(0, مبيعات − رصيد_الوجهة) */
  needMinor: number;
  /** المقترح = min(needMinor, رصيد_المصدر) */
  suggestedMinor: number;
  sourceInsufficient: boolean;
  suggestionReason: SuggestionReason;
}

interface Props {
  warehouses?: Warehouse[];
  sourceWarehouseId: string;
  destWarehouseId: string;
  onFillLines: (lines: TransferLineLocal[]) => void;
}

const PAGE_SIZE = 50;

function toMajorQty(minor: number, majorToMinor: number): string {
  if (!majorToMinor || majorToMinor <= 0) return minor.toFixed(0);
  const val = minor / majorToMinor;
  return val % 1 === 0 ? val.toFixed(0) : val.toFixed(2);
}

function ReasonBadge({ reason, sourceInsufficient }: { reason: SuggestionReason; sourceInsufficient: boolean }) {
  if (reason === "sales_gap") {
    return (
      <div className="flex flex-col gap-0.5 items-center">
        <Badge
          className="text-[9px] px-1 py-0 bg-amber-500 text-white no-default-hover-elevate no-default-active-elevate"
          title="مبيعات الوجهة تتجاوز رصيدها الحالي"
        >
          عجز مبيعات
        </Badge>
        {sourceInsufficient && (
          <Badge
            variant="destructive"
            className="text-[9px] px-1 py-0 no-default-hover-elevate no-default-active-elevate"
            title="رصيد المصدر أقل من الاحتياج — الكمية المقترحة مقصوصة حسب المتاح"
          >
            مصدر غير كافٍ
          </Badge>
        )}
      </div>
    );
  }
  if (reason === "destination_zero") {
    return (
      <Badge
        variant="secondary"
        className="text-[9px] px-1 py-0"
        title="الوجهة فارغة — يُقترح مراجعة الكمية يدوياً"
      >
        الوجهة صفر
      </Badge>
    );
  }
  return (
    <Badge
      className="text-[9px] px-1 py-0 bg-green-600 text-white no-default-hover-elevate no-default-active-elevate"
      title="رصيد الوجهة يغطي مبيعات الفترة"
    >
      مكتفٍ
    </Badge>
  );
}

export function TransferSuggestion({ warehouses, sourceWarehouseId, destWarehouseId, onFillLines }: Props) {
  const today         = new Date().toISOString().split("T")[0];
  const firstOfMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

  const [dateFrom,        setDateFrom]        = useState(firstOfMonth);
  const [dateTo,          setDateTo]          = useState(today);
  const [excludeCovered,  setExcludeCovered]  = useState(true);
  const [search,          setSearch]          = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page,            setPage]            = useState(1);
  const [debounceTimer,   setDebounceTimer]   = useState<ReturnType<typeof setTimeout> | null>(null);

  const canQuery = !!sourceWarehouseId && !!destWarehouseId && !!dateFrom && !!dateTo;

  const qsParams = new URLSearchParams({
    sourceWarehouseId,
    destWarehouseId,
    dateFrom,
    dateTo,
    excludeCovered: String(excludeCovered),
    search: debouncedSearch,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });

  const { data, isLoading, isFetching } = useQuery<{ data: SuggestionRow[]; total: number }>({
    queryKey: [`/api/transfers/smart-suggestion?${qsParams}`],
    enabled: canQuery,
  });

  const rows       = data?.data  || [];
  const total      = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sourceName = warehouses?.find((w) => w.id === sourceWarehouseId)?.nameAr || "المصدر";
  const destName   = warehouses?.find((w) => w.id === destWarehouseId)?.nameAr   || "الوجهة";

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
    setDebounceTimer(t);
  }, [debounceTimer]);

  /*
   * handleFill — يملأ أسطر إذن التحويل بالأصناف الظاهرة في هذه الصفحة فقط.
   * الكمية المستخدمة هي suggestedMinor (مقصوصة برصيد المصدر) وليس needMinor.
   * الأصناف التي suggestedMinor=0 (وجهة صفر بدون مبيعات) لا تُضاف تلقائياً.
   */
  const eligibleRows = rows.filter((r) => r.suggestedMinor > 0);

  const handleFill = useCallback(() => {
    if (!eligibleRows.length) return;

    const lines: TransferLineLocal[] = eligibleRows.map((r) => {
      const qtyInMinor = r.suggestedMinor;
      const majorQty   = r.majorToMinor > 0 ? qtyInMinor / r.majorToMinor : qtyInMinor;
      const qtyEntered = Math.ceil(majorQty * 10000) / 10000;

      const fakeItem = {
        id: r.itemId,
        nameAr: r.nameAr,
        itemCode: r.itemCode,
        majorUnitName: r.majorUnitName,
        minorUnitName: r.minorUnitName,
        majorToMinor: String(r.majorToMinor),
        mediumToMinor: null,
        availableQtyMinor: String(r.sourceQtyMinor),
        hasExpiry: false,
        isActive: true,
      } as any;

      return {
        id: crypto.randomUUID(),
        itemId: r.itemId,
        item: fakeItem,
        unitLevel: "major" as const,
        qtyEntered,
        qtyInMinor,
        selectedExpiryDate: null,
        selectedExpiryMonth: null,
        selectedExpiryYear: null,
        availableQtyMinor: String(r.sourceQtyMinor),
        notes: "",
        fefoLocked: true,
      };
    });

    onFillLines(lines);
  }, [eligibleRows, onFillLines]);

  if (!sourceWarehouseId || !destWarehouseId) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm" dir="rtl">
        اختر مخزن المصدر والوجهة أولاً من تبويب "إذن تحويل"
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap text-[12px]">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">من</span>
          <input type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="peachtree-input w-[135px]" data-testid="sug-from-date" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">إلى</span>
          <input type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="peachtree-input w-[135px]" data-testid="sug-to-date" />
        </div>

        {/* Exclude-covered checkbox with tooltip */}
        <label
          className="flex items-center gap-1.5 cursor-pointer select-none group relative"
          title="يتم استبعاد الصنف إذا كان رصيد الوجهة الحالي يغطي مبيعات الفترة المحددة، دون اعتبار حد أدنى أو مخزون أمان. الأصناف التي الوجهة فارغة تماماً تظهر دائماً."
        >
          <input type="checkbox" checked={excludeCovered}
            onChange={(e) => { setExcludeCovered(e.target.checked); setPage(1); }}
            className="w-3.5 h-3.5" data-testid="sug-exclude-covered" />
          <span className="text-xs whitespace-nowrap">
            استبعاد الأصناف التي يغطي رصيدها مبيعات الفترة
          </span>
          <Info className="h-3 w-3 text-muted-foreground" />
        </label>

        <div className="flex items-center gap-1 flex-1 min-w-[160px]">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input type="text" value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="بحث بالاسم أو الكود..."
            className="peachtree-input flex-1" data-testid="sug-search" />
        </div>

        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {total > 0 && !isFetching && (
          <span className="text-[11px] text-muted-foreground">{total} صنف</span>
        )}
      </div>

      {/* ── Header strip ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>📦 <strong className="text-foreground">{sourceName}</strong> → <strong className="text-foreground">{destName}</strong></span>
          <span>الفترة: {dateFrom} → {dateTo}</span>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <Button
            size="sm"
            variant="default"
            onClick={handleFill}
            disabled={eligibleRows.length === 0}
            data-testid="button-fill-suggested"
            className="gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            ملء الكميات المقترحة ({eligibleRows.length})
          </Button>
          <span className="text-[10px] text-muted-foreground">
            يتم ملء كميات الأصناف الظاهرة في هذه الصفحة فقط
          </span>
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1 text-[10px] text-muted-foreground">
        <span className="font-medium">الكميات بالوحدة الكبرى •</span>
        <span className="text-[10px]">
          <span className="font-medium text-foreground">الاحتياج</span> = مبيعات الوجهة − رصيد الوجهة
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="text-[10px]">
          <span className="font-medium text-foreground">المقترح</span> = الاحتياج مقصوص برصيد المصدر
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="peachtree-grid w-full text-[11px]" data-testid="table-suggestions">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="py-0.5 px-2 text-center whitespace-nowrap">#</th>
                <th className="py-0.5 px-2 text-center whitespace-nowrap">الكود</th>
                <th className="py-0.5 px-2 text-right whitespace-nowrap">الصنف</th>
                <th className="py-0.5 px-2 text-center whitespace-nowrap">الوحدة</th>
                <th className="py-0.5 px-2 text-center whitespace-nowrap">رصيد {sourceName}</th>
                <th className="py-0.5 px-2 text-center whitespace-nowrap">رصيد {destName}</th>
                <th className="py-0.5 px-2 text-center whitespace-nowrap">مبيعات {destName}</th>
                <th
                  className="py-0.5 px-2 text-center whitespace-nowrap"
                  title="الاحتياج = max(0, مبيعات الوجهة − رصيد الوجهة)"
                >
                  الاحتياج
                </th>
                <th
                  className="py-0.5 px-2 text-center whitespace-nowrap"
                  title="الكمية المقترحة = min(الاحتياج, رصيد المصدر)"
                >
                  المقترح
                </th>
                <th className="py-0.5 px-2 text-center whitespace-nowrap">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const mtu          = row.majorToMinor || 1;
                const hasSuggestion = row.suggestedMinor > 0;
                const rowBg = row.suggestionReason === "sales_gap"
                  ? " bg-amber-50/40 dark:bg-amber-900/10"
                  : row.suggestionReason === "destination_zero"
                    ? " bg-blue-50/30 dark:bg-blue-900/10"
                    : "";
                return (
                  <tr key={row.itemId}
                    className={`peachtree-grid-row${rowBg}`}
                    data-testid={`row-sug-${row.itemId}`}
                  >
                    <td className="py-0 px-2 h-7 text-center align-middle text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="py-0 px-2 h-7 text-center align-middle font-mono text-[10px]">
                      {row.itemCode}
                    </td>
                    <td className="py-0 px-2 h-7 text-right align-middle font-medium">{row.nameAr}</td>
                    <td className="py-0 px-2 h-7 text-center align-middle text-muted-foreground">
                      {row.majorUnitName || "—"}
                    </td>

                    {/* رصيد المصدر */}
                    <td className="py-0 px-2 h-7 text-center align-middle peachtree-amount font-medium">
                      {toMajorQty(row.sourceQtyMinor, mtu)}
                    </td>

                    {/* رصيد الوجهة */}
                    <td className={`py-0 px-2 h-7 text-center align-middle peachtree-amount ${row.destQtyMinor === 0 ? "text-destructive" : ""}`}>
                      {toMajorQty(row.destQtyMinor, mtu)}
                    </td>

                    {/* مبيعات الوجهة في الفترة */}
                    <td className="py-0 px-2 h-7 text-center align-middle peachtree-amount text-blue-600 dark:text-blue-400">
                      {row.destSalesMinor > 0 ? toMajorQty(row.destSalesMinor, mtu) : "—"}
                    </td>

                    {/* الاحتياج = need */}
                    <td className={`py-0 px-2 h-7 text-center align-middle peachtree-amount ${row.needMinor > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                      {row.needMinor > 0 ? toMajorQty(row.needMinor, mtu) : "—"}
                    </td>

                    {/* الكمية المقترحة = suggested (مقصوصة برصيد المصدر) */}
                    <td className={`py-0 px-2 h-7 text-center align-middle peachtree-amount font-bold ${hasSuggestion ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                      {hasSuggestion ? toMajorQty(row.suggestedMinor, mtu) : "—"}
                    </td>

                    {/* الحالة */}
                    <td className="py-0 px-2 h-7 text-center align-middle">
                      <ReasonBadge
                        reason={row.suggestionReason}
                        sourceInsufficient={row.sourceInsufficient}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground py-8">
                    {canQuery ? "لا توجد أصناف مطابقة" : "اختر الفترة الزمنية للعرض"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 text-[11px]">
          <Button variant="outline" size="sm" disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)} data-testid="sug-prev-page">
            <ChevronRight className="h-3 w-3" />
          </Button>
          <span className="text-muted-foreground">صفحة {page} من {totalPages} ({total} صنف)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)} data-testid="sug-next-page">
            <ChevronLeft className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
