import { formatCurrency } from "@/lib/formatters";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  headerDiscountPercent?: number;
  headerDiscountAmount?: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

interface TotalsSummaryCardProps {
  totals: Totals;
}

export function TotalsSummaryCard({ totals }: TotalsSummaryCardProps) {
  const hda = totals.headerDiscountAmount ?? 0;
  const hdp = totals.headerDiscountPercent ?? 0;

  return (
    <div className="flex flex-row-reverse flex-wrap items-center gap-3 text-sm flex-1">
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">الإجمالي:</span>
        <span className="font-bold text-xs" data-testid="text-footer-total">{formatCurrency(totals.totalAmount)}</span>
      </div>
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">خصم السطور:</span>
        <span className="font-bold text-xs" data-testid="text-footer-discount">{formatCurrency(totals.discountAmount)}</span>
      </div>
      {hda > 0 && (
        <div className="flex flex-row-reverse items-center gap-1">
          <span className="text-muted-foreground text-xs">
            خصم الفاتورة{hdp > 0 ? ` (${hdp}%)` : ""}:
          </span>
          <span
            className="font-bold text-xs text-orange-600 dark:text-orange-400"
            data-testid="text-footer-header-discount"
          >
            {formatCurrency(hda)}
          </span>
        </div>
      )}
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">الصافي:</span>
        <span className="font-bold text-xs" data-testid="text-footer-net">{formatCurrency(totals.netAmount)}</span>
      </div>
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">المدفوع:</span>
        <span className="font-bold text-xs" data-testid="text-footer-paid">{formatCurrency(totals.paidAmount)}</span>
      </div>
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">المتبقي:</span>
        <span
          className={`font-bold text-xs ${totals.remaining > 0 ? "text-destructive" : ""}`}
          data-testid="text-footer-remaining"
        >
          {formatCurrency(totals.remaining)}
        </span>
      </div>
    </div>
  );
}
