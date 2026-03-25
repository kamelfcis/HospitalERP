/**
 * ReceivingLineTable — جدول أصناف إذن الاستلام
 *
 * التنقل بالأسهم (spreadsheet-style):
 *  ← يسار  = عمود أعلى (RTL)     → يمين = عمود أدنى (RTL)
 *  ↑ فوق   = سطر أعلى            ↓ تحت  = سطر أدنى
 */
import { useRef, useCallback } from "react";
import { AlertTriangle, BarChart3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpiryInput } from "@/components/ui/expiry-input";
import type { ReceivingLineLocal, LineError } from "../types";
import { getUnitName } from "../types";
import { formatAvailability } from "@/lib/invoice-lines";
import { formatQty } from "@/lib/formatters";

// ── أعمدة التنقل (بالترتيب من اليمين في RTL) ─────────────────────────────
const NAV_QTY      = 0;
const NAV_BONUS    = 1;
const NAV_SALE     = 2;
const NAV_DISCOUNT = 3;
const NAV_PURCHASE = 4;
const NAV_EXPIRY   = 5;
const NAV_BATCH    = 6;
const NAV_COUNT    = 7;

interface Props {
  lines:        ReceivingLineLocal[];
  lineErrors:   LineError[];
  isViewOnly:   boolean;
  grandTotal:   number;
  onUpdateLine: (idx: number, updates: Partial<ReceivingLineLocal>) => void;
  onDeleteLine: (idx: number) => void;
  onOpenStats:  (itemId: string) => void;
  qtyInputRefs:        React.MutableRefObject<Map<number, HTMLInputElement>>;
  salePriceInputRefs:  React.MutableRefObject<Map<number, HTMLInputElement>>;
  expiryInputRefs:     React.MutableRefObject<Map<number, HTMLDivElement>>;
  lineFieldFocusedRef: React.MutableRefObject<boolean>;
  focusedLineIdx:      number | null;
  setFocusedLineIdx:   (v: number | null) => void;
}

export function ReceivingLineTable({
  lines, lineErrors, isViewOnly, grandTotal,
  onUpdateLine, onDeleteLine, onOpenStats,
  qtyInputRefs, salePriceInputRefs, expiryInputRefs,
  lineFieldFocusedRef, focusedLineIdx, setFocusedLineIdx,
}: Props) {
  // عدد الأعمدة الكلي (للـ colspan)
  // #(1) + صنف(1) + وحدة(1) + كمية(1) + هدية(1) + بيع(1) + ن الخصم(1) + شراء(1) + صلاحية(1) + تشغيلة(1) + إجمالي(1) + آخرش(1) + آخرب(1) + رصيد(1) + إحصاء(1) + تنبيه(1) [+ حذف(1)]
  const colSpan = isViewOnly ? 16 : 17;

  // ── شبكة مراجع التنقل ───────────────────────────────────────────────────
  const navRefs    = useRef<Map<string, HTMLInputElement>>(new Map());
  const expiryDivs = useRef<Map<number, HTMLDivElement>>(new Map());

  const registerNav = useCallback((row: number, col: number, el: HTMLInputElement | null) => {
    const key = `${row}-${col}`;
    if (el) navRefs.current.set(key, el);
    else    navRefs.current.delete(key);
  }, []);

  const registerExpiryDiv = useCallback((row: number, el: HTMLDivElement | null) => {
    if (el) expiryDivs.current.set(row, el);
    else    expiryDivs.current.delete(row);
  }, []);

  const focusNav = useCallback((row: number, col: number) => {
    if (col === NAV_EXPIRY) {
      const div = expiryDivs.current.get(row);
      if (div) {
        const inp = div.querySelector<HTMLInputElement>("input");
        inp?.focus(); inp?.select();
      }
      return;
    }
    const el = navRefs.current.get(`${row}-${col}`);
    if (el) { el.focus(); el.select(); }
  }, []);

  const handleNavKey = useCallback((
    e: React.KeyboardEvent,
    row: number,
    col: number,
  ) => {
    let nextRow = row;
    let nextCol = col;
    switch (e.key) {
      case "ArrowLeft":  nextCol = col + 1; break; // RTL: يسار = عمود تالٍ
      case "ArrowRight": nextCol = col - 1; break; // RTL: يمين = عمود سابق
      case "ArrowUp":    nextRow = row - 1; break;
      case "ArrowDown":  nextRow = row + 1; break;
      default: return;
    }
    if (nextCol < 0 || nextCol >= NAV_COUNT) return;
    if (nextRow < 0 || nextRow >= lines.length) return;
    e.preventDefault();
    e.stopPropagation();
    focusNav(nextRow, nextCol);
  }, [lines.length, focusNav]);

  return (
    <fieldset className="peachtree-grid p-2">
      <legend className="text-xs font-semibold px-1">أصناف الاستلام</legend>
      <div className="overflow-x-auto">
        <table
          className="w-full text-[12px]"
          dir="rtl"
          data-testid="table-receiving-lines"
          onDragStart={(e) => e.preventDefault()}
        >
          <thead>
            <tr className="peachtree-grid-header">
              <th className="py-1 px-2 text-right whitespace-nowrap">#</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الصنف</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الكمية</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">هدية</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">سعر البيع</th>
              <th className="py-1 px-2 text-right whitespace-nowrap" title="نسبة الخصم %">خصم%</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">سعر الشراء</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الصلاحية</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">التشغيلة</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الإجمالي</th>
              <th className="py-1 px-1 text-right whitespace-nowrap text-[10px]" title="آخر سعر شراء">آخر ش.</th>
              <th className="py-1 px-1 text-right whitespace-nowrap text-[10px]" title="آخر سعر بيع">آخر ب.</th>
              <th className="py-1 px-1 text-right whitespace-nowrap text-[10px]" title="رصيد المخزن">رصيد</th>
              <th className="py-1 px-2 text-center whitespace-nowrap">إحصاء</th>
              <th className="py-1 px-2 text-center whitespace-nowrap">تنبيه</th>
              {!isViewOnly && <th className="py-1 px-2 text-center whitespace-nowrap">حذف</th>}
            </tr>
          </thead>
          <tbody>
            {lines.length > 0 ? lines.map((line, idx) => (
              <LineRow
                key={line.id}
                line={line}
                idx={idx}
                lineErrors={lineErrors}
                isViewOnly={isViewOnly}
                isFocused={focusedLineIdx === idx}
                onUpdate={(upd) => onUpdateLine(idx, upd)}
                onDelete={() => onDeleteLine(idx)}
                onOpenStats={() => onOpenStats(line.itemId)}
                qtyInputRefs={qtyInputRefs}
                salePriceInputRefs={salePriceInputRefs}
                expiryInputRefs={expiryInputRefs}
                lineFieldFocusedRef={lineFieldFocusedRef}
                setFocusedLineIdx={setFocusedLineIdx}
                registerNav={registerNav}
                registerExpiryDiv={registerExpiryDiv}
                handleNavKey={handleNavKey}
              />
            )) : (
              <tr>
                <td colSpan={colSpan} className="py-4 text-center text-muted-foreground">
                  لا توجد أصناف — اضغط "إضافة صنف" أو امسح الباركود
                </td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-muted/30">
                <td colSpan={2} className="py-1.5 px-2 font-bold text-right text-[11px]">الإجمالي الكلي</td>
                <td className="py-1.5 px-2 font-mono text-[11px] text-muted-foreground">{lines.length} صنف</td>
                <td colSpan={7}></td>
                <td className="py-1.5 px-2 font-bold font-mono text-primary text-[13px] whitespace-nowrap">
                  {grandTotal.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td colSpan={isViewOnly ? 5 : 6}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </fieldset>
  );
}

// ── سطر واحد ──────────────────────────────────────────────────────────────
interface RowProps {
  line:       ReceivingLineLocal;
  idx:        number;
  lineErrors: LineError[];
  isViewOnly: boolean;
  isFocused:  boolean;
  onUpdate:   (upd: Partial<ReceivingLineLocal>) => void;
  onDelete:   () => void;
  onOpenStats: () => void;
  qtyInputRefs:        React.MutableRefObject<Map<number, HTMLInputElement>>;
  salePriceInputRefs:  React.MutableRefObject<Map<number, HTMLInputElement>>;
  expiryInputRefs:     React.MutableRefObject<Map<number, HTMLDivElement>>;
  lineFieldFocusedRef: React.MutableRefObject<boolean>;
  setFocusedLineIdx:   (v: number | null) => void;
  registerNav:      (row: number, col: number, el: HTMLInputElement | null) => void;
  registerExpiryDiv:(row: number, el: HTMLDivElement | null) => void;
  handleNavKey:     (e: React.KeyboardEvent, row: number, col: number) => void;
}

function LineRow({
  line, idx, lineErrors, isViewOnly, isFocused,
  onUpdate, onDelete, onOpenStats,
  qtyInputRefs, salePriceInputRefs, expiryInputRefs,
  lineFieldFocusedRef, setFocusedLineIdx,
  registerNav, registerExpiryDiv, handleNavKey,
}: RowProps) {
  const hasExpiryErr        = lineErrors.some((e) => e.lineIndex === idx && e.field === "expiry");
  const hasSalePriceErr     = lineErrors.some((e) => e.lineIndex === idx && e.field === "salePrice");
  const hasPurchasePriceErr = lineErrors.some(
    (e) => e.lineIndex === idx && (e.field === "purchasePrice" || e.field === "costOverPrice")
  );

  const salesPriceChanged =
    line.salePrice != null && line.lastSalePriceHint != null && line.lastSalePriceHint > 0 &&
    Math.abs(line.salePrice - line.lastSalePriceHint) > 0.01;

  const expiryNear = (() => {
    if (!line.expiryMonth || !line.expiryYear) return false;
    const now    = new Date();
    const months = (line.expiryYear - now.getFullYear()) * 12 + (line.expiryMonth - (now.getMonth() + 1));
    return months <= 6 && months >= 0;
  })();

  return (
    <tr
      className={`peachtree-grid-row ${isFocused ? "ring-1 ring-blue-300 dark:ring-blue-700" : ""}`}
      data-testid={`row-line-${idx}`}
    >
      {/* # */}
      <td className="py-0.5 px-2 text-muted-foreground">{idx + 1}</td>

      {/* الصنف */}
      <td className="py-1 px-2" title={`${line.item?.nameAr || ""} — ${line.item?.itemCode || ""}`}>
        <div className="leading-tight">
          <span className="text-foreground font-bold" style={{ fontSize: "13px", wordBreak: "break-word" }}>
            {line.item?.nameAr || "—"}
          </span>
          <div className="text-[10px] text-muted-foreground font-mono">{line.item?.itemCode || ""}</div>
        </div>
      </td>

      {/* الوحدة */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? getUnitName(line.item, line.unitLevel) : (
          <select
            value={line.unitLevel}
            onChange={(e) => onUpdate({ unitLevel: e.target.value })}
            className="h-6 text-[11px] px-0.5 border rounded bg-transparent"
            data-testid={`select-unit-${idx}`}
          >
            {line.item?.majorUnitName  && <option value="major">{line.item.majorUnitName}</option>}
            {line.item?.mediumUnitName && <option value="medium">{line.item.mediumUnitName}</option>}
            <option value="minor">{line.item?.minorUnitName || "وحدة صغرى"}</option>
          </select>
        )}
      </td>

      {/* الكمية — NAV_QTY = 0 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span data-testid={`text-qty-${idx}`}>{formatQty(line.qtyEntered)}</span> : (
          <input
            ref={(el) => {
              if (el) qtyInputRefs.current.set(idx, el);
              else    qtyInputRefs.current.delete(idx);
              registerNav(idx, NAV_QTY, el);
            }}
            type="number" value={line.qtyEntered}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onUpdate({ qtyEntered: v }); }}
            onFocus={(e) => { lineFieldFocusedRef.current = true; setFocusedLineIdx(idx); e.target.select(); }}
            onBlur={() => { lineFieldFocusedRef.current = false; setFocusedLineIdx(null); if (line.qtyEntered <= 0) onUpdate({ qtyEntered: 1 }); }}
            onKeyDown={(e) => handleNavKey(e, idx, NAV_QTY)}
            className="w-[70px] h-6 text-[12px] px-1 border rounded text-center bg-transparent focus:border-blue-400 dark:focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid={`input-qty-${idx}`} min="0" step="any"
          />
        )}
      </td>

      {/* هدية — NAV_BONUS = 1 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span>{formatQty(line.bonusQty)}</span> : (
          <input
            ref={(el) => registerNav(idx, NAV_BONUS, el)}
            type="number" value={line.bonusQty || ""}
            onChange={(e) => onUpdate({ bonusQty: parseFloat(e.target.value) || 0 })}
            onFocus={() => { lineFieldFocusedRef.current = true; }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            onKeyDown={(e) => handleNavKey(e, idx, NAV_BONUS)}
            className="w-[55px] h-6 text-[11px] px-1 border rounded text-center bg-transparent"
            placeholder="0" min="0" step="any" data-testid={`input-bonus-qty-${idx}`}
          />
        )}
      </td>

      {/* سعر البيع — NAV_SALE = 2 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span>{line.salePrice != null ? line.salePrice.toFixed(2) : "—"}</span> : (
          <input
            ref={(el) => {
              if (el) salePriceInputRefs.current.set(idx, el);
              else    salePriceInputRefs.current.delete(idx);
              registerNav(idx, NAV_SALE, el);
            }}
            type="number" value={line.salePrice ?? ""}
            onChange={(e) => onUpdate({ salePrice: e.target.value ? parseFloat(e.target.value) : null })}
            onFocus={() => { lineFieldFocusedRef.current = true; }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            onKeyDown={(e) => handleNavKey(e, idx, NAV_SALE)}
            className={`w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent text-center ${hasSalePriceErr ? "border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
            placeholder="0.00" min="0" step="any" data-testid={`input-sale-price-${idx}`}
          />
        )}
      </td>

      {/* ن الخصم % — NAV_DISCOUNT = 3 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? (
          <span className="font-mono">{line.discountPct > 0 ? `${line.discountPct}%` : "—"}</span>
        ) : (
          <input
            ref={(el) => registerNav(idx, NAV_DISCOUNT, el)}
            type="number" value={line.discountPct || ""}
            onChange={(e) => onUpdate({ discountPct: parseFloat(e.target.value) || 0 })}
            onFocus={(e) => { lineFieldFocusedRef.current = true; e.target.select(); }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            onKeyDown={(e) => handleNavKey(e, idx, NAV_DISCOUNT)}
            className="w-[65px] h-6 text-[11px] px-1 border rounded bg-transparent text-center"
            placeholder="0%" min="0" max="100" step="any" data-testid={`input-discount-pct-${idx}`}
          />
        )}
      </td>

      {/* سعر الشراء — NAV_PURCHASE = 4 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? (
          <span className="font-mono">{line.purchasePrice > 0 ? line.purchasePrice.toFixed(2) : "—"}</span>
        ) : (
          <input
            ref={(el) => registerNav(idx, NAV_PURCHASE, el)}
            type="number" value={line.purchasePrice || ""}
            onChange={(e) => onUpdate({ purchasePrice: parseFloat(e.target.value) || 0 })}
            onFocus={(e) => { lineFieldFocusedRef.current = true; e.target.select(); }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            onKeyDown={(e) => handleNavKey(e, idx, NAV_PURCHASE)}
            className={`w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent text-center ${hasPurchasePriceErr ? "border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
            placeholder="0.00" min="0" step="any" data-testid={`input-purchase-price-${idx}`}
          />
        )}
      </td>

      {/* الصلاحية — NAV_EXPIRY = 5 */}
      <td
        className="py-0.5 px-2 whitespace-nowrap"
        onFocusCapture={() => { lineFieldFocusedRef.current = true; }}
        onBlurCapture={() => { lineFieldFocusedRef.current = false; }}
      >
        {isViewOnly ? (
          <span>
            {line.expiryMonth && line.expiryYear
              ? `${String(line.expiryMonth).padStart(2, "0")}/${line.expiryYear}`
              : "—"}
          </span>
        ) : (
          <div
            ref={(el) => {
              if (el) expiryInputRefs.current.set(idx, el);
              else    expiryInputRefs.current.delete(idx);
              registerExpiryDiv(idx, el);
            }}
            onKeyDownCapture={(e) => {
              const target   = e.target as HTMLInputElement;
              const isUpDown = e.key === "ArrowUp" || e.key === "ArrowDown";
              const atStart  = target.selectionStart === 0;
              const atEnd    = target.selectionStart === target.value.length;
              const goRight  = e.key === "ArrowRight" && atStart;
              const goLeft   = e.key === "ArrowLeft"  && atEnd;
              if (isUpDown || goRight || goLeft) {
                handleNavKey(e as unknown as React.KeyboardEvent, idx, NAV_EXPIRY);
              }
            }}
            className={hasExpiryErr ? "[&_input]:border-red-500 [&_input]:bg-red-50 dark:[&_input]:bg-red-900/20" : ""}
          >
            <ExpiryInput
              expiryMonth={line.expiryMonth} expiryYear={line.expiryYear}
              onChange={(month, year) => onUpdate({ expiryMonth: month, expiryYear: year })}
              disabled={isViewOnly || !line.item?.hasExpiry}
              data-testid={`input-expiry-${idx}`}
            />
          </div>
        )}
      </td>

      {/* رقم التشغيلة — NAV_BATCH = 6 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span>{line.batchNumber || "—"}</span> : (
          <input
            ref={(el) => registerNav(idx, NAV_BATCH, el)}
            type="text" value={line.batchNumber}
            onChange={(e) => onUpdate({ batchNumber: e.target.value })}
            onFocus={() => { lineFieldFocusedRef.current = true; }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            onKeyDown={(e) => {
              const target   = e.target as HTMLInputElement;
              const isUpDown = e.key === "ArrowUp" || e.key === "ArrowDown";
              const atStart  = target.selectionStart === 0 && target.selectionEnd === 0;
              const atEnd    = target.selectionStart === target.value.length;
              const goRight  = e.key === "ArrowRight" && atStart;
              const goLeft   = e.key === "ArrowLeft"  && atEnd;
              if (isUpDown || goRight || goLeft) handleNavKey(e, idx, NAV_BATCH);
            }}
            className="w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent"
            placeholder={line.item?.hasBatch ? "مطلوب" : "—"}
            data-testid={`input-batch-${idx}`}
          />
        )}
      </td>

      {/* الإجمالي (للقراءة فقط) */}
      <td className="py-0.5 px-2 whitespace-nowrap text-right">
        <span
          className={`font-mono text-[12px] font-semibold ${line.lineTotal > 0 ? "text-primary" : "text-muted-foreground"}`}
          data-testid={`text-line-total-${idx}`}
        >
          {line.lineTotal > 0 ? line.lineTotal.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        </span>
      </td>

      {/* hints — مضغوطة */}
      <td className="py-0.5 px-1 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
        {line.lastPurchasePriceHint != null ? line.lastPurchasePriceHint.toFixed(2) : "—"}
      </td>
      <td className="py-0.5 px-1 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
        {line.lastSalePriceHint != null ? line.lastSalePriceHint.toFixed(2) : "—"}
      </td>
      <td className="py-0.5 px-1 whitespace-nowrap text-muted-foreground font-mono text-[11px] max-w-[80px] truncate"
          title={formatAvailability(line.onHandInWarehouse, line.unitLevel, line.item)}>
        {formatAvailability(line.onHandInWarehouse, line.unitLevel, line.item)}
      </td>

      {/* إحصاء */}
      <td className="py-0.5 px-2 text-center">
        <Button variant="outline" size="icon" onClick={onOpenStats} data-testid={`button-stats-${idx}`}>
          <BarChart3 className="h-3 w-3" />
        </Button>
      </td>

      {/* تنبيه */}
      <td className="py-0.5 px-2 text-center whitespace-nowrap">
        <div className="flex gap-0.5 items-center justify-center">
          {salesPriceChanged && (
            <span
              title={`سعر البيع (${line.salePrice}) يختلف عن آخر سعر (${line.lastSalePriceHint})`}
              className="text-orange-500"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
          {expiryNear && (
            <span title="صلاحية قريبة (أقل من 6 أشهر)" className="text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </td>

      {/* حذف */}
      {!isViewOnly && (
        <td className="py-0.5 px-2 text-center">
          <Button variant="outline" size="icon" onClick={onDelete} data-testid={`button-delete-line-${idx}`}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </td>
      )}
    </tr>
  );
}
