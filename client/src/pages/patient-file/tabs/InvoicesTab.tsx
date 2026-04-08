import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, ExternalLink } from "lucide-react";
import { fmtDate, fmtMoney, STATUS_LABELS } from "../shared/formatters";
import type { AggregatedInvoice } from "../shared/types";

interface Props {
  invoices: AggregatedInvoice[];
  isLoading: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  draft:     "bg-amber-50 text-amber-700 border-amber-200",
  finalized: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50   text-red-700   border-red-200",
};

const InvoiceRow = memo(function InvoiceRow({ inv }: { inv: AggregatedInvoice }) {
  const hasBalance = inv.remaining > 0.01;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-invoice-${inv.id}`}>
      <td className="p-3">
        <div className="flex items-center gap-1.5">
          <a
            href={`/patient-invoices/${inv.id}`}
            className="font-mono text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            data-testid={`link-invoice-${inv.id}`}
          >
            {inv.invoiceNumber}
            <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
          {inv.isConsolidated && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">مجمّعة</Badge>
          )}
        </div>
      </td>
      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
      <td className="p-3">
        <div className="flex items-center gap-1 text-sm">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {inv.departmentName}
        </div>
      </td>
      <td className="p-3">
        <Badge variant="outline" className={`text-xs ${STATUS_BADGE[inv.status] ?? ""}`}>
          {STATUS_LABELS[inv.status]?.label ?? inv.status}
        </Badge>
      </td>
      <td className="p-3 text-center font-mono text-sm">{fmtMoney(inv.totalAmount)}</td>
      <td className="p-3 text-center font-mono text-sm text-purple-600">
        {inv.discountAmount > 0 ? `(${fmtMoney(inv.discountAmount)})` : "—"}
      </td>
      <td className="p-3 text-center font-mono text-sm font-semibold">{fmtMoney(inv.netAmount)}</td>
      <td className="p-3 text-center font-mono text-sm text-green-600">{fmtMoney(inv.paidAmount)}</td>
      <td className={`p-3 text-center font-mono text-sm font-semibold ${hasBalance ? "text-red-600" : "text-green-600"}`}>
        {fmtMoney(inv.remaining)}
      </td>
    </tr>
  );
});

export const InvoicesTab = memo(function InvoicesTab({ invoices, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد فواتير</div>;
  }

  const totalNet  = invoices.reduce((s, i) => s + i.netAmount, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalRem  = invoices.reduce((s, i) => s + i.remaining, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">{invoices.length} فاتورة</div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
              <th className="p-3 text-right whitespace-nowrap">رقم الفاتورة</th>
              <th className="p-3 text-right whitespace-nowrap">التاريخ</th>
              <th className="p-3 text-right">القسم</th>
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3 text-center">الإجمالي</th>
              <th className="p-3 text-center">الخصم</th>
              <th className="p-3 text-center">الصافي</th>
              <th className="p-3 text-center">المدفوع</th>
              <th className="p-3 text-center">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => <InvoiceRow key={inv.id} inv={inv} />)}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-semibold text-sm border-t-2">
              <td className="p-3" colSpan={4}>الإجمالي ({invoices.length} فاتورة)</td>
              <td className="p-3 text-center font-mono">{fmtMoney(invoices.reduce((s,i)=>s+i.totalAmount,0))}</td>
              <td className="p-3 text-center font-mono text-purple-600">({fmtMoney(invoices.reduce((s,i)=>s+i.discountAmount,0))})</td>
              <td className="p-3 text-center font-mono">{fmtMoney(totalNet)}</td>
              <td className="p-3 text-center font-mono text-green-600">{fmtMoney(totalPaid)}</td>
              <td className={`p-3 text-center font-mono ${totalRem > 0.01 ? "text-red-600" : "text-green-600"}`}>{fmtMoney(totalRem)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});
