/**
 * ControlAlerts
 *
 * Displays operational alert flags as a plain table.
 * No complex UI — just severity + message.
 *
 * Flag types:
 *   high_rejection  — insurer is rejecting too many claims
 *   high_outstanding — large uncollected balance
 *   high_writeoff    — excessive write-offs
 */

import { Loader2, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import type { ControlFlag } from "../types";

interface ControlAlertsProps {
  data:      ControlFlag[];
  isLoading: boolean;
}

const FLAG_LABELS: Record<ControlFlag["type"], string> = {
  high_rejection:   "رفض مرتفع",
  high_outstanding: "متأخرات مرتفعة",
  high_writeoff:    "شطب مرتفع",
};

export function ControlAlerts({ data, isLoading }: ControlAlertsProps) {
  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-700 text-sm py-4">
        <CheckCircle2 className="h-4 w-4" />
        لا توجد تنبيهات — كل شيء ضمن الحدود الطبيعية
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-xs" dir="rtl">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-right font-medium w-6">⚠</th>
            <th className="px-3 py-2 text-right font-medium">النوع</th>
            <th className="px-3 py-2 text-right font-medium">الشركة</th>
            <th className="px-3 py-2 text-right font-medium">الرسالة</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((flag, i) => (
            <tr
              key={`${flag.companyId}-${flag.type}-${i}`}
              className={flag.severity === "error" ? "bg-red-50/60" : "bg-orange-50/40"}
              data-testid={`row-flag-${flag.companyId}-${flag.type}`}
            >
              <td className="px-3 py-2">
                {flag.severity === "error"
                  ? <AlertCircle  className="h-4 w-4 text-red-600" />
                  : <AlertTriangle className="h-4 w-4 text-orange-500" />}
              </td>
              <td className="px-3 py-2 font-medium">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  flag.severity === "error" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                }`}>
                  {FLAG_LABELS[flag.type] ?? flag.type}
                </span>
              </td>
              <td className="px-3 py-2">{flag.companyName}</td>
              <td className="px-3 py-2 text-muted-foreground">{flag.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
