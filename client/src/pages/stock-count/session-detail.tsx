/**
 * StockCountDetail — تفاصيل جلسة الجرد
 *
 * يُعرض عند الدخول على /stock-count/:id
 *
 * المسارات المدعومة:
 *  • تحميل أصناف المستودع تلقائياً
 *  • تعديل الكميات المعدودة inline
 *  • إضافة أصناف بالباركود / بحث سريع
 *  • حذف سطور الصفر
 *  • ترحيل الجلسة مع تأكيد
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight, Loader2, RefreshCw, Trash2, CheckCircle2, Search,
  ClipboardList, AlertTriangle, Edit2, X, ZapIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
interface SessionLine {
  id:              string;
  itemId:          string;
  itemCode:        string;
  itemNameAr:      string;
  itemCategory:    string;
  lotId:           string | null;
  expiryDate:      string | null;
  systemQtyMinor:  string;
  countedQtyMinor: string;
  differenceMinor: string;
  unitCost:        string;
  differenceValue: string;
}

interface LoadedItem {
  itemId:         string;
  itemCode:       string;
  itemNameAr:     string;
  itemCategory:   string;
  lotId:          string | null;
  expiryDate:     string | null;
  systemQtyMinor: string;
  unitCost:       string;
  alreadyCounted: boolean;
}

interface Session {
  id:            string;
  sessionNumber: number;
  warehouseId:   string;
  warehouseName: string;
  countDate:     string;
  status:        string;
  notes:         string | null;
  journalEntryId: string | null;
  lines:         SessionLine[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtQty(v: string | number, minor = 1000) {
  return (Number(v) / minor).toLocaleString("ar-EG", { minimumFractionDigits: 3 });
}
function fmtMoney(v: string | number) {
  return Number(v).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusLabel(s: string) {
  return { draft: "مسودة", posted: "مرحّل", cancelled: "ملغي" }[s] ?? s;
}
function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  return { draft: "secondary", posted: "default", cancelled: "destructive" }[s] as any ?? "outline";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Load Items Dialog
// ─────────────────────────────────────────────────────────────────────────────
function LoadItemsDialog({
  open, onClose, sessionId, warehouseId, onLoaded,
}: {
  open: boolean; onClose: () => void;
  sessionId: string; warehouseId: string;
  onLoaded: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q,       setQ]       = useState("");
  const [category, setCategory] = useState("");
  const [includeAll, setIncludeAll] = useState(false);
  const [selectedLines, setSelectedLines] = useState<LoadedItem[]>([]);
  const [allChecked, setAllChecked] = useState(false);

  const { data: items = [], isFetching } = useQuery<LoadedItem[]>({
    queryKey: ["/api/stock-count/sessions", sessionId, "load-items", q, category, includeAll],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q)          params.set("q", q);
      if (category)   params.set("category", category);
      if (includeAll) params.set("includeAll", "true");
      const res = await fetch(`/api/stock-count/sessions/${sessionId}/load-items?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open,
  });

  // auto-select all uncounted
  useEffect(() => {
    if (items.length > 0) {
      const uncounted = items.filter(i => !i.alreadyCounted);
      setSelectedLines(uncounted);
      setAllChecked(uncounted.length === items.length);
    }
  }, [items]);

  const toggleItem = (item: LoadedItem) => {
    setSelectedLines(prev =>
      prev.find(l => l.itemId === item.itemId && l.lotId === item.lotId)
        ? prev.filter(l => !(l.itemId === item.itemId && l.lotId === item.lotId))
        : [...prev, item]
    );
  };

  const isSelected = (item: LoadedItem) =>
    !!selectedLines.find(l => l.itemId === item.itemId && l.lotId === item.lotId);

  const toggleAll = () => {
    if (allChecked) {
      setSelectedLines([]);
      setAllChecked(false);
    } else {
      setSelectedLines(items);
      setAllChecked(true);
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const lines = selectedLines.map(i => ({
        itemId:          i.itemId,
        lotId:           i.lotId,
        expiryDate:      i.expiryDate,
        systemQtyMinor:  i.systemQtyMinor,
        countedQtyMinor: i.systemQtyMinor, // default = system qty
        unitCost:        i.unitCost,
      }));
      return apiRequest("POST", `/api/stock-count/sessions/${sessionId}/lines`, lines);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
      toast({ title: "تم", description: `تم إضافة ${selectedLines.length} سطر بنجاح` });
      onLoaded();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle>تحميل أصناف المستودع</DialogTitle>
        </DialogHeader>

        {/* filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pr-9"
              placeholder="ابحث بالاسم أو الكود..."
              value={q}
              onChange={e => setQ(e.target.value)}
              data-testid="input-item-search"
            />
          </div>
          <Input
            placeholder="الفئة..."
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-36"
          />
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={includeAll} onChange={e => setIncludeAll(e.target.checked)} />
            عرض المُجرَد أيضاً
          </label>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* items table */}
        <div className="flex-1 overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </TableHead>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الفئة</TableHead>
                <TableHead>تاريخ الانتهاء</TableHead>
                <TableHead className="text-center">الرصيد (وحدة)</TableHead>
                <TableHead className="text-center">جُرد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && !isFetching ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    لا توجد أصناف في هذا المستودع
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item, idx) => (
                  <TableRow
                    key={`${item.itemId}-${item.lotId ?? idx}`}
                    className={`cursor-pointer ${item.alreadyCounted ? "opacity-50" : ""}`}
                    onClick={() => toggleItem(item)}
                    data-testid={`row-load-item-${item.itemId}`}
                  >
                    <TableCell onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected(item)}
                        onChange={() => toggleItem(item)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.itemCode}</TableCell>
                    <TableCell>{item.itemNameAr}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.itemCategory}</TableCell>
                    <TableCell className="text-sm">
                      {item.expiryDate ? formatDate(item.expiryDate) : "—"}
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {fmtQty(item.systemQtyMinor)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.alreadyCounted
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <span className="text-sm text-muted-foreground ml-auto">
            {selectedLines.length} صنف محدد
          </span>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={selectedLines.length === 0 || saveMutation.isPending}
            data-testid="button-load-items-confirm"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            تحميل {selectedLines.length} صنف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Editable qty cell
// ─────────────────────────────────────────────────────────────────────────────
function QtyCell({
  lineId, sessionId, value, systemQty, unitCost, itemId, lotId, expiryDate, disabled, onSaved,
}: {
  lineId: string; sessionId: string; value: string; systemQty: string; unitCost: string;
  itemId: string; lotId: string | null; expiryDate: string | null;
  disabled: boolean; onSaved: () => void;
}) {
  const { toast }     = useToast();
  const queryClient   = useQueryClient();
  const [editing,  setEditing]  = useState(false);
  const [localVal, setLocalVal] = useState(() => (Number(value) / 1000).toFixed(3));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocalVal((Number(value) / 1000).toFixed(3));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (countedQtyMinor: string) =>
      apiRequest("POST", `/api/stock-count/sessions/${sessionId}/lines`, [
        {
          itemId,
          lotId,
          expiryDate,
          systemQtyMinor:  systemQty,
          countedQtyMinor,
          unitCost,
        },
      ]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handleConfirm = () => {
    const num = parseFloat(localVal);
    if (isNaN(num) || num < 0) {
      toast({ title: "تحذير", description: "الكمية يجب أن تكون رقماً غير سالب", variant: "destructive" });
      return;
    }
    const minorVal = String(Math.round(num * 1000));
    setEditing(false);
    saveMutation.mutate(minorVal);
  };

  if (disabled) {
    return <span className="font-mono">{fmtQty(value)}</span>;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          className="h-7 w-24 text-left font-mono"
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") setEditing(false); }}
          onBlur={handleConfirm}
          dir="ltr"
        />
        {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
    );
  }

  return (
    <button
      className="font-mono hover:text-primary hover:underline focus:outline-none flex items-center gap-1"
      onClick={() => setEditing(true)}
      title="انقر للتعديل"
      data-testid={`qty-cell-${lineId}`}
    >
      {fmtQty(value)}
      <Edit2 className="h-3 w-3 opacity-30" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function StockCountDetail() {
  const [match, params] = useRoute("/stock-count/:id");
  const [, navigate]    = useLocation();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();

  const sessionId = params?.id ?? "";

  const [loadItemsOpen, setLoadItemsOpen] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState("");

  // ── Session data ───────────────────────────────────────────────────────────
  const { data: session, isLoading, refetch } = useQuery<Session>({
    queryKey: ["/api/stock-count/sessions", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-count/sessions/${sessionId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!sessionId,
    refetchInterval: false,
  });

  // ── Delete zero lines ──────────────────────────────────────────────────────
  const deleteZeroMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/stock-count/sessions/${sessionId}/lines/zero`),
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
      toast({ title: "تم", description: `تم حذف ${data.deleted} سطر صفري` });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  // ── Delete single line ─────────────────────────────────────────────────────
  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) =>
      apiRequest("DELETE", `/api/stock-count/sessions/${sessionId}/lines/${lineId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  // ── Cancel session ─────────────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/stock-count/sessions/${sessionId}/cancel`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions"] });
      setCancelConfirmOpen(false);
      toast({ title: "تم الإلغاء", description: "تم إلغاء جلسة الجرد" });
    },
    onError: (err: any) => {
      setCancelConfirmOpen(false);
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // ── Post session ───────────────────────────────────────────────────────────
  const postMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/stock-count/sessions/${sessionId}/post`),
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions"] });
      setPostConfirmOpen(false);
      toast({
        title: "تم الترحيل بنجاح",
        description: `جلسة الجرد #${data.sessionNumber} مرحّلة. قيد يومية: ${data.journalEntryId ?? "—"}`,
      });
    },
    onError: (err: any) => {
      setPostConfirmOpen(false);
      toast({ title: "خطأ في الترحيل", description: err.message, variant: "destructive" });
    },
  });

  // ── Derived stats ──────────────────────────────────────────────────────────
  const lines = session?.lines ?? [];
  const isDraft = session?.status === "draft";

  const filteredLines = quickSearchTerm
    ? lines.filter(l =>
        l.itemNameAr.includes(quickSearchTerm) ||
        l.itemCode.toLowerCase().includes(quickSearchTerm.toLowerCase())
      )
    : lines;

  const totalDiffValue = lines.reduce((s, l) => s + parseFloat(l.differenceValue), 0);
  const surplusLines   = lines.filter(l => parseFloat(l.differenceMinor) > 0).length;
  const shortageLines  = lines.filter(l => parseFloat(l.differenceMinor) < 0).length;
  const zeroLines      = lines.filter(l => parseFloat(l.differenceMinor) === 0).length;

  if (!match) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-muted-foreground">جلسة الجرد غير موجودة</p>
        <Button className="mt-4" onClick={() => navigate("/stock-count")}>العودة للقائمة</Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 space-y-4" dir="rtl">

        {/* ── Breadcrumb + Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/stock-count")}
              data-testid="button-back"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">جلسة جرد #{session.sessionNumber}</h1>
                <Badge variant={statusVariant(session.status)}>{statusLabel(session.status)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {session.warehouseName} — {formatDate(session.countDate)}
                {session.notes && <span className="mr-2 opacity-70">· {session.notes}</span>}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          {isDraft && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLoadItemsOpen(true)}
                    data-testid="button-load-items"
                  >
                    <ZapIcon className="h-4 w-4 ml-1" />
                    تحميل أصناف
                  </Button>
                </TooltipTrigger>
                <TooltipContent>تحميل أصناف المستودع للجرد</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteZeroMutation.mutate()}
                    disabled={deleteZeroMutation.isPending || zeroLines === 0}
                    data-testid="button-delete-zero"
                  >
                    {deleteZeroMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
                      : <Trash2 className="h-4 w-4 ml-1" />}
                    حذف الصفري ({zeroLines})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>حذف السطور التي تكون فروقها = صفر</TooltipContent>
              </Tooltip>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelConfirmOpen(true)}
                className="text-destructive hover:text-destructive"
                data-testid="button-cancel-session"
              >
                إلغاء الجلسة
              </Button>

              <Button
                size="sm"
                onClick={() => setPostConfirmOpen(true)}
                disabled={lines.length === 0}
                data-testid="button-post-session"
              >
                <CheckCircle2 className="h-4 w-4 ml-1" />
                ترحيل الجرد
              </Button>
            </div>
          )}

          {session.status === "posted" && session.journalEntryId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/journal-entries/${session.journalEntryId}`)}
            >
              عرض قيد اليومية
            </Button>
          )}
        </div>

        {/* ── Summary cards ── */}
        {lines.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3 text-center">
              <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
              <p className="text-2xl font-bold">{lines.length}</p>
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="text-xs text-muted-foreground">فائض</p>
              <p className="text-2xl font-bold text-green-600">{surplusLines}</p>
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="text-xs text-muted-foreground">عجز</p>
              <p className="text-2xl font-bold text-destructive">{shortageLines}</p>
            </div>
            <div className={`rounded-md border p-3 text-center ${totalDiffValue < 0 ? "border-destructive/40 bg-destructive/5" : totalDiffValue > 0 ? "border-green-500/40 bg-green-500/5" : ""}`}>
              <p className="text-xs text-muted-foreground">قيمة الفرق الإجمالي</p>
              <p className={`text-xl font-bold ${totalDiffValue < 0 ? "text-destructive" : totalDiffValue > 0 ? "text-green-600" : ""}`}>
                {fmtMoney(totalDiffValue)} ج.م
              </p>
            </div>
          </div>
        )}

        {/* ── Lines table ── */}
        <div className="space-y-2">
          {lines.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-9"
                  placeholder="بحث سريع..."
                  value={quickSearchTerm}
                  onChange={e => setQuickSearchTerm(e.target.value)}
                  data-testid="input-quick-search"
                />
              </div>
              {quickSearchTerm && (
                <Button variant="ghost" size="icon" onClick={() => setQuickSearchTerm("")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <span className="text-sm text-muted-foreground">{filteredLines.length} سطر</span>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>الكود</TableHead>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="text-center">انتهاء الصلاحية</TableHead>
                  <TableHead className="text-center">الرصيد الدفتري</TableHead>
                  <TableHead className="text-center">الكمية المعدودة</TableHead>
                  <TableHead className="text-center">الفرق</TableHead>
                  <TableHead className="text-center">سعر التكلفة</TableHead>
                  <TableHead className="text-center">قيمة الفرق</TableHead>
                  {isDraft && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isDraft ? 10 : 9} className="text-center py-12 text-muted-foreground">
                      {lines.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <AlertTriangle className="h-10 w-10 opacity-30" />
                          <p>لا توجد أصناف في هذه الجلسة بعد</p>
                          {isDraft && (
                            <Button onClick={() => setLoadItemsOpen(true)} size="sm">
                              <ZapIcon className="h-4 w-4 ml-1" />
                              تحميل أصناف المستودع
                            </Button>
                          )}
                        </div>
                      ) : "لا توجد نتائج للبحث"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLines.map((line, idx) => {
                    const diff = parseFloat(line.differenceMinor);
                    const diffVal = parseFloat(line.differenceValue);
                    return (
                      <TableRow
                        key={line.id}
                        className={diff < 0 ? "bg-destructive/5" : diff > 0 ? "bg-green-500/5" : ""}
                        data-testid={`row-line-${line.id}`}
                      >
                        <TableCell className="text-muted-foreground text-sm text-center">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{line.itemCode}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{line.itemNameAr}</p>
                            <p className="text-xs text-muted-foreground">{line.itemCategory}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {line.expiryDate ? formatDate(line.expiryDate) : "—"}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {fmtQty(line.systemQtyMinor)}
                        </TableCell>
                        <TableCell className="text-center">
                          <QtyCell
                            lineId={line.id}
                            sessionId={session.id}
                            value={line.countedQtyMinor}
                            systemQty={line.systemQtyMinor}
                            unitCost={line.unitCost}
                            itemId={line.itemId}
                            lotId={line.lotId}
                            expiryDate={line.expiryDate}
                            disabled={!isDraft}
                            onSaved={() => {}}
                          />
                        </TableCell>
                        <TableCell className={`text-center font-mono font-semibold ${diff < 0 ? "text-destructive" : diff > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {diff > 0 ? "+" : ""}{fmtQty(line.differenceMinor)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {fmtMoney(line.unitCost)}
                        </TableCell>
                        <TableCell className={`text-center font-mono font-semibold ${diffVal < 0 ? "text-destructive" : diffVal > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {diffVal !== 0 && (diffVal > 0 ? "+" : "")}{fmtMoney(diffVal)}
                        </TableCell>
                        {isDraft && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteLineMutation.mutate(line.id)}
                              disabled={deleteLineMutation.isPending}
                              data-testid={`button-delete-line-${line.id}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Dialogs ── */}
        <LoadItemsDialog
          open={loadItemsOpen}
          onClose={() => setLoadItemsOpen(false)}
          sessionId={session.id}
          warehouseId={session.warehouseId}
          onLoaded={() => refetch()}
        />

        {/* Post confirm */}
        <AlertDialog open={postConfirmOpen} onOpenChange={setPostConfirmOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الترحيل</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم ترحيل جلسة الجرد #{session.sessionNumber} بشكل دائم لا يمكن التراجع عنه.
                <br /><br />
                <strong>الأصناف:</strong> {lines.length} سطر
                <br />
                <strong>قيمة الفرق الإجمالي:</strong>{" "}
                <span className={totalDiffValue < 0 ? "text-destructive" : "text-green-600"}>
                  {fmtMoney(totalDiffValue)} ج.م
                </span>
                <br /><br />
                سيتم تعديل أرصدة المخزون وإنشاء قيد يومية تلقائياً.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => postMutation.mutate()}
                disabled={postMutation.isPending}
                data-testid="button-confirm-post"
              >
                {postMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                تأكيد الترحيل
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Cancel confirm */}
        <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الإلغاء</AlertDialogTitle>
              <AlertDialogDescription>
                هل تريد إلغاء جلسة الجرد #{ session.sessionNumber}؟ لن يُمكن إعادة تفعيلها.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>تراجع</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/80"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                data-testid="button-confirm-cancel"
              >
                {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                إلغاء الجلسة
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </TooltipProvider>
  );
}
