import {
  useState, useRef, useCallback, useEffect, useLayoutEffect,
} from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, PackageX, Package, ChevronLeft } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type {
  ItemFastSearchProps, FastSearchItem, BatchOption, SearchMode, FastSearchResponse,
} from "./types";

const DEBOUNCE_MS = 200;
const PAGE_SIZE = 40;

function parsePriceFilter(q: string): { nameQ: string; minPrice?: number; maxPrice?: number } {
  const rangeMatch = q.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/);
  if (rangeMatch) {
    return {
      nameQ: q.slice(0, rangeMatch.index!).trim(),
      minPrice: parseFloat(rangeMatch[1]),
      maxPrice: parseFloat(rangeMatch[2]),
    };
  }
  const singleMatch = q.match(/(\d+(?:\.\d+)?)\s*$/);
  if (singleMatch && !/^\d+$/.test(q.trim())) {
    return {
      nameQ: q.slice(0, singleMatch.index!).trim(),
      minPrice: parseFloat(singleMatch[1]),
      maxPrice: parseFloat(singleMatch[1]),
    };
  }
  return { nameQ: q };
}

export function ItemFastSearch({
  open,
  onClose,
  warehouseId,
  invoiceDate,
  onItemSelected,
  excludeServices,
  drugsOnly,
  title = "بحث سريع عن صنف",
}: ItemFastSearchProps) {
  const [mode, setMode] = useState<SearchMode>("AR");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<FastSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  // حالة الدُفعات — تُعبأ عند الطلب الصريح فقط (Enter الأولى)
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchOption | null>(null);
  const [batchItemId, setBatchItemId] = useState<string | null>(null);
  // batchMode: true = الدُفعات ظاهرة، Enter التالية تُضيف للفاتورة
  const [batchMode, setBatchMode] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);

  // ===== إعادة ضبط الدُفعات =====
  const resetBatches = useCallback(() => {
    setBatches([]);
    setSelectedBatch(null);
    setBatchItemId(null);
    setBatchMode(false);
  }, []);

  // ===== تحميل الدُفعات عند الطلب الصريح فقط =====
  const loadBatches = useCallback(async (item: FastSearchItem): Promise<boolean> => {
    if (!item.hasExpiry || !warehouseId) return false;
    // إذا مُحمّلة بالفعل لنفس الصنف
    if (batchItemId === item.id && batches.length > 0) {
      setBatchMode(true);
      return true;
    }
    if (batchAbortRef.current) batchAbortRef.current.abort();
    batchAbortRef.current = new AbortController();
    setBatchLoading(true);
    setBatchItemId(item.id);
    setBatchMode(true);
    try {
      const date = invoiceDate || new Date().toISOString().split("T")[0];
      const r = await fetch(
        `/api/items/${item.id}/expiry-options?warehouseId=${warehouseId}&asOfDate=${date}`,
        { signal: batchAbortRef.current.signal },
      );
      if (r.ok) {
        const data: BatchOption[] = await r.json();
        setBatches(data);
        setSelectedBatch(data[0] ?? null);
        return true;
      }
    } catch (e: any) {
      if (e.name === "AbortError") return false;
    } finally {
      setBatchLoading(false);
    }
    return false;
  }, [warehouseId, invoiceDate, batchItemId, batches.length]);

  // ===== إضافة صنف للفاتورة =====
  const selectItem = useCallback((item: FastSearchItem, batch?: BatchOption | null) => {
    const resolvedBatch = batch !== undefined ? batch : (selectedBatch ?? batches[0] ?? null);
    onItemSelected({ item, batch: item.hasExpiry ? resolvedBatch : null, availableQtyMinor: item.availableQtyMinor });
    // إعادة التركيز للبحث + تصفير batchMode
    resetBatches();
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [onItemSelected, selectedBatch, batches, resetBatches]);

  // ===== معالجة البحث =====
  const doSearch = useCallback(async (q: string, pg: number, md: SearchMode) => {
    if (!q.trim()) { setItems([]); setTotal(0); resetBatches(); return; }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    resetBatches();
    try {
      const { nameQ, minPrice, maxPrice } = parsePriceFilter(q);
      const effectiveQ = nameQ || q;
      const params = new URLSearchParams({
        warehouseId,
        mode: md,
        q: effectiveQ,
        page: String(pg),
        pageSize: String(PAGE_SIZE),
        includeZeroStock: "true",
        ...(excludeServices ? { excludeServices: "true" } : {}),
        ...(drugsOnly ? { drugsOnly: "true" } : {}),
        ...(minPrice !== undefined ? { minPrice: String(minPrice) } : {}),
        ...(maxPrice !== undefined ? { maxPrice: String(maxPrice) } : {}),
      });
      const r = await fetch(`/api/items/search?${params}`, { signal: abortRef.current.signal });
      if (r.ok) {
        const data: FastSearchResponse = await r.json();
        const rows: FastSearchItem[] = (data.items || (data as any).data || data as any) as FastSearchItem[];
        setItems(rows);
        setTotal(data.total ?? rows.length);
        setHighlighted(rows.length > 0 ? 0 : -1);
        // لا نحمّل الدُفعات تلقائياً — فقط عند Enter
      }
    } catch (e: any) {
      if (e.name !== "AbortError") { setItems([]); setTotal(0); }
    } finally {
      setLoading(false);
    }
  }, [warehouseId, excludeServices, drugsOnly, resetBatches]);

  const onQueryChange = useCallback((val: string) => {
    setQuery(val);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, 1, mode), DEBOUNCE_MS);
  }, [doSearch, mode]);

  const onModeChange = useCallback((md: SearchMode) => {
    setMode(md);
    setPage(1);
    if (query.trim()) doSearch(query, 1, md);
  }, [query, doSearch]);

  // ===== لوحة المفاتيح =====
  const handleKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => {
        const next = Math.min(h + 1, items.length - 1);
        rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
      // إعادة ضبط batchMode عند التنقل
      resetBatches();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => {
        const prev = Math.max(h - 1, 0);
        rowRefs.current[prev]?.scrollIntoView({ block: "nearest" });
        return prev;
      });
      resetBatches();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[highlighted];
      if (!item) return;

      if (!item.hasExpiry) {
        // صنف بدون صلاحية → إضافة فورية بدون API call
        selectItem(item, null);
        return;
      }

      if (!batchMode) {
        // Enter الأولى → أظهر الدُفعات
        await loadBatches(item);
      } else {
        // Enter الثانية → أضف للفاتورة بالدفعة المختارة
        selectItem(item);
      }
    } else if (e.key === "Escape") {
      if (batchMode) {
        resetBatches();
      } else {
        onClose();
      }
    }
  }, [items, highlighted, batchMode, selectItem, loadBatches, resetBatches, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setItems([]);
      setTotal(0);
      setHighlighted(-1);
      resetBatches();
    }
  }, [open, resetBatches]);

  useLayoutEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentItem = highlighted >= 0 ? items[highlighted] : null;
  const showBatchPanel = batchMode && currentItem?.hasExpiry;

  const stockBadge = (item: FastSearchItem) => {
    const qty = parseFloat(item.availableQtyMinor ?? "0");
    if (qty > 0) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
          <Package className="h-3 w-3" />
          {formatNumber(qty)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
        <PackageX className="h-3 w-3" />
        نفد
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden" dir="rtl" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="px-4 py-3 border-b bg-muted/40">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <Search className="h-4 w-4 text-primary" />
            {title}
            {total > 0 && (
              <span className="mr-auto text-[11px] font-normal text-muted-foreground">
                {total.toLocaleString("ar-EG")} صنف
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* شريط البحث */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as SearchMode)}
            className="peachtree-select text-[12px] h-8 w-28 shrink-0"
            data-testid="select-fast-search-mode"
            tabIndex={0}
          >
            <option value="AR">اسم عربي</option>
            <option value="EN">اسم إنجليزي</option>
            <option value="CODE">كود</option>
            <option value="BARCODE">باركود</option>
          </select>
          <div className="relative flex-1">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='ابحث بالاسم، أو "اسم سعر" مثال: para 20 أو para 10-50'
              className="peachtree-input w-full h-8 text-[12px] pl-8"
              autoComplete="off"
              data-testid="input-fast-search-query"
            />
            {loading && (
              <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          {/* مؤشر الحالة */}
          <div className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:block">
            {!batchMode ? (
              <span>↑↓ تنقل · <kbd className="border rounded px-1">↵</kbd> {currentItem?.hasExpiry ? "دُفعات" : "إضافة"} · ESC خروج</span>
            ) : (
              <span className="text-primary font-semibold">
                <kbd className="border rounded px-1">↵</kbd> إضافة · ESC رجوع
              </span>
            )}
          </div>
        </div>

        <div className="flex" style={{ height: "52vh", minHeight: 260 }}>
          {/* جدول النتائج */}
          <div className="flex-1 overflow-auto">
            <table className="peachtree-grid w-full text-[12px]" data-testid="table-fast-search-results">
              <thead className="sticky top-0 z-10">
                <tr className="peachtree-grid-header">
                  <th className="w-[90px]">الكود</th>
                  <th>الاسم العربي</th>
                  <th className="w-[120px]">الاسم الإنجليزي</th>
                  <th className="w-[70px] text-center">الوحدة</th>
                  <th className="w-[80px] text-center">السعر</th>
                  <th className="w-[90px] text-center">المخزون</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isHl = idx === highlighted;
                  const hasStock = parseFloat(item.availableQtyMinor ?? "0") > 0;
                  return (
                    <tr
                      key={item.id}
                      ref={(el) => { rowRefs.current[idx] = el; }}
                      className={`peachtree-grid-row cursor-pointer select-none transition-colors ${
                        isHl ? "bg-primary/15 outline outline-1 outline-primary/40" : ""
                      } ${!hasStock ? "opacity-50" : ""}`}
                      onClick={() => {
                        setHighlighted(idx);
                        resetBatches();
                        if (!item.hasExpiry) {
                          selectItem(item, null);
                        } else {
                          loadBatches(item);
                        }
                      }}
                      onMouseEnter={() => {
                        // الماوس يُحرّك التظليل فقط — بدون API call
                        if (!isHl) {
                          setHighlighted(idx);
                          if (batchMode) resetBatches();
                        }
                      }}
                      data-testid={`row-fast-search-${item.id}`}
                    >
                      <td className="font-mono text-[11px]">{item.itemCode}</td>
                      <td className={`font-semibold ${!hasStock ? "text-muted-foreground" : ""}`}>
                        <span className="flex items-center gap-1">
                          {item.nameAr}
                          {item.hasExpiry && (
                            <span className="text-[9px] text-amber-500 font-normal">exp</span>
                          )}
                        </span>
                      </td>
                      <td className="text-muted-foreground text-[11px] truncate max-w-[120px]">
                        {item.nameEn || "—"}
                      </td>
                      <td className="text-center text-muted-foreground">
                        {item.majorUnitName || item.minorUnitName || "—"}
                      </td>
                      <td className="text-center peachtree-amount">
                        {formatNumber(item.salePriceCurrent)}
                      </td>
                      <td className="text-center">{stockBadge(item)}</td>
                    </tr>
                  );
                })}

                {!loading && query.trim() && items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-10 text-[13px]">
                      لا توجد نتائج لـ "{query}"
                    </td>
                  </tr>
                )}
                {!loading && !query.trim() && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-10 text-[13px]">
                      ابدأ الكتابة للبحث...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* لوحة الدُفعات — تظهر فقط بعد Enter الأولى على صنف ذي صلاحية */}
          {showBatchPanel && (
            <div className="w-56 border-r flex flex-col bg-amber-50/60 shrink-0">
              <div className="px-3 py-2 border-b text-[11px] font-semibold text-amber-700 flex items-center justify-between">
                <span>اختر الدُفعة · ↵ للإضافة</span>
                {batchLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              {batchLoading ? (
                <div className="flex items-center justify-center flex-1 gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التحميل...
                </div>
              ) : batches.length === 0 ? (
                <div className="flex items-center justify-center flex-1 text-[12px] text-muted-foreground">
                  لا توجد دفعات
                </div>
              ) : (
                <div className="overflow-auto flex-1">
                  {batches.map((b, i) => {
                    const isSel = selectedBatch?.expiryDate === b.expiryDate;
                    const qty = parseFloat(b.qtyAvailableMinor);
                    const label = `${String(b.expiryMonth).padStart(2, "0")}/${b.expiryYear}`;
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-3 py-2.5 cursor-pointer border-b text-[12px] transition-colors ${
                          isSel
                            ? "bg-amber-200/70 font-semibold text-amber-900"
                            : "hover:bg-amber-100/60"
                        }`}
                        onClick={() => { setSelectedBatch(b); if (currentItem) selectItem(currentItem, b); }}
                        data-testid={`batch-option-${i}`}
                      >
                        <span className="font-mono">{label}</span>
                        <span className={qty > 0 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                          {formatNumber(qty)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div
                className="px-3 py-2 border-t text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/30 flex items-center gap-1"
                onClick={resetBatches}
              >
                <ChevronLeft className="h-3 w-3" /> ESC رجوع
              </div>
            </div>
          )}
        </div>

        {/* شريط Pagination */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-[12px]">
          <div className="flex items-center gap-1">
            <button
              className="peachtree-btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => { const p = page - 1; setPage(p); doSearch(query, p, mode); }}
              data-testid="button-fast-search-prev"
            >
              ‹ السابق
            </button>
            <span className="px-2 text-muted-foreground">
              {page} / {totalPages || 1}
            </span>
            <button
              className="peachtree-btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => { const p = page + 1; setPage(p); doSearch(query, p, mode); }}
              data-testid="button-fast-search-next"
            >
              التالي ›
            </button>
          </div>
          <div className="flex items-center gap-2">
            {currentItem && !showBatchPanel && (
              <button
                className="peachtree-btn-sm bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  if (!currentItem.hasExpiry) selectItem(currentItem, null);
                  else loadBatches(currentItem);
                }}
                data-testid="button-fast-search-add"
              >
                {currentItem.hasExpiry ? "دُفعات ↵" : "إضافة ↵"}
              </button>
            )}
            {showBatchPanel && selectedBatch && currentItem && (
              <button
                className="peachtree-btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => selectItem(currentItem)}
                data-testid="button-fast-search-confirm-batch"
              >
                إضافة بالدفعة ↵
              </button>
            )}
            <button
              className="peachtree-btn-sm"
              onClick={() => batchMode ? resetBatches() : onClose()}
              data-testid="button-fast-search-close"
            >
              {batchMode ? "رجوع ESC" : "إغلاق ESC"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
