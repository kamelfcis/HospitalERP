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
import { Separator } from "@/components/ui/separator";
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
    queryKey: ["/api/reports/income-statement", startDate, endDate],
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

  const netIncome = parseFloat(statement?.netIncome || "0");
  const isProfit = netIncome >= 0;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">قائمة الدخل</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ملخص الإيرادات والمصروفات
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
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">من:</span>
            </div>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[160px]"
              data-testid="input-start-date"
            />
            <span className="text-sm font-medium">إلى:</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[160px]"
              data-testid="input-end-date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
                <p className="text-2xl font-bold text-emerald-600 accounting-number">
                  {formatCurrency(statement?.totalRevenue || 0)}
                </p>
              </div>
              <div className="p-3 bg-emerald-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المصروفات</p>
                <p className="text-2xl font-bold text-red-600 accounting-number">
                  {formatCurrency(statement?.totalExpense || 0)}
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isProfit ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isProfit ? "صافي الربح" : "صافي الخسارة"}
                </p>
                <p className={`text-2xl font-bold accounting-number ${isProfit ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(Math.abs(netIncome))}
                </p>
              </div>
              <Badge className={isProfit ? "bg-emerald-600" : "bg-red-600"}>
                {isProfit ? "ربح" : "خسارة"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Income Statement Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            قائمة الدخل للفترة من {formatDateShort(startDate)} إلى {formatDateShort(endDate)}
          </CardTitle>
        </CardHeader>
        <ScrollArea className="h-[calc(100vh-550px)]">
          <div className="p-6 pt-0 space-y-6">
            {/* Revenues Section */}
            <div>
              <h3 className="text-lg font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                الإيرادات
              </h3>
              <Table className="accounting-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">رقم الحساب</TableHead>
                    <TableHead>اسم الحساب</TableHead>
                    <TableHead className="w-[180px] text-left">المبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!statement?.revenues || statement.revenues.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        لا توجد إيرادات
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {statement.revenues.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-mono">{item.accountCode}</TableCell>
                          <TableCell>{item.accountName}</TableCell>
                          <TableCell className="accounting-number font-medium text-emerald-600">
                            {formatCurrency(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-emerald-50 font-bold">
                        <TableCell colSpan={2}>إجمالي الإيرادات</TableCell>
                        <TableCell className="accounting-number text-emerald-700 text-lg">
                          {formatCurrency(statement.totalRevenue)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator />

            {/* Expenses Section */}
            <div>
              <h3 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                المصروفات
              </h3>
              <Table className="accounting-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">رقم الحساب</TableHead>
                    <TableHead>اسم الحساب</TableHead>
                    <TableHead className="w-[180px] text-left">المبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!statement?.expenses || statement.expenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        لا توجد مصروفات
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {statement.expenses.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-mono">{item.accountCode}</TableCell>
                          <TableCell>{item.accountName}</TableCell>
                          <TableCell className="accounting-number font-medium text-red-600">
                            {formatCurrency(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-red-50 font-bold">
                        <TableCell colSpan={2}>إجمالي المصروفات</TableCell>
                        <TableCell className="accounting-number text-red-700 text-lg">
                          {formatCurrency(statement.totalExpense)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator />

            {/* Net Income */}
            <div className={`p-4 rounded-lg ${isProfit ? "bg-emerald-100" : "bg-red-100"}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-xl font-bold ${isProfit ? "text-emerald-800" : "text-red-800"}`}>
                  {isProfit ? "صافي الربح" : "صافي الخسارة"}
                </h3>
                <p className={`text-2xl font-bold accounting-number ${isProfit ? "text-emerald-700" : "text-red-700"}`}>
                  {formatCurrency(Math.abs(netIncome))}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
