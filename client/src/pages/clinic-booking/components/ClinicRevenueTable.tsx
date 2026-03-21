/**
 * ClinicRevenueTable.tsx
 *
 * Shared compact table — shows per-payment-type revenue breakdown.
 * Render-only component; receives data via props (no fetch inside).
 */

import type { PaymentBreakdownRow } from "../hooks/useOutpatientDashboard";

const TYPE_LABELS: Record<string, string> = {
  CASH:      "نقدي",
  INSURANCE: "تأمين",
  CONTRACT:  "تعاقد",
};

const TYPE_COLORS: Record<string, string> = {
  CASH:      "text-emerald-700 dark:text-emerald-400",
  INSURANCE: "text-blue-700 dark:text-blue-400",
  CONTRACT:  "text-violet-700 dark:text-violet-400",
};

function fmt(n: number) {
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  rows: PaymentBreakdownRow[];
  grossTotal: number;
  paidTotal: number;
}

export function ClinicRevenueTable({ rows, grossTotal, paidTotal }: Props) {
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-revenue-empty">
        لا توجد مدفوعات اليوم
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border" data-testid="table-revenue">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border text-muted-foreground">
            <th className="text-right px-3 py-2 font-medium">طريقة الدفع</th>
            <th className="text-center px-3 py-2 font-medium">عدد</th>
            <th className="text-left px-3 py-2 font-medium">إجمالي</th>
            <th className="text-left px-3 py-2 font-medium">محصّل</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.paymentType}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              data-testid={`row-revenue-${row.paymentType}`}
            >
              <td className={`px-3 py-2 font-medium ${TYPE_COLORS[row.paymentType] ?? ""}`}>
                {TYPE_LABELS[row.paymentType] ?? row.paymentType}
              </td>
              <td className="px-3 py-2 text-center text-foreground">
                {row.count}
              </td>
              <td className="px-3 py-2 text-left text-foreground ltr">
                {fmt(row.grossAmount)}
              </td>
              <td className="px-3 py-2 text-left text-foreground ltr">
                {fmt(row.paidAmount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/50 border-t border-border font-semibold">
            <td className="px-3 py-2 text-foreground" colSpan={2}>الإجمالي</td>
            <td className="px-3 py-2 text-left text-foreground ltr" data-testid="text-revenue-gross-total">
              {fmt(grossTotal)}
            </td>
            <td className="px-3 py-2 text-left text-foreground ltr" data-testid="text-revenue-paid-total">
              {fmt(paidTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
