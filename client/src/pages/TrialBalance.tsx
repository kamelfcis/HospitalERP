import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const getAccountTypeBadgeColor = (type: string) => {
    switch (type) {
      case "asset":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "liability":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "equity":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "revenue":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "expense":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ميزان المراجعة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            أرصدة الحسابات في تاريخ محدد
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-print">
            <Printer className="h-4 w-4 ml-2" />
            طباعة
          </Button>
          <Button variant="outline" size="sm" data-testid="button-export">
            <Download className="h-4 w-4 ml-2" />
            تصدير
          </Button>
        </div>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">حتى تاريخ:</span>
            </div>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-[180px]"
              data-testid="input-as-of-date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Balance Status */}
      {trialBalance && (
        <Card className={trialBalance.isBalanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {trialBalance.isBalanced ? (
                <>
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                  <div>
                    <h3 className="font-semibold text-emerald-800">ميزان المراجعة متوازن</h3>
                    <p className="text-sm text-emerald-700">
                      إجمالي المدين يساوي إجمالي الدائن
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-red-600" />
                  <div>
                    <h3 className="font-semibold text-red-800">ميزان المراجعة غير متوازن</h3>
                    <p className="text-sm text-red-700">
                      هناك فرق بين إجمالي المدين وإجمالي الدائن
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trial Balance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            ميزان المراجعة في {formatDateShort(asOfDate)}
          </CardTitle>
        </CardHeader>
        <ScrollArea className="h-[calc(100vh-450px)]">
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">رقم الحساب</TableHead>
                <TableHead>اسم الحساب</TableHead>
                <TableHead className="w-[100px]">النوع</TableHead>
                <TableHead className="w-[160px] text-left">رصيد مدين</TableHead>
                <TableHead className="w-[160px] text-left">رصيد دائن</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!trialBalance?.items || trialBalance.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    لا توجد بيانات
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {trialBalance.items.map((item) => (
                    <TableRow key={item.account.id} data-testid={`row-balance-${item.account.id}`}>
                      <TableCell className="font-mono">{item.account.code}</TableCell>
                      <TableCell className="font-medium">{item.account.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getAccountTypeBadgeColor(item.account.accountType)}
                        >
                          {accountTypeLabels[item.account.accountType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="accounting-number debit-amount font-medium">
                        {parseFloat(item.debitBalance) > 0 ? formatCurrency(item.debitBalance) : "-"}
                      </TableCell>
                      <TableCell className="accounting-number credit-amount font-medium">
                        {parseFloat(item.creditBalance) > 0 ? formatCurrency(item.creditBalance) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3} className="text-left">
                      الإجمالي
                    </TableCell>
                    <TableCell className="accounting-number debit-amount text-lg">
                      {formatCurrency(trialBalance.totalDebit)}
                    </TableCell>
                    <TableCell className="accounting-number credit-amount text-lg">
                      {formatCurrency(trialBalance.totalCredit)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}
