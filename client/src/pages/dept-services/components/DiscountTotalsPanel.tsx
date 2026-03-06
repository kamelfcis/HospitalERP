import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceLine } from "./ServicesGrid";

interface Props {
  lines: ServiceLine[];
  discountPercent: number;
  onDiscountPercentChange: (v: number) => void;
}

export function DiscountTotalsPanel({ lines, discountPercent, onDiscountPercentChange }: Props) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discountAmount = subtotal * discountPercent / 100;
  const netAmount = Math.max(subtotal - discountAmount, 0);

  return (
    <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
      <h3 className="font-semibold text-sm">الإجمالي والخصم</h3>

      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-sm w-24">الإجمالي:</Label>
        <span className="font-bold text-lg" data-testid="text-subtotal">{subtotal.toFixed(2)} ج.م</span>
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-sm w-24">خصم %:</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={discountPercent}
          onChange={e => onDiscountPercentChange(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
          className="w-20 h-8 text-center"
          data-testid="input-discount-percent"
        />
        <span className="text-sm text-muted-foreground" data-testid="text-discount-amount">
          ({discountAmount.toFixed(2)} ج.م)
        </span>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t">
        <Label className="shrink-0 text-sm w-24">الصافي:</Label>
        <span className="font-bold text-xl text-primary" data-testid="text-net-amount">{netAmount.toFixed(2)} ج.م</span>
      </div>
    </div>
  );
}
