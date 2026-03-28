/**
 * opening-stock/form.tsx — نموذج وثيقة الرصيد الافتتاحي
 *
 * الميزات:
 *  - جدول سطور إدخال بيانات grid-style
 *  - استيراد / تصدير Excel
 *  - زر الترحيل (draft → posted)
 *  - قراءة فقط بعد الترحيل
 */
import { useState, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, PackagePlus, Download, Upload, Send, Trash2, ArrowRight, Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";

// ── helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "posted")
    return <Badge variant="default" className="bg-green-600">مرحّل ✓</Badge>;
  return <Badge variant="secondary">مسودة</Badge>;
}

interface LineFormState {
  itemCode:      string;
  unitLevel:     string;
  qtyInUnit:     string;
  purchasePrice: string;
  salePrice:     string;
  batchNo:       string;
  expiryMonth:   string;
  expiryYear:    string;
  lineNotes:     string;
}

const EMPTY_LINE: LineFormState = {
  itemCode: "", unitLevel: "major", qtyInUnit: "",
  purchasePrice: "", salePrice: "", batchNo: "",
  expiryMonth: "", expiryYear: "", lineNotes: "",
};

// ── AddLineRow — سطر إضافة صنف جديد ──────────────────────────────────────

function AddLineRow({
  headerId,
  onAdded,
}: {
  headerId: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<LineFormState>({ ...EMPTY_LINE });
  const qtyRef = useRef<HTMLInputElement>(null);

  const setF = (key: keyof LineFormState, val: string) =>
    setForm((p) => ({ ...p, [key]: val }));

  const add = useMutation({
    mutationFn: async () => {
      if (!form.itemCode.trim()) throw new Error("أدخل كود الصنف");
      const qty = parseFloat(form.qtyInUnit);
      if (!(qty > 0)) throw new Error("الكمية يجب أن تكون أكبر من صفر");

      const itemRes = await fetch(
        `/api/items/search?q=${encodeURIComponent(form.itemCode.trim())}`,
        { credentials: "include" }
      );
      const itemData = await itemRes.json();
      const items = Array.isArray(itemData) ? itemData : (itemData?.items ?? []);
      const item = items.find(
        (i: any) => i.itemCode?.toLowerCase() === form.itemCode.trim().toLowerCase()
      ) ?? items[0] ?? null;
      if (!item) throw new Error(`الصنف "${form.itemCode}" غير موجود`);

      return apiRequest("POST", `/api/opening-stock/${headerId}/lines`, {
        itemId:        item.id,
        unitLevel:     form.unitLevel,
        qtyInUnit:     qty,
        purchasePrice: parseFloat(form.purchasePrice) || 0,
        salePrice:     parseFloat(form.salePrice) || 0,
        batchNo:       form.batchNo || null,
        expiryMonth:   form.expiryMonth ? parseInt(form.expiryMonth) : null,
        expiryYear:    form.expiryYear  ? parseInt(form.expiryYear)  : null,
        lineNotes:     form.lineNotes || null,
      });
    },
    onSuccess: () => {
      setForm({ ...EMPTY_LINE });
      onAdded();
      qtyRef.current?.focus();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <TableRow className="bg-muted/20">
      <TableCell>
        <Input
          value={form.itemCode}
          onChange={(e) => setF("itemCode", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && qtyRef.current?.focus()}
          placeholder="كود الصنف"
          className="h-7 text-xs font-mono"
          data-testid="input-item-code-new"
        />
      </TableCell>
      <TableCell>
        <Select value={form.unitLevel} onValueChange={(v) => setF("unitLevel", v)} dir="rtl">
          <SelectTrigger className="h-7 text-xs" data-testid="select-unit-level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="major">كبرى</SelectItem>
            <SelectItem value="medium">متوسطة</SelectItem>
            <SelectItem value="minor">صغرى</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          ref={qtyRef}
          type="number"
          value={form.qtyInUnit}
          onChange={(e) => setF("qtyInUnit", e.target.value)}
          className="h-7 text-xs text-left font-mono"
          placeholder="0"
          data-testid="input-qty"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={form.purchasePrice}
          onChange={(e) => setF("purchasePrice", e.target.value)}
          className="h-7 text-xs text-left font-mono"
          placeholder="0.00"
          data-testid="input-purchase-price"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={form.salePrice}
          onChange={(e) => setF("salePrice", e.target.value)}
          className="h-7 text-xs text-left font-mono"
          placeholder="0.00"
          data-testid="input-sale-price"
        />
      </TableCell>
      <TableCell>
        <Input
          value={form.batchNo}
          onChange={(e) => setF("batchNo", e.target.value)}
          className="h-7 text-xs"
          placeholder="اختياري"
          data-testid="input-batch-no"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Input
            type="number"
            value={form.expiryMonth}
            onChange={(e) => setF("expiryMonth", e.target.value)}
            className="h-7 text-xs w-14 text-center"
            placeholder="شهر"
            min={1} max={12}
            data-testid="input-expiry-month"
          />
          <Input
            type="number"
            value={form.expiryYear}
            onChange={(e) => setF("expiryYear", e.target.value)}
            className="h-7 text-xs w-20 text-center"
            placeholder="سنة"
            min={2020} max={2099}
            data-testid="input-expiry-year"
          />
        </div>
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="default"
          className="h-7 px-3"
          onClick={() => add.mutate()}
          disabled={add.isPending}
          data-testid="button-add-line"
        >
          {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ── Main Form Page ─────────────────────────────────────────────────────────

export default function OpeningStockForm() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const docId = params.id;

  const { data: doc, isLoading } = useQuery<any>({
    queryKey: ["/api/opening-stock", docId],
    enabled: !!docId,
  });

  const isPosted = doc?.status === "posted";
  const lines: any[] = doc?.lines ?? [];

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/opening-stock", docId] });
    qc.invalidateQueries({ queryKey: ["/api/opening-stock"] });
  }, [qc, docId]);

  // ── الترحيل ─────────────────────────────────────────────────────────────
  const postMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/opening-stock/${docId}/post`, {}),
    onSuccess: () => {
      toast({ title: "✓ تم الترحيل بنجاح", description: "تم إنشاء الحركات في المخزن" });
      invalidate();
      setShowPostConfirm(false);
    },
    onError: (e: any) => {
      toast({ title: "خطأ في الترحيل", description: e.message, variant: "destructive" });
      setShowPostConfirm(false);
    },
  });

  // ── حذف سطر ─────────────────────────────────────────────────────────────
  const deleteLine = useMutation({
    mutationFn: (lineId: string) =>
      apiRequest("DELETE", `/api/opening-stock/${docId}/lines/${lineId}`, {}),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ── تصدير Excel ──────────────────────────────────────────────────────────
  const handleExport = () => {
    window.open(`/api/opening-stock/${docId}/export`, "_blank");
  };

  // ── تحميل النموذج ────────────────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    window.open("/api/opening-stock/template", "_blank");
  };

  // ── استيراد Excel ────────────────────────────────────────────────────────
  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/opening-stock/${docId}/import`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطأ في الاستيراد");
      }
      return res.json();
    },
    onSuccess: (result) => {
      invalidate();
      const errText = result.errors?.length
        ? `\n⚠ ${result.errors.slice(0, 3).join("\n")}${result.errors.length > 3 ? `\n... و${result.errors.length - 3} أخرى` : ""}`
        : "";
      toast({
        title: `تم الاستيراد: ${result.imported} صنف`,
        description: errText || "اكتمل الاستيراد بنجاح",
        variant: result.errors?.length ? "destructive" : "default",
      });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMut.mutate(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">الوثيقة غير موجودة</p>
        <Button variant="outline" onClick={() => navigate("/opening-stock")}>
          <ArrowRight className="h-4 w-4 ml-1" />
          العودة للقائمة
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/opening-stock")}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <PackagePlus className="h-5 w-5 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">الرصيد الافتتاحي</span>
              <span className="text-muted-foreground text-sm">—</span>
              <span className="font-medium text-sm">{doc.warehouseNameAr ?? "—"}</span>
              <StatusBadge status={doc.status} />
            </div>
            <div className="text-xs text-muted-foreground">
              تاريخ الرصيد: {formatDate(doc.postDate)}
              {doc.notes && ` | ${doc.notes}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isPosted && (
            <>
              <input
                type="file"
                accept=".xlsx,.xls"
                ref={fileRef}
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-import-file"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                title="تحميل نموذج Excel"
                data-testid="button-download-template"
              >
                <Download className="h-4 w-4 ml-1" />
                نموذج
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importMut.isPending}
                data-testid="button-import"
              >
                {importMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  : <Upload className="h-4 w-4 ml-1" />
                }
                استيراد Excel
              </Button>
            </>
          )}

          {lines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              data-testid="button-export"
            >
              <Download className="h-4 w-4 ml-1" />
              تصدير
            </Button>
          )}

          {!isPosted && lines.length > 0 && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setShowPostConfirm(true)}
              data-testid="button-post"
            >
              <Send className="h-4 w-4 ml-1" />
              ترحيل
            </Button>
          )}
        </div>
      </div>

      {/* ── Lines Grid ── */}
      <div className="flex-1 overflow-auto p-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="text-xs bg-muted/50">
                <TableHead className="text-right w-[140px]">كود الصنف</TableHead>
                <TableHead className="text-right w-[90px]">الوحدة</TableHead>
                <TableHead className="text-right w-[90px]">الكمية</TableHead>
                <TableHead className="text-right w-[110px]">سعر الشراء</TableHead>
                <TableHead className="text-right w-[110px]">سعر البيع</TableHead>
                <TableHead className="text-right w-[110px]">التشغيلة</TableHead>
                <TableHead className="text-right w-[130px]">الصلاحية</TableHead>
                {!isPosted && <TableHead className="w-[60px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id} className="text-xs" data-testid={`row-line-${line.id}`}>
                  <TableCell>
                    <div className="font-mono font-medium">{line.itemCode ?? "—"}</div>
                    <div className="text-muted-foreground text-[10px] truncate max-w-[130px]">
                      {line.itemNameAr ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {line.unitLevel === "major" ? "كبرى" : line.unitLevel === "medium" ? "متوسطة" : "صغرى"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono font-semibold">
                    {parseFloat(line.qtyInUnit).toLocaleString("ar-EG", { maximumFractionDigits: 3 })}
                  </TableCell>
                  <TableCell className="font-mono text-left" dir="ltr">
                    {parseFloat(line.purchasePrice).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </TableCell>
                  <TableCell className="font-mono text-left" dir="ltr">
                    {parseFloat(line.salePrice).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{line.batchNo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {line.expiryMonth && line.expiryYear
                      ? `${line.expiryMonth}/${line.expiryYear}`
                      : "—"}
                  </TableCell>
                  {!isPosted && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteLine.mutate(line.id)}
                        disabled={deleteLine.isPending}
                        data-testid={`button-delete-line-${line.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}

              {!isPosted && (
                <AddLineRow headerId={docId} onAdded={invalidate} />
              )}

              {lines.length === 0 && isPosted && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    لا توجد سطور
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Summary ── */}
        {lines.length > 0 && (
          <div className="mt-3 flex gap-6 text-sm text-muted-foreground">
            <span>إجمالي الأصناف: <strong className="text-foreground">{lines.length}</strong></span>
            <span>
              إجمالي التكلفة:{" "}
              <strong className="text-foreground font-mono">
                {lines.reduce((sum, l) => {
                  const q = parseFloat(l.qtyInMinor || "0");
                  const p = parseFloat(l.purchasePrice || "0");
                  return sum + q * p;
                }, 0).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
              </strong>{" "}
              ج.م
            </span>
          </div>
        )}
      </div>

      {/* ── Confirm Post Dialog ── */}
      <AlertDialog open={showPostConfirm} onOpenChange={setShowPostConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الترحيل</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء الدُفعات في المخزن لـ <strong>{lines.length}</strong> صنف.
              هذه العملية <strong>لا يمكن التراجع عنها</strong>.
              هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => postMut.mutate()}
              data-testid="button-confirm-post"
            >
              {postMut.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              ترحيل الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
