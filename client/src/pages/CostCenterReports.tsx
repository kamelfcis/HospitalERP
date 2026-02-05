import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Printer, Calendar, Building2, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostCenter } from "@shared/schema";

interface CostCenterReportItem {
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  totalRevenue: string;
  totalExpense: string;
  netResult: string;
}

interface CostCenterReportData {
  items: CostCenterReportItem[];
  grandTotalRevenue: string;
  grandTotalExpense: string;
  grandNetResult: string;
  startDate: string;
  endDate: string;
}

export default function CostCenterReports() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("all");

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers"],
  });

  const { data: report, isLoading } = useQuery<CostCenterReportData>({
    queryKey: ["/api/reports/cost-centers", startDate, endDate, selectedCostCenter],
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
          <h1 className="text-2xl font-bold text-foreground">تقارير مراكز التكلفة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحليل الإيرادات والمصروفات حسب مركز التكلفة
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

      {/* Filters */}
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
            <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
              <SelectTrigger className="w-[200px]" data-testid="select-cost-center">
                <Building2 className="h-4 w-4 ml-2" />
                <SelectValue placeholder="مركز التكلفة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المراكز</SelectItem>
                {costCenters?.filter((c) => c.isActive).map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    {cc.code} - {cc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  {formatCurrency(report?.grandTotalRevenue || 0)}
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
                  {formatCurrency(report?.grandTotalExpense || 0)}
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={
          parseFloat(report?.grandNetResult || "0") >= 0
            ? "bg-emerald-50 border-emerald-200"
            : "bg-red-50 border-red-200"
        }>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">صافي النتيجة</p>
                <p className={`text-2xl font-bold accounting-number ${
                  parseFloat(report?.grandNetResult || "0") >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }`}>
                  {formatCurrency(report?.grandNetResult || 0)}
                </p>
              </div>
              <Badge className={
                parseFloat(report?.grandNetResult || "0") >= 0
                  ? "bg-emerald-600"
                  : "bg-red-600"
              }>
                {parseFloat(report?.grandNetResult || "0") >= 0 ? "ربح" : "خسارة"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            تقرير مراكز التكلفة للفترة من {formatDateShort(startDate)} إلى {formatDateShort(endDate)}
          </CardTitle>
        </CardHeader>
        <ScrollArea className="h-[calc(100vh-550px)]">
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">الرمز</TableHead>
                <TableHead>مركز التكلفة</TableHead>
                <TableHead className="w-[160px] text-left">الإيرادات</TableHead>
                <TableHead className="w-[160px] text-left">المصروفات</TableHead>
                <TableHead className="w-[160px] text-left">صافي النتيجة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!report?.items || report.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    لا توجد بيانات
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {report.items.map((item) => {
                    const netResult = parseFloat(item.netResult);
                    return (
                      <TableRow key={item.costCenterId}>
                        <TableCell className="font-mono">{item.costCenterCode}</TableCell>
                        <TableCell className="font-medium">{item.costCenterName}</TableCell>
                        <TableCell className="accounting-number text-emerald-600 font-medium">
                          {formatCurrency(item.totalRevenue)}
                        </TableCell>
                        <TableCell className="accounting-number text-red-600 font-medium">
                          {formatCurrency(item.totalExpense)}
                        </TableCell>
                        <TableCell className={`accounting-number font-bold ${
                          netResult >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}>
                          {formatCurrency(item.netResult)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={2}>الإجمالي</TableCell>
                    <TableCell className="accounting-number text-emerald-700 text-lg">
                      {formatCurrency(report.grandTotalRevenue)}
                    </TableCell>
                    <TableCell className="accounting-number text-red-700 text-lg">
                      {formatCurrency(report.grandTotalExpense)}
                    </TableCell>
                    <TableCell className={`accounting-number text-lg font-bold ${
                      parseFloat(report.grandNetResult) >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}>
                      {formatCurrency(report.grandNetResult)}
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
