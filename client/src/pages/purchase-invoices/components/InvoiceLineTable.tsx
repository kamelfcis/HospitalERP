/**
 * InvoiceLineTable — جدول أصناف فاتورة الشراء
 *
 * أعمدة الجدول (RTL):
 *   # | الصنف | الوحدة | الكمية | هدية | سعر البيع | خصم% | خصم قيمة | سعر الشراء | ض.ق.م% | قبل ض.ق.م | ض.ق.م | بعد ض.ق.م | تشغيلة/صلاحية
 *
 * الحقول القابلة للتعديل (مسودة فقط):
 *   - سعر الشراء ← → خصم% ← → خصم قيمة (علاقة متبادلة ثلاثية)
 *   - ض.ق.م %
 *
 * التنقل بالأسهم (spreadsheet-style):
 *   ← يسار  = عمود تالٍ (RTL)    → يمين = عمود سابق (RTL)
 *   ↑ فوق   = سطر أعلى            ↓ تحت  = سطر أدنى
 *
 * Memoization:
 *   - InvoiceLineRow مغلّف بـ React.memo
 *   - الـ callbacks تأخذ (idx, val) وتُمرَّر مباشرة بدون inline wrapper
 *   → تغيير سطر واحد لا يعيد رسم باقي السطور
 */
import { memo, useRef, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { getUnitName, getLineCoreErrors, getLineDiscountErrors } from "../types";
import type { InvoiceLineLocal } from "../types";

// ── أعمدة التنقل ─────────────────────────────────────────────────────────────
const NAV_DISCOUNT_PCT   = 0;
const NAV_DISCOUNT_VALUE = 1;
const NAV_PURCHASE_PRICE = 2;
const NAV_VAT_RATE       = 3;
const NAV_COUNT          = 4;

interface Props {
  lines:     InvoiceLineLocal[];
  isDraft:   boolean;
  onPurchasePriceChange: (i: number, val: string) => void;
  onDiscountPctChange:   (i: number, val: string) => void;
  onDiscountValueChange: (i: number, val: string) => void;
  onVatRateChange:       (i: number, val: string) => void;
}

export function InvoiceLineTable({
  lines, isDraft,
  onPurchasePriceChange, onDiscountPctChange,
  onDiscountValueChange, onVatRateChange,
}: Props) {
  // ── شبكة مراجع التنقل ───────────────────────────────────────────────────
  const navRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const registerNav = useCallback((row: number, col: number, el: HTMLInputElement | null) => {
    const key = `${row}-${col}`;
    if (el) navRefs.current.set(key, el);
    else    navRefs.current.delete(key);
  }, []);

  const focusNav = useCallback((row: number, col: number) => {
    const el = navRefs.current.get(`${row}-${col}`);
    if (el) { el.focus(); el.select(); }
  }, []);

  const handleNavKey = useCallback((
    e: React.KeyboardEvent,
    row: number,
    col: number,
    totalRows: number,
  ) => {
    let nextRow = row;
    let nextCol = col;
    switch (e.key) {
      case "ArrowLeft":  nextCol = col + 1; break; // RTL: يسار = عمود تالٍ
      case "ArrowRight": nextCol = col - 1; break; // RTL: يمين = عمود سابق
      case "ArrowUp":    nextRow = row - 1; break;
      case "ArrowDown":  nextRow = row + 1; break;
      case "Enter":      nextRow = row + 1; nextCol = col; break;
      default: return;
    }
    if (nextCol < 0 || nextCol >= NAV_COUNT) return;
    if (nextRow < 0 || nextRow >= totalRows) return;
    e.preventDefault();
    e.stopPropagation();
    focusNav(nextRow, nextCol);
  }, [focusNav]);

  return (
    <table
      className="peachtree-grid w-full text-[12px]"
      dir="rtl"
      data-testid="table-lines"
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
          <th className="py-1 px-2 text-right whitespace-nowrap" title="نسبة خصم السطر">خصم%</th>
          <th className="py-1 px-2 text-right whitespace-nowrap" title="قيمة خصم السطر">خصم قيمة</th>
          <th className="py-1 px-2 text-right whitespace-nowrap">سعر الشراء</th>
          <th className="py-1 px-2 text-right whitespace-nowrap" title="ضريبة القيمة المضافة">ض.ق.م%</th>
          <th className="py-1 px-2 text-right whitespace-nowrap" title="الإجمالي قبل الضريبة">قبل ض.ق.م</th>
          <th className="py-1 px-2 text-right whitespace-nowrap" title="قيمة الضريبة">ض.ق.م</th>
          <th className="py-1 px-2 text-right whitespace-nowrap" title="الإجمالي بعد الضريبة">بعد ض.ق.م</th>
          <th className="py-1 px-2 text-right whitespace-nowrap">تشغيلة / صلاحية</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((ln, i) => (
          <InvoiceLineRow
            key={ln.id}
            line={ln}
            idx={i}
            totalRows={lines.length}
            isDraft={isDraft}
            registerNav={registerNav}
            onNavKey={handleNavKey}
            onPurchasePriceChange={onPurchasePriceChange}
            onDiscountPctChange={onDiscountPctChange}
            onDiscountValueChange={onDiscountValueChange}
            onVatRateChange={onVatRateChange}
          />
        ))}
        {lines.length === 0 && (
          <tr>
            <td colSpan={14} className="text-center text-muted-foreground py-6">لا توجد أصناف</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ── سطر واحد (مُحسَّن بـ React.memo) ────────────────────────────────────────
interface RowProps {
  line:      InvoiceLineLocal;
  idx:       number;
  totalRows: number;
  isDraft:   boolean;
  registerNav: (row: number, col: number, el: HTMLInputElement | null) => void;
  onNavKey:    (e: React.KeyboardEvent, row: number, col: number, totalRows: number) => void;
  onPurchasePriceChange: (i: number, val: string) => void;
  onDiscountPctChange:   (i: number, val: string) => void;
  onDiscountValueChange: (i: number, val: string) => void;
  onVatRateChange:       (i: number, val: string) => void;
}

const InvoiceLineRow = memo(function InvoiceLineRow({
  line: ln, idx: i, totalRows, isDraft,
  registerNav, onNavKey,
  onPurchasePriceChange, onDiscountPctChange,
  onDiscountValueChange, onVatRateChange,
}: RowProps) {
  const priceWarning  = ln.purchasePrice > ln.sellingPrice && ln.sellingPrice > 0;
  const hasCoreErrors = getLineCoreErrors(ln).length > 0;
  const hasDiscErr    = getLineDiscountErrors(ln).length > 0;
  const hasAnyErr     = hasCoreErrors || hasDiscErr;

  return (
    <tr
      className={`peachtree-grid-row ${hasAnyErr ? "bg-red-50 dark:bg-red-900/20" : ""} ${priceWarning && !hasAnyErr ? "bg-orange-50 dark:bg-orange-900/20" : ""}`}
      data-testid={`row-line-${i}`}
    >
      {/* # */}
      <td className="py-0.5 px-2 text-muted-foreground text-center">{i + 1}</td>

      {/* الصنف */}
      <td className="py-1 px-2 max-w-[160px]" title={ln.item?.nameAr || ""}>
        <div className="leading-tight">
          <span className="font-bold" style={{ fontSize: "13px" }}>{ln.item?.nameAr || ln.itemId}</span>
          {priceWarning && <AlertTriangle className="inline h-3 w-3 text-orange-500 mr-1" />}
          <div className="text-[10px] text-muted-foreground font-mono">{ln.item?.itemCode || ""}</div>
        </div>
      </td>

      {/* الوحدة */}
      <td className="py-0.5 px-2 text-center whitespace-nowrap">{getUnitName(ln.item, ln.unitLevel)}</td>

      {/* الكمية */}
      <td className="py-0.5 px-2 text-center peachtree-amount whitespace-nowrap">{formatNumber(ln.qty)}</td>

      {/* هدية */}
      <td className="py-0.5 px-2 text-center peachtree-amount whitespace-nowrap">{formatNumber(ln.bonusQty)}</td>

      {/* سعر البيع */}
      <td className="py-0.5 px-2 text-center peachtree-amount whitespace-nowrap">{formatNumber(ln.sellingPrice)}</td>

      {/* خصم % — NAV_DISCOUNT_PCT = 0 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <input
            ref={(el) => registerNav(i, NAV_DISCOUNT_PCT, el)}
            type="number" step="0.01" min="0" max="99.99"
            value={ln.lineDiscountPct}
            onChange={(e) => onDiscountPctChange(i, e.target.value)}
            onKeyDown={(e) => onNavKey(e, i, NAV_DISCOUNT_PCT, totalRows)}
            onFocus={(e) => e.target.select()}
            className={`peachtree-input w-[60px] text-center ${ln.lineDiscountPct >= 100 ? "border-red-400" : ""}`}
            data-testid={`input-discount-pct-${i}`}
          />
        ) : (
          <span className="peachtree-amount">{formatNumber(ln.lineDiscountPct)}</span>
        )}
      </td>

      {/* خصم قيمة — NAV_DISCOUNT_VALUE = 1 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <input
            ref={(el) => registerNav(i, NAV_DISCOUNT_VALUE, el)}
            type="number" step="0.01" min="0"
            value={ln.lineDiscountValue}
            onChange={(e) => onDiscountValueChange(i, e.target.value)}
            onKeyDown={(e) => onNavKey(e, i, NAV_DISCOUNT_VALUE, totalRows)}
            onFocus={(e) => e.target.select()}
            className={`peachtree-input w-[80px] text-center ${ln.sellingPrice > 0 && ln.lineDiscountValue > ln.sellingPrice ? "border-red-400" : ""}`}
            data-testid={`input-discount-value-${i}`}
          />
        ) : (
          <span className="peachtree-amount">{formatNumber(ln.lineDiscountValue)}</span>
        )}
      </td>

      {/* سعر الشراء — NAV_PURCHASE_PRICE = 2 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <div>
            <input
              ref={(el) => registerNav(i, NAV_PURCHASE_PRICE, el)}
              type="number" step="0.01" min="0"
              value={ln.purchasePrice}
              onChange={(e) => onPurchasePriceChange(i, e.target.value)}
              onKeyDown={(e) => onNavKey(e, i, NAV_PURCHASE_PRICE, totalRows)}
              onFocus={(e) => e.target.select()}
              className={`peachtree-input w-[80px] text-center ${priceWarning ? "border-orange-400" : ""} ${ln.purchasePrice < 0 ? "border-red-400" : ""}`}
              data-testid={`input-purchase-price-${i}`}
            />
            {priceWarning && <span className="text-[10px] text-orange-500 block">أعلى من البيع</span>}
          </div>
        ) : (
          <span className="peachtree-amount">{formatNumber(ln.purchasePrice)}</span>
        )}
      </td>

      {/* ض.ق.م % — NAV_VAT_RATE = 3 */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <input
            ref={(el) => registerNav(i, NAV_VAT_RATE, el)}
            type="number" step="0.01" min="0"
            value={ln.vatRate}
            onChange={(e) => onVatRateChange(i, e.target.value)}
            onKeyDown={(e) => onNavKey(e, i, NAV_VAT_RATE, totalRows)}
            onFocus={(e) => e.target.select()}
            className="peachtree-input w-[55px] text-center"
            data-testid={`input-vat-rate-${i}`}
          />
        ) : (
          <span className="peachtree-amount">{formatNumber(ln.vatRate)}</span>
        )}
      </td>

      {/* قبل ض.ق.م */}
      <td className="py-0.5 px-2 text-center peachtree-amount whitespace-nowrap">{formatNumber(ln.valueBeforeVat)}</td>

      {/* ض.ق.م */}
      <td className="py-0.5 px-2 text-center peachtree-amount whitespace-nowrap">{formatNumber(ln.vatAmount)}</td>

      {/* بعد ض.ق.م */}
      <td className="py-0.5 px-2 text-center peachtree-amount font-semibold whitespace-nowrap">{formatNumber(ln.valueAfterVat)}</td>

      {/* تشغيلة / صلاحية */}
      <td className="py-0.5 px-2 text-center text-[11px] whitespace-nowrap">
        {ln.batchNumber && <span className="ml-1">{ln.batchNumber}</span>}
        {ln.expiryMonth && ln.expiryYear && <span>{ln.expiryMonth}/{ln.expiryYear}</span>}
        {!ln.batchNumber && !ln.expiryMonth && "—"}
      </td>
    </tr>
  );
});
