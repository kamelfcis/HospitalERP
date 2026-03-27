import { useEffect, useRef, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { X, BarChart3, Lock, AlertTriangle } from "lucide-react";
import { formatNumber, formatQty } from "@/lib/formatters";
import {
  formatAvailability, getUnitOptions,
  computeUnitPriceFromBase, computeLineTotal,
} from "@/lib/invoice-lines";
import type { SalesLineLocal } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// ترتيب الأعمدة للتنقل بالأسهم (من اليسار إلى اليمين في DOM)
// في RTL: السهم الأيسر = للأمام (عمود أعلى index)، السهم الأيمن = للخلف
// ─────────────────────────────────────────────────────────────────────────────
const GRID_COLS = ["unit", "qty", "expiry"] as const;
type GridCol = (typeof GRID_COLS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// QtyCell — controlled input محمي من double-call
// ─────────────────────────────────────────────────────────────────────────────
interface QtyCellProps {
  line:           SalesLineLocal;
  rowIndex:       number;
  fefoLoading:    boolean;
  pendingQtyRef:  React.MutableRefObject<Map<string, string>>;
  onQtyConfirm:   (tempId: string) => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  testId:         string;
}

const QtyCell = memo(function QtyCell({
  line, rowIndex, fefoLoading, pendingQtyRef, onQtyConfirm, barcodeInputRef, testId,
}: QtyCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // عند تغيُّر الكمية من الخارج (FEFO / updateLine):
  // إن لم يكن المستخدم مُركِّزاً على هذا الحقل الآن → حدِّث DOM مباشرة
  // (بدون setState → بدون re-render → بدون أي تلعثم)
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement !== el) {
      el.value = String(line.qty);
      pendingQtyRef.current.delete(line.tempId);
    }
  }, [line.qty, line.unitLevel, line.tempId, pendingQtyRef]);

  return (
    <input
      ref={inputRef}
      type="number"
      step="0.001"
      min="0.001"
      defaultValue={String(line.qty)}
      onChange={(e) => {
        // فقط سجِّل القيمة المعلقة — لا setState — لا re-render
        pendingQtyRef.current.set(line.tempId, e.target.value);
      }}
      onFocus={(e) => {
        // امسح أي قيمة معلقة قديمة وحدد الكل — بدون setState
        pendingQtyRef.current.delete(line.tempId);
        e.target.select();
      }}
      onBlur={() => onQtyConfirm(line.tempId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          barcodeInputRef.current?.focus();
        }
        // ArrowUp/Down/Left/Right handled by container (bubble up)
      }}
      className="peachtree-input w-[64px] text-center"
      disabled={fefoLoading}
      data-testid={testId}
      data-grid-row={rowIndex}
      data-grid-col="qty"
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  lines:           SalesLineLocal[];
  isDraft:         boolean;
  fefoLoading:     boolean;
  pendingQtyRef:   React.MutableRefObject<Map<string, string>>;
  onUpdateLine:    (index: number, patch: Partial<SalesLineLocal>) => void;
  onRemoveLine:    (index: number) => void;
  onQtyConfirm:    (tempId: string) => void;
  onOpenStats:     (itemId: string) => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
}

// ─────────────────────────────────────────────────────────────────────────────
// الجدول الرئيسي
// ─────────────────────────────────────────────────────────────────────────────
export function InvoiceLineTable({
  lines, isDraft, fefoLoading, pendingQtyRef,
  onUpdateLine, onRemoveLine, onQtyConfirm, onOpenStats, barcodeInputRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── كشف الأصناف ذات الأسعار المتعددة ───────────────────────────────────────
  const multiPriceItems = new Set<string>();
  lines.forEach((ln) => {
    // كشف 1: نفس الصنف في سطور متعددة بأسعار مختلفة (بعد FEFO)
    const same = lines.filter((l) => l.itemId === ln.itemId);
    if (same.length > 1) {
      const prices = new Set(same.map((l) => String(Math.round(l.salePrice * 100))));
      if (prices.size > 1) multiPriceItems.add(ln.itemId);
    }
    // كشف 2: خيارات الصلاحية تحتوي على أسعار مختلفة (نفس التاريخ أو مختلف)
    const opts = ln.expiryOptions;
    if (opts && opts.length >= 1) {
      const byExpiry = new Map<string, Set<string>>();
      opts.forEach((o) => {
        const key = `${o.expiryMonth}/${o.expiryYear}`;
        if (!byExpiry.has(key)) byExpiry.set(key, new Set());
        if (o.lotSalePrice && o.lotSalePrice !== "0") byExpiry.get(key)!.add(o.lotSalePrice);
      });
      for (const pr of byExpiry.values()) {
        if (pr.size > 1) { multiPriceItems.add(ln.itemId); break; }
      }
      // كشف 3: hasPriceConflict من الباكند (تاريخ واحد لكن دُفعتان بسعرين)
      if (opts.some((o) => o.hasPriceConflict)) multiPriceItems.add(ln.itemId);
      // كشف 4: أسعار مختلفة عبر تواريخ صلاحية مختلفة
      const allPrices = new Set(opts.map((o) => o.lotSalePrice || "0").filter((p) => p !== "0"));
      if (allPrices.size > 1) multiPriceItems.add(ln.itemId);
    }
  });

  // ── التنقل بالأسهم ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const rowAttr = target.dataset.gridRow;
    const colAttr = target.dataset.gridCol as GridCol | undefined;
    if (!rowAttr || !colAttr) return;

    const row    = parseInt(rowAttr, 10);
    const colIdx = GRID_COLS.indexOf(colAttr);
    if (colIdx < 0) return;

    let nextRow = row;
    let nextCol = colIdx;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = row + 1;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = row - 1;
    } else if (e.key === "ArrowLeft") {
      // RTL: يسار = تقدّم = العمود التالي (index أعلى)
      // نمنع الـ default حتى لا تتغير قيمة SELECT بالسهم
      e.preventDefault();
      nextCol = colIdx + 1;
      if (nextCol >= GRID_COLS.length) { nextRow = row + 1; nextCol = 0; }
    } else if (e.key === "ArrowRight") {
      // RTL: يمين = تراجع = العمود السابق (index أقل)
      e.preventDefault();
      nextCol = colIdx - 1;
      if (nextCol < 0) { nextRow = row - 1; nextCol = GRID_COLS.length - 1; }
    } else {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // ابحث عن العنصر المستهدف — وإن لم يوجد العمود (مثلاً خلية صلاحية لصنف بدون تاريخ)، ابحث عن أقرب عمود
    const seek = (r: number, startCol: number): HTMLElement | null => {
      // جرّب العمود المطلوب أولاً
      const el = container.querySelector<HTMLElement>(
        `[data-grid-row="${r}"][data-grid-col="${GRID_COLS[startCol]}"]`,
      );
      if (el) return el;
      // ابحث في الاتجاهين
      for (let c = startCol + 1; c < GRID_COLS.length; c++) {
        const f = container.querySelector<HTMLElement>(`[data-grid-row="${r}"][data-grid-col="${GRID_COLS[c]}"]`);
        if (f) return f;
      }
      for (let c = startCol - 1; c >= 0; c--) {
        const f = container.querySelector<HTMLElement>(`[data-grid-row="${r}"][data-grid-col="${GRID_COLS[c]}"]`);
        if (f) return f;
      }
      return null;
    };

    const el = seek(nextRow, nextCol);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    }
  }, []);

  return (
    <div ref={containerRef} className="flex-1 overflow-auto p-2" onKeyDown={handleKeyDown}>
      <table className="peachtree-grid w-full text-[12px]" data-testid="table-lines">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="w-6">#</th>
            <th>الصنف</th>
            <th className="w-[100px]">الوحدة</th>
            <th className="w-[72px]">الكمية</th>
            <th className="w-[96px]">سعر البيع</th>
            <th className="w-[90px]">إجمالي السطر</th>
            <th className="w-[110px]">الصلاحية</th>
            <th className="w-[100px]">الرصيد المتاح</th>
            <th className="w-9">إحصاء</th>
            {isDraft && <th className="w-9">حذف</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((ln, i) => {
            const needsExpiry  = ln.item?.hasExpiry && !ln.expiryMonth;
            const hasMultiPrice = multiPriceItems.has(ln.itemId);
            return (
              <tr
                key={ln.tempId}
                className={`peachtree-grid-row ${needsExpiry ? "bg-yellow-50 dark:bg-yellow-900/20" : ""}`}
                data-testid={`row-line-${i}`}
              >
                {/* # */}
                <td className="text-center text-muted-foreground">{i + 1}</td>

                {/* ── اسم الصنف ──────────────────────────────────────── */}
                <td className="max-w-[200px]">
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="line-entry-name truncate"
                      title={`${ln.item?.nameAr || ""} — ${ln.item?.itemCode || ""}`}
                    >
                      {ln.item?.nameAr || ln.itemId}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {ln.item?.itemCode && (
                        <span className="text-[10px] text-muted-foreground font-mono leading-none">
                          {ln.item.itemCode}
                        </span>
                      )}
                      {ln.item?.allowFractionalSale === false && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded leading-none dark:bg-amber-900/30 dark:text-amber-300">
                          كامل فقط
                        </span>
                      )}
                      {ln.priceSource === "department" && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded leading-none dark:bg-blue-900/30 dark:text-blue-300">
                          سعر قسم
                        </span>
                      )}
                      {ln.priceSource === "lot" && (
                        <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded leading-none dark:bg-green-900/30 dark:text-green-300">
                          سعر دُفعة
                        </span>
                      )}
                      {hasMultiPrice && (
                        <span
                          title="تنبيه: هذا الصنف له دُفعات بأسعار بيع مختلفة — راجع السعر قبل الحفظ"
                          className="inline-flex items-center gap-0.5 bg-yellow-400 text-yellow-900 rounded px-1 py-0.5 leading-none"
                          data-testid={`badge-multi-price-${i}`}
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          <span className="text-[9px] font-bold">سعرين</span>
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* الوحدة */}
                <td className="text-center">
                  {isDraft ? (
                    <select
                      value={ln.unitLevel}
                      onChange={(e) => onUpdateLine(i, { unitLevel: e.target.value })}
                      className="peachtree-select w-full"
                      data-testid={`select-unit-${i}`}
                      data-grid-row={i}
                      data-grid-col="unit"
                    >
                      {getUnitOptions(ln.item).map((opt) => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={!opt.priceable}
                          title={!opt.priceable ? "معامل التحويل غير معرّف لهذه الوحدة — يجب إعداد الصنف أولاً" : undefined}
                        >
                          {opt.priceable ? opt.label : `${opt.label} (غير معرّف)`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-foreground" data-testid={`text-unit-${i}`}>
                      {ln.unitLevel === "major" ? ln.item?.majorUnitName
                        : ln.unitLevel === "medium" ? ln.item?.mediumUnitName
                        : ln.item?.minorUnitName}
                    </span>
                  )}
                </td>

                {/* الكمية */}
                <td className="text-center">
                  {isDraft ? (
                    <QtyCell
                      line={ln}
                      rowIndex={i}
                      fefoLoading={fefoLoading}
                      pendingQtyRef={pendingQtyRef}
                      onQtyConfirm={onQtyConfirm}
                      barcodeInputRef={barcodeInputRef}
                      testId={`input-qty-${i}`}
                    />
                  ) : (
                    <span className="peachtree-amount">{formatQty(ln.qty)}</span>
                  )}
                </td>

                {/* سعر البيع */}
                <td className="text-center">
                  <span
                    className="flex items-center justify-center gap-0.5 peachtree-amount"
                    title="سعر النظام — يتحدد تلقائياً بناءً على الصنف أو الدُفعة أو القسم"
                    data-testid={`text-sale-price-${i}`}
                  >
                    {isDraft && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                    {formatNumber(ln.salePrice)}
                  </span>
                </td>

                {/* إجمالي السطر */}
                <td className="text-center peachtree-amount font-semibold">
                  {formatNumber(ln.lineTotal)}
                </td>

                {/* الصلاحية */}
                <td className="text-center text-[11px]">
                  <ExpiryCell
                    line={ln}
                    index={i}
                    isDraft={isDraft}
                    needsExpiry={!!needsExpiry}
                    onUpdateLine={onUpdateLine}
                  />
                </td>

                {/* الرصيد المتاح */}
                <td className="text-center whitespace-nowrap text-[11px] text-muted-foreground"
                    data-testid={`text-available-${i}`}>
                  {ln.item ? formatAvailability(ln.availableQtyMinor || "0", ln.unitLevel, ln.item) : "—"}
                </td>

                {/* إحصاء */}
                <td className="text-center">
                  <Button
                    variant="outline" size="icon"
                    onClick={(e) => { e.stopPropagation(); onOpenStats(ln.itemId); }}
                    data-testid={`button-stats-${i}`}
                  >
                    <BarChart3 className="h-3 w-3" />
                  </Button>
                </td>

                {/* حذف */}
                {isDraft && (
                  <td className="text-center">
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => onRemoveLine(i)}
                      data-testid={`button-delete-line-${i}`}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}

          {lines.length === 0 && (
            <tr>
              <td colSpan={isDraft ? 10 : 9}
                  className="text-center text-muted-foreground py-8 text-[13px]">
                لا توجد أصناف — امسح الباركود أو استخدم البحث لإضافة أصناف
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpiryCell
// ─────────────────────────────────────────────────────────────────────────────
interface ExpiryCellProps {
  line:         SalesLineLocal;
  index:        number;
  isDraft:      boolean;
  needsExpiry:  boolean;
  onUpdateLine: (index: number, patch: Partial<SalesLineLocal>) => void;
}

function ExpiryCell({ line: ln, index: i, isDraft, needsExpiry, onUpdateLine }: ExpiryCellProps) {
  if (!ln.item?.hasExpiry) return <span className="text-muted-foreground">—</span>;

  const gridAttrs = { "data-grid-row": i, "data-grid-col": "expiry" } as const;

  // ── حالة 1: fefoLocked — سطور موزّعة تلقائياً بـ FEFO ───────────────────
  if (isDraft && ln.fefoLocked && ln.expiryOptions && ln.expiryOptions.length > 0) {
    return (
      <select
        value={ln.lotId || ""}
        onChange={(e) => {
          const opt = ln.expiryOptions?.find((o) => o.lotId === e.target.value);
          if (!opt) return;
          const updates: Partial<SalesLineLocal> = {
            expiryMonth: opt.expiryMonth,
            expiryYear:  opt.expiryYear,
            lotId:       opt.lotId || null,
          };
          if (opt.lotSalePrice && parseFloat(opt.lotSalePrice) > 0 && ln.priceSource !== "department") {
            const newBase  = parseFloat(opt.lotSalePrice);
            updates.baseSalePrice = newBase;
            updates.salePrice     = computeUnitPriceFromBase(newBase, ln.unitLevel, ln.item);
            updates.lineTotal     = computeLineTotal(ln.qty, newBase, ln.unitLevel, ln.item);
            updates.priceSource   = "lot";
          }
          onUpdateLine(i, updates);
        }}
        className={`peachtree-select w-full ${needsExpiry ? "border-yellow-400" : ""}`}
        data-testid={`select-expiry-${i}`}
        title={ln.expiryMonth && ln.expiryYear
          ? `${String(ln.expiryMonth).padStart(2, "0")}/${ln.expiryYear}`
          : "اختر الصلاحية"}
        {...gridAttrs}
      >
        {ln.expiryOptions.map((opt) => (
          <option key={opt.lotId} value={opt.lotId}>
            {String(opt.expiryMonth).padStart(2, "0")}/{opt.expiryYear}
          </option>
        ))}
      </select>
    );
  }

  // ── حالة 2: اختيار يدوي من قائمة الدُفعات المتاحة ───────────────────────
  if (isDraft && ln.expiryOptions && ln.expiryOptions.length > 0) {
    return (
      <select
        value={ln.expiryMonth && ln.expiryYear ? `${ln.expiryMonth}-${ln.expiryYear}` : ""}
        onChange={(e) => {
          if (!e.target.value) {
            onUpdateLine(i, { expiryMonth: null, expiryYear: null, lotId: null });
            return;
          }
          const [m, y] = e.target.value.split("-").map(Number);
          const opt = ln.expiryOptions?.find(
            (o) => o.expiryMonth === m && o.expiryYear === y,
          );
          const updates: Partial<SalesLineLocal> = {
            expiryMonth: m || null,
            expiryYear:  y || null,
            lotId:       opt?.lotId || null,
          };
          if (opt?.lotSalePrice && parseFloat(opt.lotSalePrice) > 0 && ln.priceSource !== "department") {
            const newBase = parseFloat(opt.lotSalePrice);
            updates.baseSalePrice = newBase;
            updates.salePrice     = computeUnitPriceFromBase(newBase, ln.unitLevel, ln.item);
            updates.lineTotal     = computeLineTotal(ln.qty, newBase, ln.unitLevel, ln.item);
            updates.priceSource   = "lot";
          }
          onUpdateLine(i, updates);
        }}
        className={`peachtree-select w-full ${needsExpiry ? "border-yellow-400" : ""}`}
        data-testid={`select-expiry-${i}`}
        {...gridAttrs}
      >
        <option value="">— اختر —</option>
        {ln.expiryOptions.map((opt) => (
          <option key={`${opt.expiryMonth}-${opt.expiryYear}`} value={`${opt.expiryMonth}-${opt.expiryYear}`}>
            {String(opt.expiryMonth).padStart(2, "0")}/{opt.expiryYear}
          </option>
        ))}
      </select>
    );
  }

  // ── عرض ثابت ─────────────────────────────────────────────────────────────
  if (ln.expiryMonth && ln.expiryYear) {
    return (
      <span className="font-mono text-[12px] text-foreground" data-testid={`text-expiry-${i}`}>
        {String(ln.expiryMonth).padStart(2, "0")}/{ln.expiryYear}
      </span>
    );
  }

  if (isDraft) return <span className="text-yellow-600 font-semibold text-[11px]">مطلوب !</span>;
  return <span className="text-muted-foreground">—</span>;
}
