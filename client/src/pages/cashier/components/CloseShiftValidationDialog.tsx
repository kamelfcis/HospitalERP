// ============================================================
//  CloseShiftValidationDialog — dialog التحقق قبل إغلاق الوردية
//
//  سيناريوهات:
//  CLEAN                     → لا فواتير معلّقة — إغلاق آمن
//  PENDING_NO_OTHER_SHIFT    → فواتير معلّقة ولا وردية أخرى — محجوب
//  PENDING_OTHER_SHIFT_EXISTS → فواتير معلّقة + وردية أخرى — تحذير فقط
// ============================================================
import { AlertTriangle, CheckCircle, Loader2, XCircle, User, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ShiftCloseValidation } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  validation: ShiftCloseValidation | null;
  isValidating: boolean;
  onProceed: () => void;
}

export function CloseShiftValidationDialog({ open, onOpenChange, validation, isValidating, onProceed }: Props) {
  const reasonCode      = validation?.reasonCode;
  const isBlocked       = reasonCode === "PENDING_NO_OTHER_SHIFT";
  const isWithWarning   = reasonCode === "PENDING_OTHER_SHIFT_EXISTS";
  const isClean         = reasonCode === "CLEAN";

  const otherShiftTime = validation?.otherShift?.openedAt
    ? new Date(validation.otherShift.openedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            {isValidating  && <Loader2      className="h-5 w-5 animate-spin" />}
            {!isValidating && isBlocked     && <XCircle       className="h-5 w-5 text-red-600"   />}
            {!isValidating && isWithWarning && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            {!isValidating && isClean       && <CheckCircle   className="h-5 w-5 text-green-600" />}
            التحقق من إغلاق الوردية
          </DialogTitle>
          <DialogDescription className="text-right sr-only">
            التحقق من وجود فواتير معلّقة قبل إغلاق الوردية
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {isValidating && (
            <p className="text-sm text-muted-foreground text-right">جارٍ التحقق من الفواتير المعلّقة...</p>
          )}

          {!isValidating && isBlocked && (
            <>
              <AlertBox variant="error" title="لا يمكن إغلاق الوردية">
                يوجد <strong>{validation?.pendingCount}</strong> فاتورة معلّقة لم يتم تحصيلها.
              </AlertBox>
              <p className="text-xs text-muted-foreground text-right">
                يجب تحصيل جميع الفواتير المعلّقة أو فتح وردية أخرى لنفس الوحدة قبل الإغلاق.
              </p>
            </>
          )}

          {!isValidating && isWithWarning && (
            <>
              <AlertBox variant="warning" title="مسموح بالإغلاق مع تنبيه">
                يوجد <strong>{validation?.pendingCount}</strong> فاتورة معلّقة — ستُحوَّل للوردية المفتوحة أدناه.
              </AlertBox>

              {validation?.otherShift && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-right space-y-1">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300">الوردية المفتوحة لنفس الوحدة:</p>
                  <div className="flex items-center gap-2 justify-end text-sm text-blue-800 dark:text-blue-200">
                    <span>{validation.otherShift.cashierName}</span>
                    <User className="h-4 w-4" />
                  </div>
                  {otherShiftTime && (
                    <div className="flex items-center gap-2 justify-end text-xs text-blue-600 dark:text-blue-400">
                      <span>مفتوحة منذ {otherShiftTime}</span>
                      <Clock className="h-3 w-3" />
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground text-right">هل تريد المتابعة وإغلاق الوردية؟</p>
            </>
          )}

          {!isValidating && isClean && (
            <AlertBox variant="success" title="لا توجد فواتير معلّقة">
              يمكن إغلاق الوردية بأمان.
            </AlertBox>
          )}
        </div>

        <DialogFooter className="flex flex-row-reverse gap-2">
          {!isValidating && !isBlocked && (
            <Button onClick={onProceed} data-testid="button-proceed-close-shift">
              متابعة الإغلاق
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-validation-dialog">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AlertBox — مساعد بسيط لتوحيد مربعات التنبيه ─────────────
function AlertBox({
  variant, title, children,
}: {
  variant: "error" | "warning" | "success";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    error:   "bg-red-50   dark:bg-red-950/30   border-red-200   dark:border-red-800   text-red-800   dark:text-red-200",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200",
    success: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200",
  };

  return (
    <div className={`rounded-md border p-4 text-right ${styles[variant]}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm mt-1">{children}</p>
    </div>
  );
}
