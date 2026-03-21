/**
 * ReconciliationTable
 *
 * Displays claimed vs approved vs settled per line with variance.
 * Used in a panel/tab within the batch detail view.
 */

import { Loader2, AlertCircle, TrendingDown } from "lucide-react";
import type { BatchReconciliation } from "../hooks/useClaimSettlement";

interface ReconciliationTableProps {
  data:      BatchReconciliation | undefined;
  isLoading: boolean;
}

function fmt(v: number) {
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

const STATUS_LABELS: Record<string, string> = {
  pending:  "معلّق",
  approved: "مقبول",
  rejected: "مرفوض",
  settled:  "مُسوَّى",
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  settled:  "bg-blue-100 text-blue-700",
};

export function ReconciliationTable({ data, isLoading }: ReconciliationTableProps) {
  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Totals summary */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-muted/30 rounded p-2 text-center">
          <div className="text-muted-foreground mb-0.5">الفرق (مطالبة − معتمد)</div>
          <div className={`font-bold ${data.totalVariance > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
            {fmt(data.totalVariance)} ج.م
          </div>
        </div>
        <div className="bg-muted/30 rounded p-2 text-center">
          <div className="text-muted-foreground mb-0.5">شطب</div>
          <div className="font-bold text-red-600">{fmt(data.totalWriteoff)} ج.م</div>
        </div>
        <div className="bg-muted/30 rounded p-2 text-center">
          <div className="text-muted-foreground mb-0.5">متبقي للتحصيل</div>
          <div className={`font-bold ${data.totalOutstanding > 0 ? "text-orange-600" : "text-green-700"}`}>
            {fmt(data.totalOutstanding)} ج.م
          </div>
        </div>
      </div>

      {/* Lines table */}
      {data.lines.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-muted-foreground text-sm gap-2">
          <AlertCircle className="h-5 w-5" />
          لا توجد بيانات للمطابقة
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-xs" dir="rtl">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-right">الخدمة</th>
                <th className="px-2 py-1.5 text-right">التاريخ</th>
                <th className="px-2 py-1.5 text-right">المطالَب</th>
                <th className="px-2 py-1.5 text-right">المعتمد</th>
                <th className="px-2 py-1.5 text-right">الفرق</th>
                <th className="px-2 py-1.5 text-right">المُسوَّى</th>
                <th className="px-2 py-1.5 text-right">متبقي</th>
                <th className="px-2 py-1.5 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.lines.map(line => (
                <tr key={line.claimLineId} className="hover:bg-muted/20">
                  <td className="px-2 py-1.5 max-w-[180px] truncate" title={line.serviceDescription}>
                    {line.serviceDescription}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                    {line.serviceDate}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{fmt(line.claimedAmount)}</td>
                  <td className="px-2 py-1.5 font-mono text-green-700">{fmt(line.approvedAmount)}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {line.variance !== 0 ? (
                      <span className={`flex items-center gap-0.5 ${line.variance > 0 ? "text-orange-600" : "text-green-700"}`}>
                        <TrendingDown className="h-3 w-3" />
                        {fmt(Math.abs(line.variance))}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-blue-700">{fmt(line.settledAmount)}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {line.outstanding > 0.005
                      ? <span className="text-orange-600">{fmt(line.outstanding)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[line.status] ?? ""}`}>
                      {STATUS_LABELS[line.status] ?? line.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
