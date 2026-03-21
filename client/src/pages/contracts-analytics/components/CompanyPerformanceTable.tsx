/**
 * CompanyPerformanceTable
 *
 * Per-company claim summary: claimed / approved / settled / outstanding / rejection %.
 * Rejection rate > 30% highlighted in orange; > 50% in red.
 */

import { Loader2, AlertCircle } from "lucide-react";
import type { CompanyPerformance } from "../types";

interface CompanyPerformanceTableProps {
  data:      CompanyPerformance[];
  isLoading: boolean;
}

function fmtEGP(v: number): string {
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

function rejectionColor(pct: number): string {
  if (pct > 50) return "text-red-600 font-bold";
  if (pct > 30) return "text-orange-600 font-semibold";
  return "text-muted-foreground";
}

export function CompanyPerformanceTable({ data, isLoading }: CompanyPerformanceTableProps) {
  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-muted-foreground text-sm gap-2">
        <AlertCircle className="h-5 w-5" />
        لا توجد بيانات للشركات
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-xs" dir="rtl">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-right font-medium">الشركة</th>
            <th className="px-3 py-2 text-right font-medium">المطالب به</th>
            <th className="px-3 py-2 text-right font-medium text-green-700">المعتمد</th>
            <th className="px-3 py-2 text-right font-medium text-blue-700">المُسوَّى</th>
            <th className="px-3 py-2 text-right font-medium text-orange-600">المتبقي</th>
            <th className="px-3 py-2 text-right font-medium">نسبة الرفض %</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map(row => (
            <tr key={row.companyId} className="hover:bg-muted/20" data-testid={`row-perf-${row.companyId}`}>
              <td className="px-3 py-2 font-medium">{row.companyName}</td>
              <td className="px-3 py-2 font-mono">{fmtEGP(row.totalClaimed)}</td>
              <td className="px-3 py-2 font-mono text-green-700">{fmtEGP(row.totalApproved)}</td>
              <td className="px-3 py-2 font-mono text-blue-700">{fmtEGP(row.totalSettled)}</td>
              <td className="px-3 py-2 font-mono text-orange-600 font-semibold">{fmtEGP(row.totalOutstanding)}</td>
              <td className={`px-3 py-2 font-mono ${rejectionColor(row.rejectionRate)}`}>
                {row.rejectionRate.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
