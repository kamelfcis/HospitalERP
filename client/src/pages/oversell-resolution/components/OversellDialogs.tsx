import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { CheckCircle, ShieldAlert, BookOpen, AlertTriangle } from "lucide-react";
import { GlStatusBadge } from "./helpers";
import type { PreviewResult, GlReadinessResult } from "./types";

interface PreviewDialogProps {
  previewData: PreviewResult | null;
  previewId: string | null;
  glReadiness: GlReadinessResult | undefined;
  glLoading: boolean;
  glBlocked: boolean;
  resolvePending: boolean;
  onResolve: (ids: string[]) => void;
  onClose: () => void;
}

export function PreviewDialog({
  previewData, previewId, glReadiness, glLoading, glBlocked,
  resolvePending, onResolve, onClose,
}: PreviewDialogProps) {
  return (
    <Dialog open={!!previewData} onOpenChange={onClose}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader><DialogTitle>معاينة التسوية</DialogTitle></DialogHeader>
        {previewData && (
          <div className="space-y-4 text-sm">
            <div className={`rounded-lg p-3 border ${glBlocked ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">الحالة المحاسبية</span>
                {glLoading ? <span className="text-xs text-gray-400">جاري الفحص...</span> : <GlStatusBadge readiness={glReadiness} />}
              </div>
              {glReadiness && (
                <div className="space-y-1">
                  {glReadiness.checks.map(check => (
                    <div key={check.key} className="flex items-start gap-2 text-xs">
                      {check.ok ? <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 shrink-0" /> : <ShieldAlert className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />}
                      <div>
                        <span className={check.ok ? "text-green-700" : "text-red-700"}>{check.label}</span>
                        {check.ok && check.accountCode && <span className="text-gray-500 mr-1">({check.accountCode} - {check.accountName})</span>}
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
                    اذهب إلى إدارة الحسابات
                  </Link>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded p-3">
              <div><p className="text-xs text-gray-500">كمية معلقة</p><p className="font-mono font-bold">{previewData.qtyPending.toFixed(4)}</p></div>
              <div>
                <p className="text-xs text-gray-500">يمكن تسويتها</p>
                <p className={`font-mono font-bold ${previewData.fullyResolvable ? "text-green-600" : "text-amber-600"}`}>{previewData.qtyCanResolve.toFixed(4)}</p>
              </div>
              {previewData.qtyShortfall > 0 && <div className="col-span-2"><p className="text-xs text-red-500">عجز: {previewData.qtyShortfall.toFixed(4)}</p></div>}
              <div className="col-span-2">
                <p className="text-xs text-gray-500">التكلفة الفعلية</p>
                <p className="font-bold text-base">{previewData.estimatedCost.toFixed(2)} ج.م.</p>
              </div>
            </div>
            {previewData.estimatedCost > 0 && (
              <div>
                <p className="font-medium mb-1 text-xs text-gray-600">القيد المتوقع:</p>
                <div className={`rounded border text-xs font-mono overflow-hidden ${glBlocked ? "opacity-50" : ""}`}>
                  <div className="grid grid-cols-3 bg-gray-100 px-3 py-1 font-semibold text-gray-600">
                    <span>الحساب</span><span className="text-center">مدين</span><span className="text-center">دائن</span>
                  </div>
                  <div className="grid grid-cols-3 px-3 py-1.5 border-t">
                    <span>{glReadiness?.checks.find(c => c.key === "cogs_account")?.accountCode ?? "COGS"}</span>
                    <span className="text-center text-blue-700 font-bold">{previewData.estimatedCost.toFixed(2)}</span>
                    <span className="text-center text-gray-400">—</span>
                  </div>
                  <div className="grid grid-cols-3 px-3 py-1.5 border-t">
                    <span>{glReadiness?.checks.find(c => c.key === "inventory_account")?.accountCode ?? "المخزون"}</span>
                    <span className="text-center text-gray-400">—</span>
                    <span className="text-center text-red-700 font-bold">{previewData.estimatedCost.toFixed(2)}</span>
                  </div>
                </div>
                {glBlocked && <p className="text-xs text-red-600 mt-1">القيد لن يُنشأ حتى ربط الحسابات</p>}
              </div>
            )}
            {previewData.lots.length > 0 && (
              <div>
                <p className="font-medium mb-2 text-xs">الأدوار (FEFO):</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">دور</TableHead>
                      <TableHead className="text-right text-xs">كمية</TableHead>
                      <TableHead className="text-right text-xs">تكلفة</TableHead>
                      <TableHead className="text-right text-xs">انتهاء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.lots.map((lot, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{lot.lotId.slice(-6)}</TableCell>
                        <TableCell className="text-xs font-mono">{lot.qtyToDeduct.toFixed(4)}</TableCell>
                        <TableCell className="text-xs font-mono">{lot.lineCost.toFixed(2)}</TableCell>
                        <TableCell className="text-xs">{lot.expiryMonth && lot.expiryYear ? `${lot.expiryMonth}/${lot.expiryYear}` : "—"}</TableCell>
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
            <Button onClick={() => { if (previewId) onResolve([previewId]); onClose(); }}
              disabled={resolvePending || !previewData.fullyResolvable}>
              {resolvePending ? "جاري التسوية..." : "تسوية الآن"}
            </Button>
          )}
          {previewData && glBlocked && (
            <Link href="/account-mappings"><Button variant="default"><BookOpen className="h-4 w-4 ml-1" />إعداد الحسابات</Button></Link>
          )}
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CancelDialogProps {
  cancelDialogId: string | null;
  cancelReason: string;
  setCancelReason: (v: string) => void;
  onCancel: () => void;
  cancelPending: boolean;
  onClose: () => void;
}

export function CancelDialog({ cancelDialogId, cancelReason, setCancelReason, onCancel, cancelPending, onClose }: CancelDialogProps) {
  return (
    <Dialog open={!!cancelDialogId} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader><DialogTitle>إلغاء الطلب المعلق</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">سيتم إلغاء هذا الطلب وإعادة بند الفاتورة إلى وضعه الطبيعي.</p>
          <div>
            <Label className="text-xs">سبب الإلغاء (اختياري)</Label>
            <Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="أدخل السبب..." className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={onCancel} disabled={cancelPending}>
            {cancelPending ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
          </Button>
          <Button variant="outline" onClick={onClose}>تراجع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VoidDialogProps {
  voidConfirmId: string | null;
  onVoid: () => void;
  voidPending: boolean;
  onClose: () => void;
}

export function VoidDialog({ voidConfirmId, onVoid, voidPending, onClose }: VoidDialogProps) {
  return (
    <Dialog open={!!voidConfirmId} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader><DialogTitle>عكس دفعة التسوية</DialogTitle></DialogHeader>
        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 text-sm">
            سيتم: إعادة الكميات للمخزون + قيد عكسي للقيد المحاسبي + إعادة الطلبات لحالة "معلق".
          </AlertDescription>
        </Alert>
        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={onVoid} disabled={voidPending}>
            {voidPending ? "جاري العكس..." : "تأكيد العكس"}
          </Button>
          <Button variant="outline" onClick={onClose}>تراجع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  featureEnabled: boolean;
  onToggle: (val: boolean) => void;
  flagPending: boolean;
}

export function SettingsDialog({ open, onClose, featureEnabled, onToggle, flagPending }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader><DialogTitle>إعدادات الصرف بدون رصيد</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="flag-toggle" className="text-sm">تفعيل الصرف بدون رصيد</Label>
            <Switch id="flag-toggle" checked={featureEnabled} onCheckedChange={onToggle} disabled={flagPending} data-testid="toggle-deferred-cost-issue" />
          </div>
          <Separator />
          <p className="text-xs text-gray-500">
            ملاحظة: لا يمكن إغلاق الفترة المالية إذا كانت هناك بنود معلقة.
            cost_status يتدرج تلقائياً: pending → partial → resolved.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
