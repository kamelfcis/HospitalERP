/**
 * VarianceTable
 *
 * Per-batch claimed vs approved variance.
 * Sorted by variance descending (highest loss first).
 * Variance% > 20% highlighted in orange.
 */

import { Loader2, AlertCircle } from "lucide-react";
import type { ClaimVariance } from "../types";

interface VarianceTableProps {
  data:      ClaimVariance[];
  isLoading: boolean;
}

function fmtEGP(v: number): string {
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

function variancePctColor(pct: number): string {
  if (pct > 30) return "text-red-600 font-bold";
  if (pct > 20) return "text-orange-600 font-semibold";
  return "text-muted-foreground";
}

export function VarianceTable({ data, isLoading }: VarianceTableProps) {
  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-muted-foreground text-sm gap-2">
        <AlertCircle className="h-5 w-5" />
        لا توجد دفعات
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-xs" dir="rtl">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-right font-medium">رقم الدفعة</th>
            <th className="px-3 py-2 text-right font-medium">الشركة</th>
            <th className="px-3 py-2 text-right font-medium">التاريخ</th>
            <th className="px-3 py-2 text-right font-medium">المطالب به</th>
            <th className="px-3 py-2 text-right font-medium text-green-700">المعتمد</th>
            <th className="px-3 py-2 text-right font-medium text-orange-600">الفرق</th>
            <th className="px-3 py-2 text-right font-medium">نسبة الفرق %</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map(row => (
            <tr key={row.batchId} className="hover:bg-muted/20" data-testid={`row-variance-${row.batchId}`}>
              <td className="px-3 py-2 font-mono font-medium">{row.batchNumber}</td>
              <td className="px-3 py-2">{row.companyName}</td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.batchDate}</td>
              <td className="px-3 py-2 font-mono">{fmtEGP(row.totalClaimed)}</td>
              <td className="px-3 py-2 font-mono text-green-700">{fmtEGP(row.totalApproved)}</td>
              <td className="px-3 py-2 font-mono text-orange-600 font-semibold">
                {row.variance > 0 ? fmtEGP(row.variance) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className={`px-3 py-2 font-mono ${variancePctColor(row.variancePct)}`}>
                {row.variancePct > 0 ? `${row.variancePct.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
