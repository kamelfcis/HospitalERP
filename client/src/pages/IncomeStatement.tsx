import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Printer, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

interface IncomeStatementItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: string;
}

interface IncomeStatementData {
  revenues: IncomeStatementItem[];
  expenses: IncomeStatementItem[];
  totalRevenue: string;
  totalExpense: string;
  netIncome: string;
  startDate: string;
  endDate: string;
}

export default function IncomeStatement() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);

  const { data: statement, isLoading } = useQuery<IncomeStatementData>({
    queryKey: [`/api/reports/income-statement?startDate=${startDate}&endDate=${endDate}`],
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

  const netIncome = parseFloat(statement?.netIncome || "0");
  const isProfit = netIncome >= 0;

  return (
    <div className="p-3 space-y-3">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-foreground">قائمة الدخل</h1>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">ملخص الإيرادات والمصروفات</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-6 text-xs px-2 no-print" onClick={() => window.print()} data-testid="button-print">
            <Printer className="h-3 w-3 ml-1" />
            طباعة
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-xs px-2" data-testid="button-export">
            <Download className="h-3 w-3 ml-1" />
            تصدير
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">من:</span>
        </div>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="peachtree-input w-[130px] text-xs"
          data-testid="input-start-date"
        />
        <span className="text-xs font-medium">إلى:</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="peachtree-input w-[130px] text-xs"
          data-testid="input-end-date"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="peachtree-toolbar p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
              <p className="text-sm font-bold font-mono peachtree-amount peachtree-amount-credit">
                {formatCurrency(statement?.totalRevenue || 0)}
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
        <div className="peachtree-toolbar p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
              <p className="text-sm font-bold font-mono peachtree-amount peachtree-amount-debit">
                {formatCurrency(statement?.totalExpense || 0)}
              </p>
            </div>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </div>
        </div>
        <div className={`p-2 ${isProfit ? "peachtree-totals-balanced" : "peachtree-totals-unbalanced"}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">
                {isProfit ? "صافي الربح" : "صافي الخسارة"}
              </p>
              <p className={`text-sm font-bold font-mono peachtree-amount ${isProfit ? "peachtree-amount-credit" : "peachtree-amount-debit"}`}>
                {formatCurrency(Math.abs(netIncome))}
              </p>
            </div>
            <Badge className={`text-xs h-5 ${isProfit ? "bg-emerald-600" : "bg-red-600"}`}>
              {isProfit ? "ربح" : "خسارة"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="peachtree-toolbar py-1 px-2">
        <span className="text-xs font-semibold">
          قائمة الدخل للفترة من {formatDateShort(startDate)} إلى {formatDateShort(endDate)}
        </span>
      </div>

      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1 mb-1 px-1">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              <h3 className="text-xs font-bold text-emerald-700">الإيرادات</h3>
            </div>
            <table className="w-full peachtree-grid text-xs">
              <thead>
                <tr className="peachtree-grid-header">
                  <th className="w-[80px] text-right">رقم الحساب</th>
                  <th className="text-right">اسم الحساب</th>
                  <th className="w-[120px] text-left">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {!statement?.revenues || statement.revenues.length === 0 ? (
                  <tr className="peachtree-grid-row">
                    <td colSpan={3} className="text-center py-2 text-muted-foreground text-xs">
                      لا توجد إيرادات
                    </td>
                  </tr>
                ) : (
                  <>
                    {statement.revenues.map((item) => (
                      <tr key={item.accountId} className="peachtree-grid-row">
                        <td className="font-mono text-xs">{item.accountCode}</td>
                        <td className="text-xs">{item.accountName}</td>
                        <td className="font-mono peachtree-amount peachtree-amount-credit text-xs">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="peachtree-totals">
                      <td colSpan={2} className="text-xs font-bold py-1 px-2">إجمالي الإيرادات</td>
                      <td className="font-mono peachtree-amount peachtree-amount-credit text-sm font-bold py-1 px-2">
                        {formatCurrency(statement.totalRevenue)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1 px-1">
              <TrendingDown className="h-3 w-3 text-red-600" />
              <h3 className="text-xs font-bold text-red-700">المصروفات</h3>
            </div>
            <table className="w-full peachtree-grid text-xs">
              <thead>
                <tr className="peachtree-grid-header">
                  <th className="w-[80px] text-right">رقم الحساب</th>
                  <th className="text-right">اسم الحساب</th>
                  <th className="w-[120px] text-left">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {!statement?.expenses || statement.expenses.length === 0 ? (
                  <tr className="peachtree-grid-row">
                    <td colSpan={3} className="text-center py-2 text-muted-foreground text-xs">
                      لا توجد مصروفات
                    </td>
                  </tr>
                ) : (
                  <>
                    {statement.expenses.map((item) => (
                      <tr key={item.accountId} className="peachtree-grid-row">
                        <td className="font-mono text-xs">{item.accountCode}</td>
                        <td className="text-xs">{item.accountName}</td>
                        <td className="font-mono peachtree-amount peachtree-amount-debit text-xs">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="peachtree-totals">
                      <td colSpan={2} className="text-xs font-bold py-1 px-2">إجمالي المصروفات</td>
                      <td className="font-mono peachtree-amount peachtree-amount-debit text-sm font-bold py-1 px-2">
                        {formatCurrency(statement.totalExpense)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div className={`p-3 ${isProfit ? "peachtree-totals-balanced" : "peachtree-totals-unbalanced"}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold ${isProfit ? "text-emerald-800" : "text-red-800"}`}>
                {isProfit ? "صافي الربح" : "صافي الخسارة"}
              </h3>
              <p className={`text-base font-bold font-mono peachtree-amount ${isProfit ? "peachtree-amount-credit" : "peachtree-amount-debit"}`}>
                {formatCurrency(Math.abs(netIncome))}
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
