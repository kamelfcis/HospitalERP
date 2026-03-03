import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/formatters";
import type { Department } from "@shared/schema";

interface Props {
  open: boolean;
  onClose: () => void;
  listId: string;
}

// ─── BulkAdjustModal ───────────────────────────────────────────────────────────
/**
 * BulkAdjustModal
 * ديالوج التعديل الجماعي للأسعار (نسبة مئوية أو مبلغ ثابت، زيادة أو تخفيض).
 * يتيح معاينة النتائج قبل التطبيق.
 */
export default function BulkAdjustModal({ open, onClose, listId }: Props) {
  const { toast } = useToast();
  const [mode, setMode]               = useState("PCT");
  const [direction, setDirection]     = useState("INCREASE");
  const [value, setValue]             = useState("");
  const [filterDeptId, setFilterDeptId] = useState("");
  const [filterCat, setFilterCat]     = useState("");
  const [createMissing, setCreateMissing] = useState(true);
  const [preview, setPreview]         = useState<any>(null);

  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });

  const buildPayload = () => ({
    mode, direction, value: parseFloat(value),
    departmentId: filterDeptId || null,
    category: filterCat || null,
    createMissingFromBasePrice: createMissing,
  });

  const previewMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/price-lists/${listId}/bulk-adjust/preview`, buildPayload()).then(r => r.json()),
    onSuccess: (data) => setPreview(data),
    onError:   (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/price-lists/${listId}/bulk-adjust/apply`, buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", listId] });
      toast({ title: "تم تطبيق التعديل الجماعي بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!open) {
      setMode("PCT"); setDirection("INCREASE"); setValue(""); setFilterDeptId(""); setFilterCat("");
      setCreateMissing(true); setPreview(null);
    }
  }, [open]);

  useEffect(() => { setPreview(null); }, [mode, direction, value, filterDeptId, filterCat, createMissing]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل جماعي للأسعار</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">

            <div className="space-y-1">
              <Label>نوع التعديل</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger data-testid="select-trigger-bulk-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PCT">نسبة مئوية</SelectItem>
                  <SelectItem value="FIXED">مبلغ ثابت</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>الاتجاه</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger data-testid="select-trigger-bulk-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCREASE">زيادة</SelectItem>
                  <SelectItem value="DECREASE">تخفيض</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>القيمة {mode === "PCT" ? "(%)" : ""}</Label>
              <Input data-testid="input-bulk-value" type="number" min="0" step="0.01"
                value={value} onChange={e => setValue(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>القسم (اختياري)</Label>
              <Select value={filterDeptId || "all"} onValueChange={v => setFilterDeptId(v === "all" ? "" : v)}>
                <SelectTrigger data-testid="select-trigger-bulk-dept">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {(departments || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>الفئة (اختياري)</Label>
              <Input data-testid="input-bulk-category" value={filterCat}
                onChange={e => setFilterCat(e.target.value)} placeholder="اتركه فارغاً للكل" />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="bulk-create-missing" checked={createMissing}
                onCheckedChange={v => setCreateMissing(!!v)}
                data-testid="checkbox-create-missing" />
              <Label htmlFor="bulk-create-missing" className="text-sm">
                إنشاء أسعار مفقودة من السعر الأساسي
              </Label>
            </div>
          </div>

          {/* ─── معاينة ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || !value} data-testid="button-bulk-preview">
              {previewMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
                : <Eye className="h-4 w-4 ml-1" />}
              معاينة
            </Button>
            {preview && (
              <span className="text-xs text-muted-foreground" data-testid="text-affected-count">
                عدد الخدمات المتأثرة: {preview.affectedCount}
              </span>
            )}
          </div>

          {preview?.preview && preview.preview.length > 0 && (
            <div className="max-h-48 overflow-auto">
              <div className="peachtree-grid overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="peachtree-grid-header" data-testid="header-bulk-preview-table">
                      <th>الخدمة</th>
                      <th>السعر القديم</th>
                      <th>السعر الجديد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((r: any, i: number) => (
                      <tr key={i} className="peachtree-grid-row">
                        <td className="text-xs">{r.serviceNameAr || r.serviceCode || "-"}</td>
                        <td className="peachtree-amount text-xs">{formatNumber(r.oldPrice)}</td>
                        <td className="peachtree-amount text-xs">{formatNumber(r.newPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-bulk">إلغاء</Button>
          <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending || !preview}
            data-testid="button-apply-bulk">
            {applyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            تطبيق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
