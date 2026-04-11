/**
 * OversellResolutionPage — شاشة تسوية الصرف بدون رصيد
 *
 * التبويبات:
 *   1. البنود المعلقة — التسوية / الإلغاء
 *   2. التقرير اليومي — KPI + تفاصيل حسب صنف/مستخدم/قسم
 *   3. سجل التسويات — الدفعات + عكس
 *   4. فحص السلامة — تقرير الأيتام والتعارضات
 *   5. السياسة والاستعداد — قائمة التحقق قبل الإنتاج + وثيقة السياسة
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Package, RefreshCw, CheckCircle, Clock, AlertTriangle, Settings,
  ShieldAlert, ShieldCheck, TrendingUp,
  BarChart3, ClipboardList,
} from "lucide-react";

import type {
  PendingAllocation, OversellStats, DailyReport, GoLiveChecklist,
  PreviewResult, GlReadinessResult, ResolutionBatch, IntegrityReport,
} from "./components/types";
import { ratioColor } from "./components/helpers";
import { PendingTab } from "./components/PendingTab";
import { DailyReportTab } from "./components/DailyReportTab";
import { HistoryTab } from "./components/HistoryTab";
import { IntegrityTab } from "./components/IntegrityTab";
import { PolicyTab } from "./components/PolicyTab";
import { PreviewDialog, CancelDialog, VoidDialog, SettingsDialog } from "./components/OversellDialogs";

export default function OversellResolutionPage() {
  const { toast } = useToast();

  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set());
  const [previewData, setPreviewData]           = useState<PreviewResult | null>(null);
  const [previewId, setPreviewId]               = useState<string | null>(null);
  const [previewWarehouseId, setPreviewWarehouseId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen]         = useState(false);
  const [cancelDialogId, setCancelDialogId]     = useState<string | null>(null);
  const [cancelReason, setCancelReason]         = useState("");
  const [voidConfirmId, setVoidConfirmId]       = useState<string | null>(null);
  const [alertThreshold, setAlertThreshold]     = useState<string>("");

  const { data: stats, refetch: refetchStats } = useQuery<OversellStats>({ queryKey: ["/api/oversell/stats"] });
  const { data: pendingData, isLoading, refetch } = useQuery<{ data: PendingAllocation[]; total: number; page: number; totalPages: number }>({
    queryKey: ["/api/oversell/pending"],
  });
  const { data: historyData, refetch: refetchHistory } = useQuery<ResolutionBatch[]>({ queryKey: ["/api/oversell/history"] });
  const { data: integrityData, refetch: refetchIntegrity } = useQuery<IntegrityReport>({ queryKey: ["/api/oversell/integrity"], staleTime: 60_000 });
  const { data: dailyReport, refetch: refetchDaily, isLoading: dailyLoading } = useQuery<DailyReport>({ queryKey: ["/api/oversell/daily-report"], staleTime: 30_000 });
  const { data: checklistData, refetch: refetchChecklist } = useQuery<GoLiveChecklist>({ queryKey: ["/api/oversell/go-live-checklist"], staleTime: 30_000 });
  const { data: featureFlag, refetch: refetchFlag } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/settings/deferred-cost-issue"] });

  const { data: glReadiness, isLoading: glLoading } = useQuery<GlReadinessResult>({
    queryKey: ["/api/oversell/gl-readiness", previewWarehouseId],
    enabled: !!previewWarehouseId,
    queryFn: () => fetch(`/api/oversell/gl-readiness?warehouseId=${previewWarehouseId}`, { credentials: "include" }).then(r => r.json()),
  });

  const allocations = pendingData?.data ?? [];
  const glBlocked   = glReadiness && !glReadiness.ready;

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/integrity"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/daily-report"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/go-live-checklist"] });
  }, []);

  const previewMutation = useMutation({
    mutationFn: (alloc: PendingAllocation) =>
      apiRequest("POST", "/api/oversell/preview", { allocationId: alloc.id }).then(r => r.json()),
    onSuccess: (data: PreviewResult, alloc: PendingAllocation) => {
      setPreviewData({ ...data, warehouseId: alloc.warehouse_id });
      setPreviewId(data.allocationId);
      setPreviewWarehouseId(alloc.warehouse_id);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطأ", description: err.message }),
  });

  const resolveMutation = useMutation({
    mutationFn: (allocationIds: string[]) => {
      const warehouseId = allocations.find(a => allocationIds.includes(a.id))?.warehouse_id ?? "";
      return apiRequest("POST", "/api/oversell/resolve", {
        warehouseId,
        notes: `تسوية دفعة — ${new Date().toLocaleDateString("ar")}`,
        lines: allocationIds.map(id => ({
          pendingAllocationId: id,
          qtyMinorToResolve: parseFloat(allocations.find(a => a.id === id)?.qty_minor_pending ?? "0"),
        })),
      }).then(r => r.json());
    },
    onSuccess: (data: any) => {
      const journalMsg = data.journalStatus === "posted"
        ? ` — قيد #${data.journalEntryId?.slice(-6)?.toUpperCase() ?? ""} مُرحَّل`
        : data.journalStatus === "blocked" ? " ⚠️ القيد لم يُنشأ" : "";
      toast({ title: "تمت التسوية", description: `تم خصم الكميات بنجاح${journalMsg}` });
      setSelectedIds(new Set());
      setPreviewData(null);
      invalidateAll();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "فشلت التسوية", description: err.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/oversell/cancel-allocation/${id}`, { reason }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "تم إلغاء الطلب المعلق" });
      setCancelDialogId(null);
      setCancelReason("");
      invalidateAll();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "فشل الإلغاء", description: err.message }),
  });

  const voidMutation = useMutation({
    mutationFn: (batchId: string) =>
      apiRequest("POST", `/api/oversell/void-batch/${batchId}`, {}).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "تم عكس دفعة التسوية" });
      setVoidConfirmId(null);
      invalidateAll();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "فشل العكس", description: err.message }),
  });

  const flagMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", "/api/settings/deferred-cost-issue", { enabled }).then(r => r.json()),
    onSuccess: () => { refetchFlag(); refetchChecklist(); toast({ title: "تم الحفظ" }); },
  });

  const thresholdMutation = useMutation({
    mutationFn: (threshold: number) =>
      apiRequest("PATCH", "/api/oversell/alert-threshold", { threshold }).then(r => r.json()),
    onSuccess: () => { refetchDaily(); toast({ title: "تم تحديث حد التنبيه" }); },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const allIds = allocations.filter(a => a.status !== "fully_resolved" && a.status !== "cancelled").map(a => a.id);
    setSelectedIds(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
  }, [allocations]);

  const ratio = dailyReport?.summary.oversellRatio ?? 0;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">تسوية الصرف بدون رصيد</h1>
          <p className="text-sm text-gray-500 mt-1">رقابة تشغيلية يومية + تسوية محاسبية</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); refetchHistory(); refetchDaily(); }}>
            <RefreshCw className="h-4 w-4 ml-1" />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 ml-1" />
            إعدادات
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-gray-500">معلق</p>
                <p className="text-xl font-bold text-red-600">{stats?.pendingCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs text-gray-500">جزئي</p>
                <p className="text-xl font-bold text-amber-600">{stats?.partialCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">مسوّى</p>
                <p className="text-xl font-bold text-green-600">{stats?.resolvedCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <TrendingUp className={`h-5 w-5 mt-0.5 ${ratioColor(ratio)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">نسبة الصرف المؤجل</p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-xl font-bold ${ratioColor(ratio)}`}>{ratio}%</p>
                  <span className="text-xs text-gray-400">من إجمالي الصرف</span>
                </div>
                <Progress
                  value={Math.min(ratio, 100)}
                  className="h-1.5 mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {ratio === 0 ? "ممتاز" : ratio < 10 ? "مقبول — راقب" : ratio < 25 ? "مرتفع — يحتاج انتباه" : "خطر — تدخل فوري"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {dailyReport?.alertTriggered && (
        <Alert className="border-red-400 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 text-sm">
            <strong>تنبيه رقابي:</strong> عدد البنود المعلقة ({stats?.activeCount}) تجاوز الحد المسموح ({dailyReport.alertThreshold}).
            {dailyReport.ageDistribution.over48h > 0 && ` — يوجد ${dailyReport.ageDistribution.over48h} بند أكبر من 48 ساعة.`}
          </AlertDescription>
        </Alert>
      )}
      {(stats?.activeCount ?? 0) > 0 && !dailyReport?.alertTriggered && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            <strong>تنبيه:</strong> {stats?.activeCount} بند بدون تكلفة مسجّلة — لا يمكن إغلاق الفترة المالية حتى التسوية.
          </AlertDescription>
        </Alert>
      )}
      {checklistData && !checklistData.allGreen && (
        <Alert className="border-orange-300 bg-orange-50">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 text-sm">
            <strong>قائمة التحقق:</strong> يوجد {checklistData.checks.filter(c => !c.ok).length} بند(اً) غير مكتمل. راجع تبويب "السياسة والاستعداد".
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="pending">
        <TabsList className="flex-wrap gap-1 h-auto mb-4">
          <TabsTrigger value="pending" className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            البنود المعلقة
            {(stats?.activeCount ?? 0) > 0 && (
              <Badge className="mr-1 text-xs bg-red-100 text-red-700">{stats?.activeCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="daily" className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            التقرير اليومي
            {dailyReport?.alertTriggered && <Badge className="mr-1 text-xs bg-red-100 text-red-700">!</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            سجل التسويات
          </TabsTrigger>
          <TabsTrigger value="integrity" className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            فحص السلامة
            {integrityData && !integrityData.clean && <Badge className="mr-1 text-xs bg-red-100 text-red-700">!</Badge>}
          </TabsTrigger>
          <TabsTrigger value="policy" className="flex items-center gap-1">
            <ClipboardList className="h-3 w-3" />
            السياسة والاستعداد
            {checklistData && !checklistData.allGreen && <Badge className="mr-1 text-xs bg-orange-100 text-orange-700">!</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          <PendingTab
            allocations={allocations}
            isLoading={isLoading}
            total={pendingData?.total ?? 0}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleAll={toggleAll}
            onPreview={(alloc) => previewMutation.mutate(alloc)}
            previewPending={previewMutation.isPending}
            onResolve={(ids) => resolveMutation.mutate(ids)}
            resolvePending={resolveMutation.isPending}
            onCancelAlloc={(id) => { setCancelDialogId(id); setCancelReason(""); }}
            cancelPending={cancelMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="daily" className="space-y-4">
          <DailyReportTab
            dailyReport={dailyReport}
            dailyLoading={dailyLoading}
            alertThreshold={alertThreshold}
            setAlertThreshold={setAlertThreshold}
            onSaveThreshold={() => thresholdMutation.mutate(parseInt(alertThreshold || "5"))}
            thresholdPending={thresholdMutation.isPending}
            onRefresh={() => refetchDaily()}
          />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab
            historyData={historyData}
            onRefresh={() => refetchHistory()}
            onVoid={(id) => setVoidConfirmId(id)}
            voidPending={voidMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="integrity">
          <IntegrityTab
            integrityData={integrityData}
            onRefresh={() => refetchIntegrity()}
          />
        </TabsContent>

        <TabsContent value="policy" className="space-y-4">
          <PolicyTab
            checklistData={checklistData}
            onRefreshChecklist={() => refetchChecklist()}
            onEnableFlag={() => flagMutation.mutate(true)}
            flagPending={flagMutation.isPending}
          />
        </TabsContent>
      </Tabs>

      <PreviewDialog
        previewData={previewData}
        previewId={previewId}
        glReadiness={glReadiness}
        glLoading={glLoading}
        glBlocked={!!glBlocked}
        resolvePending={resolveMutation.isPending}
        onResolve={(ids) => resolveMutation.mutate(ids)}
        onClose={() => { setPreviewData(null); setPreviewWarehouseId(null); }}
      />

      <CancelDialog
        cancelDialogId={cancelDialogId}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        onCancel={() => cancelMutation.mutate({ id: cancelDialogId!, reason: cancelReason })}
        cancelPending={cancelMutation.isPending}
        onClose={() => setCancelDialogId(null)}
      />

      <VoidDialog
        voidConfirmId={voidConfirmId}
        onVoid={() => voidMutation.mutate(voidConfirmId!)}
        voidPending={voidMutation.isPending}
        onClose={() => setVoidConfirmId(null)}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        featureEnabled={featureFlag?.enabled ?? false}
        onToggle={(val) => flagMutation.mutate(val)}
        flagPending={flagMutation.isPending}
      />
    </div>
  );
}
