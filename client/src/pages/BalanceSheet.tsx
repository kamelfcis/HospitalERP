import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Printer, Calendar, Building2, Wallet, Users } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

interface BalanceSheetItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  balance: string;
}

interface BalanceSheetData {
  assets: BalanceSheetItem[];
  liabilities: BalanceSheetItem[];
  equity: BalanceSheetItem[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  totalLiabilitiesAndEquity: string;
  asOfDate: string;
  isBalanced: boolean;
}

export default function BalanceSheet() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: balanceSheet, isLoading } = useQuery<BalanceSheetData>({
    queryKey: ["/api/reports/balance-sheet", asOfDate],
  });

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Page Header - Peachtree Toolbar Style */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">قائمة المركز المالي</h1>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">الأصول والخصوم وحقوق الملكية</span>
        </div>
        <div className="flex items-center gap-1">
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

      {/* Date Filter - Compact Toolbar */}
      <div className="peachtree-toolbar flex items-center gap-3">
        <Calendar className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium">في تاريخ:</span>
        <Input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="peachtree-input w-[140px]"
          data-testid="input-as-of-date"
        />
      </div>

      {/* Summary Row - Compact */}
      <div className="grid grid-cols-3 gap-2">
        <div className="peachtree-toolbar flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">إجمالي الأصول</span>
          </div>
          <span className="text-sm font-bold font-mono peachtree-amount text-primary">
            {formatCurrency(balanceSheet?.totalAssets || 0)}
          </span>
        </div>
        <div className="peachtree-toolbar flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-medium">إجمالي الخصوم</span>
          </div>
          <span className="text-sm font-bold font-mono peachtree-amount text-purple-600">
            {formatCurrency(balanceSheet?.totalLiabilities || 0)}
          </span>
        </div>
        <div className="peachtree-toolbar flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-medium">حقوق الملكية</span>
          </div>
          <span className="text-sm font-bold font-mono peachtree-amount text-indigo-600">
            {formatCurrency(balanceSheet?.totalEquity || 0)}
          </span>
        </div>
      </div>

      {/* Balance Sheet Details - Peachtree Grid */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-4">
          {/* Assets Section */}
          <div>
            <div className="flex items-center gap-2 mb-1 px-1">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold text-primary uppercase">الأصول</h3>
            </div>
            <table className="w-full peachtree-grid">
              <thead>
                <tr className="peachtree-grid-header">
                  <th className="w-[80px] text-right">رقم الحساب</th>
                  <th className="text-right">اسم الحساب</th>
                  <th className="w-[120px] text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {!balanceSheet?.assets || balanceSheet.assets.length === 0 ? (
                  <tr className="peachtree-grid-row">
                    <td colSpan={3} className="text-center py-2 text-xs text-muted-foreground">
                      لا توجد أصول
                    </td>
                  </tr>
                ) : (
                  <>
                    {balanceSheet.assets.map((item) => (
                      <tr key={item.accountId} className="peachtree-grid-row">
                        <td className="font-mono text-xs">{item.accountCode}</td>
                        <td className="text-xs">{item.accountName}</td>
                        <td className="font-mono text-xs peachtree-amount peachtree-amount-debit">
                          {formatCurrency(item.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr className="peachtree-totals">
                      <td colSpan={2} className="text-xs font-semibold py-1 px-2">إجمالي الأصول</td>
                      <td className="font-mono text-sm font-bold peachtree-amount text-primary py-1 px-2">
                        {formatCurrency(balanceSheet.totalAssets)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Liabilities Section */}
          <div>
            <div className="flex items-center gap-2 mb-1 px-1">
              <Wallet className="h-4 w-4 text-purple-600" />
              <h3 className="text-xs font-semibold text-purple-600 uppercase">الخصوم</h3>
            </div>
            <table className="w-full peachtree-grid">
              <thead>
                <tr className="peachtree-grid-header">
                  <th className="w-[80px] text-right">رقم الحساب</th>
                  <th className="text-right">اسم الحساب</th>
                  <th className="w-[120px] text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {!balanceSheet?.liabilities || balanceSheet.liabilities.length === 0 ? (
                  <tr className="peachtree-grid-row">
                    <td colSpan={3} className="text-center py-2 text-xs text-muted-foreground">
                      لا توجد خصوم
                    </td>
                  </tr>
                ) : (
                  <>
                    {balanceSheet.liabilities.map((item) => (
                      <tr key={item.accountId} className="peachtree-grid-row">
                        <td className="font-mono text-xs">{item.accountCode}</td>
                        <td className="text-xs">{item.accountName}</td>
                        <td className="font-mono text-xs peachtree-amount peachtree-amount-credit">
                          {formatCurrency(item.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr className="peachtree-totals">
                      <td colSpan={2} className="text-xs font-semibold py-1 px-2">إجمالي الخصوم</td>
                      <td className="font-mono text-sm font-bold peachtree-amount text-purple-600 py-1 px-2">
                        {formatCurrency(balanceSheet.totalLiabilities)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Equity Section */}
          <div>
            <div className="flex items-center gap-2 mb-1 px-1">
              <Users className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-semibold text-indigo-600 uppercase">حقوق الملكية</h3>
            </div>
            <table className="w-full peachtree-grid">
              <thead>
                <tr className="peachtree-grid-header">
                  <th className="w-[80px] text-right">رقم الحساب</th>
                  <th className="text-right">اسم الحساب</th>
                  <th className="w-[120px] text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {!balanceSheet?.equity || balanceSheet.equity.length === 0 ? (
                  <tr className="peachtree-grid-row">
                    <td colSpan={3} className="text-center py-2 text-xs text-muted-foreground">
                      لا توجد حقوق ملكية
                    </td>
                  </tr>
                ) : (
                  <>
                    {balanceSheet.equity.map((item) => (
                      <tr key={item.accountId} className="peachtree-grid-row">
                        <td className="font-mono text-xs">{item.accountCode}</td>
                        <td className="text-xs">{item.accountName}</td>
                        <td className="font-mono text-xs peachtree-amount peachtree-amount-credit">
                          {formatCurrency(item.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr className="peachtree-totals">
                      <td colSpan={2} className="text-xs font-semibold py-1 px-2">إجمالي حقوق الملكية</td>
                      <td className="font-mono text-sm font-bold peachtree-amount text-indigo-600 py-1 px-2">
                        {formatCurrency(balanceSheet.totalEquity)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Total Liabilities and Equity - Final Balance Bar */}
          <div className={`peachtree-totals ${balanceSheet?.isBalanced ? 'peachtree-totals-balanced' : 'peachtree-totals-unbalanced'} flex items-center justify-between px-3 py-2`}>
            <span className="text-sm font-bold">إجمالي الخصوم وحقوق الملكية</span>
            <span className="text-base font-bold font-mono peachtree-amount">
              {formatCurrency(balanceSheet?.totalLiabilitiesAndEquity || 0)}
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
