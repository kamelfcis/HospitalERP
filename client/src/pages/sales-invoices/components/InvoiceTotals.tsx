import { formatNumber } from "@/lib/formatters";

interface Props {
  subtotal: number;
  discountPct: number;
  discountValue: number;
  netTotal: number;
  isDraft: boolean;
  onDiscountPctChange: (val: string) => void;
  onDiscountValueChange: (val: string) => void;
}

export function InvoiceTotals({
  subtotal, discountPct, discountValue, netTotal, isDraft,
  onDiscountPctChange, onDiscountValueChange,
}: Props) {
  return (
    <div className="bg-gradient-to-l from-slate-700 to-slate-800 text-white p-3 m-2 rounded-md sticky bottom-0 z-40">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
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
              className="peachtree-input w-[70px] text-center text-black"
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
        <div>
          <span className="font-semibold block opacity-80">صافي المستحق</span>
          <span className="text-sm font-bold text-green-300" data-testid="text-net-total">{formatNumber(netTotal)}</span>
        </div>
      </div>
    </div>
  );
}
