// ============================================================
//  SearchView — شاشة البحث عن فاتورة مبيعات
//  تحتوي على: أزرار وضع البحث + حقول الإدخال + جدول النتائج
// ============================================================
import { useState, useEffect } from "react";
import { Search, FileText, Barcode, Package, Loader2, Hash, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import type { SearchMode } from "../hooks/useReturnSearch";
import type { ReturnSearchResult } from "../types";

// ── الثوابت ──────────────────────────────────────────────────
const SEARCH_MODES: { key: SearchMode; label: string; icon: any }[] = [
  { key: "invoiceNumber",  label: "رقم الفاتورة",    icon: FileText    },
  { key: "receiptBarcode", label: "باركود الإيصال",  icon: Barcode     },
  { key: "itemBarcode",    label: "باركود الصنف",    icon: ScanBarcode },
  { key: "itemCode",       label: "كود الصنف",       icon: Hash        },
  { key: "item",           label: "بحث بالاسم",      icon: Package     },
];

// وضع البحث المباشر (حقل نص واحد)
const DIRECT_INPUT_MODES: SearchMode[] = ["invoiceNumber", "receiptBarcode", "itemBarcode", "itemCode"];

const INPUT_LABELS: Record<string, string> = {
  invoiceNumber:  "رقم الفاتورة",
  receiptBarcode: "رقم الإيصال",
  itemBarcode:    "باركود الصنف",
  itemCode:       "كود الصنف الداخلي",
};

const INPUT_PLACEHOLDERS: Record<string, string> = {
  invoiceNumber:  "ادخل رقم الفاتورة",
  receiptBarcode: "ادخل رقم الإيصال",
  itemBarcode:    "امسح أو ادخل باركود الصنف",
  itemCode:       "ادخل كود الصنف",
};

// ── Props ─────────────────────────────────────────────────────
interface Props {
  searchMode: SearchMode;
  setSearchMode: (m: SearchMode) => void;
  searchValue: string;
  setSearchValue: (v: string) => void;
  selectedItemId: string | null;
  selectedItemName: string;
  setSelectedItemId: (id: string | null) => void;
  setSelectedItemName: (name: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  warehouseId: string;
  setWarehouseId: (v: string) => void;
  results: ReturnSearchResult[];
  isLoading: boolean;
  canSearch: boolean;
  triggerSearch: () => void;
  onSelectInvoice: (id: string) => void;
}

// ============================================================
export function SearchView(props: Props) {
  const {
    searchMode, setSearchMode,
    searchValue, setSearchValue,
    selectedItemId, selectedItemName, setSelectedItemId, setSelectedItemName,
    dateFrom, setDateFrom, dateTo, setDateTo,
    warehouseId, setWarehouseId,
    results, isLoading, canSearch, triggerSearch,
    onSelectInvoice,
  } = props;

  const { data: warehouses = [] } = useQuery<any[]>({ queryKey: ["/api/warehouses"], staleTime: 5 * 60_000 });

  // ضبط المخزن تلقائياً إذا كان للمستخدم مخزن واحد فقط
  useEffect(() => {
    if (warehouses.length === 1 && !warehouseId) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehouses, warehouseId, setWarehouseId]);

  const isWarehouseLocked = warehouses.length === 1;

  const isDirectMode = DIRECT_INPUT_MODES.includes(searchMode);
  const showDateFilters = ["item", "itemBarcode", "itemCode"].includes(searchMode);

  return (
    <div className="space-y-4" data-testid="section-search">

      {/* ── أزرار وضع البحث ── */}
      <div className="flex gap-2 flex-wrap" dir="rtl">
        {SEARCH_MODES.map((m) => (
          <Button
            key={m.key}
            variant={searchMode === m.key ? "default" : "outline"}
            size="sm"
            onClick={() => setSearchMode(m.key)}
            data-testid={`button-mode-${m.key}`}
          >
            <m.icon className="h-4 w-4 ml-1" />
            {m.label}
          </Button>
        ))}
      </div>

      {/* ── حقول الإدخال + فلاتر ── */}
      <div className="flex gap-2 flex-wrap items-end" dir="rtl">

        {/* حقل نص مباشر (رقم فاتورة / باركود / كود) */}
        {isDirectMode && (
          <div className="w-56">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">
              {INPUT_LABELS[searchMode]}
            </label>
            <Input
              type={["invoiceNumber", "receiptBarcode"].includes(searchMode) ? "number" : "text"}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && triggerSearch()}
              placeholder={INPUT_PLACEHOLDERS[searchMode]}
              className="h-9"
              autoFocus
              data-testid="input-search-value"
            />
          </div>
        )}

        {/* بحث بالاسم مع autocomplete */}
        {searchMode === "item" && (
          <ItemSearchField
            selectedItemId={selectedItemId}
            selectedItemName={selectedItemName}
            onSelect={(id, name) => { setSelectedItemId(id); setSelectedItemName(name); }}
            onClear={() => { setSelectedItemId(null); setSelectedItemName(""); }}
          />
        )}

        {/* فلاتر التاريخ (تظهر فقط مع بعض الأوضاع) */}
        {showDateFilters && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" data-testid="input-date-to" />
            </div>
          </>
        )}

        {/* فلتر المخزن */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">المخزن</label>
          {isWarehouseLocked ? (
            <div
              className="h-9 text-sm border rounded px-2 bg-muted text-foreground min-w-[140px] flex items-center font-semibold"
              data-testid="select-warehouse"
              title="مخزنك المخصص"
            >
              {warehouses[0]?.nameAr || warehouses[0]?.name_ar || ""}
            </div>
          ) : (
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-9 text-sm border rounded px-2 bg-background text-foreground min-w-[140px]"
              data-testid="select-warehouse"
            >
              <option value="">الكل</option>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.nameAr || w.name_ar || w.name}</option>
              ))}
            </select>
          )}
        </div>

        <Button
          onClick={triggerSearch}
          disabled={!canSearch || isLoading}
          size="sm"
          className="h-9"
          data-testid="button-search"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 ml-1" />}
          بحث
        </Button>
      </div>

      {/* ── جدول نتائج البحث ── */}
      {results.length > 0 && (
        <SearchResultsTable results={results} onSelect={onSelectInvoice} />
      )}
    </div>
  );
}

// ============================================================
//  Sub-component: بحث صنف بالاسم مع dropdown
// ============================================================
function ItemSearchField({
  selectedItemId, selectedItemName,
  onSelect, onClear,
}: {
  selectedItemId: string | null;
  selectedItemName: string;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/items/search?q=${encodeURIComponent(term)}`],
    enabled: term.length >= 2,
  });

  if (selectedItemId) {
    return (
      <div className="w-64">
        <label className="text-xs font-semibold text-muted-foreground mb-1 block">بحث عن صنف</label>
        <div className="flex items-center gap-2 h-9 border rounded px-2 bg-muted">
          <span className="text-sm font-semibold truncate flex-1">{selectedItemName}</span>
          <button onClick={onClear} className="text-xs text-destructive hover:underline" data-testid="button-clear-item">
            مسح
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 relative">
      <label className="text-xs font-semibold text-muted-foreground mb-1 block">بحث عن صنف</label>
      <Input
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="اسم أو كود الصنف..."
        className="h-9"
        autoFocus
        data-testid="input-item-search"
      />
      {open && term.length >= 2 && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-y-auto bg-background border rounded-lg shadow-xl">
          {isLoading ? (
            <div className="p-3 text-center text-sm text-muted-foreground">جاري البحث...</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
          ) : (
            items.map((item: any) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item.id, item.nameAr || item.name_ar); setOpen(false); setTerm(""); }}
                className="w-full text-right px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0 flex items-center gap-2"
                data-testid={`item-option-${item.id}`}
              >
                <span className="font-semibold">{item.nameAr || item.name_ar}</span>
                <span className="text-muted-foreground text-xs">({item.itemCode || item.item_code})</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Sub-component: جدول نتائج البحث
//  ملاحظة: فواتير الآجل (credit) تظهر بخلفية كهرمانية مميّزة
//  ومرتجعاتها تُغلق تلقائياً (collected) دون مرور على الكاشير.
// ============================================================
function SearchResultsTable({
  results, onSelect,
}: {
  results: ReturnSearchResult[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden" data-testid="section-results">
      {/* تلميح توضيحي لفواتير الآجل */}
      {results.some((r) => r.customerType === "credit") && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b text-[12px] text-amber-700 dark:text-amber-400" dir="rtl">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-700 border border-amber-400 flex-shrink-0" />
          فواتير الآجل (المظلّلة) — مرتجعاتها تُخصَم من ذمة العميل مباشرة ولا تظهر عند الكاشير
        </div>
      )}
      <table className="w-full text-[13px]" dir="rtl">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="py-1.5 px-3 text-right font-bold">رقم الفاتورة</th>
            <th className="py-1.5 px-3 text-right">التاريخ</th>
            <th className="py-1.5 px-3 text-right">المخزن</th>
            <th className="py-1.5 px-3 text-right">العميل / النوع</th>
            <th className="py-1.5 px-3 text-center">عدد الأصناف</th>
            <th className="py-1.5 px-3 text-left">الصافي</th>
            <th className="py-1.5 px-3 text-center">اختيار</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const isCredit = r.customerType === "credit";
            return (
              <tr
                key={r.id}
                className={[
                  "border-b",
                  isCredit
                    ? "bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    : "hover:bg-muted/30",
                ].join(" ")}
                data-testid={`row-result-${r.invoiceNumber}`}
              >
                <td className="py-1.5 px-3 font-bold text-[14px]">{r.invoiceNumber}</td>
                <td className="py-1.5 px-3">{new Date(r.invoiceDate).toLocaleDateString("ar-EG")}</td>
                <td className="py-1.5 px-3">{r.warehouseName}</td>
                <td className="py-1.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span>{r.customerName || "نقدي"}</span>
                    {isCredit && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 leading-none">
                        آجل
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 px-3 text-center">{r.itemCount}</td>
                <td className="py-1.5 px-3 text-left font-mono font-semibold">{parseFloat(r.netTotal).toFixed(2)}</td>
                <td className="py-1.5 px-3 text-center">
                  <Button
                    variant={isCredit ? "default" : "outline"}
                    size="sm"
                    onClick={() => onSelect(r.id)}
                    className={isCredit ? "bg-amber-500 hover:bg-amber-600 text-white border-0" : ""}
                    data-testid={`button-select-${r.invoiceNumber}`}
                  >
                    اختيار
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
