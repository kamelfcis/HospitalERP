/**
 * تقرير رصيد مخزن في تاريخ معين
 * Warehouse Balance at a Specific Date Report
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
function catLabel(c: string) {
  return c === "drug" ? "دواء" : c === "supply" ? "مستهلك" : c;
}
function unitLabel(u: string) {
  return u === "minor" ? "صغرى" : u === "medium" ? "متوسطة" : "كبرى";
}
function catFilterLabel(c: string) {
  return c === "drug" ? "أدوية فقط" : c === "supply" ? "مستهلكات فقط" : "الكل";
}

// ── Print HTML builder ────────────────────────────────────────────────────────
function buildPrintHTML(
  rows: BalanceRow[],
  summary: BalanceSummary,
  applied: Filters,
  warehouseName: string,
): string {
  const ROWS_PER_PAGE = 38;
  const pages: BalanceRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  const totalPgs = pages.length || 1;

  const generatedAt = new Date().toLocaleString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const headerHTML = `
    <div style="border-bottom:2px solid #1e40af;padding-bottom:6px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <div style="font-size:16pt;font-weight:bold;color:#1e40af;">تقرير رصيد المخزن في تاريخ معين</div>
          <div style="font-size:9pt;color:#475569;margin-top:2px;">Warehouse Inventory Balance Report</div>
        </div>
        <div style="text-align:left;font-size:8pt;color:#64748b;">
          <div>تاريخ الطباعة: ${generatedAt}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;
                  background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:6px 10px;font-size:9pt;">
        <div><span style="color:#64748b;">المخزن: </span><strong>${warehouseName}</strong></div>
        <div><span style="color:#64748b;">في تاريخ: </span><strong>${applied.asOfDate}</strong></div>
        <div><span style="color:#64748b;">نوع الصنف: </span><strong>${catFilterLabel(applied.category)}</strong></div>
        <div><span style="color:#64748b;">وحدة القياس: </span><strong>${unitLabel(applied.unitLevel)}</strong></div>
      </div>
    </div>
  `;

  const tableHead = `
    <table style="width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;">
      <colgroup>
        <col style="width:3%"><col style="width:9%"><col style="width:21%">
        <col style="width:15%"><col style="width:6%"><col style="width:6%">
        <col style="width:8%"><col style="width:9%"><col style="width:9%">
        <col style="width:12%"><col style="width:12%">
      </colgroup>
      <thead>
        <tr style="background:#1e40af;color:#fff;">
          ${["#","كود الصنف","اسم الصنف","الاسم الإنجليزي","النوع","الوحدة","الكمية","سعر الشراء","سعر البيع","إجمالي التكلفة","إجمالي البيع"]
            .map((h,i) => `<th style="padding:5px 4px;text-align:${i<=5?'right':'center'};font-weight:bold;font-size:8.5pt;border-bottom:1px solid #3b5cb8;">${h}</th>`)
            .join("")}
        </tr>
      </thead>
      <tbody>
  `;

  const buildRow = (row: BalanceRow, globalIdx: number) => {
    const bg = globalIdx % 2 === 0 ? "#f8fafc" : "#ffffff";
    const catBg = row.category === "drug" ? "#dbeafe" : "#f1f5f9";
    const catClr = row.category === "drug" ? "#1d4ed8" : "#475569";
    const catBorder = row.category === "drug" ? "#bfdbfe" : "#e2e8f0";
    return `
      <tr style="background:${bg};">
        <td style="padding:4px;text-align:center;color:#94a3b8;font-size:8pt;border-bottom:1px solid #e2e8f0;">${globalIdx}</td>
        <td style="padding:4px;font-family:monospace;font-weight:600;border-bottom:1px solid #e2e8f0;font-size:8pt;">${row.itemCode}</td>
        <td style="padding:4px;font-weight:600;border-bottom:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.nameAr}</td>
        <td style="padding:4px;color:#475569;border-bottom:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.nameEn || ""}</td>
        <td style="padding:4px;text-align:center;border-bottom:1px solid #e2e8f0;">
          <span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:7.5pt;background:${catBg};color:${catClr};border:1px solid ${catBorder};">${catLabel(row.category)}</span>
        </td>
        <td style="padding:4px;text-align:center;color:#475569;border-bottom:1px solid #e2e8f0;">${row.unitLabel}</td>
        <td style="padding:4px;text-align:center;font-family:monospace;font-weight:500;border-bottom:1px solid #e2e8f0;">${fmt(row.qty, 3)}</td>
        <td style="padding:4px;text-align:center;font-family:monospace;border-bottom:1px solid #e2e8f0;">${fmt(row.purchasePriceUnit)}</td>
        <td style="padding:4px;text-align:center;font-family:monospace;border-bottom:1px solid #e2e8f0;">${fmt(row.salePriceUnit)}</td>
        <td style="padding:4px;text-align:center;font-family:monospace;font-weight:600;color:#c2410c;border-bottom:1px solid #e2e8f0;">${fmt(row.totalCost)}</td>
        <td style="padding:4px;text-align:center;font-family:monospace;font-weight:600;color:#15803d;border-bottom:1px solid #e2e8f0;">${fmt(row.totalSaleValue)}</td>
      </tr>
    `;
  };

  const totalsRow = `
    <tfoot>
      <tr style="background:#1e3a5f;color:#fff;font-weight:bold;">
        <td colspan="6" style="padding:5px 8px;text-align:right;font-size:9pt;">
          الإجماليات — ${summary.itemCount.toLocaleString("ar-EG")} صنف
        </td>
        <td style="padding:5px 4px;text-align:center;font-family:monospace;">${fmt(summary.totalQty, 3)}</td>
        <td colspan="2"></td>
        <td style="padding:5px 4px;text-align:center;font-family:monospace;color:#fbbf24;">${fmt(summary.totalCost)}</td>
        <td style="padding:5px 4px;text-align:center;font-family:monospace;color:#86efac;">${fmt(summary.totalSaleValue)}</td>
      </tr>
    </tfoot>
  `;

  const pagesHTML = pages.map((pageRows, pageIdx) => {
    const isLast = pageIdx === totalPgs - 1;
    const rowsHTML = pageRows.map((r, i) => buildRow(r, pageIdx * ROWS_PER_PAGE + i + 1)).join("");
    return `
      <div style="padding:0;${pageIdx < totalPgs - 1 ? "page-break-after:always;" : ""}">
        ${headerHTML}
        ${tableHead}${rowsHTML}${isLast ? totalsRow : ""}</tbody></table>
        <div style="margin-top:6px;padding-top:4px;border-top:1px solid #cbd5e1;
                    display:flex;justify-content:space-between;font-size:7.5pt;color:#94a3b8;">
          <span>نظام المحاسبة الصحية</span>
          <span>صفحة ${pageIdx + 1} من ${totalPgs}</span>
        </div>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير رصيد المخزن — ${applied.asOfDate}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 10pt; color: #000; direction: rtl; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>${pagesHTML}</body>
</html>`;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WarehouseBalanceReport() {
  const [filters, setFilters]     = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied]     = useState<Filters | null>(null);
  const [page, setPage]           = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const { data: warehouses = [] } = useQuery<WarehouseOption[]>({
    queryKey: ["/api/warehouses"],
  });

  // ── Paginated query ────────────────────────────────────────────────────────
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
    queryKey: [`/api/reports/warehouse-balance?${queryParams}`],
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

  const handlePrint = useCallback(async () => {
    if (!applied) return;
    setIsPrinting(true);
    try {
      // Fetch ALL rows for print (up to 2000)
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

      const res  = await fetch(`/api/reports/warehouse-balance?${p}`);
      const json: BalanceResult = await res.json();

      const wName = warehouses.find(w => w.id === applied.warehouseId)?.nameAr ?? "";
      const html  = buildPrintHTML(json.rows, json.summary, applied, wName);

      const win = window.open("", "_blank", "width=1100,height=800");
      if (!win) { alert("يرجى السماح بالنوافذ المنبثقة لهذا الموقع"); return; }
      win.document.open();
      win.document.write(html);
      win.document.close();
      // Wait for fonts/images to load then auto-print
      win.onload = () => {
        win.focus();
        win.print();
      };
    } catch (e) {
      console.error(e);
    } finally {
      setIsPrinting(false);
    }
  }, [applied, warehouses]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const rows       = data?.rows    ?? [];
  const total      = data?.total   ?? 0;
  const summary    = data?.summary ?? { itemCount: 0, totalQty: 0, totalCost: 0, totalSaleValue: 0 };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const warehouseName = warehouses.find(w => w.id === applied?.warehouseId)?.nameAr ?? "";

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(f => ({ ...f, [k]: v }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" dir="rtl">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
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
          <Button size="sm" variant="outline" className="text-xs gap-1 px-3"
            onClick={handleExport} disabled={!applied || isLoading} data-testid="button-export">
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1 px-3"
            onClick={handlePrint} disabled={!applied || isPrinting} data-testid="button-print">
            {isPrinting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
            طباعة
          </Button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
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
            <Input type="date" className="h-9 text-sm"
              value={filters.asOfDate}
              onChange={e => set("asOfDate", e.target.value)}
              data-testid="input-as-of-date" />
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
              <Input ref={searchRef} className="h-9 text-sm pr-7" placeholder="ابحث..."
                value={filters.search}
                onChange={e => set("search", e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleApply()}
                data-testid="input-search" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 h-5">
              <Checkbox id="exclude-zero" checked={filters.excludeZero}
                onCheckedChange={v => set("excludeZero", !!v)} data-testid="checkbox-exclude-zero" />
              <Label htmlFor="exclude-zero" className="text-sm font-medium cursor-pointer">استبعاد الصفري</Label>
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="flex-1 h-9 text-sm gap-1"
                onClick={handleApply} data-testid="button-apply">
                {(isLoading || isFetching)
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
                استعلام
              </Button>
              <Button size="sm" variant="outline" className="h-9 px-2"
                onClick={handleReset} data-testid="button-reset" title="إعادة تعيين">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────────────── */}
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
                      {catLabel(row.category)}
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

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {applied && total > PAGE_SIZE && (
        <div className="flex-shrink-0 p-2 border-t flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحة {page} من {totalPages} — {total.toLocaleString("ar-EG")} صنف
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2"
              disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2"
              disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
