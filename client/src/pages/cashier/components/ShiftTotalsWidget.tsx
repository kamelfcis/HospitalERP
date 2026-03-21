import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/formatters";
import type { ShiftTotals } from "../types";

interface ShiftTotalsWidgetProps {
  totals: ShiftTotals;
}

export function ShiftTotalsWidget({ totals }: ShiftTotalsWidgetProps) {
  return (
    <div className="fixed bottom-3 left-3 z-50" data-testid="widget-shift-totals">
      <Card className="w-56">
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="text-[10px] flex flex-row-reverse items-center gap-1">
            <Wallet className="h-3 w-3" />
            ملخص الوردية
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 space-y-0.5" dir="rtl">
          <div className="flex flex-row-reverse justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">التحصيل:</span>
            <span className="font-medium" data-testid="text-total-collected">{formatNumber(totals.totalCollected)}</span>
          </div>
          <div className="flex flex-row-reverse justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">المرتجعات:</span>
            <span className="font-medium text-red-600 dark:text-red-400" data-testid="text-total-refunded">{formatNumber(totals.totalRefunded)}</span>
          </div>
          <div className="flex flex-row-reverse justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">صافي التحصيل:</span>
            <span className="font-semibold text-primary" data-testid="text-net-collected">{formatNumber(totals.netCollected)}</span>
          </div>
          <div className="border-t pt-0.5 flex flex-row-reverse justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">إجمالي الخزنة:</span>
            <span className="font-bold" data-testid="text-net-cash">{formatNumber(totals.netCash)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
