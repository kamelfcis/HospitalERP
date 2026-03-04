import { Loader2, CheckCircle, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/formatters";

interface DoctorTransferSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doctorName: string;
  amount: string;
  notes: string;
  isPending: boolean;
  onConfirm: () => void;
}

export function DoctorTransferSheet({
  open, onOpenChange, doctorName, amount, notes, isPending, onConfirm,
}: DoctorTransferSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="rounded-t-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-row-reverse items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-blue-600" />
            تأكيد تحويل مستحقات الطبيب
          </SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-3 text-right">
          <div className="flex flex-row-reverse gap-2 text-sm">
            <span className="text-muted-foreground">الطبيب:</span>
            <strong>{doctorName}</strong>
          </div>
          <div className="flex flex-row-reverse gap-2 text-sm">
            <span className="text-muted-foreground">المبلغ:</span>
            <strong className="text-blue-700 text-base">{formatCurrency(parseFloat(amount || "0"))}</strong>
          </div>
          {notes && (
            <div className="flex flex-row-reverse gap-2 text-sm">
              <span className="text-muted-foreground">ملاحظات:</span>
              <span>{notes}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground border rounded p-2 bg-muted">
            سيتم تسجيل هذا التحويل كمستحق مالي (مستحقات للطبيب على المستشفى). لا يمكن التراجع عنه بعد التأكيد.
          </p>
        </div>
        <SheetFooter className="flex-row-reverse gap-2 pb-2">
          <Button
            onClick={onConfirm}
            disabled={isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-dt-submit"
          >
            {isPending
              ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
              : <CheckCircle className="h-3 w-3 ml-1" />}
            تأكيد التحويل
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-dt-cancel">
            إلغاء
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
