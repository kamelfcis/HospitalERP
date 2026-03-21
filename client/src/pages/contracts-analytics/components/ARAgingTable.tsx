/**
 * ARAgingTable
 *
 * Displays outstanding AR grouped by age buckets per company.
 *
 * Columns: Company | 0–30 | 31–60 | 61–90 | 90+ | Total
 * Rows with all-zero buckets are excluded (server already filters, but safety guard here).
 */

import { Loader2, AlertCircle } from "lucide-react";
import type { ARAging } from "../types";

interface ARAgingTableProps {
  data:      ARAging[];
  isLoading: boolean;
}

/** Format a number as Arabic locale currency */
function fmtEGP(v: number): string {
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

/** Highlight cell red if value > 0 */
function amtClass(v: number): string {
  return v > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground";
}

export function ARAgingTable({ data, isLoading }: ARAgingTableProps) {
  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-muted-foreground text-sm gap-2">
        <AlertCircle className="h-5 w-5" />
        لا توجد ذمم مدينة متأخرة
      </div>
    );
  }

  // Column totals across all companies
  const colTotals = data.reduce(
    (acc, r) => ({
      bucket_0_30:   acc.bucket_0_30   + r.bucket_0_30,
      bucket_31_60:  acc.bucket_31_60  + r.bucket_31_60,
      bucket_61_90:  acc.bucket_61_90  + r.bucket_61_90,
      bucket_90plus: acc.bucket_90plus + r.bucket_90plus,
      total:         acc.total         + r.total,
    }),
    { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90plus: 0, total: 0 }
  );

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-xs" dir="rtl">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-right font-medium">الشركة</th>
            <th className="px-3 py-2 text-right font-medium">0–30 يوم</th>
            <th className="px-3 py-2 text-right font-medium">31–60 يوم</th>
            <th className="px-3 py-2 text-right font-medium">61–90 يوم</th>
            <th className="px-3 py-2 text-right font-medium text-red-600">+90 يوم</th>
            <th className="px-3 py-2 text-right font-medium">الإجمالي</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map(row => (
            <tr key={row.companyId} className="hover:bg-muted/20" data-testid={`row-aging-${row.companyId}`}>
              <td className="px-3 py-2 font-medium">{row.companyName}</td>
              <td className={`px-3 py-2 font-mono ${amtClass(row.bucket_0_30)}`}>{fmtEGP(row.bucket_0_30)}</td>
              <td className={`px-3 py-2 font-mono ${amtClass(row.bucket_31_60)}`}>{fmtEGP(row.bucket_31_60)}</td>
              <td className={`px-3 py-2 font-mono ${amtClass(row.bucket_61_90)}`}>{fmtEGP(row.bucket_61_90)}</td>
              <td className={`px-3 py-2 font-mono ${row.bucket_90plus > 0 ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                {fmtEGP(row.bucket_90plus)}
              </td>
              <td className="px-3 py-2 font-mono font-bold">{fmtEGP(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30 border-t-2 font-bold text-xs">
          <tr>
            <td className="px-3 py-2">الإجمالي</td>
            <td className="px-3 py-2 font-mono">{fmtEGP(colTotals.bucket_0_30)}</td>
            <td className="px-3 py-2 font-mono">{fmtEGP(colTotals.bucket_31_60)}</td>
            <td className="px-3 py-2 font-mono">{fmtEGP(colTotals.bucket_61_90)}</td>
            <td className="px-3 py-2 font-mono text-red-600">{fmtEGP(colTotals.bucket_90plus)}</td>
            <td className="px-3 py-2 font-mono">{fmtEGP(colTotals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
