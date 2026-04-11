import { memo } from "react";
import {
  Loader2, Lock, CheckCircle2, AlertTriangle,
  ShieldCheck, Building2, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fmtDate, fmtMoney } from "../../../shared/formatters";

export function FinRow({ label, value, highlight, muted, border }: {
  label: string; value: number; highlight?: boolean; muted?: boolean; border?: boolean;
}) {
  const cls = highlight
    ? "text-green-700 font-bold text-base"
    : muted
      ? "text-muted-foreground text-sm"
      : "font-semibold text-sm";
  const neg = value < 0;
  return (
    <div className={`flex justify-between items-center py-1.5 ${border ? "border-t border-dashed mt-1 pt-2" : ""}`}>
      <span className={`text-sm ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>{label}</span>
      <span className={`font-mono ${cls} ${neg ? "text-red-600" : ""}`}>
        {neg ? `(${fmtMoney(Math.abs(value))})` : fmtMoney(value)}
      </span>
    </div>
  );
}

export const FinancialSidebar = memo(function FinancialSidebar({
  totals, isFinalClosed, canFinalClose, onFinalClose, isPending, finalClosedAt, invoiceNumber,
  contractName, companyShareAmount, patientShareAmount,
  invoiceStatus, onFinalize, isFinalizePending,
}: {
  totals: { totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number; remaining: number };
  isFinalClosed: boolean;
  canFinalClose: boolean;
  onFinalClose: () => void;
  isPending: boolean;
  finalClosedAt?: string | null;
  invoiceNumber?: string;
  contractName?: string | null;
  companyShareAmount?: number | null;
  patientShareAmount?: number | null;
  invoiceStatus?: string;
  onFinalize?: () => void;
  isFinalizePending?: boolean;
}) {
  const hasContractSplit = (companyShareAmount != null && companyShareAmount > 0) || (patientShareAmount != null && patientShareAmount > 0);
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <div className="bg-slate-50 border rounded-xl p-4 flex flex-col gap-0.5">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">الملخص المالي</p>

        <FinRow label="إجمالي الخدمات" value={totals.totalAmount} />
        <FinRow label="الخصم" value={totals.discountAmount} muted />
        <FinRow label="الصافي" value={totals.netAmount} highlight border />

        <div className="my-2 border-t border-slate-200" />
        <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">الدفعات</p>
        <FinRow label="المدفوع" value={totals.paidAmount} />
        <FinRow label="الباقي" value={totals.remaining} />
      </div>

      {hasContractSplit && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col gap-0.5" data-testid="section-contract-split">
          <div className="flex items-center gap-1.5 mb-2">
            <Building2 className="h-3.5 w-3.5 text-indigo-600" />
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">توزيع التعاقد</p>
          </div>
          {contractName && (
            <div className="text-[10px] text-indigo-600 mb-1.5 font-medium">{contractName}</div>
          )}
          <div className="flex justify-between items-center py-1">
            <span className="text-xs text-indigo-700/80">نصيب الشركة</span>
            <span className="font-mono text-sm font-semibold text-indigo-700">{fmtMoney(companyShareAmount ?? 0)}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-xs text-indigo-700/80">نصيب المريض</span>
            <span className="font-mono text-sm font-semibold text-amber-700">{fmtMoney(patientShareAmount ?? 0)}</span>
          </div>
          {companyShareAmount != null && patientShareAmount != null && (companyShareAmount + patientShareAmount) > 0 && (
            <div className="flex justify-between items-center py-0.5 mt-1 border-t border-indigo-200 pt-1.5">
              <span className="text-[10px] text-indigo-600">نسبة الشركة</span>
              <span className="text-[10px] font-mono font-semibold text-indigo-600">
                {Math.round((companyShareAmount / (companyShareAmount + patientShareAmount)) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {isFinalClosed ? (
        <div className="flex flex-col items-center gap-1 mt-3 p-3 rounded-xl border border-green-200 bg-green-50">
          <Lock className="h-5 w-5 text-green-600" />
          <span className="text-xs font-semibold text-green-700">مغلق نهائياً</span>
          {finalClosedAt && (
            <span className="text-[10px] text-green-600">{fmtDate(finalClosedAt)}</span>
          )}
        </div>
      ) : invoiceStatus === "finalizing" ? (
        <div className="flex flex-col items-center gap-1 mt-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
          <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
          <span className="text-xs font-semibold text-amber-700">جاري الاعتماد...</span>
        </div>
      ) : invoiceStatus === "draft" && onFinalize ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"
              disabled={isFinalizePending}
              data-testid="button-finalize-invoice"
            >
              {isFinalizePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              اعتماد الفاتورة
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                تأكيد اعتماد الفاتورة
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم اعتماد الفاتورة — بعد الاعتماد لن يمكن تعديل البنود.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={onFinalize}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-finalize"
              >
                تأكيد الاعتماد
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : canFinalClose ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
              disabled={isPending}
              data-testid="button-final-close"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              إغلاق نهائي
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                تأكيد الإغلاق النهائي
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم إغلاق الفاتورة <strong>{invoiceNumber}</strong> نهائياً.
                بعد الإغلاق لن يمكن إجراء أي تعديلات عليها إلا بصلاحية خاصة.
                <br /><br />
                <strong>الشروط:</strong> الرصيد المتبقي = صفر، لا فواتير مسودة في الإقامة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={onFinalClose}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-confirm-final-close"
              >
                تأكيد الإغلاق النهائي
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : invoiceStatus === "finalized" ? (
        <div className="flex flex-col items-center gap-1 mt-3 p-3 rounded-xl border border-blue-200 bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-blue-600" />
          <span className="text-xs font-semibold text-blue-700">معتمد</span>
        </div>
      ) : null}
    </div>
  );
});
