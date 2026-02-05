import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">قائمة المركز المالي</h1>
          <p className="text-sm text-muted-foreground mt-1">
            الأصول والخصوم وحقوق الملكية
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
              <span className="text-sm font-medium">في تاريخ:</span>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الأصول</p>
                <p className="text-2xl font-bold text-primary accounting-number">
                  {formatCurrency(balanceSheet?.totalAssets || 0)}
                </p>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الخصوم</p>
                <p className="text-2xl font-bold text-purple-600 accounting-number">
                  {formatCurrency(balanceSheet?.totalLiabilities || 0)}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Wallet className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">حقوق الملكية</p>
                <p className="text-2xl font-bold text-indigo-600 accounting-number">
                  {formatCurrency(balanceSheet?.totalEquity || 0)}
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Users className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Balance Sheet Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            قائمة المركز المالي في {formatDateShort(asOfDate)}
          </CardTitle>
        </CardHeader>
        <ScrollArea className="h-[calc(100vh-550px)]">
          <div className="p-6 pt-0 space-y-6">
            {/* Assets Section */}
            <div>
              <h3 className="text-lg font-semibold text-primary mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                الأصول
              </h3>
              <Table className="accounting-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">رقم الحساب</TableHead>
                    <TableHead>اسم الحساب</TableHead>
                    <TableHead className="w-[180px] text-left">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!balanceSheet?.assets || balanceSheet.assets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        لا توجد أصول
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {balanceSheet.assets.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-mono">{item.accountCode}</TableCell>
                          <TableCell>{item.accountName}</TableCell>
                          <TableCell className="accounting-number font-medium text-primary">
                            {formatCurrency(item.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-primary/5 font-bold">
                        <TableCell colSpan={2}>إجمالي الأصول</TableCell>
                        <TableCell className="accounting-number text-primary text-lg">
                          {formatCurrency(balanceSheet.totalAssets)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator />

            {/* Liabilities Section */}
            <div>
              <h3 className="text-lg font-semibold text-purple-700 mb-3 flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                الخصوم
              </h3>
              <Table className="accounting-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">رقم الحساب</TableHead>
                    <TableHead>اسم الحساب</TableHead>
                    <TableHead className="w-[180px] text-left">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!balanceSheet?.liabilities || balanceSheet.liabilities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        لا توجد خصوم
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {balanceSheet.liabilities.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-mono">{item.accountCode}</TableCell>
                          <TableCell>{item.accountName}</TableCell>
                          <TableCell className="accounting-number font-medium text-purple-600">
                            {formatCurrency(item.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-purple-50 font-bold">
                        <TableCell colSpan={2}>إجمالي الخصوم</TableCell>
                        <TableCell className="accounting-number text-purple-700 text-lg">
                          {formatCurrency(balanceSheet.totalLiabilities)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator />

            {/* Equity Section */}
            <div>
              <h3 className="text-lg font-semibold text-indigo-700 mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" />
                حقوق الملكية
              </h3>
              <Table className="accounting-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">رقم الحساب</TableHead>
                    <TableHead>اسم الحساب</TableHead>
                    <TableHead className="w-[180px] text-left">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!balanceSheet?.equity || balanceSheet.equity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        لا توجد حقوق ملكية
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {balanceSheet.equity.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-mono">{item.accountCode}</TableCell>
                          <TableCell>{item.accountName}</TableCell>
                          <TableCell className="accounting-number font-medium text-indigo-600">
                            {formatCurrency(item.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-indigo-50 font-bold">
                        <TableCell colSpan={2}>إجمالي حقوق الملكية</TableCell>
                        <TableCell className="accounting-number text-indigo-700 text-lg">
                          {formatCurrency(balanceSheet.totalEquity)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator />

            {/* Total Liabilities and Equity */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">إجمالي الخصوم وحقوق الملكية</h3>
                <p className="text-2xl font-bold accounting-number">
                  {formatCurrency(balanceSheet?.totalLiabilitiesAndEquity || 0)}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
