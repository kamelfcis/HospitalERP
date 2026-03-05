import { Input } from "@/components/ui/input";

interface Props {
  subtotal: number;
  discountType: "percent" | "value";
  setDiscountType: (t: "percent" | "value") => void;
  discountPercent: string;
  setDiscountPercent: (v: string) => void;
  discountValue: string;
  setDiscountValue: (v: string) => void;
  computedDiscount: number;
  netTotal: number;
  notes: string;
  setNotes: (v: string) => void;
}

export function ReturnTotals({
  subtotal, discountType, setDiscountType,
  discountPercent, setDiscountPercent,
  discountValue, setDiscountValue,
  computedDiscount, netTotal,
  notes, setNotes,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row gap-4 items-start" dir="rtl" data-testid="section-totals">
      <div className="flex-1">
        <label className="text-xs font-semibold text-muted-foreground mb-1 block">ملاحظات</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full border rounded px-3 py-2 text-sm bg-background text-foreground resize-none"
          placeholder="سبب الإرجاع أو ملاحظات أخرى..."
          data-testid="textarea-notes"
        />
      </div>

      <div className="w-72 space-y-2 border rounded-lg p-3 bg-muted/30">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">إجمالي المرتجع</span>
          <span className="font-mono font-bold">{subtotal.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as "percent" | "value")}
            className="h-7 text-xs border rounded px-1 bg-background text-foreground w-20"
            data-testid="select-discount-type"
          >
            <option value="percent">نسبة %</option>
            <option value="value">قيمة</option>
          </select>
          {discountType === "percent" ? (
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="h-7 text-center text-xs flex-1"
              data-testid="input-discount-percent"
            />
          ) : (
            <Input
              type="number"
              min="0"
              step="0.01"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="h-7 text-center text-xs flex-1"
              data-testid="input-discount-value"
            />
          )}
        </div>

        {computedDiscount > 0 && (
          <div className="flex justify-between text-sm text-orange-600">
            <span>الخصم</span>
            <span className="font-mono">-{computedDiscount.toFixed(2)}</span>
          </div>
        )}

        <div className="border-t pt-2 flex justify-between text-base font-bold">
          <span>صافي المرتجع</span>
          <span className="font-mono text-green-700 dark:text-green-400">{netTotal.toFixed(2)} ج.م</span>
        </div>
      </div>
    </div>
  );
}
