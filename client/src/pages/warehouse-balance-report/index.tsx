/**
 * تقرير رصيد مخزن في تاريخ معين
 * Warehouse Balance at a Specific Date Report
 */
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
import {
  Loader2, FileSpreadsheet, Printer, Search, RotateCcw,
  Warehouse, ChevronRight, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BalanceRow {
  itemId:            string;
  warehouseId:       string;
  itemCode:          string;
  nameAr:            string;
  nameEn:            string | null;
  category:          "drug" | "supply" | "service";
  warehouseName:     string;
  unitLabel:         string;
  qty:               number;
  purchasePriceUnit: number;
  salePriceUnit:     number;
  totalCost:         number;
  totalSaleValue:    number;
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
  return v.toLocaleString("ar-EG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function categoryLabel(cat: string) {
  if (cat === "drug")   return "دواء";
  if (cat === "supply") return "مستهلك";
  return cat;
}

function unitLevelLabel(u: string) {
  if (u === "minor")  return "صغرى";
  if (u === "medium") return "متوسطة";
  return "كبرى";
}

function categoryFilterLabel(c: string) {
  if (c === "drug")   return "أدوية فقط";
  if (c === "supply") return "مستهلكات فقط";
  return "الكل";
}

// ── Print styles injected once ────────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  @page {
    size: A4 landscape;
    margin: 12mm 10mm;
  }
  body > *:not(#wbr-print-root) { display: none !important; }
  #wbr-print-root { display: block !important; }
  .wbr-print-page { page-break-after: always; }
  .wbr-print-page:last-child { page-break-after: avoid; }
}
#wbr-print-root { display: none; }
`;

// ── Main Component ────────────────────────────────────────────────────────────
export default function WarehouseBalanceReport() {
  const [filters, setFilters]   = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied]   = useState<Filters | null>(null);
  const [page, setPage]         = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const printRootRef = useRef<HTMLDivElement>(null);

  // Inject print styles once
  useEffect(() => {
    const el = document.createElement("style");
    el.id = "wbr-print-style";
    el.textContent = PRINT_STYLE;
    document.head.appendChild(el);
    return () => { document.getElementById("wbr-print-style")?.remove(); };
  }, []);

  // ── Warehouses lookup ──────────────────────────────────────────────────────
  const { data: warehouses = [] } = useQuery<WarehouseOption[]>({
    queryKey: ["/api/warehouses"],
  });

  // ── Paginated query params ─────────────────────────────────────────────────
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

  // ── All-rows query params (for print) ─────────────────────────────────────
  const printParams = useMemo(() => {
    if (!applied?.warehouseId || !applied?.asOfDate) return null;
    const p = new URLSearchParams({
      warehouseId: applied.warehouseId,
      asOfDate:    applied.asOfDate,
      category:    applied.category,
      unitLevel:   applied.unitLevel,
      excludeZero: applied.excludeZero ? "true" : "false",
      page:        "1",
      pageSize:    "2000",
    });
    if (applied.search.trim()) p.set("search", applied.search.trim());
    return p.toString();
  }, [applied]);

  const { data, isLoading, isFetching } = useQuery<BalanceResult>({
    queryKey: [`/api/reports/warehouse-balance?${queryParams}`],
    enabled:  !!queryParams,
  });

  const { data: printData, isFetching: printFetching, refetch: fetchPrint } = useQuery<BalanceResult>({
    queryKey: [`/api/reports/warehouse-balance?${printParams}`],
    enabled:  false,
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

  const handlePrint = useCallback(async () => {
    if (!applied) return;
    setIsPrinting(true);
    try {
      await fetchPrint();
      // Small delay to let React render the print DOM
      setTimeout(() => {
        window.print();
        setIsPrinting(false);
      }, 300);
    } catch {
      setIsPrinting(false);
    }
  }, [applied, fetchPrint]);

  // ── Derived values ────────────────────────────────────────────────────────
  const rows        = data?.rows    ?? [];
  const total       = data?.total   ?? 0;
  const summary     = data?.summary ?? { itemCount: 0, totalQty: 0, totalCost: 0, totalSaleValue: 0 };
  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const allRows     = printData?.rows ?? [];
  const allSummary  = printData?.summary ?? summary;

  const warehouseName = warehouses.find(w => w.id === applied?.warehouseId)?.nameAr ?? "";

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(f => ({ ...f, [k]: v }));

  const generatedAt = new Date().toLocaleString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ════════════════════════════════════════════════════════
          SCREEN LAYOUT
      ════════════════════════════════════════════════════════ */}
      <div className="h-full flex flex-col" dir="rtl">

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="peachtree-toolbar flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">تقرير رصيد مخزن في تاريخ معين</span>
            {applied && (
              <Badge variant="secondary" className="text-xs h-5">
                {warehouseName} — {applied.asOfDate}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm" variant="outline" className="text-xs gap-1 px-3"
              onClick={handleExport} disabled={!applied || isLoading}
              data-testid="button-export"
            >
              <FileSpreadsheet className="h-3 w-3" /> Excel
            </Button>
            <Button
              size="sm" variant="outline" className="text-xs gap-1 px-3"
              onClick={handlePrint} disabled={!applied || printFetching || isPrinting}
              data-testid="button-print"
            >
              {(printFetching || isPrinting)
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Printer className="h-3 w-3" />}
              طباعة
            </Button>
          </div>
        </div>

        {/* ── Filters Panel ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 p-2 border-b bg-muted/20">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 items-end">

            <div className="space-y-1">
              <Label className="text-sm font-medium">المخزن *</Label>
              <Select value={filters.warehouseId} onValueChange={v => set("warehouseId", v)}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-warehouse">
                  <SelectValue placeholder="اختر مخزناً..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium">في تاريخ *</Label>
              <Input
                type="date" className="h-9 text-sm"
                value={filters.asOfDate}
                onChange={e => set("asOfDate", e.target.value)}
                data-testid="input-as-of-date"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium">نوع الصنف</Label>
              <Select value={filters.category} onValueChange={v => set("category", v)}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="drug">أدوية فقط</SelectItem>
                  <SelectItem value="supply">مستهلكات فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium">الوحدة</Label>
              <Select value={filters.unitLevel} onValueChange={v => set("unitLevel", v)}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-unit-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="major">كبرى (افتراضي)</SelectItem>
                  <SelectItem value="medium">متوسطة</SelectItem>
                  <SelectItem value="minor">صغرى</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium">بحث (كود / اسم)</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  className="h-9 text-sm pr-7"
                  placeholder="ابحث..."
                  value={filters.search}
                  onChange={e => set("search", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleApply()}
                  data-testid="input-search"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 h-5">
                <Checkbox
                  id="exclude-zero"
                  checked={filters.excludeZero}
                  onCheckedChange={v => set("excludeZero", !!v)}
                  data-testid="checkbox-exclude-zero"
                />
                <Label htmlFor="exclude-zero" className="text-sm font-medium cursor-pointer">
                  استبعاد الصفري
                </Label>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm" className="flex-1 h-9 text-sm gap-1"
                  onClick={handleApply} data-testid="button-apply"
                >
                  {(isLoading || isFetching)
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Search className="h-4 w-4" />}
                  استعلام
                </Button>
                <Button
                  size="sm" variant="outline" className="h-9 px-2"
                  onClick={handleReset} data-testid="button-reset" title="إعادة تعيين"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Summary Cards ───────────────────────────────────────────────── */}
        {applied && (
          <div className="flex-shrink-0 p-2 border-b">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: "عدد الأصناف",       value: summary.itemCount.toLocaleString("ar-EG"), color: "text-blue-600" },
                { label: "إجمالي الكمية",     value: fmt(summary.totalQty, 2),                  color: "text-green-600" },
                { label: "إجمالي التكلفة",    value: `${fmt(summary.totalCost)} ج`,             color: "text-orange-600" },
                { label: "إجمالي قيمة البيع", value: `${fmt(summary.totalSaleValue)} ج`,        color: "text-purple-600" },
              ].map(c => (
                <div key={c.label} className="peachtree-card p-2 text-center">
                  <div className={cn("text-xl font-bold font-mono", c.color)}>{c.value}</div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────────── */}
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
            <Table className="text-sm">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="text-right w-8 font-bold">#</TableHead>
                  <TableHead className="text-right w-28 font-bold">كود الصنف</TableHead>
                  <TableHead className="text-right w-44 font-bold">اسم الصنف</TableHead>
                  <TableHead className="text-right w-44 hidden md:table-cell font-bold">اسم إنجليزي</TableHead>
                  <TableHead className="text-right w-16 font-bold">النوع</TableHead>
                  <TableHead className="text-right w-24 hidden lg:table-cell font-bold">المخزن</TableHead>
                  <TableHead className="text-right w-20 font-bold">الوحدة</TableHead>
                  <TableHead className="text-left w-24 font-bold">الكمية</TableHead>
                  <TableHead className="text-left w-28 font-bold">سعر الشراء</TableHead>
                  <TableHead className="text-left w-28 font-bold">سعر البيع</TableHead>
                  <TableHead className="text-left w-32 font-bold">إجمالي التكلفة</TableHead>
                  <TableHead className="text-left w-32 font-bold">إجمالي البيع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.itemId} className="hover:bg-muted/30" data-testid={`row-balance-${row.itemId}`}>
                    <TableCell className="text-muted-foreground">{(page - 1) * PAGE_SIZE + idx + 1}</TableCell>
                    <TableCell className="font-mono font-semibold">{row.itemCode}</TableCell>
                    <TableCell className="font-semibold w-44">{row.nameAr}</TableCell>
                    <TableCell className="w-44 hidden md:table-cell">{row.nameEn || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.category === "drug" ? "default" : "secondary"} className="text-xs px-2">
                        {categoryLabel(row.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{row.warehouseName}</TableCell>
                    <TableCell>{row.unitLabel}</TableCell>
                    <TableCell className="text-left font-mono font-medium">{fmt(row.qty, 3)}</TableCell>
                    <TableCell className="text-left font-mono font-medium">{fmt(row.purchasePriceUnit)}</TableCell>
                    <TableCell className="text-left font-mono font-medium">{fmt(row.salePriceUnit)}</TableCell>
                    <TableCell className="text-left font-mono font-semibold text-orange-700">{fmt(row.totalCost)}</TableCell>
                    <TableCell className="text-left font-mono font-semibold text-green-700">{fmt(row.totalSaleValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {applied && total > PAGE_SIZE && (
          <div className="flex-shrink-0 p-2 border-t flex items-center justify-between text-sm">
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
      </div>

      {/* ════════════════════════════════════════════════════════
          PRINT LAYOUT — hidden on screen, shown only when printing
          Full A4 Landscape, RTL Arabic, professional formatting
      ════════════════════════════════════════════════════════ */}
      <div id="wbr-print-root" ref={printRootRef} dir="rtl"
        style={{ fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", fontSize: "10pt", color: "#000" }}>

        {applied && allRows.length > 0 && (() => {
          // Split rows into A4 pages (~35 rows each for landscape)
          const ROWS_PER_PAGE = 35;
          const pages: BalanceRow[][] = [];
          for (let i = 0; i < allRows.length; i += ROWS_PER_PAGE) {
            pages.push(allRows.slice(i, i + ROWS_PER_PAGE));
          }
          const totalPgs = pages.length;

          return pages.map((pageRows, pageIdx) => (
            <div key={pageIdx} className="wbr-print-page"
              style={{ padding: "0", marginBottom: pageIdx < totalPgs - 1 ? "0" : "0" }}>

              {/* ── Page Header ──────────────────────────────────── */}
              <div style={{ borderBottom: "2px solid #1e40af", paddingBottom: "6px", marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: "16pt", fontWeight: "bold", color: "#1e40af" }}>
                      تقرير رصيد المخزن في تاريخ معين
                    </div>
                    <div style={{ fontSize: "9pt", color: "#475569", marginTop: "2px" }}>
                      Warehouse Inventory Balance Report
                    </div>
                  </div>
                  <div style={{ textAlign: "left", fontSize: "8pt", color: "#64748b" }}>
                    <div>صفحة {pageIdx + 1} من {totalPgs}</div>
                    <div>تاريخ الطباعة: {generatedAt}</div>
                  </div>
                </div>

                {/* Report params box */}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "6px", marginTop: "6px",
                  background: "#eff6ff", border: "1px solid #bfdbfe",
                  borderRadius: "4px", padding: "6px 10px",
                  fontSize: "9pt",
                }}>
                  <div><span style={{ color: "#64748b" }}>المخزن: </span><strong>{warehouseName}</strong></div>
                  <div><span style={{ color: "#64748b" }}>في تاريخ: </span><strong>{applied.asOfDate}</strong></div>
                  <div><span style={{ color: "#64748b" }}>نوع الصنف: </span><strong>{categoryFilterLabel(applied.category)}</strong></div>
                  <div><span style={{ color: "#64748b" }}>وحدة القياس: </span><strong>{unitLevelLabel(applied.unitLevel)}</strong></div>
                </div>
              </div>

              {/* ── Table ────────────────────────────────────────── */}
              <table style={{
                width: "100%", borderCollapse: "collapse",
                fontSize: "9pt", tableLayout: "fixed",
              }}>
                <colgroup>
                  <col style={{ width: "3%" }} />   {/* # */}
                  <col style={{ width: "9%" }} />   {/* كود */}
                  <col style={{ width: "20%" }} />  {/* عربي */}
                  <col style={{ width: "15%" }} />  {/* إنجليزي */}
                  <col style={{ width: "6%" }} />   {/* نوع */}
                  <col style={{ width: "6%" }} />   {/* وحدة */}
                  <col style={{ width: "8%" }} />   {/* كمية */}
                  <col style={{ width: "9%" }} />   {/* سعر شراء */}
                  <col style={{ width: "9%" }} />   {/* سعر بيع */}
                  <col style={{ width: "11%" }} />  {/* إجمالي تكلفة */}
                  <col style={{ width: "11%" }} />  {/* إجمالي بيع */}
                </colgroup>
                <thead>
                  <tr style={{ background: "#1e40af", color: "#fff" }}>
                    {["#", "كود الصنف", "اسم الصنف", "الاسم الإنجليزي", "النوع", "الوحدة",
                      "الكمية", "سعر الشراء", "سعر البيع", "إجمالي التكلفة", "إجمالي البيع"
                    ].map((h, i) => (
                      <th key={i} style={{
                        padding: "5px 4px", textAlign: i <= 5 ? "right" : "center",
                        fontWeight: "bold", fontSize: "8.5pt",
                        borderBottom: "1px solid #3b5cb8",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => {
                    const globalIdx = pageIdx * ROWS_PER_PAGE + idx + 1;
                    const isEven = globalIdx % 2 === 0;
                    return (
                      <tr key={row.itemId} style={{ background: isEven ? "#f8fafc" : "#fff" }}>
                        <td style={{ padding: "4px", textAlign: "center", color: "#94a3b8", fontSize: "8pt", borderBottom: "1px solid #e2e8f0" }}>
                          {globalIdx}
                        </td>
                        <td style={{ padding: "4px", fontFamily: "monospace", fontWeight: "600", borderBottom: "1px solid #e2e8f0", fontSize: "8pt" }}>
                          {row.itemCode}
                        </td>
                        <td style={{ padding: "4px", fontWeight: "600", borderBottom: "1px solid #e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.nameAr}
                        </td>
                        <td style={{ padding: "4px", color: "#475569", borderBottom: "1px solid #e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.nameEn || ""}
                        </td>
                        <td style={{ padding: "4px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>
                          <span style={{
                            display: "inline-block", padding: "1px 5px", borderRadius: "3px", fontSize: "7.5pt",
                            background: row.category === "drug" ? "#dbeafe" : "#f1f5f9",
                            color:      row.category === "drug" ? "#1d4ed8" : "#475569",
                            border:     `1px solid ${row.category === "drug" ? "#bfdbfe" : "#e2e8f0"}`,
                          }}>
                            {categoryLabel(row.category)}
                          </span>
                        </td>
                        <td style={{ padding: "4px", textAlign: "center", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                          {row.unitLabel}
                        </td>
                        <td style={{ padding: "4px", textAlign: "center", fontFamily: "monospace", fontWeight: "500", borderBottom: "1px solid #e2e8f0" }}>
                          {fmt(row.qty, 3)}
                        </td>
                        <td style={{ padding: "4px", textAlign: "center", fontFamily: "monospace", borderBottom: "1px solid #e2e8f0" }}>
                          {fmt(row.purchasePriceUnit)}
                        </td>
                        <td style={{ padding: "4px", textAlign: "center", fontFamily: "monospace", borderBottom: "1px solid #e2e8f0" }}>
                          {fmt(row.salePriceUnit)}
                        </td>
                        <td style={{ padding: "4px", textAlign: "center", fontFamily: "monospace", fontWeight: "600", color: "#c2410c", borderBottom: "1px solid #e2e8f0" }}>
                          {fmt(row.totalCost)}
                        </td>
                        <td style={{ padding: "4px", textAlign: "center", fontFamily: "monospace", fontWeight: "600", color: "#15803d", borderBottom: "1px solid #e2e8f0" }}>
                          {fmt(row.totalSaleValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Totals row — only on last page */}
                {pageIdx === totalPgs - 1 && (
                  <tfoot>
                    <tr style={{ background: "#1e3a5f", color: "#fff", fontWeight: "bold" }}>
                      <td colSpan={6} style={{ padding: "5px 8px", textAlign: "right", fontSize: "9pt" }}>
                        الإجماليات — {allSummary.itemCount.toLocaleString("ar-EG")} صنف
                      </td>
                      <td style={{ padding: "5px 4px", textAlign: "center", fontFamily: "monospace" }}>
                        {fmt(allSummary.totalQty, 3)}
                      </td>
                      <td colSpan={2} />
                      <td style={{ padding: "5px 4px", textAlign: "center", fontFamily: "monospace", color: "#fbbf24" }}>
                        {fmt(allSummary.totalCost)}
                      </td>
                      <td style={{ padding: "5px 4px", textAlign: "center", fontFamily: "monospace", color: "#86efac" }}>
                        {fmt(allSummary.totalSaleValue)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* ── Page Footer ──────────────────────────────────── */}
              <div style={{
                marginTop: "6px", paddingTop: "4px",
                borderTop: "1px solid #cbd5e1",
                display: "flex", justifyContent: "space-between",
                fontSize: "7.5pt", color: "#94a3b8",
              }}>
                <span>نظام المحاسبة الصحية</span>
                <span>صفحة {pageIdx + 1} من {totalPgs}</span>
              </div>

            </div>
          ));
        })()}

        {/* Placeholder when print triggered before data is ready */}
        {applied && allRows.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
            جاري تحميل البيانات...
          </div>
        )}
      </div>
    </>
  );
}
