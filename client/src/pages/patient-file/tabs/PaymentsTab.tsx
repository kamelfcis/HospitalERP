import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Banknote } from "lucide-react";
import { fmtDate, fmtMoney, PAYMENT_METHOD_LABELS } from "../shared/formatters";
import { usePatientPayments } from "../hooks/useInvoiceLines";
import type { PaymentRecord } from "../shared/types";

interface Props {
  patientId: string;
  active: boolean;
}

const PAY_METHOD_CLASS: Record<string, string> = {
  cash:          "bg-green-50  text-green-700  border-green-200",
  card:          "bg-blue-50   text-blue-700   border-blue-200",
  bank_transfer: "bg-purple-50 text-purple-700 border-purple-200",
  insurance:     "bg-amber-50  text-amber-700  border-amber-200",
};

const PaymentRow = memo(function PaymentRow({ pay }: { pay: PaymentRecord }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-payment-${pay.id}`}>
      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(pay.payment_date)}</td>
      <td className="p-3 font-mono text-sm font-semibold text-green-600">{fmtMoney(pay.amount)}</td>
      <td className="p-3">
        <Badge variant="outline" className={`text-xs ${PAY_METHOD_CLASS[pay.payment_method] ?? ""}`}>
          {PAYMENT_METHOD_LABELS[pay.payment_method] ?? pay.payment_method}
        </Badge>
      </td>
      <td className="p-3 text-sm">{pay.treasury_name}</td>
      <td className="p-3 text-sm text-muted-foreground">{pay.department_name}</td>
      <td className="p-3 font-mono text-xs text-muted-foreground">{pay.invoice_number}</td>
      <td className="p-3 text-xs text-muted-foreground">{pay.reference_number ?? "—"}</td>
    </tr>
  );
});

export const PaymentsTab = memo(function PaymentsTab({ patientId, active }: Props) {
  const { data, isLoading, isError } = usePatientPayments(patientId, active);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <div className="text-center py-8 text-red-500 text-sm">حدث خطأ أثناء تحميل المدفوعات</div>;
  }

  const payments: PaymentRecord[] = data ?? [];

  if (payments.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد مدفوعات</div>;
  }

  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-4 py-2">
          <Banknote className="h-4 w-4" />
          <span className="text-sm font-semibold">إجمالي المدفوعات: {fmtMoney(totalPaid)}</span>
          <span className="text-xs opacity-70">({payments.length} دفعة)</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
              <th className="p-3 text-right whitespace-nowrap">التاريخ</th>
              <th className="p-3 text-center">المبلغ</th>
              <th className="p-3 text-right">طريقة الدفع</th>
              <th className="p-3 text-right">الخزنة</th>
              <th className="p-3 text-right">القسم</th>
              <th className="p-3 text-right">رقم الفاتورة</th>
              <th className="p-3 text-right">المرجع</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => <PaymentRow key={p.id} pay={p} />)}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-semibold text-sm border-t-2">
              <td className="p-3" colSpan={1}>الإجمالي</td>
              <td className="p-3 text-center font-mono text-green-600">{fmtMoney(totalPaid)}</td>
              <td className="p-3" colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});
