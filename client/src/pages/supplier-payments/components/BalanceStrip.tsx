import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/formatters";
import { Loader2 } from "lucide-react";

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

interface BalanceResult {
  openingBalance: string;
  totalInvoiced:  string;
  totalReturns:   string;
  totalPaid:      string;
  currentBalance: string;
}

export function BalanceStrip({ supplierId }: { supplierId: string }) {
  const { data, isLoading } = useQuery<BalanceResult>({
    queryKey: ["/api/supplier-payments/balance", supplierId],
    queryFn:  async () => {
      const r = await fetch(`/api/supplier-payments/balance/${supplierId}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل الرصيد");
      return r.json();
    },
    enabled: !!supplierId,
    staleTime: 10_000,
  });

  if (isLoading) return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> جارٍ تحميل الرصيد...
    </span>
  );
  if (!data) return null;

  const bal = parseFloat(data.currentBalance);

  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      <span className="text-muted-foreground">
        ذمم: <strong>{formatCurrency(data.totalInvoiced)}</strong>
      </span>
      {parseFloat(data.totalReturns) > 0 && (
        <span className="text-orange-600 dark:text-orange-400">
          مرتجع: <strong>{formatCurrency(data.totalReturns)}</strong>
        </span>
      )}
      <span className="text-green-600 dark:text-green-400">
        مسدد: <strong>{formatCurrency(data.totalPaid)}</strong>
      </span>
      <span className={cx(
        "font-bold",
        bal > 0 ? "text-red-600" : bal < 0 ? "text-blue-600" : "text-green-600"
      )} data-testid="balance-current">
        رصيد: {formatCurrency(data.currentBalance)}
      </span>
    </div>
  );
}
