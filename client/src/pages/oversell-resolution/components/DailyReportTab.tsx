import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, RefreshCw, Package, Users, Building2 } from "lucide-react";
import type { DailyReport } from "./types";

interface DailyReportTabProps {
  dailyReport: DailyReport | undefined;
  dailyLoading: boolean;
  alertThreshold: string;
  setAlertThreshold: (v: string) => void;
  onSaveThreshold: () => void;
  thresholdPending: boolean;
  onRefresh: () => void;
}

export function DailyReportTab({
  dailyReport,
  dailyLoading,
  alertThreshold,
  setAlertThreshold,
  onSaveThreshold,
  thresholdPending,
  onRefresh,
}: DailyReportTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          {dailyReport && new Date(dailyReport.reportDate).toLocaleString("ar")}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Label className="text-xs text-gray-600">حد التنبيه:</Label>
            <Input
              type="number"
              value={alertThreshold || String(dailyReport?.alertThreshold ?? 5)}
              onChange={e => setAlertThreshold(e.target.value)}
              className="w-20 h-7 text-xs text-center"
              min={1}
            />
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={onSaveThreshold}
              disabled={thresholdPending}>
              حفظ
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3 ml-1" />
            تحديث
          </Button>
        </div>
      </div>

      {dailyLoading ? (
        <div className="p-8 text-center text-gray-400">جاري تحميل التقرير...</div>
      ) : dailyReport && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500">أقل من 24 ساعة</p>
                <p className="text-2xl font-bold text-green-600">{dailyReport.ageDistribution.within24h}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500">24 – 48 ساعة</p>
                <p className="text-2xl font-bold text-amber-600">{dailyReport.ageDistribution.within48h}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500">أكثر من 48 ساعة</p>
                <p className={`text-2xl font-bold ${dailyReport.ageDistribution.over48h > 0 ? "text-red-600" : "text-gray-400"}`}>
                  {dailyReport.ageDistribution.over48h}
                </p>
                {dailyReport.ageDistribution.over48h > 0 && (
                  <p className="text-xs text-red-500 mt-1">تجاوزت الحد — تدخل فوري</p>
                )}
              </CardContent>
            </Card>
          </div>

          {dailyReport.byItem.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" />حسب الصنف</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">الصنف</TableHead>
                      <TableHead className="text-right text-xs">عدد البنود</TableHead>
                      <TableHead className="text-right text-xs">كمية معلقة</TableHead>
                      <TableHead className="text-right text-xs">نسبة من الأصل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyReport.byItem.map((row, i) => {
                      const pendingPct = parseFloat(row.original_qty) > 0
                        ? ((parseFloat(row.pending_qty) / parseFloat(row.original_qty)) * 100).toFixed(0)
                        : "0";
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <p className="text-xs font-medium">{row.item_name}</p>
                            {row.item_barcode && <p className="text-xs text-gray-400">{row.item_barcode}</p>}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-center">{row.pending_count}</TableCell>
                          <TableCell className="text-xs font-mono text-red-600">{parseFloat(row.pending_qty).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={parseFloat(pendingPct)} className="h-1.5 w-16" />
                              <span className="text-xs text-gray-600">{pendingPct}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {dailyReport.byUser.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />حسب المستخدم</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">المستخدم</TableHead>
                      <TableHead className="text-right text-xs">عدد البنود</TableHead>
                      <TableHead className="text-right text-xs">كمية معلقة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyReport.byUser.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{row.username}</TableCell>
                        <TableCell className="text-xs font-mono text-center">
                          <span className={parseInt(row.pending_count) > 3 ? "text-red-600 font-bold" : ""}>{row.pending_count}</span>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{parseFloat(row.pending_qty).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {dailyReport.byDepartment.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" />حسب القسم</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">القسم</TableHead>
                      <TableHead className="text-right text-xs">عدد البنود</TableHead>
                      <TableHead className="text-right text-xs">كمية معلقة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyReport.byDepartment.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{row.department_name}</TableCell>
                        <TableCell className="text-xs font-mono text-center">{row.pending_count}</TableCell>
                        <TableCell className="text-xs font-mono">{parseFloat(row.pending_qty).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {dailyReport.byItem.length === 0 && dailyReport.byUser.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
              لا توجد بنود نشطة
            </div>
          )}
        </div>
      )}
    </div>
  );
}
