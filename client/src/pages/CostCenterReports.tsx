import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Printer, Calendar, Building2, RefreshCw } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers"],
  });

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/backfill-cost-centers"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({
        title: "تم تحديث مراكز التكلفة",
        description: `تم تحديث ${data.linesUpdated} سطر محاسبي`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/cost-centers"] });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل تحديث مراكز التكلفة", variant: "destructive" });
    },
  });

  const { data: report, isLoading } = useQuery<CostCenterReportData>({
    queryKey: [`/api/reports/cost-centers?startDate=${startDate}&endDate=${endDate}&costCenterId=${selectedCostCenter}`],
  });

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const grandNetResult = parseFloat(report?.grandNetResult || "0");
  const isBalanced = grandNetResult >= 0;

  return (
    <div className="p-3 space-y-3">
      {/* Page Header - Peachtree Toolbar Style */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <h1 className="text-sm font-bold text-foreground">تقارير مراكز التكلفة</h1>
            <p className="text-xs text-muted-foreground">
              تحليل الإيرادات والمصروفات حسب مركز التكلفة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 no-print"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            title="تحديث مراكز التكلفة للسطور المحاسبية القديمة بناءً على الحسابات الافتراضية"
            data-testid="button-backfill-cost-centers"
          >
            <RefreshCw className={`h-3 w-3 ml-1 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
            تحديث مراكز التكلفة
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2 no-print" onClick={() => window.print()} data-testid="button-print">
            <Printer className="h-3 w-3 ml-1" />
            طباعة
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" data-testid="button-export">
            <Download className="h-3 w-3 ml-1" />
            تصدير
          </Button>
        </div>
      </div>

      {/* Filters - Peachtree Toolbar Style */}
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
        <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
          <SelectTrigger className="peachtree-select w-[180px] text-xs" data-testid="select-cost-center">
            <Building2 className="h-3 w-3 ml-1" />
            <SelectValue placeholder="مركز التكلفة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">جميع المراكز</SelectItem>
            {costCenters?.filter((c) => c.isActive).map((cc) => (
              <SelectItem key={cc.id} value={cc.id} className="text-xs">
                {cc.code} - {cc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Report Title */}
      <div className="peachtree-toolbar text-center py-2">
        <h2 className="text-xs font-semibold">
          تقرير مراكز التكلفة للفترة من {formatDateShort(startDate)} إلى {formatDateShort(endDate)}
        </h2>
      </div>

      {/* Report Table - Peachtree Grid Style */}
      <div className="peachtree-grid">
        <ScrollArea className="h-[calc(100vh-320px)]">
          <table className="w-full">
            <thead className="peachtree-grid-header sticky top-0">
              <tr>
                <th className="w-[80px] text-right">الرمز</th>
                <th className="text-right">مركز التكلفة</th>
                <th className="w-[140px] text-left">الإيرادات</th>
                <th className="w-[140px] text-left">المصروفات</th>
                <th className="w-[140px] text-left">صافي النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {!report?.items || report.items.length === 0 ? (
                <tr className="peachtree-grid-row">
                  <td colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                    لا توجد بيانات
                  </td>
                </tr>
              ) : (
                report.items.map((item) => {
                  const netResult = parseFloat(item.netResult);
                  return (
                    <tr key={item.costCenterId} className="peachtree-grid-row">
                      <td className="font-mono text-xs">{item.costCenterCode}</td>
                      <td className="text-xs">{item.costCenterName}</td>
                      <td className="peachtree-amount peachtree-amount-credit font-mono text-xs">
                        {formatCurrency(item.totalRevenue)}
                      </td>
                      <td className="peachtree-amount peachtree-amount-debit font-mono text-xs">
                        {formatCurrency(item.totalExpense)}
                      </td>
                      <td className={`peachtree-amount font-mono text-xs font-semibold ${
                        netResult >= 0 ? "peachtree-amount-credit" : "peachtree-amount-debit"
                      }`}>
                        {formatCurrency(item.netResult)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {/* Totals Row - Peachtree Totals Style */}
      {report?.items && report.items.length > 0 && (
        <div className={`peachtree-totals ${isBalanced ? "peachtree-totals-balanced" : "peachtree-totals-unbalanced"}`}>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-bold">الإجمالي</span>
            <div className="flex items-center gap-6">
              <div className="text-left">
                <span className="text-xs text-muted-foreground ml-2">الإيرادات:</span>
                <span className="peachtree-amount peachtree-amount-credit font-mono text-sm font-bold">
                  {formatCurrency(report.grandTotalRevenue)}
                </span>
              </div>
              <div className="text-left">
                <span className="text-xs text-muted-foreground ml-2">المصروفات:</span>
                <span className="peachtree-amount peachtree-amount-debit font-mono text-sm font-bold">
                  {formatCurrency(report.grandTotalExpense)}
                </span>
              </div>
              <div className="text-left">
                <span className="text-xs text-muted-foreground ml-2">صافي النتيجة:</span>
                <span className={`peachtree-amount font-mono text-sm font-bold ${
                  grandNetResult >= 0 ? "peachtree-amount-credit" : "peachtree-amount-debit"
                }`}>
                  {formatCurrency(report.grandNetResult)}
                </span>
                <span className={`text-xs mr-2 px-1 py-0.5 rounded ${
                  grandNetResult >= 0 
                    ? "bg-emerald-600 text-white" 
                    : "bg-red-600 text-white"
                }`}>
                  {grandNetResult >= 0 ? "ربح" : "خسارة"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
