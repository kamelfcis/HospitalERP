import { AlertTriangle, CheckCircle, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ShiftCloseValidation {
  canClose: boolean;
  pendingCount: number;
  hasOtherOpenShift: boolean;
  reasonCode: "CLEAN" | "PENDING_NO_OTHER_SHIFT" | "PENDING_OTHER_SHIFT_EXISTS" | "NOT_FOUND" | "ALREADY_CLOSED" | string;
}

interface CloseShiftValidationDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  validation: ShiftCloseValidation | null;
  isValidating: boolean;
  onProceed: () => void;
}

export function CloseShiftValidationDialog({
  open, onOpenChange, validation, isValidating, onProceed,
}: CloseShiftValidationDialogProps) {
  const isBlocked = validation?.reasonCode === "PENDING_NO_OTHER_SHIFT";
  const isAllowedWithWarning = validation?.reasonCode === "PENDING_OTHER_SHIFT_EXISTS";
  const isClean = validation?.reasonCode === "CLEAN";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            {isValidating && <Loader2 className="h-5 w-5 animate-spin" />}
            {!isValidating && isBlocked && <XCircle className="h-5 w-5 text-red-600" />}
            {!isValidating && isAllowedWithWarning && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            {!isValidating && isClean && <CheckCircle className="h-5 w-5 text-green-600" />}
            التحقق من إغلاق الوردية
          </DialogTitle>
          <DialogDescription className="text-right sr-only">
            التحقق من وجود فواتير معلقة قبل إغلاق الوردية
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isValidating && (
            <p className="text-sm text-muted-foreground text-right">
              جارٍ التحقق من الفواتير المعلّقة...
            </p>
          )}

          {!isValidating && isBlocked && (
            <div className="space-y-3">
              <div className="rounded-md bg-red-50 border border-red-200 p-4 text-right">
                <p className="text-sm font-medium text-red-800">
                  لا يمكن قفل الوردية
                </p>
                <p className="text-sm text-red-700 mt-1">
                  يوجد <span className="font-bold">{validation?.pendingCount}</span> فاتورة بيع/مرتجع معلّقة لم يتم تحصيلها بعد.
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                يجب تحصيل جميع الفواتير المعلّقة أو فتح وردية أخرى لنفس الوحدة قبل الإغلاق.
              </p>
            </div>
          )}

          {!isValidating && isAllowedWithWarning && (
            <div className="space-y-3">
              <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-right">
                <p className="text-sm font-medium text-amber-800">
                  مسموح بالإغلاق مع تنبيه
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  يوجد <span className="font-bold">{validation?.pendingCount}</span> فاتورة معلّقة، لكن يوجد وردية أخرى مفتوحة لنفس الوحدة يمكنها استقبالها.
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                هل تريد المتابعة وإغلاق الوردية؟
              </p>
            </div>
          )}

          {!isValidating && isClean && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-right">
              <p className="text-sm font-medium text-green-800">
                لا توجد فواتير معلّقة
              </p>
              <p className="text-sm text-green-700 mt-1">
                يمكن إغلاق الوردية بأمان.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row-reverse gap-2">
          {!isValidating && !isBlocked && (
            <Button
              onClick={onProceed}
              data-testid="button-proceed-close-shift"
              variant={isAllowedWithWarning ? "default" : "default"}
            >
              متابعة الإغلاق
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-validation-dialog"
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
