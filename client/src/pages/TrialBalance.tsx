import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Printer, Calendar, CheckCircle, AlertCircle } from "lucide-react";
import { formatCurrency, formatDateShort, accountTypeLabels } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Account } from "@shared/schema";

interface TrialBalanceItem {
  account: Account;
  debitBalance: string;
  creditBalance: string;
}

interface TrialBalanceData {
  items: TrialBalanceItem[];
  totalDebit: string;
  totalCredit: string;
  asOfDate: string;
  isBalanced: boolean;
}

export default function TrialBalance() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: trialBalance, isLoading } = useQuery<TrialBalanceData>({
    queryKey: ["/api/reports/trial-balance", asOfDate],
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const getAccountTypeBadgeColor = (type: string) => {
    switch (type) {
      case "asset":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
      case "liability":
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
      case "equity":
        return "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800";
      case "revenue":
        return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800";
      case "expense":
        return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
      default:
        return "";
    }
  };

  return (
    <div className="p-3 space-y-3">
      {/* Page Header - Peachtree Toolbar Style */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground">ميزان المراجعة</h1>
          <p className="text-xs text-muted-foreground">
            أرصدة الحسابات في تاريخ محدد
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">حتى تاريخ:</span>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="peachtree-input w-[140px] text-xs"
              data-testid="input-as-of-date"
            />
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" data-testid="button-print">
            <Printer className="h-3 w-3 ml-1" />
            طباعة
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" data-testid="button-export">
            <Download className="h-3 w-3 ml-1" />
            تصدير
          </Button>
        </div>
      </div>

      {/* Balance Status - Compact */}
      {trialBalance && (
        <div className={`${trialBalance.isBalanced ? "peachtree-totals-balanced" : "peachtree-totals-unbalanced"} px-3 py-2 rounded flex items-center gap-2`}>
          {trialBalance.isBalanced ? (
            <>
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">ميزان المراجعة متوازن - إجمالي المدين يساوي إجمالي الدائن</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-xs font-semibold text-red-800 dark:text-red-300">ميزان المراجعة غير متوازن - هناك فرق بين إجمالي المدين وإجمالي الدائن</span>
            </>
          )}
        </div>
      )}

      {/* Trial Balance Table - Peachtree Grid Style */}
      <div className="peachtree-grid rounded overflow-hidden">
        <div className="peachtree-toolbar px-3 py-1.5 border-b">
          <span className="text-xs font-semibold">ميزان المراجعة في {formatDateShort(asOfDate)}</span>
        </div>
        <ScrollArea className="h-[calc(100vh-280px)]">
          <table className="w-full text-xs">
            <thead className="peachtree-grid-header sticky top-0">
              <tr>
                <th className="w-[80px] text-right">رقم الحساب</th>
                <th className="text-right">اسم الحساب</th>
                <th className="w-[80px] text-center">النوع</th>
                <th className="w-[120px] text-left">رصيد مدين</th>
                <th className="w-[120px] text-left">رصيد دائن</th>
              </tr>
            </thead>
            <tbody>
              {!trialBalance?.items || trialBalance.items.length === 0 ? (
                <tr className="peachtree-grid-row">
                  <td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">
                    لا توجد بيانات
                  </td>
                </tr>
              ) : (
                <>
                  {trialBalance.items.map((item) => (
                    <tr key={item.account.id} className="peachtree-grid-row" data-testid={`row-balance-${item.account.id}`}>
                      <td className="font-mono text-xs">{item.account.code}</td>
                      <td className="text-xs">{item.account.name}</td>
                      <td className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${getAccountTypeBadgeColor(item.account.accountType)}`}
                        >
                          {accountTypeLabels[item.account.accountType]}
                        </Badge>
                      </td>
                      <td className={`font-mono text-xs peachtree-amount ${parseFloat(item.debitBalance) > 0 ? "peachtree-amount-debit" : ""}`}>
                        {parseFloat(item.debitBalance) > 0 ? formatCurrency(item.debitBalance) : "-"}
                      </td>
                      <td className={`font-mono text-xs peachtree-amount ${parseFloat(item.creditBalance) > 0 ? "peachtree-amount-credit" : ""}`}>
                        {parseFloat(item.creditBalance) > 0 ? formatCurrency(item.creditBalance) : "-"}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </ScrollArea>
        
        {/* Totals Row - Peachtree Style */}
        {trialBalance?.items && trialBalance.items.length > 0 && (
          <div className={`peachtree-totals ${trialBalance.isBalanced ? "peachtree-totals-balanced" : "peachtree-totals-unbalanced"}`}>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="w-[80px] py-2 px-2"></td>
                  <td className="py-2 px-2 font-bold text-sm">الإجمالي</td>
                  <td className="w-[80px] py-2 px-2"></td>
                  <td className="w-[120px] py-2 px-2 font-mono font-bold text-sm peachtree-amount peachtree-amount-debit">
                    {formatCurrency(trialBalance.totalDebit)}
                  </td>
                  <td className="w-[120px] py-2 px-2 font-mono font-bold text-sm peachtree-amount peachtree-amount-credit">
                    {formatCurrency(trialBalance.totalCredit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
