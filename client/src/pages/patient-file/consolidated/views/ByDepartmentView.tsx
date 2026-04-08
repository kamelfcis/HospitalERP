import { memo } from "react";
import { Building2 } from "lucide-react";
import { fmtMoney } from "../../shared/formatters";
import type { DepartmentGroup } from "../../shared/types";

interface Props {
  departments: DepartmentGroup[];
  showPaid: boolean;
}

const DeptRow = memo(function DeptRow({ dept, showPaid }: { dept: DepartmentGroup; showPaid: boolean }) {
  const hasBalance = dept.remaining > 0.01;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-dept-${dept.departmentId ?? "none"}`}>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="font-medium text-sm">{dept.departmentName}</span>
        </div>
      </td>
      <td className="p-3 text-center text-sm">{dept.invoiceCount}</td>
      <td className="p-3 text-center font-mono text-sm">{fmtMoney(dept.totalAmount)}</td>
      <td className="p-3 text-center font-mono text-sm text-purple-600">
        {dept.discountAmount > 0 ? `(${fmtMoney(dept.discountAmount)})` : "—"}
      </td>
      <td className="p-3 text-center font-mono text-sm font-semibold">{fmtMoney(dept.netAmount)}</td>
      {showPaid && (
        <>
          <td className="p-3 text-center font-mono text-sm text-green-600">{fmtMoney(dept.paidAmount)}</td>
          <td className={`p-3 text-center font-mono text-sm font-semibold ${hasBalance ? "text-red-600" : "text-green-600"}`}>
            {fmtMoney(dept.remaining)}
          </td>
        </>
      )}
    </tr>
  );
});

export const ByDepartmentView = memo(function ByDepartmentView({ departments, showPaid }: Props) {
  if (departments.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد أقسام</div>;
  }

  const totalNet  = departments.reduce((s, d) => s + d.netAmount, 0);
  const totalPaid = departments.reduce((s, d) => s + d.paidAmount, 0);
  const totalRem  = departments.reduce((s, d) => s + d.remaining, 0);

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" dir="rtl">
        <thead>
          <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
            <th className="p-3 text-right">القسم</th>
            <th className="p-3 text-center">الفواتير</th>
            <th className="p-3 text-center">الإجمالي</th>
            <th className="p-3 text-center">الخصم</th>
            <th className="p-3 text-center">الصافي</th>
            {showPaid && <><th className="p-3 text-center">المدفوع</th><th className="p-3 text-center">المتبقي</th></>}
          </tr>
        </thead>
        <tbody>
          {departments.map(d => <DeptRow key={d.departmentId ?? "none"} dept={d} showPaid={showPaid} />)}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-semibold text-sm border-t-2">
            <td className="p-3" colSpan={2}>الإجمالي</td>
            <td className="p-3 text-center font-mono">{fmtMoney(departments.reduce((s,d)=>s+d.totalAmount,0))}</td>
            <td className="p-3 text-center font-mono text-purple-600">({fmtMoney(departments.reduce((s,d)=>s+d.discountAmount,0))})</td>
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
