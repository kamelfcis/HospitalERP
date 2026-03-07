import { CheckCircle, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { JournalTotals } from "./types";

interface Props {
  totals: JournalTotals;
}

export default function JournalTotalsBar({ totals }: Props) {
  return (
    <div
      className={`p-3 flex items-center justify-between ${
        totals.isBalanced
          ? "peachtree-totals peachtree-totals-balanced"
          : "peachtree-totals peachtree-totals-unbalanced"
      }`}
    >
      <div className="flex items-center gap-2">
        {totals.isBalanced ? (
          <>
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <span className="text-emerald-800 font-semibold">القيد متوازن</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-800 font-semibold">
              الفرق: {formatCurrency(totals.difference)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-8">
        <div className="text-left">
          <span className="text-xs text-muted-foreground ml-2">إجمالي المدين:</span>
          <span className="font-mono font-bold text-lg peachtree-amount-debit">
            {formatCurrency(totals.totalDebit)}
          </span>
        </div>
        <div className="text-left">
          <span className="text-xs text-muted-foreground ml-2">إجمالي الدائن:</span>
          <span className="font-mono font-bold text-lg peachtree-amount-credit">
            {formatCurrency(totals.totalCredit)}
          </span>
        </div>
      </div>
    </div>
  );
}
