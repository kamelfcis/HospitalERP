/**
 * unit-integrity/index.tsx — تقرير سلامة الوحدات
 *
 * يصنّف الأصناف إلى:
 *  - أحمر (blocking): مشكلة تمنع العمليات — يجب تصحيحها فوراً
 *  - أصفر (legacy): كبرى+متوسطة بدون صغرى — صحيح (اتفاقية legacy)، لا حاجة لترحيل
 *  - أخضر (ok): سليم تماماً
 */

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Clock, Info, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface IntegrityItem {
  id: string;
  itemCode: string;
  nameAr: string;
  category: string;
  majorUnitName: string | null;
  mediumUnitName: string | null;
  minorUnitName: string | null;
  majorToMedium: string | null;
  majorToMinor: string | null;
  mediumToMinor: string | null;
  status: "blocking" | "legacy" | "ok";
}

interface ReportData {
  summary: { total: number; blocking: number; legacy: number; ok: number };
  blocking: IntegrityItem[];
  legacy: IntegrityItem[];
  ok: IntegrityItem[];
}

function ItemRow({ item }: { item: IntegrityItem }) {
  const unitChain = [item.majorUnitName, item.mediumUnitName, item.minorUnitName]
    .filter(Boolean).join(" → ");
  const ratioChain = [
    item.majorToMedium ? `1:${item.majorToMedium}` : null,
    item.mediumToMinor ? `1:${item.mediumToMinor}` : null,
    item.majorToMinor  ? `(مباشر: 1:${item.majorToMinor})` : null,
  ].filter(Boolean).join("  ");

  let blockerReason = "";
  if (item.status === "blocking") {
    if (item.minorUnitName && (!item.majorToMinor || parseFloat(item.majorToMinor) <= 0)) {
      blockerReason = `الصغرى "${item.minorUnitName}" بدون majorToMinor`;
    } else if (item.mediumUnitName && (!item.majorToMedium || parseFloat(item.majorToMedium) <= 0)) {
      blockerReason = `المتوسطة "${item.mediumUnitName}" بدون majorToMedium`;
    }
  }

  return (
    <TableRow>
      <TableCell className="text-[11px] font-mono">{item.itemCode}</TableCell>
      <TableCell className="text-[12px]">{item.nameAr}</TableCell>
      <TableCell className="text-[11px] text-muted-foreground">{unitChain || "—"}</TableCell>
      <TableCell className="text-[10px] font-mono text-muted-foreground" dir="ltr">{ratioChain || "—"}</TableCell>
      {item.status === "blocking" && (
        <TableCell className="text-[10px] text-red-600 dark:text-red-400">{blockerReason}</TableCell>
      )}
    </TableRow>
  );
}

export default function UnitIntegrityPage() {
  const { data, isLoading, isFetching, refetch } = useQuery<ReportData>({
    queryKey: ["/api/admin/unit-integrity-report"],
    staleTime: 0,
  });

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">تقرير سلامة الوحدات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            فحص تعريفات الوحدات ومعاملات التحويل لجميع الأصناف غير الخدمية
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل…</div>
      )}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{data.summary.total}</div>
                <div className="text-xs text-muted-foreground mt-0.5">إجمالي الأصناف</div>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-900">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {data.summary.blocking}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  تمنع العمليات
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 dark:border-amber-900">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {data.summary.legacy}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3 text-amber-500" />
                  legacy (سليم)
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 dark:border-green-900">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {data.summary.ok}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  سليم
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Legend */}
          <Card className="bg-muted/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <div>
                    <Badge variant="destructive" className="text-[10px] py-0 ml-1">أحمر — blocking</Badge>
                    الصنف لديه وحدة صغرى أو متوسطة محددة لكن معامل التحويل مفقود أو صفر — يجب تصحيحه فوراً من شاشة الأصناف.
                  </div>
                  <div>
                    <Badge className="text-[10px] py-0 ml-1 bg-amber-500">أصفر — legacy</Badge>
                    كبرى+متوسطة بدون صغرى — اتفاقية تخزين صحيحة (qty_in_minor = qty بالكبرى). لا حاجة لأي ترحيل.
                  </div>
                  <div>
                    <Badge className="text-[10px] py-0 ml-1 bg-green-600">أخضر — ok</Badge>
                    الصنف سليم بالكامل — وحدة واحدة، أو وحدتان بمعامل صحيح، أو ثلاث وحدات بمعاملات صحيحة.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue={data.summary.blocking > 0 ? "blocking" : "legacy"}>
            <TabsList>
              <TabsTrigger value="blocking" className="gap-1">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                مشاكل ({data.summary.blocking})
              </TabsTrigger>
              <TabsTrigger value="legacy" className="gap-1">
                <Clock className="h-3 w-3 text-amber-500" />
                Legacy ({data.summary.legacy})
              </TabsTrigger>
              <TabsTrigger value="ok" className="gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                سليم ({data.summary.ok})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="blocking">
              {data.blocking.length === 0 ? (
                <div className="text-center py-8 text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle className="h-6 w-6 mx-auto mb-2" />
                  لا توجد مشاكل — جميع الأصناف سليمة
                </div>
              ) : (
                <Card>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-sm text-red-600 dark:text-red-400">
                      أصناف تحتاج تصحيح فوري — {data.blocking.length} صنف
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right text-[11px]">الكود</TableHead>
                          <TableHead className="text-right text-[11px]">الاسم</TableHead>
                          <TableHead className="text-right text-[11px]">الوحدات</TableHead>
                          <TableHead className="text-right text-[11px]">المعاملات</TableHead>
                          <TableHead className="text-right text-[11px]">سبب المشكلة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.blocking.map(item => <ItemRow key={item.id} item={item} />)}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="legacy">
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm text-amber-600 dark:text-amber-400">
                    أصناف Legacy (كبرى+متوسطة) — {data.legacy.length} صنف — لا تتطلب أي إجراء
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.legacy.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground text-sm">لا توجد أصناف legacy</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right text-[11px]">الكود</TableHead>
                          <TableHead className="text-right text-[11px]">الاسم</TableHead>
                          <TableHead className="text-right text-[11px]">الوحدات</TableHead>
                          <TableHead className="text-right text-[11px]">المعاملات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.legacy.map(item => <ItemRow key={item.id} item={item} />)}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ok">
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm text-green-600 dark:text-green-400">
                    أصناف سليمة — {data.summary.ok} صنف
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.ok.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground text-sm">—</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right text-[11px]">الكود</TableHead>
                          <TableHead className="text-right text-[11px]">الاسم</TableHead>
                          <TableHead className="text-right text-[11px]">الوحدات</TableHead>
                          <TableHead className="text-right text-[11px]">المعاملات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.ok.map(item => <ItemRow key={item.id} item={item} />)}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
