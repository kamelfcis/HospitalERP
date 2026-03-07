import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HeaderDiscountDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string | null;
  currentPercent: number;
  currentAmount: number;
  onApplied: (percent: number, amount: number) => void;
}

export function HeaderDiscountDialog({
  open, onOpenChange, invoiceId,
  currentPercent, currentAmount, onApplied,
}: HeaderDiscountDialogProps) {
  const { toast } = useToast();
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    currentPercent > 0 ? "percent" : "amount"
  );
  const [discountValue, setDiscountValue] = useState(
    currentPercent > 0 ? String(currentPercent) : String(currentAmount)
  );

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/patient-invoices/${invoiceId}/header-discount`, {
        discountType,
        discountValue: parseFloat(discountValue) || 0,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const newPercent = parseFloat(data.headerDiscountPercent) || 0;
      const newAmount = parseFloat(data.headerDiscountAmount) || 0;
      onApplied(newPercent, newAmount);
      toast({ title: "تم تطبيق الخصم بنجاح" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/patient-invoices/${invoiceId}/header-discount`, {
        discountType: "amount",
        discountValue: 0,
      });
      return res.json();
    },
    onSuccess: () => {
      onApplied(0, 0);
      toast({ title: "تم إزالة الخصم" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const isPending = applyMutation.isPending || removeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>خصم على مستوى الفاتورة</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>نوع الخصم</Label>
            <Select
              value={discountType}
              onValueChange={(v) => setDiscountType(v as "percent" | "amount")}
            >
              <SelectTrigger data-testid="select-discount-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">نسبة مئوية (%)</SelectItem>
                <SelectItem value="amount">مبلغ ثابت (ج.م)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{discountType === "percent" ? "نسبة الخصم %" : "مبلغ الخصم ج.م"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              data-testid="input-discount-value"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="text-left"
              dir="ltr"
            />
          </div>

          {(currentPercent > 0 || currentAmount > 0) && (
            <p className="text-xs text-muted-foreground">
              الخصم الحالي: {currentPercent > 0 ? `${currentPercent}%` : ""}{" "}
              ({currentAmount.toLocaleString("ar-EG")} ج.م)
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {(currentPercent > 0 || currentAmount > 0) && (
            <Button
              variant="outline"
              onClick={() => removeMutation.mutate()}
              disabled={isPending}
              data-testid="button-remove-discount"
            >
              {removeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              إزالة الخصم
            </Button>
          )}
          <Button
            onClick={() => applyMutation.mutate()}
            disabled={isPending || !invoiceId}
            data-testid="button-apply-discount"
          >
            {applyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            تطبيق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
