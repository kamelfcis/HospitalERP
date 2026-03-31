import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, FileSpreadsheet, Printer, Search, Package, X, TrendingUp, TrendingDown, ArrowLeftRight, ClipboardList, RotateCcw, Gift, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

// ── Types ──────────────────────────────────────────────────────────────────────
interface ItemMovementSummary {
  totalIn: number;
  totalOut: number;
  byType: Record<string, number>;
}

interface ItemMovementResult {
  rows: ItemMovementRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: ItemMovementSummary;
}

interface ItemMovementRow {
  id: string;
  txDate: string;
  txType: "in" | "out";
  referenceType: string;
  referenceId: string;
  isReturn: boolean;
  qtyChangeMinor: number;
  unitCost: number | null;
  balanceAfterMinor: number;
  lotPurchasePrice: number;
  lotSalePrice: number;
  isBonus: boolean;
  itemCode: string;
  itemName: string;
  majorUnitName: string | null;
  mediumUnitName: string | null;
  minorUnitName: string | null;
  majorToMinor: number;
  mediumToMinor: number;
  majorToMedium: number;
  warehouseName: string;
  documentNumber: string | null;
  supplierInvoiceNo: string | null;
  supplierName: string | null;
  transferOtherWarehouse: string | null;
  userName: string | null;
}

interface ItemLookupResult {
  id: string;
  itemCode: string;
  nameAr: string;
}

type UnitLevel = "major" | "medium" | "minor";

// ── Constants ─────────────────────────────────────────────────────────────────
const TX_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  receiving:       { label: "استلام شراء",     color: "bg-emerald-100 text-emerald-800 border-emerald-200",   icon: TrendingUp },
  sales_invoice:   { label: "فاتورة مبيعات",  color: "bg-red-100 text-red-800 border-red-200",              icon: TrendingDown },
  sales_return:    { label: "مرتجع مبيعات",   color: "bg-purple-100 text-purple-800 border-purple-200",     icon: RotateCcw },
  patient_invoice: { label: "فاتورة مريض",    color: "bg-orange-100 text-orange-800 border-orange-200",     icon: TrendingDown },
  transfer:        { label: "تحويل مخزن",     color: "bg-blue-100 text-blue-800 border-blue-200",           icon: ArrowLeftRight },
  stock_count:     { label: "جرد دوري",       color: "bg-gray-100 text-gray-800 border-gray-200",           icon: ClipboardList },
  purchase_return: { label: "مرتجع مشتريات",  color: "bg-yellow-100 text-yellow-800 border-yellow-200",    icon: RotateCcw },
};

const ALL_TX_TYPES = ["receiving", "sales_invoice", "patient_invoice", "transfer", "stock_count", "purchase_return"];

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * تحويل qty_in_minor لعرضها بالوحدة المطلوبة.
 *
 * القاعدة: qty_in_minor يُخزَّن بالوحدة الصغرى الحقيقية إذا majorToMinor > 1.
 *          إذا majorToMinor = 1 (NULL في DB) فالقيمة مخزَّنة بالوحدة الكبرى (علبة).
 *
 * حالات العرض:
 *  major  → إذا majorToMinor > 1 : اقسم عليه. وإلا: أظهر كما هي (القيمة مخزونة بالعلبة).
 *  medium → إذا mediumToMinor > 1: اقسم عليه.
 *           إذا majorToMinor = 1 (مخزون بعلبة) ومفيش minor حقيقي: اضرب في majorToMedium.
 *  minor  → أظهر كما هي (القيمة في وحدتها الصغرى).
 */
function convertQty(
  minor: number,
  level: UnitLevel,
  majorToMinor: number,
  mediumToMinor: number,
  majorToMedium: number = 1,
): number {
  if (level === "major") {
    if (majorToMinor > 1) return minor / majorToMinor;
    return minor; // مخزون بالعلبة — أظهر كما هي
  }
  if (level === "medium") {
    if (mediumToMinor > 1) return minor / mediumToMinor;
    // لا يوجد وحدة صغرى حقيقية → المخزون بالعلبة → اضرب في majorToMedium
    if (majorToMinor <= 1 && majorToMedium > 1) return minor * majorToMedium;
    return minor;
  }
  return minor;
}

function fmtQty(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "٠";
  if (Number.isInteger(n) || abs >= 100) return n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 4 });
}

function fmtMoney(n: number | null): string {
  if (n == null || n === 0) return "—";
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" }),
    time: d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
  };
}

// ── Item Combobox ─────────────────────────────────────────────────────────────
interface ItemComboboxProps {
  value: string;
  displayName: string;
  onChange: (id: string, name: string, code: string) => void;
}

function ItemCombobox({ value, displayName, onChange }: ItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ItemLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/items?search=${encodeURIComponent(query)}&limit=15&isActive=true`);
      const data = await res.json();
      const items: ItemLookupResult[] = (data.items ?? []).map((it: any) => ({
        id: it.id,
        itemCode: it.itemCode ?? it.item_code ?? "",
        nameAr: it.nameAr ?? it.name_ar ?? "",
      }));
      setResults(items);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  function handleInput(v: string) {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 220);
  }

  function handleSelect(item: ItemLookupResult) {
    onChange(item.id, item.nameAr, item.itemCode);
    setOpen(false);
    setQ("");
    setResults([]);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("", "", "");
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative" data-testid="item-combobox">
      <div
        className={cn(
          "flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer bg-background min-h-[38px]",
          "hover:border-primary/50 transition-colors",
          open && "border-primary ring-1 ring-primary/30"
        )}
        onClick={() => setOpen(o => !o)}
      >
        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
        {value ? (
          <span className="flex-1 text-sm font-semibold text-foreground truncate">{displayName}</span>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">اختر صنفاً...</span>
        )}
        {value && (
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive shrink-0" onClick={handleClear} />
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                className="pr-8 h-8 text-sm"
                placeholder="ابحث بالاسم أو الكود..."
                value={q}
                onChange={e => handleInput(e.target.value)}
                data-testid="input-item-search"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && q && results.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
            )}
            {!loading && !q && (
              <div className="py-4 text-center text-sm text-muted-foreground">اكتب للبحث...</div>
            )}
            {results.map(item => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted transition-colors text-sm",
                  item.id === value && "bg-primary/5 text-primary font-medium"
                )}
                onClick={() => handleSelect(item)}
                data-testid={`item-option-${item.id}`}
              >
                <span className="text-xs text-muted-foreground shrink-0 font-mono">{item.itemCode}</span>
                <span className="flex-1 truncate">{item.nameAr}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────
// يستقبل الملخص من السيرفر (إجمالي كل الصفحات) + أول صف لمعاملات التحويل
interface SummaryBarProps {
  summary: ItemMovementSummary;
  firstRow: ItemMovementRow;
  unitLevel: UnitLevel;
  totalRows: number;
}

function SummaryBar({ summary, firstRow, unitLevel, totalRows }: SummaryBarProps) {
  const conv = (m: number) => convertQty(m, unitLevel, firstRow.majorToMinor, firstRow.mediumToMinor, firstRow.majorToMedium);
  const unitLabel = unitLevel === "major" ? (firstRow.majorUnitName ?? "وحدة كبيرة")
    : unitLevel === "medium" ? (firstRow.mediumUnitName ?? "وحدة وسط")
    : (firstRow.minorUnitName ?? "وحدة صغيرة");

  return (
    <div className="print:hidden rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        ملخص الحركات — بالـ {unitLabel}
        <span className="mr-2 text-muted-foreground/70">({totalRows} حركة إجمالاً)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(summary.byType).map(([type, qty]) => {
          const cfg = TX_CONFIG[type] ?? { label: type, color: "bg-gray-100 text-gray-700 border-gray-200", icon: Package };
          const Icon = cfg.icon;
          const converted = conv(qty);
          return (
            <div key={type} className={cn("flex items-center gap-1.5 border rounded-md px-2.5 py-1 text-xs font-medium", cfg.color)}>
              <Icon className="h-3 w-3" />
              <span>{cfg.label}:</span>
              <span className="font-bold">{fmtQty(Math.abs(converted))}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 border rounded-md px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-800 border-slate-200">
          <TrendingUp className="h-3 w-3 text-emerald-600" />
          <span>إجمالي وارد: <strong>{fmtQty(conv(summary.totalIn))}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 border rounded-md px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-800 border-slate-200">
          <TrendingDown className="h-3 w-3 text-red-600" />
          <span>إجمالي صادر: <strong>{fmtQty(conv(summary.totalOut))}</strong></span>
        </div>
      </div>
    </div>
  );
}

// ── Print Header ──────────────────────────────────────────────────────────────
interface PrintHeaderProps {
  itemName: string;
  itemCode: string;
  warehouseName?: string;
  fromDate?: string;
  toDate?: string;
}
function PrintHeader({ itemName, itemCode, warehouseName, fromDate, toDate }: PrintHeaderProps) {
  return (
    <div className="hidden print:block mb-4">
      <h1 className="text-xl font-bold text-center mb-1">تقرير حركة صنف</h1>
      <div className="text-sm text-center text-muted-foreground space-y-0.5">
        <p>الصنف: <strong>{itemCode} — {itemName}</strong></p>
        {warehouseName && <p>المستودع: <strong>{warehouseName}</strong></p>}
        {(fromDate || toDate) && (
          <p>الفترة: {fromDate || "—"} إلى {toDate || "—"}</p>
        )}
        <p>تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}</p>
      </div>
      <hr className="mt-2" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ItemMovementReport() {
  const [itemId, setItemId] = useState("");
  const [itemDisplayName, setItemDisplayName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");
  const [unitLevel, setUnitLevel] = useState<UnitLevel>("minor");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(ALL_TX_TYPES));
  const [lastParams, setLastParams] = useState<Record<string, string> | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data: warehouses = [] } = useQuery<{ id: string; nameAr: string }[]>({
    queryKey: ["/api/warehouses"],
    staleTime: 5 * 60_000,
  });

  // queryUrl مُشتَق من lastParams + page — لا state منفصل
  const queryUrl = useMemo(() => {
    if (!lastParams) return null;
    const qs = new URLSearchParams({ ...lastParams, page: String(page), pageSize: String(PAGE_SIZE) });
    return `/api/reports/item-movement-detail?${qs}`;
  }, [lastParams, page]);

  const { data, isFetching, error } = useQuery<ItemMovementResult>({
    queryKey: [queryUrl],
    enabled: !!queryUrl,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const totalRows = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  function buildParams(): Record<string, string> {
    const params: Record<string, string> = { itemId };
    if (warehouseId && warehouseId !== "all") params.warehouseId = warehouseId;
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    if (selectedTypes.size > 0 && selectedTypes.size < ALL_TX_TYPES.length) {
      params.txTypes = Array.from(selectedTypes).join(",");
    }
    return params;
  }

  function handleGenerate() {
    if (!itemId) return;
    const params = buildParams();
    setPage(1);
    setLastParams(params);
  }

  function handleExport() {
    if (!lastParams) return;
    setExporting(true);
    const qs = new URLSearchParams({ ...lastParams, unitLevel });
    const url = `/api/reports/item-movement-detail/export?${qs}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `item-movement-${itemCode || "report"}.xlsx`;
    a.click();
    setTimeout(() => setExporting(false), 1500);
  }

  function handlePrint() {
    window.print();
  }

  function toggleType(type: string) {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleAllTypes() {
    if (selectedTypes.size === ALL_TX_TYPES.length) {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(new Set(ALL_TX_TYPES));
    }
  }

  const selectedWarehouseName = warehouses.find(w => w.id === warehouseId)?.nameAr;

  // ── خيارات الوحدات المتاحة بناءً على إعداد الصنف الفعلي ──────────────────
  // القاعدة التصميمية:
  //   • إذا majorToMinor > 1  → القاعدة وحدة صغرى  (minor)   → نعرض major + [medium] + minor
  //   • إذا majorToMinor = 1 ومعامل وسطى > 1 → القاعدة علبة  (major)   → نعرض major + medium
  //   • إذا وحدة واحدة فقط → نعرض major فقط
  const unitOptions = useMemo((): Array<{ value: UnitLevel; label: string }> => {
    if (rows.length === 0) return [
      { value: "major",  label: "كبيرة" },
      { value: "medium", label: "وسط"   },
      { value: "minor",  label: "صغيرة" },
    ];
    const f = rows[0];
    const opts: Array<{ value: UnitLevel; label: string }> = [];

    const hasMinor  = f.majorToMinor > 1;          // هل هناك وحدة صغرى حقيقية؟
    const hasMedium = f.majorToMedium > 1;          // هل هناك وحدة وسطى؟
    const hasMediumTrue = f.mediumToMinor > 1;      // وسطى مع minor حقيقي

    // الوحدة الكبرى (علبة): تظهر دائماً إذا كان لها اسم
    if (f.majorUnitName) {
      opts.push({ value: "major", label: f.majorUnitName });
    }

    // الوحدة الوسطى (شريط):
    //   حالة 1 — وسطى+صغرى معاً (ثلاث وحدات): تظهر إذا mediumToMinor > 1
    //   حالة 2 — وسطى فقط بدون صغرى حقيقية:  تظهر إذا majorToMedium > 1
    if (f.mediumUnitName && (hasMediumTrue || (!hasMinor && hasMedium))) {
      opts.push({ value: "medium", label: f.mediumUnitName });
    }

    // الوحدة الصغرى: تظهر فقط إذا كانت هناك وحدة صغرى حقيقية (majorToMinor > 1)
    if (hasMinor && f.minorUnitName) {
      opts.push({ value: "minor", label: f.minorUnitName });
    }

    // احتياطي: لا خيار → أظهر وحدة واحدة
    if (opts.length === 0) {
      opts.push({ value: "major", label: f.majorUnitName ?? f.minorUnitName ?? "وحدة" });
    }

    return opts;
  }, [rows]);

  // إذا تغيّر الصنف وأصبح unitLevel المختار غير متاح → اختر الأول المتاح
  useEffect(() => {
    if (!unitOptions.find(u => u.value === unitLevel)) {
      setUnitLevel(unitOptions[0]?.value ?? "minor");
    }
  }, [unitOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitName = rows.length > 0
    ? (unitOptions.find(u => u.value === unitLevel)?.label ?? "وحدة")
    : "وحدة";

  return (
    <div className="p-4 space-y-4 min-h-screen" dir="rtl">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-zone, .print-zone * { visibility: visible; }
          .print-zone { position: absolute; top: 0; right: 0; width: 100%; }
          @page { margin: 1.5cm; size: A4 landscape; }
        }
      `}</style>

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">تقرير حركة صنف</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={rows.length === 0 || exporting}
            data-testid="button-export-excel"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
            <span className="mr-1">تصدير Excel</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={rows.length === 0}
            data-testid="button-print"
          >
            <Printer className="h-4 w-4" />
            <span className="mr-1">طباعة</span>
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="rounded-lg border bg-card p-3 space-y-3 print:hidden">

        {/* ── Main filter row ── */}
        <div className="flex flex-wrap items-end gap-2">

          {/* Item selector — wider */}
          <div className="flex-1 min-w-[240px] space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">الصنف <span className="text-destructive">*</span></Label>
            <ItemCombobox
              value={itemId}
              displayName={`${itemCode} — ${itemDisplayName}`}
              onChange={(id, name, code) => {
                setItemId(id);
                setItemDisplayName(name);
                setItemCode(code);
                setLastParams(null);
              }}
            />
          </div>

          {/* Warehouse */}
          <div className="w-[160px] space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">المستودع</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId} data-testid="select-warehouse">
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="جميع المستودعات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المستودعات</SelectItem>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={w.id} data-testid={`warehouse-option-${w.id}`}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unit level */}
          <div className="w-[120px] space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">الوحدة</Label>
            <Select value={unitLevel} onValueChange={v => setUnitLevel(v as UnitLevel)} data-testid="select-unit-level">
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* From date */}
          <div className="w-[140px] space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">من تاريخ</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="h-9 text-sm"
              data-testid="input-from-date"
            />
          </div>

          {/* To date */}
          <div className="w-[140px] space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">إلى تاريخ</Label>
            <Input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="h-9 text-sm"
              data-testid="input-to-date"
            />
          </div>

          {/* Generate button aligned to bottom */}
          <Button
            onClick={handleGenerate}
            disabled={!itemId || isFetching}
            className="h-9 shrink-0 self-end"
            data-testid="button-generate-report"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="mr-1">توليد</span>
          </Button>
        </div>

        {/* ── Movement type filters ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2.5">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-muted-foreground">أنواع الحركات:</span>
            <button
              onClick={toggleAllTypes}
              className="text-xs text-primary hover:underline"
              data-testid="button-toggle-all-types"
            >
              {selectedTypes.size === ALL_TX_TYPES.length ? "إلغاء الكل" : "تحديد الكل"}
            </button>
          </div>
          {ALL_TX_TYPES.map(type => {
            const cfg = TX_CONFIG[type];
            const Icon = cfg.icon;
            return (
              <label
                key={type}
                className="flex items-center gap-1.5 cursor-pointer select-none"
                data-testid={`checkbox-type-${type}`}
              >
                <Checkbox
                  checked={selectedTypes.has(type)}
                  onCheckedChange={() => toggleType(type)}
                />
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs">{cfg.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          حدث خطأ أثناء جلب البيانات. يرجى المحاولة مرة أخرى.
        </div>
      )}

      {/* ── Summary ── */}
      {rows.length > 0 && !isFetching && data?.summary && (
        <SummaryBar
          summary={data.summary}
          firstRow={rows[0]}
          unitLevel={unitLevel}
          totalRows={totalRows}
        />
      )}

      {/* ── Results ── */}
      {(rows.length > 0 || isFetching) && (
        <div className="print-zone rounded-lg border overflow-hidden">
          <PrintHeader
            itemName={itemDisplayName}
            itemCode={itemCode}
            warehouseName={selectedWarehouseName}
            fromDate={fromDate}
            toDate={toDate}
          />

          {isFetching ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 print:hidden">
                <span className="text-sm text-muted-foreground">
                  {totalRows > 0
                    ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalRows)} من ${totalRows} حركة — بالـ ${unitName}`
                    : "لا توجد حركات"}
                </span>
                <span className="text-sm font-medium">{rows[0]?.itemName}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead className="w-10 text-center text-foreground">#</TableHead>
                    <TableHead className="text-foreground">التاريخ</TableHead>
                    <TableHead className="text-foreground">الوقت</TableHead>
                    <TableHead className="text-foreground">نوع الحركة</TableHead>
                    <TableHead className="text-foreground">مستند</TableHead>
                    <TableHead className="text-foreground">مورد / فاتورة / مخزن</TableHead>
                    <TableHead className="text-left text-foreground">الكمية</TableHead>
                    <TableHead className="text-left text-foreground">الرصيد</TableHead>
                    <TableHead className="text-left text-foreground print:hidden">سعر الشراء</TableHead>
                    <TableHead className="text-left text-foreground print:hidden">سعر البيع</TableHead>
                    <TableHead className="text-foreground print:hidden">المستودع</TableHead>
                    <TableHead className="text-foreground">المستخدم</TableHead>
                    <TableHead className="text-center text-foreground">هدية</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-12 text-center text-muted-foreground">
                        لا توجد حركات في النطاق المحدد
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, idx) => {
                      // للمرتجع مبيعات: نستخدم إعداد مختلف
                      const cfgKey = (row.referenceType === "sales_invoice" && row.isReturn) ? "sales_return" : row.referenceType;
                      const cfg = TX_CONFIG[cfgKey] ?? { label: row.referenceType, color: "bg-gray-100 text-gray-700 border-gray-200", icon: Package };
                      const Icon = cfg.icon;
                      const qtyConverted = convertQty(row.qtyChangeMinor, unitLevel, row.majorToMinor, row.mediumToMinor, row.majorToMedium);
                      const balConverted = convertQty(row.balanceAfterMinor, unitLevel, row.majorToMinor, row.mediumToMinor, row.majorToMedium);
                      const { date, time } = fmtDateTime(row.txDate);
                      const isIn = row.txType === "in";

                      // خلية "مورد / فاتورة / مخزن"
                      const refCell = (() => {
                        if (row.referenceType === "receiving") {
                          return (
                            <span className="flex flex-col gap-0.5">
                              {row.supplierName && <span className="font-medium text-foreground">{row.supplierName}</span>}
                              {row.supplierInvoiceNo && <span className="font-mono text-[10px] text-muted-foreground">{row.supplierInvoiceNo}</span>}
                              {!row.supplierName && !row.supplierInvoiceNo && <span className="text-muted-foreground">—</span>}
                            </span>
                          );
                        }
                        if (row.referenceType === "purchase_return") {
                          return <span className="font-medium">{row.supplierName ?? "—"}</span>;
                        }
                        if (row.referenceType === "transfer" && row.transferOtherWarehouse) {
                          return (
                            <span className="flex items-center gap-1 text-blue-700">
                              <ArrowLeftRight className="h-3 w-3 shrink-0" />
                              <span>{row.transferOtherWarehouse}</span>
                            </span>
                          );
                        }
                        return <span className="text-muted-foreground">—</span>;
                      })();

                      return (
                        <TableRow
                          key={row.id}
                          className={cn(
                            "text-xs hover:bg-muted/30 transition-colors [&>td]:py-3",
                            row.isBonus && "bg-amber-50/40 hover:bg-amber-50/60"
                          )}
                          data-testid={`row-movement-${row.id}`}
                        >
                          <TableCell className="text-center text-muted-foreground">{(page - 1) * PAGE_SIZE + idx + 1}</TableCell>
                          <TableCell className="font-mono">{date}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{time}</TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[11px] font-medium", cfg.color)}>
                              <Icon className="h-2.5 w-2.5" />
                              {cfg.label}
                              {row.referenceType === "transfer" && (
                                <span className="opacity-70">{isIn ? "↓" : "↑"}</span>
                              )}
                              {row.referenceType === "stock_count" && (
                                <span className="opacity-70">{isIn ? "+" : "−"}</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {row.documentNumber ?? "—"}
                          </TableCell>
                          <TableCell>{refCell}</TableCell>
                          <TableCell className={cn("text-left font-semibold tabular-nums", isIn ? "text-emerald-700" : "text-red-600")}>
                            {isIn ? "+" : "−"}{fmtQty(Math.abs(qtyConverted))}
                          </TableCell>
                          <TableCell className={cn("text-left font-bold tabular-nums", balConverted >= 0 ? "text-foreground" : "text-destructive")}>
                            {fmtQty(balConverted)}
                          </TableCell>
                          <TableCell className="text-left tabular-nums text-muted-foreground print:hidden">
                            {fmtMoney(row.unitCost ?? row.lotPurchasePrice)}
                          </TableCell>
                          <TableCell className="text-left tabular-nums text-muted-foreground print:hidden">
                            {fmtMoney(row.lotSalePrice)}
                          </TableCell>
                          <TableCell className="text-muted-foreground print:hidden">
                            {row.warehouseName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.userName ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.isBonus && (
                              <span className="inline-flex items-center gap-0.5 text-amber-700 text-[11px]">
                                <Gift className="h-3 w-3" />
                                هدية
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Footer: totals (server-side) + pagination */}
              {rows.length > 0 && data?.summary && (
                <div className="border-t px-4 py-3 bg-muted/30 space-y-2 print:hidden">
                  {/* Totals row — from server summary (covers ALL pages) */}
                  <div className="flex flex-wrap gap-4 text-xs justify-end">
                    {(() => {
                      const first = rows[0];
                      const conv = (m: number) => convertQty(m, unitLevel, first.majorToMinor, first.mediumToMinor, first.majorToMedium);
                      const lastBalance = rows[rows.length - 1].balanceAfterMinor;
                      return (
                        <>
                          <span className="text-muted-foreground">إجمالي وارد (كل الصفحات): <strong className="text-emerald-700">{fmtQty(conv(data.summary.totalIn))} {unitName}</strong></span>
                          <span className="text-muted-foreground">إجمالي صادر (كل الصفحات): <strong className="text-red-600">{fmtQty(conv(data.summary.totalOut))} {unitName}</strong></span>
                          <span className="text-muted-foreground">الرصيد ختام الصفحة: <strong>{fmtQty(conv(lastBalance))} {unitName}</strong></span>
                        </>
                      );
                    })()}
                  </div>
                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <span className="text-xs text-muted-foreground">
                        صفحة {page} من {totalPages} — إجمالي {totalRows} حركة
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page <= 1 || isFetching}
                          data-testid="button-prev-page"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span className="text-xs mr-1">السابق</span>
                        </Button>
                        <span className="text-xs px-2 font-mono">{page}/{totalPages}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page >= totalPages || isFetching}
                          data-testid="button-next-page"
                        >
                          <span className="text-xs ml-1">التالي</span>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!lastParams && !isFetching && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground print:hidden">
          <Package className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">اختر صنفاً ثم اضغط «توليد التقرير» لعرض الحركات</p>
        </div>
      )}

      {lastParams && !isFetching && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground print:hidden">
          <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">لا توجد حركات للصنف المحدد في النطاق الزمني والفلاتر المختارة</p>
        </div>
      )}
    </div>
  );
}

