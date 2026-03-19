/**
 * StockCountDetail — تفاصيل جلسة الجرد (منسّق رفيع ~250 سطر)
 *
 * يستورد المكونات من components/ ويدير الحالة العليا فقط.
 */
import { useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  TooltipProvider, Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight, Loader2, Trash2, CheckCircle2, ClipboardList, ZapIcon,
  Lock, TrendingUp, TrendingDown, Scale, Printer, BookOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";

import { LoadItemsDialog } from "./components/LoadItemsDialog";
import { BarcodeInput }    from "./components/BarcodeInput";
import { LineTable, type SessionLine } from "./components/LineTable";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
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
  id:              string;
  sessionNumber:   number;
  warehouseId:     string;
  warehouseName:   string;
  countDate:       string;
  status:          string;
  notes:           string | null;
  journalEntryId:  string | null;
  createdByName:   string | null;
  postedByName:    string | null;
  postedAt:        string | null;
  createdAt:       string;
  lines:           SessionLine[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtMoney(v: number) {
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
function statusLabel(s: string) {
  return ({ draft: "مسودة", posted: "مرحّل", cancelled: "ملغي" } as Record<string, string>)[s] ?? s;
}
function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  return ({ draft: "secondary", posted: "default", cancelled: "destructive" } as Record<string, any>)[s] ?? "outline";
}

// ─────────────────────────────────────────────────────────────────────────────
//  PostedSummaryCard — تقرير مصادقة الترحيل (يظهر عند status = posted)
// ─────────────────────────────────────────────────────────────────────────────
function PostedSummaryCard({
  session,
  lines,
  onViewJournal,
}: {
  session:      Session;
  lines:        SessionLine[];
  onViewJournal: () => void;
}) {
  const surplus  = lines.reduce((s, l) => {
    const d = parseFloat(l.differenceMinor);
    return d > 0.0001 ? s + parseFloat(l.differenceValue) : s;
  }, 0);
  const shortage = lines.reduce((s, l) => {
    const d = parseFloat(l.differenceMinor);
    return d < -0.0001 ? s + Math.abs(parseFloat(l.differenceValue)) : s;
  }, 0);
  const net      = surplus - shortage;
  const zeroCount    = lines.filter(l => Math.abs(parseFloat(l.differenceMinor)) <= 0.0001).length;
  const surplusCount = lines.filter(l => parseFloat(l.differenceMinor) >  0.0001).length;
  const shortageCount= lines.filter(l => parseFloat(l.differenceMinor) < -0.0001).length;

  return (
    <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20 flex-shrink-0 print:border print:border-green-300" data-testid="posted-summary-card">
      <CardContent className="pt-4 pb-3 px-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="font-semibold text-sm text-green-700 dark:text-green-400">تقرير مصادقة الترحيل</span>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {session.journalEntryId && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onViewJournal}>
                <BookOpen className="h-3.5 w-3.5" />
                قيد اليومية
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              طباعة
            </Button>
          </div>
        </div>

        {/* ── Metadata grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1.5 text-sm mb-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-medium text-foreground">المستودع:</span> {session.warehouseName}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-medium text-foreground">تاريخ الجرد:</span> {formatDate(session.countDate)}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-medium text-foreground">رحّله:</span> {session.postedByName ?? "—"}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-medium text-foreground">وقت الترحيل:</span> {fmtDateTime(session.postedAt)}
          </div>
        </div>

        <Separator className="mb-3" />

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Surplus */}
          <div className="bg-green-100 dark:bg-green-900/30 rounded-md p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-green-700 dark:text-green-400 mb-0.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">فوائض ({surplusCount})</span>
            </div>
            <p className="font-mono font-bold text-green-700 dark:text-green-300 text-sm">
              +{fmtMoney(surplus)} ج.م
            </p>
          </div>

          {/* Shortage */}
          <div className="bg-red-100 dark:bg-red-900/30 rounded-md p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-destructive mb-0.5">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">عجز ({shortageCount})</span>
            </div>
            <p className="font-mono font-bold text-destructive text-sm">
              -{fmtMoney(shortage)} ج.م
            </p>
          </div>

          {/* Net */}
          <div className={`rounded-md p-2.5 text-center ${
            net > 0 ? "bg-green-100 dark:bg-green-900/30" :
            net < 0 ? "bg-red-100 dark:bg-red-900/30" :
                      "bg-muted"
          }`}>
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
              <Scale className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">صافي الفرق</span>
            </div>
            <p className={`font-mono font-bold text-sm ${
              net > 0 ? "text-green-700 dark:text-green-300" :
              net < 0 ? "text-destructive" :
                        "text-muted-foreground"
            }`}>
              {net > 0 ? "+" : ""}{fmtMoney(net)} ج.م
            </p>
          </div>

          {/* Lines breakdown */}
          <div className="bg-muted rounded-md p-2.5 text-center">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">الأصناف المُجرَّدة</p>
            <p className="font-mono font-bold text-sm">{lines.length}</p>
          </div>

          {/* Journal ref */}
          <div className="bg-muted rounded-md p-2.5 text-center">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">لا فرق (صفري)</p>
            <p className="font-mono font-bold text-sm text-muted-foreground">{zeroCount}</p>
          </div>
        </div>

        {/* ── Journal entry reference ── */}
        {session.journalEntryId && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
            <BookOpen className="h-3.5 w-3.5" />
            <span>قيد اليومية مرتبط:</span>
            <button
              className="font-mono text-primary underline-offset-2 hover:underline"
              onClick={onViewJournal}
              data-testid="link-journal-entry"
            >
              {session.journalEntryId.slice(0, 8)}…
            </button>
          </div>
        )}
        {!session.journalEntryId && (
          <p className="mt-3 text-xs text-muted-foreground border-t pt-2">
            لا يوجد قيد يومية (لم توجد فروق مالية أو المستودع بدون حساب محاسبي)
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────────
export default function StockCountDetail() {
  const [match, params] = useRoute("/stock-count/:id");
  const [, navigate]    = useLocation();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();

  const sessionId = params?.id ?? "";

  const [loadItemsOpen,    setLoadItemsOpen]    = useState(false);
  const [postConfirmOpen,  setPostConfirmOpen]  = useState(false);
  const [cancelConfirmOpen,setCancelConfirmOpen] = useState(false);
  const [focusLineId,      setFocusLineId]      = useState<string | null>(null);

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

  // ── Barcode: add lots then focus row ──────────────────────────────────────
  const handleBarcodeAddItems = useCallback(async (lots: LoadedItem[]) => {
    const body = lots.map(i => ({
      itemId:          i.itemId,
      lotId:           i.lotId,
      expiryDate:      i.expiryDate,
      systemQtyMinor:  i.systemQtyMinor,
      countedQtyMinor: i.systemQtyMinor,
      unitCost:        i.unitCost,
    }));
    await apiRequest("POST", `/api/stock-count/sessions/${sessionId}/lines`, body);
    await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
    // Focus the first newly-added lot's line (find it by itemId after refresh)
    // The LineTable will handle focusing via focusLineId state when we set it
    const freshSession = await queryClient.getQueryData<Session>(["/api/stock-count/sessions", sessionId]);
    const addedLine = freshSession?.lines.find(l =>
      lots.some(lot => lot.itemId === l.itemId && (lot.lotId === l.lotId || (!lot.lotId && !l.lotId)))
    );
    if (addedLine) setFocusLineId(addedLine.id);
  }, [sessionId, queryClient]);

  // ─────────────────────────────────────────────────────────────────────────
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

  const lines   = session.lines;
  const isDraft = session.status === "draft";
  const totalDiffValue = lines.reduce((s, l) => s + parseFloat(l.differenceValue), 0);
  const zeroLines      = lines.filter(l => parseFloat(l.differenceMinor) === 0).length;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full p-4 md:p-6 gap-4 min-h-0" dir="rtl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap flex-shrink-0">
          <div className="flex items-start gap-2">
            <Button
              variant="ghost" size="icon"
              onClick={() => navigate("/stock-count")}
              data-testid="button-back"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">جلسة جرد #{session.sessionNumber}</h1>
                <Badge variant={statusVariant(session.status)}>{statusLabel(session.status)}</Badge>
                {!isDraft && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    <Lock className="h-3 w-3" />
                    محمي للقراءة فقط
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {session.warehouseName} — {formatDate(session.countDate)}
                {session.notes && <span className="mr-2 opacity-70">· {session.notes}</span>}
              </p>
            </div>
          </div>

          {/* Action zone */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Barcode scanner — only while draft */}
            {isDraft && (
              <BarcodeInput
                sessionId={sessionId}
                sessionLines={lines.map(l => ({ id: l.id, itemId: l.itemId, lotId: l.lotId }))}
                onFocusLine={setFocusLineId}
                onAddItems={handleBarcodeAddItems}
              />
            )}

            {isDraft && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm"
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
                      variant="outline" size="sm"
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
                  <TooltipContent>حذف السطور التي فروقها صفر</TooltipContent>
                </Tooltip>

                <Button
                  variant="outline" size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelConfirmOpen(true)}
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
              </>
            )}

            {session.status === "posted" && session.journalEntryId && (
              <Button
                variant="outline" size="sm"
                onClick={() => navigate(`/journal-entries/${session.journalEntryId}`)}
              >
                عرض قيد اليومية
              </Button>
            )}
          </div>
        </div>

        {/* ── Posted Summary Card (reconciliation report) ── */}
        {session.status === "posted" && (
          <PostedSummaryCard
            session={session}
            lines={lines}
            onViewJournal={() =>
              session.journalEntryId && navigate(`/journal-entries/${session.journalEntryId}`)
            }
          />
        )}

        {/* ── Cancelled banner ── */}
        {session.status === "cancelled" && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive flex-shrink-0" data-testid="banner-cancelled">
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>هذه الجلسة ملغاة — لا يمكن إجراء أي تعديلات عليها.</span>
          </div>
        )}

        {/* ── Lines table (with filters + sticky footer) ── */}
        <div className="flex-1 min-h-0">
          <LineTable
            lines={lines}
            sessionId={sessionId}
            isDraft={isDraft}
            focusLineId={focusLineId}
            onFocused={() => setFocusLineId(null)}
            onLoadItems={() => setLoadItemsOpen(true)}
          />
        </div>

        {/* ── Dialogs ── */}
        <LoadItemsDialog
          open={loadItemsOpen}
          onClose={() => setLoadItemsOpen(false)}
          sessionId={sessionId}
          onLoaded={refetch}
        />

        {/* Post confirm */}
        <AlertDialog open={postConfirmOpen} onOpenChange={setPostConfirmOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الترحيل</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>سيتم ترحيل جلسة الجرد <strong>#{session.sessionNumber}</strong> بشكل دائم.</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    <li>عدد الأصناف: <strong className="text-foreground">{lines.length}</strong></li>
                    <li>
                      قيمة الفرق الإجمالي:{" "}
                      <strong className={totalDiffValue < 0 ? "text-destructive" : "text-green-600"}>
                        {fmtMoney(totalDiffValue)} ج.م
                      </strong>
                    </li>
                  </ul>
                  <p className="text-amber-600 text-xs">سيتم تعديل أرصدة المخزون وإنشاء قيد يومية تلقائياً.</p>
                </div>
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
                هل تريد إلغاء جلسة الجرد #{session.sessionNumber}؟ لن يمكن إعادة تفعيلها.
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
