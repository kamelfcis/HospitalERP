/**
 * OversellResolutionPage — شاشة تسوية الصرف بدون رصيد
 *
 * يعرض جميع بنود patient_invoice_lines ذات status = pending_cost
 * ويتيح للمسؤول تسويتها عبر خصم حقيقي من أدوار المخزن.
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Package, RefreshCw, CheckCircle, Clock, AlertTriangle, Settings, Eye,
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function statusBadge(status: PendingAllocation["status"]) {
  switch (status) {
    case "pending":            return <Badge variant="destructive" className="text-xs">معلق</Badge>;
    case "partially_resolved": return <Badge variant="outline"    className="text-xs border-amber-500 text-amber-700">جزئي</Badge>;
    case "fully_resolved":     return <Badge className="text-xs bg-green-100 text-green-700">مسوّى</Badge>;
    default:                   return <Badge variant="outline" className="text-xs">ملغي</Badge>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function OversellResolutionPage() {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewId, setPreviewId]     = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: stats, refetch: refetchStats } = useQuery<OversellStats>({
    queryKey: ["/api/oversell/stats"],
  });

  const { data: pendingData, isLoading, refetch } = useQuery<{
    data: PendingAllocation[]; total: number; page: number; totalPages: number;
  }>({
    queryKey: ["/api/oversell/pending"],
  });

  const { data: featureFlag, refetch: refetchFlag } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/deferred-cost-issue"],
  });

  const allocations = pendingData?.data ?? [];

  // ── Preview mutation ─────────────────────────────────────────────────────
  const previewMutation = useMutation({
    mutationFn: (allocationId: string) =>
      apiRequest("POST", "/api/oversell/preview", { allocationId }).then(r => r.json()),
    onSuccess: (data: PreviewResult) => {
      setPreviewData(data);
      setPreviewId(data.allocationId);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطأ", description: err.message }),
  });

  // ── Resolve mutation ─────────────────────────────────────────────────────
  const resolveMutation = useMutation({
    mutationFn: (allocationIds: string[]) => {
      const warehouseId = allocations.find(a => allocationIds.includes(a.id))?.warehouse_id ?? "";
      return apiRequest("POST", "/api/oversell/resolve", {
        warehouseId,
        notes: `تسوية دفعة — ${new Date().toLocaleDateString("ar")}`,
        lines: allocationIds.map(id => ({
          pendingAllocationId: id,
          qtyMinorToResolve: parseFloat(
            allocations.find(a => a.id === id)?.qty_minor_pending ?? "0"
          ),
        })),
      }).then(r => r.json());
    },
    onSuccess: () => {
      toast({ title: "تمت التسوية", description: "تم خصم الكميات من المخزون بنجاح" });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/oversell/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oversell/stats"] });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "فشلت التسوية", description: err.message }),
  });

  // ── Feature flag mutation ─────────────────────────────────────────────────
  const flagMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", "/api/settings/deferred-cost-issue", { enabled }).then(r => r.json()),
    onSuccess: () => {
      refetchFlag();
      toast({ title: "تم الحفظ" });
    },
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
    const allIds = allocations.filter(a => a.status !== "fully_resolved").map(a => a.id);
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
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
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

      {/* Feature flag warning */}
      {featureFlag && !featureFlag.enabled && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            خاصية الصرف بدون رصيد <strong>معطّلة</strong> حالياً. لن تُنشأ تسجيلات جديدة. يمكن تفعيلها من الإعدادات.
          </AlertDescription>
        </Alert>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <span className="text-sm font-medium text-blue-800">
            تم تحديد {selectedIds.size} بند
          </span>
          <Button
            size="sm"
            onClick={() => resolveMutation.mutate(Array.from(selectedIds))}
            disabled={resolveMutation.isPending}
          >
            {resolveMutation.isPending ? "جاري التسوية..." : "تسوية المحدد"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
            إلغاء التحديد
          </Button>
        </div>
      )}

      {/* Table */}
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
                    <input
                      type="checkbox"
                      checked={selectedIds.size === allocations.filter(a => a.status !== "fully_resolved").length}
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
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((alloc) => {
                  const qtyPending = parseFloat(alloc.qty_minor_pending);
                  const currentStock = parseFloat(alloc.current_stock_minor);
                  const canResolve = currentStock >= qtyPending - 0.00005;
                  const isResolved = alloc.status === "fully_resolved";

                  return (
                    <TableRow
                      key={alloc.id}
                      className={selectedIds.has(alloc.id) ? "bg-blue-50" : ""}
                      data-testid={`oversell-row-${alloc.id}`}
                    >
                      <TableCell>
                        {!isResolved && (
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
                      <TableCell>{statusBadge(alloc.status)}</TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(alloc.created_at).toLocaleDateString("ar")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => previewMutation.mutate(alloc.id)}
                            disabled={previewMutation.isPending || isResolved}
                            data-testid={`preview-btn-${alloc.id}`}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {!isResolved && canResolve && (
                            <Button
                              size="sm"
                              onClick={() => resolveMutation.mutate([alloc.id])}
                              disabled={resolveMutation.isPending}
                              data-testid={`resolve-btn-${alloc.id}`}
                            >
                              تسوية
                            </Button>
                          )}
                          {!isResolved && !canResolve && (
                            <span className="text-xs text-red-500 self-center">رصيد غير كافٍ</span>
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

      {/* Preview Dialog */}
      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>معاينة التسوية</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4 text-sm">
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
                  <p className="text-xs text-gray-500">التكلفة المقدّرة</p>
                  <p className="font-bold">{previewData.estimatedCost.toFixed(2)} ج.م.</p>
                </div>
              </div>

              {previewData.lots.length > 0 && (
                <div>
                  <p className="font-medium mb-2">الأدوار المقترحة:</p>
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
                            {lot.expiryMonth && lot.expiryYear
                              ? `${lot.expiryMonth}/${lot.expiryYear}`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {previewData && (
              <Button
                onClick={() => {
                  if (previewId) resolveMutation.mutate([previewId]);
                  setPreviewData(null);
                }}
                disabled={resolveMutation.isPending || !previewData.fullyResolvable}
              >
                تسوية الآن
              </Button>
            )}
            <Button variant="outline" onClick={() => setPreviewData(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إعدادات الصرف بدون رصيد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="flag-toggle" className="text-sm">
                تفعيل الصرف بدون رصيد
              </Label>
              <Switch
                id="flag-toggle"
                checked={featureFlag?.enabled ?? false}
                onCheckedChange={(val) => flagMutation.mutate(val)}
                disabled={flagMutation.isPending}
                data-testid="toggle-deferred-cost-issue"
              />
            </div>
            <Separator />
            <p className="text-xs text-gray-500">
              عند التفعيل: يُسمح بصرف الأصناف المحددة حتى لو كانت الكمية المتاحة أقل من المطلوب،
              ويُسجَّل الفرق كـ "طلب معلق" لحين وصول التوريد.
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
