import { memo } from "react";
import { Loader2, TrendingDown, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { fmtDate, fmtMoney } from "../shared/formatters";
import type { AggregatedViewData, FinancialSummary } from "../shared/types";

interface Props {
  aggregated: AggregatedViewData | undefined;
  financial: FinancialSummary | undefined;
  isLoading: boolean;
  patientName: string;
}

function StatRow({ label, value, valueClass, sub }: { label: string; value: number; valueClass?: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-left">
        <span className={`font-mono font-semibold text-base ${valueClass ?? ""}`}>{fmtMoney(value)}</span>
        {sub && <div className="text-xs text-muted-foreground text-left">{sub}</div>}
      </div>
    </div>
  );
}

export const StatementTab = memo(function StatementTab({ aggregated, financial, isLoading, patientName }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!aggregated || !financial) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بيانات كافية</div>;
  }

  const totals = aggregated.totals;
  const isSettled = totals.remaining <= 0.01;

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      <div className="border-b pb-3">
        <h3 className="font-semibold text-base">{patientName}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">كشف حساب إجمالي · {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div className="rounded-lg border p-5 space-y-1">
        <StatRow label="إجمالي الفواتير" value={totals.totalAmount} sub={`${totals.invoiceCount} فاتورة`} />
        <StatRow label="إجمالي الخصومات" value={totals.discountAmount} valueClass="text-purple-700" />
        <StatRow label="الصافي المستحق" value={totals.netAmount} valueClass="font-bold" />
        <div className="h-1 border-t my-1" />
        <StatRow label="إجمالي المدفوع" value={totals.paidAmount} valueClass="text-green-700" />
        <div className="py-3 border-b last:border-0">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">الرصيد المتبقي</span>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${isSettled ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              {isSettled
                ? <CheckCircle className="h-4 w-4" />
                : <AlertCircle className="h-4 w-4" />
              }
              <span className="font-mono font-bold text-lg">{fmtMoney(totals.remaining)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-5">
        <h4 className="font-semibold text-sm mb-3">تفصيل حسب الزيارة</h4>
        <div className="space-y-2">
          {aggregated.byVisit.map(v => (
            <div key={v.visitKey} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
              <div>
                <div className="font-medium">{v.visitLabel}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(v.visitDate)} · {v.invoiceCount} فاتورة</div>
              </div>
              <div className="text-left">
                <div className="font-mono font-semibold">{fmtMoney(v.netAmount)}</div>
                {v.remaining > 0.01 && (
                  <div className="text-xs text-red-600 font-mono">متبقي: {fmtMoney(v.remaining)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-5">
        <h4 className="font-semibold text-sm mb-3">تفصيل حسب القسم</h4>
        <div className="space-y-2">
          {aggregated.byDepartment.map(d => (
            <div key={d.departmentId ?? "none"} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
              <span>{d.departmentName}</span>
              <span className="font-mono font-semibold">{fmtMoney(d.netAmount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
