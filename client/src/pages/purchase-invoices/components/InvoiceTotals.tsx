/**
 * InvoiceTotals — شريط الإجماليات في أسفل فاتورة الشراء
 *
 * يعرض: إجمالي قبل ض.ق.م | إجمالي ض.ق.م | إجمالي بعد ض.ق.م
 *        خصم الأسطر | خصم الفاتورة (قابل للتعديل في المسودة) | صافي مستحق
 */
import { formatNumber } from "@/lib/formatters";
import type { UseInvoiceDiscountReturn } from "../hooks/useInvoiceDiscount";

interface Props {
  summary:  UseInvoiceDiscountReturn["summary"];
  isDraft:  boolean;
  invoiceDiscountPct: number;
  invoiceDiscountVal: number;
  onDiscountPctChange: (val: string) => void;
  onDiscountValChange: (val: string) => void;
}

export function InvoiceTotals({
  summary, isDraft,
  invoiceDiscountPct, invoiceDiscountVal,
  onDiscountPctChange, onDiscountValChange,
}: Props) {
  return (
    <div className="peachtree-totals p-3 m-2">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-[12px]">

        {/* إجمالي قبل ض.ق.م */}
        <div>
          <span className="font-semibold block">إجمالي قبل ض.ق.م</span>
          <span className="peachtree-amount text-sm font-bold" data-testid="text-total-before-vat">
            {formatNumber(summary.totalBeforeVat)}
          </span>
        </div>

        {/* إجمالي ض.ق.م */}
        <div>
          <span className="font-semibold block">إجمالي ض.ق.م</span>
          <span className="peachtree-amount text-sm font-bold" data-testid="text-total-vat">
            {formatNumber(summary.totalVat)}
          </span>
        </div>

        {/* إجمالي بعد ض.ق.م */}
        <div>
          <span className="font-semibold block">إجمالي بعد ض.ق.م</span>
          <span className="peachtree-amount text-sm font-bold" data-testid="text-total-after-vat">
            {formatNumber(summary.totalAfterVat)}
          </span>
        </div>

        {/* خصم الأسطر — حقل تحليلي: يُستخدم لمقارنة أسعار الموردين وتاريخ الشراء، لا يُرحَّل في القيد */}
        <div>
          <span className="font-semibold block">خصم الأسطر</span>
          <span className="peachtree-amount text-sm" data-testid="text-total-line-discounts"
            title="إجمالي خصم الأسطر (للتحليل والمقارنة) — لا يُرحَّل كسطر قيد مستقل؛ سعر الشراء النهائي هو القيمة المحاسبية">
            {formatNumber(summary.totalLineDiscounts)}
          </span>
        </div>

        {/* خصم الفاتورة الإجمالي */}
        <div>
          <span className="font-semibold block">خصم إجمالي</span>
          {isDraft ? (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <div className="flex items-center gap-0.5">
                <input
                  type="number" step="0.01" min="0" max="100"
                  value={invoiceDiscountPct || ""}
                  onChange={(e) => onDiscountPctChange(e.target.value)}
                  className="peachtree-input w-[55px] text-center"
                  placeholder="0"
                  data-testid="input-invoice-discount-pct"
                />
                <span className="text-[10px] text-muted-foreground">%</span>
              </div>
              <div className="flex items-center gap-0.5">
                <input
                  type="number" step="0.01" min="0"
                  value={invoiceDiscountVal || ""}
                  onChange={(e) => onDiscountValChange(e.target.value)}
                  className="peachtree-input w-[80px] text-center"
                  placeholder="0"
                  data-testid="input-invoice-discount-val"
                />
                <span className="text-[10px] text-muted-foreground">ج.م</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="peachtree-amount">{formatNumber(invoiceDiscountPct)}%</span>
              <span className="text-muted-foreground mx-0.5">=</span>
              <span className="peachtree-amount">{formatNumber(invoiceDiscountVal)}</span>
            </div>
          )}
        </div>

        {/* صافي المستحق */}
        <div>
          <span className="font-semibold block">صافي المستحق</span>
          <span
            className="peachtree-amount text-sm font-bold text-green-700 dark:text-green-400"
            data-testid="text-net-payable"
          >
            {formatNumber(summary.netPayable)}
          </span>
        </div>

      </div>
    </div>
  );
}
