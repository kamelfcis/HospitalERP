import { Loader2, LogOut, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/formatters";
import type { ShiftTotals } from "../types";

interface CloseShiftDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expectedCash: number;
  closingCash: string;
  setClosingCash: (v: string) => void;
  varianceCalc: number;
  onConfirm: () => void;
  isPending: boolean;
  shiftTotals?: ShiftTotals | null;
}

export function CloseShiftDialog({
  open, onOpenChange, expectedCash, closingCash, setClosingCash, varianceCalc, onConfirm, isPending, shiftTotals,
}: CloseShiftDialogProps) {
  const hasNegativeExpected = expectedCash < 0;
  const hasNetRefunds = shiftTotals &&
    parseFloat(shiftTotals.totalRefunded || "0") >
    parseFloat(shiftTotals.totalCollected || "0");

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
            <div className="flex items-center gap-1 justify-end text-muted-foreground">
              النقدية المتوقعة:
              {shiftTotals && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-right text-xs space-y-1 max-w-[230px]" dir="rtl">
                      <div className="font-semibold mb-1">تفصيل النقدية المتوقعة</div>
                      <div className="flex justify-between gap-4">
                        <span>رصيد افتتاح</span>
                        <span>{formatNumber(parseFloat(shiftTotals.openingCash || "0"))}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-green-400">
                        <span>+ تحصيل ({shiftTotals.collectCount})</span>
                        <span>{formatNumber(parseFloat(shiftTotals.totalCollected || "0"))}</span>
                      </div>
                      {parseFloat(shiftTotals.creditCollected || "0") > 0 && (
                        <div className="flex justify-between gap-4 text-green-400">
                          <span>+ آجل ({shiftTotals.creditCount})</span>
                          <span>{formatNumber(parseFloat(shiftTotals.creditCollected || "0"))}</span>
                        </div>
                      )}
                      {parseFloat(shiftTotals.deliveryCollected || "0") > 0 && (
                        <div className="flex justify-between gap-4 text-green-400">
                          <span>+ توصيل ({shiftTotals.deliveryCollectedCount})</span>
                          <span>{formatNumber(parseFloat(shiftTotals.deliveryCollected || "0"))}</span>
                        </div>
                      )}
                      {parseFloat(shiftTotals.totalRefunded || "0") > 0 && (
                        <div className="flex justify-between gap-4 text-red-400">
                          <span>- مرتجعات ({shiftTotals.refundCount})</span>
                          <span>{formatNumber(parseFloat(shiftTotals.totalRefunded || "0"))}</span>
                        </div>
                      )}
                      {parseFloat(shiftTotals.supplierPaid || "0") > 0 && (
                        <div className="flex justify-between gap-4 text-red-400">
                          <span>- موردون ({shiftTotals.supplierPaidCount})</span>
                          <span>{formatNumber(parseFloat(shiftTotals.supplierPaid || "0"))}</span>
                        </div>
                      )}
                      <div className="border-t border-border pt-1 flex justify-between gap-4 font-semibold">
                        <span>= الصافي</span>
                        <span className={expectedCash < 0 ? "text-red-400" : "text-green-400"}>
                          {formatNumber(expectedCash)}
                        </span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div
              className={`text-right font-medium ${hasNegativeExpected ? "text-red-600 dark:text-red-400" : ""}`}
              data-testid="text-expected-cash"
            >
              {formatNumber(expectedCash)}
            </div>
          </div>

          {hasNegativeExpected && hasNetRefunds && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs text-amber-800 dark:text-amber-300 text-right">
              ⚠️ المرتجعات ({formatNumber(parseFloat(shiftTotals!.totalRefunded || "0"))}) تتجاوز التحصيل — يُنصح بفتح الوردية برصيد افتتاحي يكفي لتغطية المرتجعات.
            </div>
          )}

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
