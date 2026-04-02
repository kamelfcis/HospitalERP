import { formatNumber } from "@/lib/formatters";
import { AlertTriangle } from "lucide-react";

interface Props {
  subtotal: number;
  discountPct: number;
  discountValue: number;
  netTotal: number;
  isDraft: boolean;
  totalTaxAmount?: number;
  onDiscountPctChange: (val: string) => void;
  onDiscountValueChange: (val: string) => void;
  customerType?: string;
  companyCoveragePct?: number;
  maxDiscountPct?:   number | null;
  maxDiscountValue?: number | null;
  estimatedCompanyTotal?: number | null;
  estimatedPatientTotal?: number | null;
}

export function InvoiceTotals({
  subtotal, discountPct, discountValue, netTotal, isDraft,
  totalTaxAmount = 0,
  onDiscountPctChange, onDiscountValueChange,
  customerType, companyCoveragePct = 100,
  maxDiscountPct, maxDiscountValue,
  estimatedCompanyTotal, estimatedPatientTotal,
}: Props) {
  const hasVat               = totalTaxAmount > 0.001;
  const isContract           = customerType === "contract";
  const discountOverMaxPct   = maxDiscountPct   != null && discountPct   > maxDiscountPct;
  const discountOverMaxValue = maxDiscountValue != null && discountValue > maxDiscountValue;
  const discountOverMax      = discountOverMaxPct || discountOverMaxValue;

  const hasRuleEstimate = estimatedCompanyTotal != null && estimatedPatientTotal != null;
  const companyShare = isContract
    ? (hasRuleEstimate ? estimatedCompanyTotal! : +(netTotal * (companyCoveragePct / 100)).toFixed(2))
    : 0;
  const patientShare = isContract
    ? (hasRuleEstimate ? estimatedPatientTotal! : +(netTotal - companyShare).toFixed(2))
    : 0;

  const colCount = (hasVat ? 5 : 4) + (isContract ? 2 : 0);

  return (
    <div className="bg-gradient-to-l from-slate-700 to-slate-800 text-white p-3 m-2 rounded-md sticky bottom-0 z-40">
      {discountOverMaxPct && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-red-600/80 rounded text-xs font-semibold text-white" data-testid="discount-over-limit-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>تجاوز حد نسبة الخصم: الحد الأقصى {maxDiscountPct}% — الخصم الحالي {discountPct}%</span>
        </div>
      )}
      {discountOverMaxValue && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-red-600/80 rounded text-xs font-semibold text-white" data-testid="discount-value-over-limit-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>تجاوز حد قيمة الخصم: الحد الأقصى {formatNumber(maxDiscountValue!)} ج — الخصم الحالي {formatNumber(discountValue)} ج</span>
        </div>
      )}
      <div className={`grid grid-cols-2 md:grid-cols-${colCount} gap-3 text-[12px]`}>
        <div>
          <span className="font-semibold block opacity-80">الإجمالي قبل الخصم</span>
          <span className="text-sm font-bold" data-testid="text-subtotal">{formatNumber(subtotal)}</span>
        </div>
        <div>
          <span className="font-semibold block opacity-80">خصم %</span>
          {isDraft ? (
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={discountPct}
              onChange={(e) => onDiscountPctChange(e.target.value)}
              className={`peachtree-input w-[70px] text-center text-black ${discountOverMax ? "border-2 border-red-500" : ""}`}
              data-testid="input-discount-pct"
            />
          ) : (
            <span className="text-sm font-bold" data-testid="text-discount-pct">{formatNumber(discountPct)}%</span>
          )}
        </div>
        <div>
          <span className="font-semibold block opacity-80">خصم قيمة</span>
          {isDraft ? (
            <input
              type="number"
              step="0.01"
              min="0"
              value={discountValue}
              onChange={(e) => onDiscountValueChange(e.target.value)}
              className="peachtree-input w-[80px] text-center text-black"
              data-testid="input-discount-value"
            />
          ) : (
            <span className="text-sm font-bold" data-testid="text-discount-value">{formatNumber(discountValue)}</span>
          )}
        </div>
        {hasVat && (
          <div>
            <span className="font-semibold block opacity-80">ض.ق.م ({((totalTaxAmount / (subtotal || 1)) * 100).toFixed(1)}%)</span>
            <span className="text-sm font-bold text-yellow-300" data-testid="text-total-tax-amount">{formatNumber(totalTaxAmount)}</span>
          </div>
        )}
        <div>
          <span className="font-semibold block opacity-80">صافي المستحق</span>
          <span className="text-sm font-bold text-green-300" data-testid="text-net-total">{formatNumber(netTotal)}</span>
        </div>

        {isContract && (
          <>
            <div>
              <span className="font-semibold block opacity-80 text-blue-300">
                حصة الشركة
                {hasRuleEstimate ? " (بعد القواعد)" : ` (${companyCoveragePct}%)`}
              </span>
              <span className="text-sm font-bold text-blue-200" data-testid="text-company-share">{formatNumber(companyShare)}</span>
            </div>
            <div>
              <span className="font-semibold block opacity-80 text-amber-300">حصة المريض</span>
              <span className="text-sm font-bold text-amber-200" data-testid="text-patient-share">{formatNumber(patientShare)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
