/**
 * ReceivingLineTable — جدول أصناف إذن الاستلام
 *
 * يعرض السطور ويمكّن تعديلها إذا كان الإذن مسودة.
 * لا يحمل أي حالة — كل شيء يأتي من الـ props.
 */
import { AlertTriangle, BarChart3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpiryInput } from "@/components/ui/expiry-input";
import type { ReceivingLineLocal, LineError } from "../types";
import { getUnitName } from "../types";

interface Props {
  lines:        ReceivingLineLocal[];
  lineErrors:   LineError[];
  isViewOnly:   boolean;
  onUpdateLine: (idx: number, updates: Partial<ReceivingLineLocal>) => void;
  onDeleteLine: (idx: number) => void;
  onOpenStats:  (itemId: string) => void;
  // refs للتركيز
  qtyInputRefs:        React.MutableRefObject<Map<number, HTMLInputElement>>;
  salePriceInputRefs:  React.MutableRefObject<Map<number, HTMLInputElement>>;
  expiryInputRefs:     React.MutableRefObject<Map<number, HTMLDivElement>>;
  lineFieldFocusedRef: React.MutableRefObject<boolean>;
  focusedLineIdx:      number | null;
  setFocusedLineIdx:   (v: number | null) => void;
}

export function ReceivingLineTable({
  lines, lineErrors, isViewOnly,
  onUpdateLine, onDeleteLine, onOpenStats,
  qtyInputRefs, salePriceInputRefs, expiryInputRefs,
  lineFieldFocusedRef, focusedLineIdx, setFocusedLineIdx,
}: Props) {
  const colSpan = isViewOnly ? 14 : 15;

  return (
    <fieldset className="peachtree-grid p-2">
      <legend className="text-xs font-semibold px-1">أصناف الاستلام</legend>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" dir="rtl" data-testid="table-receiving-lines">
          <thead>
            <tr className="peachtree-grid-header">
              <th className="py-1 px-2 text-right font-bold whitespace-nowrap">#</th>
              <th className="py-1 px-2 text-right font-bold text-[13px]">الصنف</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الكمية</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">هدية</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">سعر الشراء</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">سعر البيع</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">الصلاحية</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">رقم التشغيلة</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">آخر شراء</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">آخر بيع</th>
              <th className="py-1 px-2 text-right whitespace-nowrap">رصيد المخزن</th>
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
              <tr className="border-t font-bold">
                <td colSpan={3} className="py-1 px-2 text-left">إجمالي الأصناف</td>
                <td className="py-1 px-2 font-mono">{lines.length}</td>
                <td colSpan={isViewOnly ? 9 : 10}></td>
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
}

function LineRow({
  line, idx, lineErrors, isViewOnly, isFocused,
  onUpdate, onDelete, onOpenStats,
  qtyInputRefs, salePriceInputRefs, expiryInputRefs,
  lineFieldFocusedRef, setFocusedLineIdx,
}: RowProps) {
  const hasExpiryErr      = lineErrors.some((e) => e.lineIndex === idx && e.field === "expiry");
  const hasSalePriceErr   = lineErrors.some((e) => e.lineIndex === idx && e.field === "salePrice");
  const hasPurchasePriceErr = lineErrors.some(
    (e) => e.lineIndex === idx && (e.field === "purchasePrice" || e.field === "costOverPrice")
  );

  // تنبيهات
  const salesPriceChanged =
    line.salePrice != null && line.lastSalePriceHint != null && line.lastSalePriceHint > 0 &&
    Math.abs(line.salePrice - line.lastSalePriceHint) > 0.01;

  const expiryNear = (() => {
    if (!line.expiryMonth || !line.expiryYear) return false;
    const now = new Date();
    const months = (line.expiryYear - now.getFullYear()) * 12 + (line.expiryMonth - (now.getMonth() + 1));
    return months <= 6 && months >= 0;
  })();

  return (
    <tr className={`peachtree-grid-row ${isFocused ? "ring-1 ring-blue-300 dark:ring-blue-700" : ""}`}
      data-testid={`row-line-${idx}`}>
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
          <select value={line.unitLevel} onChange={(e) => onUpdate({ unitLevel: e.target.value })}
            className="h-6 text-[11px] px-0.5 border rounded bg-transparent"
            data-testid={`select-unit-${idx}`}>
            {line.item?.majorUnitName  && <option value="major">{line.item.majorUnitName}</option>}
            {line.item?.mediumUnitName && <option value="medium">{line.item.mediumUnitName}</option>}
            <option value="minor">{line.item?.minorUnitName || "وحدة صغرى"}</option>
          </select>
        )}
      </td>
      {/* الكمية */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span data-testid={`text-qty-${idx}`}>{line.qtyEntered}</span> : (
          <input
            ref={(el) => { if (el) qtyInputRefs.current.set(idx, el); else qtyInputRefs.current.delete(idx); }}
            type="number" value={line.qtyEntered}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onUpdate({ qtyEntered: v }); }}
            onFocus={(e) => { lineFieldFocusedRef.current = true; setFocusedLineIdx(idx); e.target.select(); }}
            onBlur={() => { lineFieldFocusedRef.current = false; setFocusedLineIdx(null); if (line.qtyEntered <= 0) onUpdate({ qtyEntered: 1 }); }}
            className="w-[70px] h-6 text-[12px] px-1 border rounded text-center bg-transparent focus:border-blue-400 dark:focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid={`input-qty-${idx}`} min="0" step="any" />
        )}
      </td>
      {/* هدية */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span>{line.bonusQty}</span> : (
          <input type="number" value={line.bonusQty || ""}
            onChange={(e) => onUpdate({ bonusQty: parseFloat(e.target.value) || 0 })}
            onFocus={() => { lineFieldFocusedRef.current = true; }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            className="w-[55px] h-6 text-[11px] px-1 border rounded text-center bg-transparent"
            placeholder="0" min="0" step="any" data-testid={`input-bonus-qty-${idx}`} />
        )}
      </td>
      {/* سعر الشراء */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? (
          <span className="font-mono">{line.purchasePrice > 0 ? line.purchasePrice.toFixed(2) : "—"}</span>
        ) : (
          <input
            type="number" value={line.purchasePrice || ""}
            onChange={(e) => onUpdate({ purchasePrice: parseFloat(e.target.value) || 0 })}
            onFocus={(e) => { lineFieldFocusedRef.current = true; e.target.select(); }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            className={`w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent text-center ${hasPurchasePriceErr ? "border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
            placeholder="0.00" min="0" step="any" data-testid={`input-purchase-price-${idx}`} />
        )}
      </td>
      {/* سعر البيع */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span>{line.salePrice != null ? line.salePrice.toFixed(2) : "—"}</span> : (
          <input
            ref={(el) => { if (el) salePriceInputRefs.current.set(idx, el); else salePriceInputRefs.current.delete(idx); }}
            type="number" value={line.salePrice ?? ""}
            onChange={(e) => onUpdate({ salePrice: e.target.value ? parseFloat(e.target.value) : null })}
            onFocus={() => { lineFieldFocusedRef.current = true; }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            className={`w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent text-center ${hasSalePriceErr ? "border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
            placeholder="0.00" min="0" step="any" data-testid={`input-sale-price-${idx}`} />
        )}
      </td>
      {/* الصلاحية */}
      <td className="py-0.5 px-2 whitespace-nowrap"
        onFocusCapture={() => { lineFieldFocusedRef.current = true; }}
        onBlurCapture={() => { lineFieldFocusedRef.current = false; }}>
        {isViewOnly ? (
          <span>{line.expiryMonth && line.expiryYear ? `${String(line.expiryMonth).padStart(2, "0")}/${line.expiryYear}` : "—"}</span>
        ) : (
          <div
            ref={(el) => { if (el) expiryInputRefs.current.set(idx, el); else expiryInputRefs.current.delete(idx); }}
            className={hasExpiryErr ? "[&_input]:border-red-500 [&_input]:bg-red-50 dark:[&_input]:bg-red-900/20" : ""}>
            <ExpiryInput
              expiryMonth={line.expiryMonth} expiryYear={line.expiryYear}
              onChange={(month, year) => onUpdate({ expiryMonth: month, expiryYear: year })}
              disabled={isViewOnly || !line.item?.hasExpiry}
              data-testid={`input-expiry-${idx}`} />
          </div>
        )}
      </td>
      {/* رقم التشغيلة */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isViewOnly ? <span>{line.batchNumber || "—"}</span> : (
          <input type="text" value={line.batchNumber}
            onChange={(e) => onUpdate({ batchNumber: e.target.value })}
            onFocus={() => { lineFieldFocusedRef.current = true; }}
            onBlur={() => { lineFieldFocusedRef.current = false; }}
            className="w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent"
            placeholder={line.item?.hasBatch ? "مطلوب" : "—"}
            data-testid={`input-batch-${idx}`} />
        )}
      </td>
      {/* hints */}
      <td className="py-0.5 px-2 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
        {line.lastPurchasePriceHint != null ? line.lastPurchasePriceHint.toFixed(2) : "—"}
      </td>
      <td className="py-0.5 px-2 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
        {line.lastSalePriceHint != null ? line.lastSalePriceHint.toFixed(2) : "—"}
      </td>
      <td className="py-0.5 px-2 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
        {line.onHandInWarehouse}
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
            <span title={`سعر البيع (${line.salePrice}) يختلف عن آخر سعر (${line.lastSalePriceHint})`} className="text-orange-500">
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
