import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Building2, Bed, UserRound, Minus } from "lucide-react";
import { fmtDate, fmtMoney, VISIT_TYPE_LABELS } from "../../shared/formatters";
import type { VisitGroup } from "../../shared/types";

interface Props {
  visits: VisitGroup[];
  showPaid: boolean;
}

function VisitTypeIcon({ type }: { type: VisitGroup["visitType"] }) {
  if (type === "inpatient")  return <Bed className="h-4 w-4 text-green-600 shrink-0" />;
  if (type === "outpatient") return <UserRound className="h-4 w-4 text-blue-600 shrink-0" />;
  return <Minus className="h-4 w-4 text-gray-400 shrink-0" />;
}

const VisitRow = memo(function VisitRow({ visit, showPaid }: { visit: VisitGroup; showPaid: boolean }) {
  const hasBalance = visit.remaining > 0.01;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-visit-${visit.visitKey}`}>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <VisitTypeIcon type={visit.visitType} />
          <div>
            <div className="font-medium text-sm">{visit.visitLabel}</div>
            <div className="text-xs text-muted-foreground">{fmtDate(visit.visitDate)}</div>
          </div>
        </div>
      </td>
      <td className="p-3">
        <Badge variant="outline" className="text-xs">
          {VISIT_TYPE_LABELS[visit.visitType] ?? visit.visitType}
        </Badge>
      </td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          {visit.departments.slice(0, 3).map(d => (
            <Badge key={d} variant="secondary" className="text-xs gap-1">
              <Building2 className="h-2.5 w-2.5" />
              {d}
            </Badge>
          ))}
          {visit.departments.length > 3 && (
            <Badge variant="secondary" className="text-xs">+{visit.departments.length - 3}</Badge>
          )}
        </div>
      </td>
      <td className="p-3 text-center text-sm">{visit.invoiceCount}</td>
      <td className="p-3 text-center font-mono text-sm">{fmtMoney(visit.totalAmount)}</td>
      {visit.discountAmount > 0 && (
        <td className="p-3 text-center font-mono text-sm text-purple-600">({fmtMoney(visit.discountAmount)})</td>
      )}
      <td className="p-3 text-center font-mono text-sm font-semibold">{fmtMoney(visit.netAmount)}</td>
      {showPaid && (
        <>
          <td className="p-3 text-center font-mono text-sm text-green-600">{fmtMoney(visit.paidAmount)}</td>
          <td className={`p-3 text-center font-mono text-sm font-semibold ${hasBalance ? "text-red-600" : "text-green-600"}`}>
            {fmtMoney(visit.remaining)}
          </td>
        </>
      )}
    </tr>
  );
});

export const ByVisitView = memo(function ByVisitView({ visits, showPaid }: Props) {
  if (visits.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد زيارات</div>;
  }

  const hasDiscount = visits.some(v => v.discountAmount > 0);

  const totalNet  = visits.reduce((s, v) => s + v.netAmount, 0);
  const totalPaid = visits.reduce((s, v) => s + v.paidAmount, 0);
  const totalRem  = visits.reduce((s, v) => s + v.remaining, 0);

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" dir="rtl">
        <thead>
          <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
            <th className="p-3 text-right">الزيارة</th>
            <th className="p-3 text-center">النوع</th>
            <th className="p-3 text-right">الأقسام</th>
            <th className="p-3 text-center">الفواتير</th>
            <th className="p-3 text-center">الإجمالي</th>
            {hasDiscount && <th className="p-3 text-center">الخصم</th>}
            <th className="p-3 text-center">الصافي</th>
            {showPaid && <><th className="p-3 text-center">المدفوع</th><th className="p-3 text-center">المتبقي</th></>}
          </tr>
        </thead>
        <tbody>
          {visits.map(v => <VisitRow key={v.visitKey} visit={v} showPaid={showPaid} />)}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-semibold text-sm border-t-2">
            <td className="p-3" colSpan={4}>الإجمالي</td>
            <td className="p-3 text-center font-mono">{fmtMoney(visits.reduce((s,v)=>s+v.totalAmount,0))}</td>
            {hasDiscount && <td className="p-3 text-center font-mono text-purple-600">({fmtMoney(visits.reduce((s,v)=>s+v.discountAmount,0))})</td>}
            <td className="p-3 text-center font-mono">{fmtMoney(totalNet)}</td>
            {showPaid && (
              <>
                <td className="p-3 text-center font-mono text-green-600">{fmtMoney(totalPaid)}</td>
                <td className={`p-3 text-center font-mono ${totalRem > 0.01 ? "text-red-600" : "text-green-600"}`}>{fmtMoney(totalRem)}</td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
});
