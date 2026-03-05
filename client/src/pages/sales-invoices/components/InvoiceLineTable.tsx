import { useState, useEffect, useRef, memo } from "react";
import { Button } from "@/components/ui/button";
import { X, BarChart3 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import {
  formatAvailability, getUnitOptions,
  computeUnitPriceFromBase, computeLineTotal,
} from "../utils";
import type { SalesLineLocal } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// QtyCell — controlled input محمي من double-call
//
// السبب: defaultValue (uncontrolled) لا يتحدث عند تغيير الوحدة.
//         onKeyDown + setTimeout(focus) كان يُطلق onBlur مرة ثانية → FEFO ×2
// الحل:
//   - value مُتحكَّم به من useState مع useEffect يمسح عند تغيير unitLevel/qty
//   - onKeyDown يحرّك التركيز فقط → onBlur يتولى الـ confirm (مرة واحدة فقط)
// ─────────────────────────────────────────────────────────────────────────────
interface QtyCellProps {
  line:           SalesLineLocal;
  fefoLoading:    boolean;
  pendingQtyRef:  React.MutableRefObject<Map<string, string>>;
  onQtyConfirm:   (tempId: string) => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  testId:         string;
}

const QtyCell = memo(function QtyCell({
  line, fefoLoading, pendingQtyRef, onQtyConfirm, barcodeInputRef, testId,
}: QtyCellProps) {
  const [localVal, setLocalVal] = useState(String(line.qty));

  // متزامن مع تغيير الوحدة أو الكمية — يمسح القيمة المعلقة ويعرض الكمية الجديدة
  useEffect(() => {
    setLocalVal(String(line.qty));
    pendingQtyRef.current.delete(line.tempId);
  }, [line.qty, line.unitLevel, line.tempId, pendingQtyRef]);

  return (
    <input
      type="number"
      step="0.001"
      min="0.001"
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        pendingQtyRef.current.set(line.tempId, e.target.value);
      }}
      onBlur={() => {
        // نقطة الدخول الوحيدة لـ onQtyConfirm — تعمل لكل الأصناف
        onQtyConfirm(line.tempId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          // نحرّك التركيز فقط → onBlur يتولى الـ confirm تلقائياً (مرة واحدة)
          barcodeInputRef.current?.focus();
        }
      }}
      className="peachtree-input w-[64px] text-center"
      disabled={fefoLoading}
      data-testid={testId}
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

  const multiPriceItems = new Set<string>();
  lines.forEach((ln) => {
    if (ln.expiryOptions && ln.expiryOptions.length > 1) {
      const prices = new Set(ln.expiryOptions.map((o) => parseFloat(o.lotSalePrice || "0")));
      if (prices.size > 1) multiPriceItems.add(ln.itemId);
    }
    const sameLinesForItem = lines.filter((l) => l.itemId === ln.itemId);
    if (sameLinesForItem.length > 1) {
      const linePrices = new Set(sameLinesForItem.map((l) => l.baseSalePrice));
      if (linePrices.size > 1) multiPriceItems.add(ln.itemId);
    }
  });

  return (
    <div className="flex-1 overflow-auto p-2">
      <table className="peachtree-grid w-full text-[12px]" data-testid="table-lines">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="w-6">#</th>
            <th>الصنف</th>
            <th className="w-[100px]">الوحدة</th>
            <th className="w-[72px]">الكمية</th>
            <th className="w-[90px]">سعر البيع</th>
            <th className="w-[90px]">إجمالي السطر</th>
            <th className="w-[110px]">الصلاحية</th>
            <th className="w-[100px]">الرصيد المتاح</th>
            <th className="w-9">إحصاء</th>
            {isDraft && <th className="w-9">حذف</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((ln, i) => {
            const needsExpiry = ln.item?.hasExpiry && !ln.expiryMonth;
            return (
              <tr
                key={ln.tempId}
                className={`peachtree-grid-row ${needsExpiry ? "bg-yellow-50 dark:bg-yellow-900/20" : ""}`}
                data-testid={`row-line-${i}`}
              >
                {/* # */}
                <td className="text-center text-muted-foreground">{i + 1}</td>

                {/* اسم الصنف */}
                <td className="max-w-[200px]" title={`${ln.item?.nameAr || ""} — ${ln.item?.itemCode || ""}`}>
                  <span className="line-entry-name">{ln.item?.nameAr || ln.itemId}</span>
                  {ln.item?.itemCode && (
                    <span className="block text-[10px] text-muted-foreground font-mono leading-none mt-0.5">
                      {ln.item.itemCode}
                    </span>
                  )}
                </td>

                {/* الوحدة */}
                <td className="text-center">
                  {isDraft ? (
                    <select
                      value={ln.unitLevel}
                      onChange={(e) => onUpdateLine(i, { unitLevel: e.target.value })}
                      className="peachtree-select w-full"
                      data-testid={`select-unit-${i}`}
                    >
                      {getUnitOptions(ln.item).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                      fefoLoading={fefoLoading}
                      pendingQtyRef={pendingQtyRef}
                      onQtyConfirm={onQtyConfirm}
                      barcodeInputRef={barcodeInputRef}
                      testId={`input-qty-${i}`}
                    />
                  ) : (
                    <span className="peachtree-amount">{formatNumber(ln.qty)}</span>
                  )}
                </td>

                {/* سعر البيع */}
                <td className="text-center">
                  <span className="peachtree-amount" data-testid={`text-sale-price-${i}`}>
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
// ExpiryCell — خلية الصلاحية
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

  // منتج بصلاحية ومقيّد بـ FEFO — يُتيح تغيير الدُفعة يدوياً
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
          }
          onUpdateLine(i, updates);
        }}
        className={`peachtree-select w-full ${needsExpiry ? "border-yellow-400" : ""}`}
        data-testid={`select-expiry-${i}`}
        title={ln.expiryMonth && ln.expiryYear
          ? `${String(ln.expiryMonth).padStart(2, "0")}/${ln.expiryYear}`
          : "اختر الصلاحية"}
      >
        {ln.expiryOptions.map((opt) => (
          <option key={opt.lotId} value={opt.lotId}>
            {String(opt.expiryMonth).padStart(2, "0")}/{opt.expiryYear}
          </option>
        ))}
      </select>
    );
  }

  // منتج بصلاحية — اختيار يدوي من قائمة
  if (isDraft && ln.expiryOptions && ln.expiryOptions.length > 0) {
    return (
      <select
        value={ln.expiryMonth && ln.expiryYear ? `${ln.expiryMonth}-${ln.expiryYear}` : ""}
        onChange={(e) => {
          const [m, y] = e.target.value.split("-").map(Number);
          onUpdateLine(i, { expiryMonth: m || null, expiryYear: y || null });
        }}
        className={`peachtree-select w-full ${needsExpiry ? "border-yellow-400" : ""}`}
        data-testid={`select-expiry-${i}`}
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

  // عرض ثابت
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
