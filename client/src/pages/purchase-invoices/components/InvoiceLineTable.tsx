/**
 * InvoiceLineTable — جدول أصناف فاتورة الشراء
 *
 * أعمدة الجدول (RTL):
 *   # | الصنف | الوحدة | الكمية | هدية | سعر البيع | خصم% | خصم قيمة | سعر الشراء | ض.ق.م% | قبل ض.ق.م | ض.ق.م | بعد ض.ق.م | تشغيلة/صلاحية
 *
 * الحقول القابلة للتعديل (مسودة فقط):
 *   - سعر الشراء ← → خصم% ← → خصم قيمة (علاقة متبادلة ثلاثية)
 *   - ض.ق.م %
 */
import { AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { getUnitName, getLineCoreErrors, getLineDiscountErrors } from "../types";
import type { InvoiceLineLocal } from "../types";

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
            isDraft={isDraft}
            onPurchasePriceChange={(val) => onPurchasePriceChange(i, val)}
            onDiscountPctChange={(val)   => onDiscountPctChange(i, val)}
            onDiscountValueChange={(val) => onDiscountValueChange(i, val)}
            onVatRateChange={(val)       => onVatRateChange(i, val)}
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

// ── سطر واحد ──────────────────────────────────────────────────────────────
interface RowProps {
  line:     InvoiceLineLocal;
  idx:      number;
  isDraft:  boolean;
  onPurchasePriceChange: (val: string) => void;
  onDiscountPctChange:   (val: string) => void;
  onDiscountValueChange: (val: string) => void;
  onVatRateChange:       (val: string) => void;
}

function InvoiceLineRow({
  line: ln, idx: i, isDraft,
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

      {/* خصم % */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <input
            type="number" step="0.01" min="0" max="99.99"
            value={ln.lineDiscountPct}
            onChange={(e) => onDiscountPctChange(e.target.value)}
            className={`peachtree-input w-[60px] text-center ${ln.lineDiscountPct >= 100 ? "border-red-400" : ""}`}
            data-testid={`input-discount-pct-${i}`}
          />
        ) : (
          <span className="peachtree-amount">{formatNumber(ln.lineDiscountPct)}</span>
        )}
      </td>

      {/* خصم قيمة */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <input
            type="number" step="0.01" min="0"
            value={ln.lineDiscountValue}
            onChange={(e) => onDiscountValueChange(e.target.value)}
            className={`peachtree-input w-[80px] text-center ${ln.sellingPrice > 0 && ln.lineDiscountValue > ln.sellingPrice ? "border-red-400" : ""}`}
            data-testid={`input-discount-value-${i}`}
          />
        ) : (
          <span className="peachtree-amount">{formatNumber(ln.lineDiscountValue)}</span>
        )}
      </td>

      {/* سعر الشراء */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <div>
            <input
              type="number" step="0.01" min="0"
              value={ln.purchasePrice}
              onChange={(e) => onPurchasePriceChange(e.target.value)}
              className={`peachtree-input w-[80px] text-center ${priceWarning ? "border-orange-400" : ""} ${ln.purchasePrice < 0 ? "border-red-400" : ""}`}
              data-testid={`input-purchase-price-${i}`}
            />
            {priceWarning && <span className="text-[10px] text-orange-500 block">أعلى من البيع</span>}
          </div>
        ) : (
          <span className="peachtree-amount">{formatNumber(ln.purchasePrice)}</span>
        )}
      </td>

      {/* ض.ق.م % */}
      <td className="py-0.5 px-2 whitespace-nowrap">
        {isDraft ? (
          <input
            type="number" step="0.01" min="0"
            value={ln.vatRate}
            onChange={(e) => onVatRateChange(e.target.value)}
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
}
