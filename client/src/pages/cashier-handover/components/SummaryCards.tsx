import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, CreditCard, Undo2, TrendingUp, Vault, Truck } from "lucide-react";

interface HandoverTotals {
  totalCashSales: number;
  totalCreditSales: number;
  totalDeliveryCollected?: number;
  totalSalesInvoiceCount: number;
  totalReturns: number;
  totalReturnInvoiceCount: number;
  totalNet: number;
  totalTransferredToTreasury: number;
  rowCount: number;
}

interface SummaryCardsProps {
  totals: HandoverTotals;
}

function fmt(n: number) {
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ج.م";
}

export function SummaryCards({ totals }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4" dir="rtl">
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <Banknote className="h-3.5 w-3.5" />
            البيع النقدي
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="card-cash-sales">
            {fmt(totals.totalCashSales)}
          </p>
          <p className="text-xs text-muted-foreground">{totals.totalSalesInvoiceCount} فاتورة</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <CreditCard className="h-3.5 w-3.5" />
            البيع الآجل/التعاقد
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400" data-testid="card-credit-sales">
            {fmt(totals.totalCreditSales)}
          </p>
        </CardContent>
      </Card>

      {(totals.totalDeliveryCollected ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              تحصيل التوصيل
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400" data-testid="card-delivery-collected">
              {fmt(totals.totalDeliveryCollected ?? 0)}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <Undo2 className="h-3.5 w-3.5" />
            إجمالي المرتجع
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="text-lg font-bold text-red-600 dark:text-red-400" data-testid="card-returns">
            {fmt(totals.totalReturns)}
          </p>
          <p className="text-xs text-muted-foreground">{totals.totalReturnInvoiceCount} مرتجع</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            الصافي
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="text-lg font-bold" data-testid="card-net">
            {fmt(totals.totalNet)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <Vault className="h-3.5 w-3.5" />
            محوّل للخزنة
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="text-lg font-bold text-violet-600 dark:text-violet-400" data-testid="card-treasury">
            {fmt(totals.totalTransferredToTreasury)}
          </p>
          <p className="text-xs text-muted-foreground">{totals.rowCount} وردية</p>
        </CardContent>
      </Card>
    </div>
  );
}
