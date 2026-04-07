/**
 * OversellResolutionPage — شاشة تسوية الصرف بدون رصيد
 *
 * التبويبات:
 *   1. البنود المعلقة — إجراءات التسوية والإلغاء
 *   2. سجل التسويات — عرض الدفعات المنجزة مع إمكانية العكس
 *   3. فحص السلامة — تقرير أيتام الطلبات والتعارضات
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Package, RefreshCw, CheckCircle, Clock, AlertTriangle, Settings, Eye,
  BookOpen, ShieldAlert, RotateCcw, XCircle, ShieldCheck,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface PendingAllocation {
  id: string;
  invoice_id: string;
  invoice_line_id: string;
  item_id: string;
  warehouse_id: string;
  qty_minor_pending: string;
  qty_minor_original: string;
  status: "pending" | "partially_resolved" | "fully_resolved" | "cancelled";
  cost_status?: "pending" | "partial" | "resolved" | null;
  reason?: string;
  qty_minor_available_at_finalize: string;
  created_by?: string;
  created_at: string;
  item_name: string;
  item_barcode?: string;
  item_unit?: string;
  item_minor_unit?: string;
  warehouse_name: string;
  invoice_number?: string;
  patient_name?: string;
  current_stock_minor: string;
}

interface OversellStats {
  pendingCount: number;
  partialCount: number;
  resolvedCount: number;
  activeCount: number;
  totalQtyMinorPending: number;
}

interface PreviewResult {
  allocationId: string;
  warehouseId: string;
  qtyPending: number;
  qtyCanResolve: number;
  qtyShortfall: number;
  estimatedCost: number;
  fullyResolvable: boolean;
  lots: Array<{
    lotId: string;
    qtyToDeduct: number;
    unitCost: number;
    lineCost: number;
    expiryMonth?: number;
    expiryYear?: number;
  }>;
}

interface GlReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  accountCode?: string;
  accountName?: string;
  message?: string;
}

interface GlReadinessResult {
  ready: boolean;
  checks: GlReadinessCheck[];
}

interface ResolutionBatch {
  id: string;
  warehouse_id: string;
  resolved_by: string;
  resolved_by_name?: string;
  resolved_at: string;
  notes?: string;
  journal_entry_id?: string;
  journal_status: "none" | "posted" | "blocked" | "voided";
  stock_movement_header_id?: string;
}

interface IntegrityReport {
  orphanAllocations: any[];
  statusMismatches: any[];
  orphanJournalLinks: any[];
  clean: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function psaBadge(status: PendingAllocation["status"]) {
  switch (status) {
    case "pending":            return <Badge variant="destructive" className="text-xs">معلق</Badge>;
    case "partially_resolved": return <Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-400">جزئي</Badge>;
    case "fully_resolved":     return <Badge className="text-xs bg-green-100 text-green-700">مسوّى</Badge>;
    default:                   return <Badge variant="outline" className="text-xs">ملغي</Badge>;
  }
}

function costStatusBadge(costStatus?: string | null) {
  if (!costStatus) return null;
  switch (costStatus) {
    case "pending":  return <Badge className="text-xs bg-orange-100 text-orange-700 border border-orange-300">تكلفة: معلقة</Badge>;
    case "partial":  return <Badge className="text-xs bg-blue-100 text-blue-700 border border-blue-300">تكلفة: جزئية</Badge>;
    case "resolved": return <Badge className="text-xs bg-green-100 text-green-700 border border-green-300">تكلفة: مسواة ✓</Badge>;
    default: return null;
  }
}

function journalStatusBadge(status: string) {
  switch (status) {
    case "posted":  return <Badge className="text-xs bg-green-100 text-green-700">قيد مُرحَّل</Badge>;
    case "blocked": return <Badge className="text-xs bg-red-100 text-red-700">قيد محجوب</Badge>;
    case "voided":  return <Badge variant="outline" className="text-xs">ملغي</Badge>;
    default:        return <Badge variant="outline" className="text-xs">بدون قيد</Badge>;
  }
}

function GlStatusBadge({ readiness }: { readiness: GlReadinessResult | null | undefined }) {
  if (!readiness) return <Badge variant="outline" className="text-xs">جاري الفحص...</Badge>;
  if (readiness.ready) {
    return (
      <Badge className="text-xs bg-green-100 text-green-700 border border-green-300">
        <CheckCircle className="h-3 w-3 ml-1" />
        القيد جاهز
      </Badge>
    );
  }
  return (
    <Badge className="text-xs bg-red-100 text-red-700 border border-red-300">
      <ShieldAlert className="h-3 w-3 ml-1" />
      القيد محجوب
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function OversellResolutionPage() {
  const { toast } = useToast();

  // State
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set());
  const [previewData, setPreviewData]           = useState<PreviewResult | null>(null);
  const [previewId, setPreviewId]               = useState<string | null>(null);
  const [previewWarehouseId, setPreviewWarehouseId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen]         = useState(false);
  const [cancelDialogId, setCancelDialogId]     = useState<string | null>(null);
  const [cancelReason, setCancelReason]         = useState("");
  const [voidConfirmId, setVoidConfirmId]       = useState<string | null>(null);

  // ── Data Queries ──────────────────────────────────────────────────────────
  const { data: stats, refetch: refetchStats } = useQuery<OversellStats>({
    queryKey: ["/api/oversell/stats"],
  });

  const { data: pendingData, isLoading, refetch } = useQuery<{
    data: PendingAllocation[]; total: number; page: number; totalPages: number;
  }>({
    queryKey: ["/api/oversell/pending"],
  });

  const { data: historyData, refetch: refetchHistory } = useQuery<ResolutionBatch[]>({
    queryKey: ["/api/oversell/history"],
  });

  const { data: integrityData, refetch: refetchIntegrity } = useQuery<IntegrityReport>({
    queryKey: ["/api/oversell/integrity"],
    staleTime: 60_000,
  });

  const { data: featureFlag, refetch: refetchFlag } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/deferred-cost-issue"],
  });

  const { data: glReadiness, isLoading: glLoading } = useQuery<GlReadinessResult>({
    queryKey: ["/api/oversell/gl-readiness", previewWarehouseId],
    enabled: !!previewWarehouseId,
    queryFn: () =>
      fetch(`/api/oversell/gl-readiness?warehouseId=${previewWarehouseId}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const allocations = pendingData?.data ?? [];
  const glBlocked   = glReadiness && !glReadiness.ready;

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/oversell/integrity"] });
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────
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
        ? ` — قيد محاسبي #${data.journalEntryId?.slice(-6)?.toUpperCase() ?? ""} مُرحَّل`
        : data.journalStatus === "blocked"
          ? " ⚠️ (القيد المحاسبي لم يُنشأ)"
          : "";
      toast({ title: "تمت التسوية", description: `تم خصم الكميات من المخزون بنجاح${journalMsg}` });
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
      toast({ title: "تم عكس دفعة التسوية", description: "تم استرجاع الكميات إلى المخزون وعكس القيد المحاسبي" });
      setVoidConfirmId(null);
      invalidateAll();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "فشل العكس", description: err.message }),
  });

  const flagMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", "/api/settings/deferred-cost-issue", { enabled }).then(r => r.json()),
    onSuccess: () => { refetchFlag(); toast({ title: "تم الحفظ" }); },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
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

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">تسوية الصرف بدون رصيد</h1>
          <p className="text-sm text-gray-500 mt-1">
            إدارة وتسوية البنود التي صُرفت مع عجز في الرصيد
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); refetchHistory(); }}>
            <RefreshCw className="h-4 w-4 ml-1" />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 ml-1" />
            إعدادات
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-gray-500">إجمالي نشط</p>
                <p className="text-xl font-bold text-blue-600">{stats?.activeCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {(stats?.activeCount ?? 0) > 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            <strong>تنبيه:</strong> يوجد {stats?.activeCount} بند بدون تكلفة محاسبية مسجّلة — مجمل الربح غير نهائي حتى تمام التسوية. لا يمكن إغلاق الفترة المالية حتى تصفير هذه البنود.
          </AlertDescription>
        </Alert>
      )}
      {featureFlag && !featureFlag.enabled && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            خاصية الصرف بدون رصيد <strong>معطّلة</strong> حالياً. لن تُنشأ تسجيلات جديدة.
          </AlertDescription>
        </Alert>
      )}
      {integrityData && !integrityData.clean && (
        <Alert className="border-red-300 bg-red-50">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 text-sm">
            <strong>تحذير سلامة البيانات:</strong> تم اكتشاف تعارضات في حالة التسوية. راجع تبويب "فحص السلامة".
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList className="mb-4">
          <TabsTrigger value="pending">
            البنود المعلقة
            {(stats?.activeCount ?? 0) > 0 && (
              <Badge className="mr-2 text-xs bg-red-100 text-red-700">{stats?.activeCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">سجل التسويات</TabsTrigger>
          <TabsTrigger value="integrity">
            فحص السلامة
            {integrityData && !integrityData.clean && (
              <Badge className="mr-2 text-xs bg-red-100 text-red-700">!</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Pending ────────────────────────────────────────────── */}
        <TabsContent value="pending" className="space-y-3">
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span className="text-sm font-medium text-blue-800">تم تحديد {selectedIds.size} بند</span>
              <Button
                size="sm"
                onClick={() => resolveMutation.mutate(Array.from(selectedIds))}
                disabled={resolveMutation.isPending}
                data-testid="bulk-resolve-btn"
              >
                {resolveMutation.isPending ? "جاري التسوية..." : "تسوية المحدد"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                إلغاء التحديد
              </Button>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">البنود المعلقة</CardTitle>
              <CardDescription>إجمالي {pendingData?.total ?? 0} بند</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
              ) : allocations.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
                  لا توجد بنود معلقة
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-right">
                        <input type="checkbox"
                          checked={selectedIds.size === allocations.filter(a => a.status !== "fully_resolved" && a.status !== "cancelled").length && allocations.length > 0}
                          onChange={toggleAll}
                          className="cursor-pointer"
                        />
                      </TableHead>
                      <TableHead className="text-right">الصنف</TableHead>
                      <TableHead className="text-right">المريض / الفاتورة</TableHead>
                      <TableHead className="text-right">المخزن</TableHead>
                      <TableHead className="text-right">الكمية المعلقة</TableHead>
                      <TableHead className="text-right">الرصيد الحالي</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">السبب</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((alloc) => {
                      const qtyPending   = parseFloat(alloc.qty_minor_pending);
                      const currentStock = parseFloat(alloc.current_stock_minor);
                      const canResolve   = currentStock >= qtyPending - 0.00005;
                      const isResolved   = alloc.status === "fully_resolved";
                      const isCancelled  = alloc.status === "cancelled";
                      const canCancel    = !isResolved && !isCancelled;

                      return (
                        <TableRow
                          key={alloc.id}
                          className={
                            isCancelled ? "opacity-50" :
                            selectedIds.has(alloc.id) ? "bg-blue-50" : ""
                          }
                          data-testid={`oversell-row-${alloc.id}`}
                        >
                          <TableCell>
                            {!isResolved && !isCancelled && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(alloc.id)}
                                onChange={() => toggleSelect(alloc.id)}
                                className="cursor-pointer"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{alloc.item_name}</p>
                              {alloc.item_barcode && (
                                <p className="text-xs text-gray-400">{alloc.item_barcode}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{alloc.patient_name ?? "—"}</p>
                              {alloc.invoice_number && (
                                <p className="text-xs text-gray-400">#{alloc.invoice_number}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{alloc.warehouse_name}</TableCell>
                          <TableCell>
                            <span className={`text-sm font-mono ${!canResolve ? "text-red-600" : "text-gray-700"}`}>
                              {qtyPending.toFixed(2)} {alloc.item_minor_unit ?? ""}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-mono ${canResolve ? "text-green-600" : "text-red-600"}`}>
                              {currentStock.toFixed(2)} {alloc.item_minor_unit ?? ""}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {psaBadge(alloc.status)}
                              {costStatusBadge(alloc.cost_status)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-gray-500 max-w-[100px] truncate block" title={alloc.reason ?? ""}>
                              {alloc.reason ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-gray-500">
                            {new Date(alloc.created_at).toLocaleDateString("ar")}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {!isResolved && !isCancelled && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => previewMutation.mutate(alloc)}
                                  disabled={previewMutation.isPending}
                                  data-testid={`preview-btn-${alloc.id}`}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              )}
                              {!isResolved && !isCancelled && canResolve && (
                                <Button
                                  size="sm"
                                  onClick={() => resolveMutation.mutate([alloc.id])}
                                  disabled={resolveMutation.isPending}
                                  data-testid={`resolve-btn-${alloc.id}`}
                                >
                                  تسوية
                                </Button>
                              )}
                              {!isResolved && !isCancelled && !canResolve && (
                                <span className="text-xs text-red-500 self-center">رصيد غير كافٍ</span>
                              )}
                              {canCancel && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:bg-red-50 px-1"
                                  onClick={() => { setCancelDialogId(alloc.id); setCancelReason(""); }}
                                  disabled={cancelMutation.isPending}
                                  data-testid={`cancel-alloc-btn-${alloc.id}`}
                                  title="إلغاء الطلب المعلق"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: History ────────────────────────────────────────────── */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">سجل دفعات التسوية</CardTitle>
                <Button size="sm" variant="outline" onClick={() => refetchHistory()}>
                  <RefreshCw className="h-3 w-3 ml-1" />
                  تحديث
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!historyData?.length ? (
                <div className="p-8 text-center text-gray-400">لا توجد دفعات مسجّلة بعد</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الدفعة</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">بواسطة</TableHead>
                      <TableHead className="text-right">حالة القيد</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-mono text-xs">{batch.id.slice(-8).toUpperCase()}</TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {new Date(batch.resolved_at).toLocaleDateString("ar")}
                        </TableCell>
                        <TableCell className="text-xs">{batch.resolved_by_name ?? batch.resolved_by?.slice(-6)}</TableCell>
                        <TableCell>{journalStatusBadge(batch.journal_status)}</TableCell>
                        <TableCell className="text-xs text-gray-500 max-w-[150px] truncate">
                          {batch.notes ?? "—"}
                        </TableCell>
                        <TableCell>
                          {batch.journal_status !== "voided" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50 text-xs"
                              onClick={() => setVoidConfirmId(batch.id)}
                              disabled={voidMutation.isPending}
                              data-testid={`void-batch-btn-${batch.id}`}
                            >
                              <RotateCcw className="h-3 w-3 ml-1" />
                              عكس
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: Integrity ──────────────────────────────────────────── */}
        <TabsContent value="integrity">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  تقرير سلامة البيانات
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => refetchIntegrity()}>
                  <RefreshCw className="h-3 w-3 ml-1" />
                  إعادة الفحص
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!integrityData ? (
                <div className="p-4 text-center text-gray-400">جاري الفحص...</div>
              ) : integrityData.clean ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">البيانات سليمة</p>
                    <p className="text-xs text-green-600">لا توجد أيتام ولا تعارضات في الحالات</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {integrityData.orphanAllocations.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-2">
                        طلبات معلقة مرتبطة بفواتير ملغاة ({integrityData.orphanAllocations.length})
                      </p>
                      <div className="text-xs bg-red-50 rounded p-2 font-mono overflow-x-auto">
                        {integrityData.orphanAllocations.map((o: any, i: number) => (
                          <div key={i}>PSA: {o.psa_id?.slice(-6)} | Invoice: {o.invoice_id?.slice(-6)} | Status: {o.invoice_status}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {integrityData.statusMismatches.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-amber-700 mb-2">
                        تعارض في حالة التسوية ({integrityData.statusMismatches.length})
                      </p>
                      <div className="text-xs bg-amber-50 rounded p-2 font-mono overflow-x-auto">
                        {integrityData.statusMismatches.map((m: any, i: number) => (
                          <div key={i}>PSA {m.psa_status} ≠ PIL {m.stock_issue_status} / cost: {m.cost_status}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {integrityData.orphanJournalLinks.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-2">
                        قيود مرتبطة بدفعات لكن مفقودة من سجل القيود ({integrityData.orphanJournalLinks.length})
                      </p>
                      <div className="text-xs bg-red-50 rounded p-2 font-mono overflow-x-auto">
                        {integrityData.orphanJournalLinks.map((j: any, i: number) => (
                          <div key={i}>Batch {j.batch_id?.slice(-6)} → JE {j.journal_entry_id?.slice(-6)} MISSING</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Preview Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!previewData} onOpenChange={() => { setPreviewData(null); setPreviewWarehouseId(null); }}>
        <DialogContent className="max-w-xl" dir="rtl">
          <DialogHeader><DialogTitle>معاينة التسوية</DialogTitle></DialogHeader>
          {previewData && (
            <div className="space-y-4 text-sm">
              {/* GL Readiness Banner */}
              <div className={`rounded-lg p-3 border ${glBlocked ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">الحالة المحاسبية</span>
                  {glLoading
                    ? <span className="text-xs text-gray-400">جاري الفحص...</span>
                    : <GlStatusBadge readiness={glReadiness} />
                  }
                </div>
                {glReadiness && (
                  <div className="space-y-1">
                    {glReadiness.checks.map(check => (
                      <div key={check.key} className="flex items-start gap-2 text-xs">
                        {check.ok
                          ? <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />
                          : <ShieldAlert className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />
                        }
                        <div>
                          <span className={check.ok ? "text-green-700" : "text-red-700"}>{check.label}</span>
                          {check.ok && check.accountCode && (
                            <span className="text-gray-500 mr-1">({check.accountCode} - {check.accountName})</span>
                          )}
                          {!check.ok && check.message && <p className="text-red-600 mt-0.5">{check.message}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {glBlocked && (
                  <div className="mt-2 pt-2 border-t border-red-200">
                    <Link href="/account-mappings" className="text-xs text-blue-600 underline flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      اذهب إلى شاشة إدارة الحسابات لربط الحسابات الناقصة
                    </Link>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded p-3">
                <div>
                  <p className="text-xs text-gray-500">كمية معلقة</p>
                  <p className="font-mono font-bold">{previewData.qtyPending.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">يمكن تسويتها</p>
                  <p className={`font-mono font-bold ${previewData.fullyResolvable ? "text-green-600" : "text-amber-600"}`}>
                    {previewData.qtyCanResolve.toFixed(4)}
                  </p>
                </div>
                {previewData.qtyShortfall > 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-red-500">عجز: {previewData.qtyShortfall.toFixed(4)}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">التكلفة الفعلية</p>
                  <p className="font-bold text-base">{previewData.estimatedCost.toFixed(2)} ج.م.</p>
                </div>
              </div>

              {/* Journal preview */}
              {previewData.estimatedCost > 0 && (
                <div>
                  <p className="font-medium mb-1 text-xs text-gray-600">القيد المحاسبي المتوقع:</p>
                  <div className={`rounded border text-xs font-mono overflow-hidden ${glBlocked ? "opacity-50" : ""}`}>
                    <div className="grid grid-cols-3 bg-gray-100 px-3 py-1 font-semibold text-gray-600">
                      <span>الحساب</span><span className="text-center">مدين</span><span className="text-center">دائن</span>
                    </div>
                    <div className="grid grid-cols-3 px-3 py-1.5 border-t">
                      <span className="text-gray-700">
                        {glReadiness?.checks.find(c => c.key === "cogs_account")?.accountCode
                          ? `${glReadiness.checks.find(c => c.key === "cogs_account")?.accountCode} - ${glReadiness.checks.find(c => c.key === "cogs_account")?.accountName}`
                          : "COGS"}
                      </span>
                      <span className="text-center text-blue-700 font-bold">{previewData.estimatedCost.toFixed(2)}</span>
                      <span className="text-center text-gray-400">—</span>
                    </div>
                    <div className="grid grid-cols-3 px-3 py-1.5 border-t">
                      <span className="text-gray-700">
                        {glReadiness?.checks.find(c => c.key === "inventory_account")?.accountCode
                          ? `${glReadiness.checks.find(c => c.key === "inventory_account")?.accountCode} - ${glReadiness.checks.find(c => c.key === "inventory_account")?.accountName}`
                          : "المخزون"}
                      </span>
                      <span className="text-center text-gray-400">—</span>
                      <span className="text-center text-red-700 font-bold">{previewData.estimatedCost.toFixed(2)}</span>
                    </div>
                  </div>
                  {glBlocked && <p className="text-xs text-red-600 mt-1">القيد لن يُنشأ حتى يتم ربط الحسابات الناقصة</p>}
                </div>
              )}

              {/* Lot details */}
              {previewData.lots.length > 0 && (
                <div>
                  <p className="font-medium mb-2 text-xs">الأدوار المقترحة (FEFO):</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right text-xs">دور</TableHead>
                        <TableHead className="text-right text-xs">كمية</TableHead>
                        <TableHead className="text-right text-xs">سعر</TableHead>
                        <TableHead className="text-right text-xs">تكلفة</TableHead>
                        <TableHead className="text-right text-xs">انتهاء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.lots.map((lot, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{lot.lotId.slice(-6)}</TableCell>
                          <TableCell className="text-xs font-mono">{lot.qtyToDeduct.toFixed(4)}</TableCell>
                          <TableCell className="text-xs font-mono">{lot.unitCost.toFixed(4)}</TableCell>
                          <TableCell className="text-xs font-mono">{lot.lineCost.toFixed(2)}</TableCell>
                          <TableCell className="text-xs">
                            {lot.expiryMonth && lot.expiryYear ? `${lot.expiryMonth}/${lot.expiryYear}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {previewData && !glBlocked && (
              <Button
                onClick={() => { if (previewId) resolveMutation.mutate([previewId]); setPreviewData(null); }}
                disabled={resolveMutation.isPending || !previewData.fullyResolvable}
              >
                {resolveMutation.isPending ? "جاري التسوية..." : "تسوية الآن"}
              </Button>
            )}
            {previewData && glBlocked && (
              <Link href="/account-mappings">
                <Button variant="default">
                  <BookOpen className="h-4 w-4 ml-1" />
                  إعداد الحسابات
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => { setPreviewData(null); setPreviewWarehouseId(null); }}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Allocation Dialog ──────────────────────────────────────── */}
      <Dialog open={!!cancelDialogId} onOpenChange={() => setCancelDialogId(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إلغاء الطلب المعلق</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              سيتم إلغاء هذا الطلب وإعادة حالة بند الفاتورة إلى وضعه الطبيعي. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div>
              <Label className="text-xs">سبب الإلغاء (اختياري)</Label>
              <Input
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="أدخل السبب..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate({ id: cancelDialogId!, reason: cancelReason })}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
            </Button>
            <Button variant="outline" onClick={() => setCancelDialogId(null)}>تراجع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Void Batch Confirm Dialog ─────────────────────────────────────── */}
      <Dialog open={!!voidConfirmId} onOpenChange={() => setVoidConfirmId(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>عكس دفعة التسوية</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Alert className="border-red-300 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 text-sm">
                سيتم:
                <ul className="list-disc pr-4 mt-1 space-y-1 text-xs">
                  <li>إعادة الكميات إلى المخزون</li>
                  <li>إصدار قيد عكسي للقيد المحاسبي (إن وجد)</li>
                  <li>إعادة الطلبات إلى حالة "معلق"</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={() => voidMutation.mutate(voidConfirmId!)}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending ? "جاري العكس..." : "تأكيد العكس"}
            </Button>
            <Button variant="outline" onClick={() => setVoidConfirmId(null)}>تراجع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Settings Dialog ────────────────────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إعدادات الصرف بدون رصيد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="flag-toggle" className="text-sm">تفعيل الصرف بدون رصيد</Label>
              <Switch
                id="flag-toggle"
                checked={featureFlag?.enabled ?? false}
                onCheckedChange={(val) => flagMutation.mutate(val)}
                disabled={flagMutation.isPending}
                data-testid="toggle-deferred-cost-issue"
              />
            </div>
            <Separator />
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <BookOpen className="h-3 w-3" />
                متطلبات إدارة الحسابات
              </div>
              <p>قبل تفعيل هذه الخاصية، تأكد من ربط الحسابات التالية:</p>
              <ul className="list-disc pr-4 space-y-1">
                <li>نوع العملية: <strong>تسوية الصرف المؤجل التكلفة</strong></li>
                <li>حساب تكلفة البضاعة المباعة (COGS) — مدين</li>
                <li>حساب المخزون — من GL المخزن تلقائياً</li>
              </ul>
              <Link href="/account-mappings" className="text-blue-600 underline flex items-center gap-1 mt-1">
                اذهب إلى إدارة الحسابات
              </Link>
            </div>
            <p className="text-xs text-gray-500">
              ملاحظة: لا يمكن إغلاق الفترة المالية إذا كانت هناك بنود معلقة غير مسواة.
              يُوجَّه اعتبار "cost_status" من: <code>pending → partial → resolved</code> بشكل تلقائي عند التسوية.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
