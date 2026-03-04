import { Loader2, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/formatters";

interface CloseShiftDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expectedCash: number;
  closingCash: string;
  setClosingCash: (v: string) => void;
  varianceCalc: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function CloseShiftDialog({
  open, onOpenChange, expectedCash, closingCash, setClosingCash, varianceCalc, onConfirm, isPending
}: CloseShiftDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">إغلاق الوردية</DialogTitle>
          <DialogDescription className="text-right">
            أدخل المبلغ النقدي الفعلي في الخزنة لإغلاق الوردية
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground text-right">النقدية المتوقعة:</div>
            <div className="text-right font-medium" data-testid="text-expected-cash">
              {formatNumber(expectedCash)}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-right block">النقدية الفعلية:</label>
            <Input
              type="number"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              className="text-right"
              data-testid="input-closing-cash"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground text-right">الفرق:</div>
            <div
              className={`text-right font-medium ${varianceCalc < 0 ? "text-red-600" : varianceCalc > 0 ? "text-green-600" : ""}`}
              data-testid="text-variance"
            >
              {formatNumber(varianceCalc)}
            </div>
          </div>
        </div>
        <DialogFooter className="flex flex-row-reverse gap-2">
          <Button onClick={onConfirm} disabled={isPending} data-testid="button-confirm-close-shift">
            {isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <LogOut className="ml-2 h-4 w-4" />}
            تأكيد إغلاق الوردية
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-close-shift">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
