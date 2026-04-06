import {
  useState, useRef, useCallback, useEffect, useLayoutEffect,
} from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, PackageX, Package, AlertCircle, SlidersHorizontal } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { formatAvailability } from "@/lib/invoice-lines";
import type {
  ItemFastSearchProps, FastSearchItem, BatchOption, SearchMode, FastSearchResponse,
} from "./types";

// ── ثوابت ───────────────────────────────────────────────────────────────────
const DEBOUNCE_MS      = 180;
const PRELOAD_DELAY_MS = 120;   // تحميل الدُفعات مسبقاً بعد توقف التمييز
const PAGE_SIZE        = 40;

// ── مكوّن شارة المخزون ──────────────────────────────────────────────────────
function StockBadge({ item, hide }: { item: FastSearchItem; hide: boolean }) {
  const qty   = parseFloat(item.availableQtyMinor ?? "0");
  const label = formatAvailability(item.availableQtyMinor, "major", item);
  if (hide) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-[12px]">
        <Package className="h-3.5 w-3.5" />{label}
      </span>
    );
  }
  if (qty > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[12px]">
        <Package className="h-3.5 w-3.5" />{label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-rose-400 text-[12px]">
      <PackageX className="h-3.5 w-3.5" />نفد
    </span>
  );
}

// ── الكمبوننت الرئيسي ──────────────────────────────────────────────────────
export function ItemFastSearch({
  open, onClose, warehouseId, invoiceDate, onItemSelected,
  excludeServices, drugsOnly, title = "بحث سريع عن صنف",
  hideStockWarning = false,
}: ItemFastSearchProps) {

  // ── حالة البحث ─────────────────────────────────────────────────────────
  const [mode,        setMode]        = useState<SearchMode>("AR");
  const [query,       setQuery]       = useState("");
  const [items,       setItems]       = useState<FastSearchItem[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  // ── فلاتر إضافية ────────────────────────────────────────────────────────
  const [inStockOnly, setInStockOnly] = useState(false);
  const [minPrice,    setMinPrice]    = useState("");
  const [maxPrice,    setMaxPrice]    = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ── حالة الدُفعات (للتحميل المسبق الصامت فقط — لا لوحة اختيار) ────────
  const [batches,      setBatches]      = useState<BatchOption[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchItemId,  setBatchItemId]  = useState<string | null>(null);

  // ── refs ────────────────────────────────────────────────────────────────
  const searchRef    = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs      = useRef<(HTMLTableRowElement | null)[]>([]);
  const abortRef     = useRef<AbortController | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const lastKeyboardAt = useRef<number>(0);

  // ── إعادة ضبط بيانات الدُفعات المحملة مسبقاً ─────────────────────────
  const resetBatches = useCallback(() => {
    if (batchAbortRef.current) { batchAbortRef.current.abort(); batchAbortRef.current = null; }
    setBatches([]);
    setBatchItemId(null);
    setBatchLoading(false);
  }, []);

  // ── تحميل الدُفعات بشكل صامت (لتمرير allBatches للفاتورة/التحويل) ─────
  const loadBatches = useCallback(async (item: FastSearchItem): Promise<BatchOption[]> => {
    if (!item.hasExpiry || !warehouseId) return [];

    // إذا كانت محملة بالفعل لنفس الصنف → أعدها مباشرةً
    if (batchItemId === item.id && batches.length > 0 && !batchLoading) return batches;

    if (batchAbortRef.current) batchAbortRef.current.abort();
    batchAbortRef.current = new AbortController();

    setBatchLoading(true);
    setBatchItemId(item.id);

    try {
      const date = invoiceDate || new Date().toISOString().split("T")[0];
      const r = await fetch(
        `/api/items/${item.id}/expiry-options?warehouseId=${warehouseId}&asOfDate=${date}`,
        { signal: batchAbortRef.current.signal },
      );
      if (r.ok) {
        const data: BatchOption[] = await r.json();
        setBatches(data);
        return data;
      }
    } catch (e: any) {
      if (e.name === "AbortError") return [];
    } finally {
      setBatchLoading(false);
    }
    return [];
  }, [warehouseId, invoiceDate, batchItemId, batches, batchLoading]);

  // ── تحميل مسبق صامت عند التمييز ─────────────────────────────────────
  // يحذف race-condition: بحلول وقت الضغط على Enter تكون الدُفعات جاهزة
  useEffect(() => {
    if (preloadRef.current) clearTimeout(preloadRef.current);
    const item = items[highlighted];
    if (!item?.hasExpiry || !warehouseId) return;
    if (batchItemId === item.id) return;   // جاري التحميل أو محمّل بالفعل

    preloadRef.current = setTimeout(() => {
      loadBatches(item);                  // صامت: بدون لوحة
    }, PRELOAD_DELAY_MS);

    return () => {
      if (preloadRef.current) clearTimeout(preloadRef.current);
    };
  }, [highlighted, items, warehouseId, batchItemId, loadBatches]);

  // ── إضافة الصنف مباشرةً (FEFO يُعيّن الدُفعة في الفاتورة/التحويل) ─────
  const selectItem = useCallback((item: FastSearchItem) => {
    onItemSelected({
      item,
      batch:             null,           // لا نختار دُفعة هنا — FEFO يختار
      availableQtyMinor: item.availableQtyMinor,
      allBatches:        item.hasExpiry ? batches : [],  // الدُفعات المحملة مسبقاً
    });
    resetBatches();
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [onItemSelected, batches, resetBatches]);


  // ── البحث ─────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string, pg: number, md: SearchMode) => {
    if (!q.trim()) { setItems([]); setTotal(0); resetBatches(); return; }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    resetBatches();
    try {
      const minP = minPrice.trim() ? parseFloat(minPrice) : undefined;
      const maxP = maxPrice.trim() ? parseFloat(maxPrice) : undefined;

      const params = new URLSearchParams({
        warehouseId, mode: md, q: q.trim(),
        page: String(pg), pageSize: String(PAGE_SIZE),
        includeZeroStock: inStockOnly ? "false" : "true",
        ...(excludeServices    ? { excludeServices: "true" }   : {}),
        ...(drugsOnly          ? { drugsOnly:        "true" }   : {}),
        ...(minP !== undefined ? { minPrice: String(minP) }    : {}),
        ...(maxP !== undefined ? { maxPrice: String(maxP) }    : {}),
      });
      const r = await fetch(`/api/items/search?${params}`, { signal: abortRef.current.signal });
      if (r.ok) {
        const data: FastSearchResponse = await r.json();
        const rows: FastSearchItem[]   = (data.items || (data as any).data || data as any) as FastSearchItem[];
        setItems(rows);
        setTotal(data.total ?? rows.length);
        setHighlighted(rows.length > 0 ? 0 : -1);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") { setItems([]); setTotal(0); }
    } finally {
      setLoading(false);
    }
  }, [warehouseId, excludeServices, drugsOnly, resetBatches, inStockOnly, minPrice, maxPrice]);

  const triggerSearch = useCallback((val: string, pg = 1, md = mode) => {
    setPage(pg);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, pg, md), DEBOUNCE_MS);
  }, [doSearch, mode]);

  const onQueryChange = (val: string) => {
    setQuery(val);
    triggerSearch(val);
  };

  const onModeChange = (md: SearchMode) => {
    setMode(md);
    setPage(1);
    if (query.trim()) doSearch(query, 1, md);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  // إعادة بحث عند تغيير الفلاتر
  useEffect(() => {
    if (query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(query, 1, mode), DEBOUNCE_MS);
    }
  }, [inStockOnly, minPrice, maxPrice]);  // eslint-disable-line

  // ── لوحة المفاتيح ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      lastKeyboardAt.current = Date.now();
      setHighlighted(h => {
        const next = Math.min(h + 1, items.length - 1);
        rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      lastKeyboardAt.current = Date.now();
      setHighlighted(h => {
        const prev = Math.max(h - 1, 0);
        rowRefs.current[prev]?.scrollIntoView({ block: "nearest" });
        return prev;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[highlighted];
      if (!item) return;
      // أضف الصنف مباشرةً بغض النظر عن وجود صلاحية (FEFO يعمل في الفاتورة/التحويل)
      selectItem(item);
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [items, highlighted, selectItem, onClose]);

  // ── إعادة الضبط عند الإغلاق ──────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setQuery(""); setItems([]); setTotal(0); setHighlighted(-1);
      setPage(1);
      resetBatches();
    }
  }, [open, resetBatches]);

  useLayoutEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── قيم مشتقة ─────────────────────────────────────────────────────────
  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentItem = highlighted >= 0 ? items[highlighted] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-4xl w-full p-0 gap-0 overflow-hidden"
        dir="rtl"
        style={{ maxHeight: "90vh" }}
      >
        {/* ── Header ── */}
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

        {/* ── شريط البحث الرئيسي ── */}
        <div className="border-b bg-background">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as SearchMode)}
              className="peachtree-select text-[12px] h-8 w-28 shrink-0"
              data-testid="select-fast-search-mode"
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
                dir={mode === "EN" ? "ltr" : "rtl"}
                placeholder={
                  mode === "AR"      ? "ابحث بالاسم العربي..." :
                  mode === "EN"      ? "Search by English name..." :
                  mode === "CODE"    ? "ابحث بكود الصنف..." :
                                       "ابحث بالباركود..."
                }
                className={`peachtree-input w-full h-8 text-[13px] pl-8 ${mode === "EN" ? "font-mono tracking-wide" : ""}`}
                autoComplete="off"
                data-testid="input-fast-search-query"
              />
              {loading && (
                <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {mode === "EN" && (
              <span className="shrink-0 text-[10px] font-bold border rounded px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 border-blue-300">
                EN
              </span>
            )}

            {/* زر الفلاتر */}
            <button
              type="button"
              onClick={() => setShowFilters(f => !f)}
              className={`shrink-0 h-8 px-2 rounded border text-[12px] flex items-center gap-1 transition-colors ${showFilters ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              title="فلاتر متقدمة"
              data-testid="button-fast-search-filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>

            {/* تلميح لوحة المفاتيح */}
            <div className="text-[11px] text-muted-foreground whitespace-nowrap hidden md:block">
              <span>↑↓ · ↵ إضافة · ESC</span>
            </div>
          </div>

          {/* ── شريط الفلاتر (قابل للإخفاء) ── */}
          {showFilters && (
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 px-4 pb-2.5 pt-0">
              {/* فلتر السعر */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">سعر البيع:</span>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="من"
                  className="peachtree-input h-7 w-20 text-[12px] text-center"
                  data-testid="input-fast-search-min-price"
                />
                <span className="text-[11px] text-muted-foreground">—</span>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="إلى"
                  className="peachtree-input h-7 w-20 text-[12px] text-center"
                  data-testid="input-fast-search-max-price"
                />
              </div>

              {/* فلتر المخزون */}
              {!hideStockWarning && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                    data-testid="checkbox-fast-search-in-stock-only"
                  />
                  <span className="text-[12px] text-foreground">الأصناف المتاحة فقط</span>
                </label>
              )}

              {/* زر إعادة الضبط */}
              {(minPrice || maxPrice || inStockOnly) && (
                <button
                  type="button"
                  onClick={() => { setMinPrice(""); setMaxPrice(""); setInStockOnly(false); }}
                  className="text-[11px] text-rose-500 hover:underline"
                  data-testid="button-fast-search-reset-filters"
                >
                  مسح الفلاتر
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── جسم النافذة ── */}
        <div className="flex" style={{ height: "52vh", minHeight: 260 }}>

          {/* جدول النتائج */}
          <div className="flex-1 overflow-auto">
            <table
              className="peachtree-grid peachtree-grid-search w-full"
              data-testid="table-fast-search-results"
            >
              <thead className="sticky top-0 z-10">
                <tr className="peachtree-grid-header">
                  <th className="w-[90px]">الكود</th>
                  <th className="text-right">الاسم العربي</th>
                  <th className="w-[130px] text-right">الاسم الإنجليزي</th>
                  <th className="w-[70px] text-center">الوحدة</th>
                  <th className="w-[80px] text-center">السعر</th>
                  <th className="w-[90px] text-center">المخزون</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isHl     = idx === highlighted;
                  const hasStock = parseFloat(item.availableQtyMinor ?? "0") > 0;
                  const isPreloading =
                    isHl && item.hasExpiry && batchLoading && batchItemId === item.id;

                  return (
                    <tr
                      key={item.id}
                      ref={(el) => { rowRefs.current[idx] = el; }}
                      className={[
                        "peachtree-grid-row cursor-pointer select-none transition-colors",
                        isHl ? "bg-primary/15 outline outline-2 outline-primary/50" : "",
                        !hasStock && !hideStockWarning ? "opacity-55" : "",
                      ].join(" ")}
                      onClick={() => {
                        setHighlighted(idx);
                        selectItem(item);
                      }}
                      onMouseEnter={() => {
                        if (Date.now() - lastKeyboardAt.current < 400) return;
                        if (!isHl) setHighlighted(idx);
                      }}
                      data-testid={`row-fast-search-${item.id}`}
                    >
                      <td className="font-mono text-[11px] text-muted-foreground">{item.itemCode}</td>

                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold text-[13px] ${!hasStock && !hideStockWarning ? "text-muted-foreground" : "text-foreground"}`}>
                            {item.nameAr}
                          </span>
                          {item.hasExpiry && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded px-1 py-0 leading-4">
                              <AlertCircle className="h-2.5 w-2.5" />صلاحية
                            </span>
                          )}
                          {isPreloading && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </td>

                      <td className="text-muted-foreground text-[11px]">{item.nameEn || "—"}</td>

                      <td className="text-center text-muted-foreground text-[12px]">
                        {item.majorUnitName || item.minorUnitName || "—"}
                      </td>

                      <td className="text-center peachtree-amount text-[13px]">
                        {formatNumber(item.salePriceCurrent)}
                      </td>

                      <td className="text-center">
                        <StockBadge item={item} hide={hideStockWarning} />
                      </td>
                    </tr>
                  );
                })}

                {!loading && query.trim() && items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-12 text-[14px]">
                      لا توجد نتائج لـ <strong>"{query}"</strong>
                    </td>
                  </tr>
                )}
                {!loading && !query.trim() && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-12 text-[14px]">
                      ابدأ الكتابة للبحث...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* ── Pagination + أزرار الإجراء ── */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-[12px]">
          <div className="flex items-center gap-1">
            <button
              className="peachtree-btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => { const p = page - 1; setPage(p); doSearch(query, p, mode); }}
              data-testid="button-fast-search-prev"
            >‹ السابق</button>
            <span className="px-2 text-muted-foreground">{page} / {totalPages || 1}</span>
            <button
              className="peachtree-btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => { const p = page + 1; setPage(p); doSearch(query, p, mode); }}
              data-testid="button-fast-search-next"
            >التالي ›</button>
          </div>

          <div className="flex items-center gap-2">
            {currentItem && (
              <button
                className="peachtree-btn-sm bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                onClick={() => selectItem(currentItem)}
                data-testid="button-fast-search-add"
              >
                إضافة ↵
              </button>
            )}

            <button
              className="peachtree-btn-sm"
              onClick={onClose}
              data-testid="button-fast-search-close"
            >
              إغلاق ESC
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
