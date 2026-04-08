import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Receipt, Percent, Banknote, CheckCircle, AlertCircle } from "lucide-react";
import { fmtMoney } from "../shared/formatters";
import type { PatientFileTotals } from "../shared/types";

interface Props {
  totals: PatientFileTotals;
}

interface SummaryCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  sub?: string;
}

const SummaryCard = memo(function SummaryCard({ label, value, icon, colorClass, sub }: SummaryCardProps) {
  return (
    <Card className="flex-1 min-w-[160px]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${colorClass} shrink-0`}>{icon}</div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-lg font-bold leading-tight">{fmtMoney(value)}</span>
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export const ConsolidatedSummaryCards = memo(function ConsolidatedSummaryCards({ totals }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <SummaryCard
        label="إجمالي الفواتير"
        value={totals.totalAmount}
        icon={<Receipt className="h-4 w-4 text-blue-600" />}
        colorClass="bg-blue-50"
        sub={`${totals.invoiceCount} فاتورة`}
      />
      <SummaryCard
        label="إجمالي الخصومات"
        value={totals.discountAmount}
        icon={<Percent className="h-4 w-4 text-purple-600" />}
        colorClass="bg-purple-50"
      />
      <SummaryCard
        label="الصافي المستحق"
        value={totals.netAmount}
        icon={<Banknote className="h-4 w-4 text-green-600" />}
        colorClass="bg-green-50"
      />
      <SummaryCard
        label="إجمالي المدفوع"
        value={totals.paidAmount}
        icon={<CheckCircle className="h-4 w-4 text-emerald-600" />}
        colorClass="bg-emerald-50"
      />
      <SummaryCard
        label="المتبقي"
        value={totals.remaining}
        icon={<AlertCircle className="h-4 w-4 text-red-500" />}
        colorClass={totals.remaining > 0 ? "bg-red-50" : "bg-gray-50"}
        sub={totals.remaining <= 0 ? "مسدد بالكامل" : undefined}
      />
    </div>
  );
});
