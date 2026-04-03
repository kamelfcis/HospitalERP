/**
 * تقرير رصيد مخزن في تاريخ معين
 * Warehouse Balance at a Specific Date Report
 *
 * Algorithm: SUM(qty_change_in_minor) in inventory_lot_movements WHERE tx_date <= asOfDate
 * No N+1 — single batch SQL query with unit conversion inside the DB.
 */
import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, FileSpreadsheet, Printer, Search, RotateCcw, Warehouse, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BalanceRow {
  itemId:           string;
  warehouseId:      string;
  itemCode:         string;
  nameAr:           string;
  nameEn:           string | null;
  category:         "drug" | "supply" | "service";
  warehouseName:    string;
  unitLabel:        string;
  qty:              number;
  purchasePriceUnit: number;
  salePriceUnit:    number;
  totalCost:        number;
  totalSaleValue:   number;
}

interface BalanceSummary {
  itemCount:      number;
  totalQty:       number;
  totalCost:      number;
  totalSaleValue: number;
}

interface BalanceResult {
  rows:     BalanceRow[];
  total:    number;
  page:     number;
  pageSize: number;
  summary:  BalanceSummary;
}

interface WarehouseOption {
  id:            string;
  nameAr:        string;
  warehouseCode: string;
}

// ── Filter state ──────────────────────────────────────────────────────────────
interface Filters {
  warehouseId: string;
  asOfDate:    string;
  category:    string;
  unitLevel:   string;
  search:      string;
  excludeZero: boolean;
}

const today = new Date().toISOString().split("T")[0];

const DEFAULT_FILTERS: Filters = {
  warehouseId: "",
  asOfDate:    today,
  category:    "all",
  unitLevel:   "major",
  search:      "",
  excludeZero: true,
};

const PAGE_SIZE = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | string | null | undefined, decimals = 2): string {
  const v = parseFloat(String(n ?? 0));
  if (isNaN(v)) return "0";
  return v.toLocaleString("ar-EG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function categoryLabel(cat: string) {
  if (cat === "drug")   return "دواء";
  if (cat === "supply") return "مستهلك";
  return cat;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WarehouseBalanceReport() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters | null>(null);
  const [page, setPage] = useState(1);

  const searchRef = useRef<HTMLInputElement>(null);

  // Warehouses lookup
  const { data: warehouses = [] } = useQuery<WarehouseOption[]>({
    queryKey: ["/api/warehouses"],
  });

  // Build query params
  const queryParams = useMemo(() => {
    if (!applied?.warehouseId || !applied?.asOfDate) return null;
    const p = new URLSearchParams({
      warehouseId: applied.warehouseId,
      asOfDate:    applied.asOfDate,
      category:    applied.category,
      unitLevel:   applied.unitLevel,
      excludeZero: applied.excludeZero ? "true" : "false",
      page:        String(page),
      pageSize:    String(PAGE_SIZE),
    });
    if (applied.search.trim()) p.set("search", applied.search.trim());
    return p.toString();
  }, [applied, page]);

  const { data, isLoading, isFetching } = useQuery<BalanceResult>({
    queryKey: ["/api/reports/warehouse-balance", queryParams],
    enabled:  !!queryParams,
  });

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!filters.warehouseId) { alert("الرجاء اختيار المخزن"); return; }
    if (!filters.asOfDate)    { alert("الرجاء إدخال التاريخ"); return; }
    setApplied({ ...filters });
    setPage(1);
  }, [filters]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setApplied(null);
    setPage(1);
  }, []);

  const handleExport = useCallback(() => {
    if (!applied?.warehouseId || !applied?.asOfDate) return;
    const p = new URLSearchParams({
      warehouseId: applied.warehouseId,
      asOfDate:    applied.asOfDate,
      category:    applied.category,
      unitLevel:   applied.unitLevel,
      excludeZero: applied.excludeZero ? "true" : "false",
    });
    if (applied.search.trim()) p.set("search", applied.search.trim());
    window.open(`/api/reports/warehouse-balance/export?${p}`, "_blank");
  }, [applied]);

  const handlePrint = useCallback(() => window.print(), []);

  const rows     = data?.rows    ?? [];
  const total    = data?.total   ?? 0;
  const summary  = data?.summary ?? { itemCount: 0, totalQty: 0, totalCost: 0, totalSaleValue: 0 };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const warehouseName = warehouses.find(w => w.id === applied?.warehouseId)?.nameAr ?? "";

  // ── Filter changed helper ──────────────────────────────────────────────────
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(f => ({ ...f, [k]: v }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col print:block" dir="rtl">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">تقرير رصيد مخزن في تاريخ معين</span>
          {applied && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {warehouseName} — {applied.asOfDate}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="text-[11px] gap-1 px-2" onClick={handleExport} disabled={!applied || isLoading} data-testid="button-export">
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="text-[11px] gap-1 px-2" onClick={handlePrint} disabled={!applied} data-testid="button-print">
            <Printer className="h-3 w-3" /> طباعة
          </Button>
        </div>
      </div>

      {/* ── Filters Panel ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 p-2 border-b bg-muted/20 print:hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 items-end">

          {/* Warehouse */}
          <div className="space-y-1">
            <Label className="text-xs">المخزن *</Label>
            <Select value={filters.warehouseId} onValueChange={v => set("warehouseId", v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-warehouse">
                <SelectValue placeholder="اختر مخزناً..." />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* As-Of Date */}
          <div className="space-y-1">
            <Label className="text-xs">في تاريخ *</Label>
            <Input
              type="date" className="h-8 text-xs"
              value={filters.asOfDate}
              onChange={e => set("asOfDate", e.target.value)}
              data-testid="input-as-of-date"
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label className="text-xs">نوع الصنف</Label>
            <Select value={filters.category} onValueChange={v => set("category", v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="drug">أدوية فقط</SelectItem>
                <SelectItem value="supply">مستهلكات فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Unit Level */}
          <div className="space-y-1">
            <Label className="text-xs">الوحدة</Label>
            <Select value={filters.unitLevel} onValueChange={v => set("unitLevel", v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-unit-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="major">كبرى (افتراضي)</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="minor">صغرى</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="space-y-1">
            <Label className="text-xs">بحث (كود / اسم)</Label>
            <div className="relative">
              <Search className="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                className="h-8 text-xs pr-6"
                placeholder="ابحث..."
                value={filters.search}
                onChange={e => set("search", e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleApply()}
                data-testid="input-search"
              />
            </div>
          </div>

          {/* Actions col */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 h-5">
              <Checkbox
                id="exclude-zero"
                checked={filters.excludeZero}
                onCheckedChange={v => set("excludeZero", !!v)}
                data-testid="checkbox-exclude-zero"
              />
              <Label htmlFor="exclude-zero" className="text-[11px] cursor-pointer">استبعاد الصفري</Label>
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={handleApply} data-testid="button-apply">
                {(isLoading || isFetching) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                استعلام
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleReset} data-testid="button-reset" title="إعادة تعيين">
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────────────── */}
      {applied && (
        <div className="flex-shrink-0 p-2 border-b print:pb-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "عدد الأصناف",   value: summary.itemCount.toLocaleString("ar-EG"), color: "text-blue-600" },
              { label: "إجمالي الكمية", value: fmt(summary.totalQty, 2),                  color: "text-green-600" },
              { label: "إجمالي التكلفة",    value: `${fmt(summary.totalCost)} ج`,      color: "text-orange-600" },
              { label: "إجمالي قيمة البيع", value: `${fmt(summary.totalSaleValue)} ج`, color: "text-purple-600" },
            ].map(c => (
              <div key={c.label} className="peachtree-card p-2 text-center">
                <div className={cn("text-lg font-bold font-mono", c.color)}>{c.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Print Header (hidden on screen) ─────────────────────────────────── */}
      {applied && (
        <div className="hidden print:block p-4 border-b mb-2">
          <h2 className="text-lg font-bold text-center">تقرير رصيد مخزن في تاريخ معين</h2>
          <div className="flex justify-between text-xs mt-1">
            <span>المخزن: <strong>{warehouseName}</strong></span>
            <span>في تاريخ: <strong>{applied.asOfDate}</strong></span>
            <span>نوع الصنف: <strong>{applied.category === "drug" ? "أدوية" : applied.category === "supply" ? "مستهلكات" : "الكل"}</strong></span>
            <span>الوحدة: <strong>{applied.unitLevel === "major" ? "كبرى" : applied.unitLevel === "medium" ? "متوسطة" : "صغرى"}</strong></span>
            <span>تاريخ الطباعة: <strong>{new Date().toLocaleDateString("ar-EG")}</strong></span>
          </div>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!applied ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Warehouse className="h-12 w-12 opacity-20" />
            <p className="text-sm">اختر المخزن والتاريخ ثم اضغط "استعلام"</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">جاري تحميل البيانات...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <p className="text-sm">لا توجد بيانات بالفلاتر المحددة</p>
          </div>
        ) : (
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="text-right w-8 print:hidden">#</TableHead>
                <TableHead className="text-right w-24">كود الصنف</TableHead>
                <TableHead className="text-right">اسم الصنف</TableHead>
                <TableHead className="text-right w-20 hidden md:table-cell">اسم إنجليزي</TableHead>
                <TableHead className="text-right w-16">النوع</TableHead>
                <TableHead className="text-right w-20 hidden lg:table-cell">المخزن</TableHead>
                <TableHead className="text-right w-16">الوحدة</TableHead>
                <TableHead className="text-left w-20">الكمية</TableHead>
                <TableHead className="text-left w-24">سعر الشراء</TableHead>
                <TableHead className="text-left w-24">سعر البيع</TableHead>
                <TableHead className="text-left w-28">إجمالي التكلفة</TableHead>
                <TableHead className="text-left w-28">إجمالي البيع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.itemId} className="hover:bg-muted/30" data-testid={`row-balance-${row.itemId}`}>
                  <TableCell className="text-muted-foreground print:hidden">{(page - 1) * PAGE_SIZE + idx + 1}</TableCell>
                  <TableCell className="font-mono font-medium">{row.itemCode}</TableCell>
                  <TableCell className="font-medium">{row.nameAr}</TableCell>
                  <TableCell className="text-muted-foreground text-[11px] hidden md:table-cell">{row.nameEn || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.category === "drug" ? "default" : "secondary"} className="text-[10px] h-4 px-1">
                      {categoryLabel(row.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{row.warehouseName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.unitLabel}</TableCell>
                  <TableCell className="text-left font-mono">{fmt(row.qty, 3)}</TableCell>
                  <TableCell className="text-left font-mono">{fmt(row.purchasePriceUnit)}</TableCell>
                  <TableCell className="text-left font-mono">{fmt(row.salePriceUnit)}</TableCell>
                  <TableCell className="text-left font-mono text-orange-700">{fmt(row.totalCost)}</TableCell>
                  <TableCell className="text-left font-mono text-green-700">{fmt(row.totalSaleValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {applied && total > PAGE_SIZE && (
        <div className="flex-shrink-0 p-2 border-t flex items-center justify-between text-xs print:hidden">
          <span className="text-muted-foreground">
            صفحة {page} من {totalPages} — {total.toLocaleString("ar-EG")} صنف
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Print Footer ────────────────────────────────────────────────────── */}
      {applied && rows.length > 0 && (
        <div className="hidden print:block mt-4 border-t pt-2 text-xs">
          <div className="flex justify-between font-bold">
            <span>الإجماليات: {summary.itemCount} صنف</span>
            <span>إجمالي الكمية: {fmt(summary.totalQty, 3)}</span>
            <span>إجمالي التكلفة: {fmt(summary.totalCost)} ج</span>
            <span>إجمالي قيمة البيع: {fmt(summary.totalSaleValue)} ج</span>
          </div>
        </div>
      )}

    </div>
  );
}
