import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banknote, Percent, DollarSign, CheckCircle2, Clock } from "lucide-react";

interface Props {
  consultationFee: number;
  discountType: string;
  discountValue: number;
  finalAmount: number;
  paymentStatus: string | null | undefined;
  treasuryId: string | null | undefined;
  onDiscountTypeChange: (type: string) => void;
  onDiscountValueChange: (value: number) => void;
}

export function FeeDiscountBar({
  consultationFee,
  discountType,
  discountValue,
  finalAmount,
  paymentStatus,
  treasuryId,
  onDiscountTypeChange,
  onDiscountValueChange,
}: Props) {
  const [inputVal, setInputVal] = useState(String(discountValue || 0));

  useEffect(() => {
    setInputVal(String(discountValue || 0));
  }, [discountValue]);

  if (!consultationFee && !treasuryId) return null;

  const computed = discountType === "percent"
    ? consultationFee * (1 - (parseFloat(inputVal) || 0) / 100)
    : consultationFee - (parseFloat(inputVal) || 0);
  const displayFinal = Math.max(0, computed);

  const handleInputChange = (v: string) => {
    setInputVal(v);
    const num = parseFloat(v) || 0;
    onDiscountValueChange(num);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm" dir="rtl">
      <Banknote className="h-4 w-4 text-blue-600 shrink-0" />
      <span className="text-blue-800 font-medium shrink-0">
        رسم الكشف:
      </span>
      <span className="text-blue-900 font-bold shrink-0" data-testid="text-consultation-fee">
        {consultationFee.toLocaleString("ar-EG", { minimumFractionDigits: 0 })} ج.م
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">خصم:</span>
        <Button
          type="button"
          size="sm"
          variant={discountType === "amount" ? "default" : "outline"}
          className="h-6 px-2 text-xs"
          onClick={() => onDiscountTypeChange("amount")}
          data-testid="button-discount-amount"
        >
          <DollarSign className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={discountType === "percent" ? "default" : "outline"}
          className="h-6 px-2 text-xs"
          onClick={() => onDiscountTypeChange("percent")}
          data-testid="button-discount-percent"
        >
          <Percent className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={inputVal}
          onChange={(e) => handleInputChange(e.target.value)}
          className="h-6 w-20 text-xs px-2"
          placeholder={discountType === "percent" ? "%" : "ج.م"}
          data-testid="input-discount-value"
        />
      </div>

      {(parseFloat(inputVal) || 0) > 0 && (
        <>
          <span className="text-xs text-muted-foreground">=</span>
          <span className="font-bold text-green-700 shrink-0" data-testid="text-final-amount">
            {displayFinal.toLocaleString("ar-EG", { minimumFractionDigits: 0 })} ج.م
          </span>
        </>
      )}

      <div className="flex-1" />

      {paymentStatus === "paid" && treasuryId ? (
        <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-xs" variant="outline" data-testid="badge-treasury-paid">
          <CheckCircle2 className="h-3 w-3" />
          تم التسجيل في الخزنة
        </Badge>
      ) : treasuryId ? (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-xs" variant="outline" data-testid="badge-treasury-pending">
          <Clock className="h-3 w-3" />
          في انتظار التسجيل
        </Badge>
      ) : null}
    </div>
  );
}
