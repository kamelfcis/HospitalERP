/**
 * accounting-events/index.tsx
 * صفحة مراقبة أحداث المحاسبة وإعادة محاولة القيود الفاشلة
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, AlertCircle, CheckCircle2, Clock, Ban,
  RotateCcw, PlayCircle, Timer, ShieldAlert,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

// ── Types ──────────────────────────────────────────────────────────────────

type AcctEvent = {
  id: string;
  event_type: string;
  source_type: string;
  source_id: string;
  status: "completed" | "failed" | "pending" | "needs_retry" | "blocked";
  error_message: string | null;
  attempt_count: number;
  last_attempted_at: string | null;
  next_retry_at: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

type SummaryRow = { status: string; source_type: string; count: number };

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AcctEvent["status"] }) {
  const map: Record<AcctEvent["status"], { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
    completed:   { label: "مكتمل",       variant: "default" },
    failed:      { label: "فاشل",         variant: "destructive" },
    pending:     { label: "معلّق",        variant: "secondary" },
    needs_retry: { label: "يحتاج إعادة", variant: "outline" },
    blocked:     { label: "محجوب",        variant: "outline" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={variant} data-testid={`badge-status-${status}`}>{label}</Badge>;
}

// ── Source type label ──────────────────────────────────────────────────────

function sourceTypeLabel(t: string) {
  const m: Record<string, string> = {
    sales_invoice:             "فاتورة مبيعات",
    cashier_collection:        "تحصيل كاشير",
    patient_invoice:           "فاتورة مريض",
    purchase_receiving:        "استلام مورد",
    receiving:                 "استلام مورد",
    warehouse_transfer:        "تحويل مخزني",
    doctor_payable_settlement: "تسوية مستحقات طبيب",
    cashier_refund:            "مرتجع كاشير",
    doctor_settlement:         "تسوية طبيب",
  };
  return m[t] ?? t;
}

// ── Contract warning event types ───────────────────────────────────────────

const CONTRACT_WARNING_TYPES = new Set(["contract_ar_split_fallback", "contract_ar_no_split"]);

function eventTypeLabel(t: string): string {
  const m: Record<string, string> = {
    sales_invoice_journal:          "قيد فاتورة مبيعات",
    sales_invoice_cogs_skipped:     "COGS محذوف",
    contract_ar_split_fallback:     "ذمم تعاقد — حساب بديل",
    contract_ar_no_split:           "ذمم تعاقد — بدون تقسيم",
    patient_invoice_journal:        "قيد فاتورة مريض",
    cashier_collection_journal:     "قيد تحصيل كاشير",
    receiving_journal:              "قيد استلام مورد",
    warehouse_transfer_journal:     "قيد تحويل مخزني",
    doctor_settlement_journal:      "قيد تسوية طبيب",
    cashier_refund_journal:         "قيد مرتجع كاشير",
  };
  return m[t] ?? t;
}

function EventTypeBadge({ eventType }: { eventType: string }) {
  if (CONTRACT_WARNING_TYPES.has(eventType)) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-xs font-medium whitespace-nowrap"
        title={eventType}
        data-testid={`badge-event-type-${eventType}`}
      >
        <ShieldAlert className="h-3 w-3 flex-shrink-0" />
        {eventTypeLabel(eventType)}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground truncate" title={eventType}>
      {eventTypeLabel(eventType)}
    </span>
  );
}

// ── Next retry display ──────────────────────────────────────────────────────

function NextRetryCell({ nextRetryAt, status }: { nextRetryAt: string | null; status: string }) {
  if (!nextRetryAt || status === "completed") return <span className="text-muted-foreground">—</span>;

  const d = new Date(nextRetryAt);
  const isPast = d <= new Date();
  return (
    <span
      className={`flex items-center gap-1 text-xs whitespace-nowrap ${isPast ? "text-orange-500 font-medium" : "text-muted-foreground"}`}
      title={format(d, "dd/MM/yyyy HH:mm:ss")}
    >
      <Timer className="h-3 w-3 flex-shrink-0" />
      {isPast ? "منذ " : "بعد "}
      {formatDistanceToNow(d, { locale: ar })}
    </span>
  );
}

// ── Summary bar ────────────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: SummaryRow[] }) {
  const totals: Record<string, number> = {};
  rows.forEach((r) => { totals[r.status] = (totals[r.status] || 0) + r.count; });

  const cards = [
    { status: "failed",      label: "فاشل",         icon: AlertCircle,  color: "text-destructive" },
    { status: "pending",     label: "معلّق",         icon: Clock,        color: "text-yellow-500" },
    { status: "needs_retry", label: "يحتاج إعادة",  icon: RotateCcw,    color: "text-orange-500" },
    { status: "blocked",     label: "محجوب",         icon: Ban,          color: "text-muted-foreground" },
    { status: "completed",   label: "مكتمل",         icon: CheckCircle2, color: "text-green-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4" dir="rtl">
      {cards.map(({ status, label, icon: Icon, color }) => (
        <Card key={status} className="text-center">
          <CardContent className="pt-4 pb-3">
            <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
            <div className={`text-2xl font-bold ${color}`}>{totals[status] ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AccountingEventsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter]         = useState<string>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter]   = useState<string>("all");
  const [page, setPage]                         = useState(0);
  const [autoRefresh, setAutoRefresh]           = useState(false);
  const pageSize = 50;

  const buildQS = (p = page) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all")     params.set("status",     statusFilter);
    if (sourceTypeFilter !== "all") params.set("sourceType", sourceTypeFilter);
    if (eventTypeFilter !== "all")  params.set("eventType",  eventTypeFilter);
    params.set("limit",  String(pageSize));
    params.set("offset", String(p * pageSize));
    return params.toString();
  };

  const eventsKey = ["/api/accounting/events", statusFilter, sourceTypeFilter, eventTypeFilter, page];
  const { data, isLoading, refetch } = useQuery<{ events: AcctEvent[]; total: number }>({
    queryKey: eventsKey,
    queryFn: () => fetch(`/api/accounting/events?${buildQS()}`).then((r) => r.json()),
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const { data: summaryData, refetch: refetchSummary } = useQuery<{ rows: SummaryRow[] }>({
    queryKey: ["/api/accounting/events/summary"],
    queryFn: () => fetch("/api/accounting/events/summary").then((r) => r.json()),
    refetchInterval: autoRefresh ? 30_000 : 60_000,
  });

  // Single-event retry
  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/accounting/events/${id}/retry`, {}),
    onSuccess: () => {
      toast({ title: "تمت إعادة المحاولة", description: "راجع الحالة المحدّثة في القائمة" });
      queryClient.invalidateQueries({ queryKey: eventsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/events/summary"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطأ أثناء إعادة المحاولة";
      toast({ title: "فشل", description: msg, variant: "destructive" });
    },
  });

  // Batch retry all due events
  const batchRetryMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/accounting/events/retry-batch", {}),
    onSuccess: (data: any) => {
      toast({
        title: "اكتملت إعادة المحاولة الجماعية",
        description: data?.message ?? `نجح ${data?.succeeded ?? 0} من ${data?.attempted ?? 0}`,
      });
      queryClient.invalidateQueries({ queryKey: eventsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/events/summary"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطأ في إعادة المحاولة الجماعية";
      toast({ title: "فشل", description: msg, variant: "destructive" });
    },
  });

  const events = data?.events ?? [];
  const total  = data?.total  ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const canRetry = (status: AcctEvent["status"]) => ["failed", "pending", "needs_retry"].includes(status);

  const handleRefreshAll = () => {
    refetch();
    refetchSummary();
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">مراقبة أحداث المحاسبة</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-2 border rounded-md px-3 py-1.5">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              data-testid="switch-auto-refresh"
            />
            <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">
              تحديث تلقائي (15 ث)
            </Label>
          </div>

          {/* Manual refresh */}
          <Button variant="outline" size="sm" onClick={handleRefreshAll} data-testid="button-refresh-events">
            <RefreshCw className="h-4 w-4 ms-1" />
            تحديث
          </Button>

          {/* Batch retry */}
          <Button
            size="sm"
            variant="default"
            disabled={batchRetryMutation.isPending}
            onClick={() => batchRetryMutation.mutate()}
            data-testid="button-batch-retry"
          >
            {batchRetryMutation.isPending
              ? <RefreshCw className="h-4 w-4 ms-1 animate-spin" />
              : <PlayCircle className="h-4 w-4 ms-1" />}
            إعادة محاولة جماعية
          </Button>
        </div>
      </div>

      {summaryData?.rows && <SummaryBar rows={summaryData.rows} />}

      {/* ── Filters ── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm text-muted-foreground">فلترة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap items-center">
            {/* Quick shortcut: contract AR warnings */}
            <Button
              variant={eventTypeFilter === "contract_warnings" ? "default" : "outline"}
              size="sm"
              className={eventTypeFilter === "contract_warnings"
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                : "border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"}
              onClick={() => {
                setEventTypeFilter(eventTypeFilter === "contract_warnings" ? "all" : "contract_warnings");
                setPage(0);
              }}
              data-testid="button-filter-contract-warnings"
            >
              <ShieldAlert className="h-3.5 w-3.5 ms-1" />
              تحذيرات التعاقد
            </Button>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }} data-testid="select-status-filter">
              <SelectTrigger className="w-44" data-testid="trigger-status-filter">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="failed">فاشل</SelectItem>
                <SelectItem value="pending">معلّق</SelectItem>
                <SelectItem value="needs_retry">يحتاج إعادة</SelectItem>
                <SelectItem value="blocked">محجوب</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceTypeFilter} onValueChange={(v) => { setSourceTypeFilter(v); setPage(0); }} data-testid="select-source-filter">
              <SelectTrigger className="w-52" data-testid="trigger-source-filter">
                <SelectValue placeholder="نوع المصدر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="sales_invoice">فاتورة مبيعات</SelectItem>
                <SelectItem value="cashier_collection">تحصيل كاشير</SelectItem>
                <SelectItem value="patient_invoice">فاتورة مريض</SelectItem>
                <SelectItem value="purchase_receiving">استلام مورد</SelectItem>
                <SelectItem value="warehouse_transfer">تحويل مخزني</SelectItem>
                <SelectItem value="doctor_payable_settlement">تسوية مستحقات طبيب</SelectItem>
                <SelectItem value="cashier_refund">مرتجع كاشير</SelectItem>
              </SelectContent>
            </Select>

            <Select value={eventTypeFilter === "contract_warnings" ? "all" : eventTypeFilter}
              onValueChange={(v) => { setEventTypeFilter(v); setPage(0); }}
              data-testid="select-event-type-filter">
              <SelectTrigger className="w-56" data-testid="trigger-event-type-filter">
                <SelectValue placeholder="نوع الحدث" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل أنواع الأحداث</SelectItem>
                <SelectItem value="contract_ar_split_fallback">ذمم تعاقد — حساب بديل</SelectItem>
                <SelectItem value="contract_ar_no_split">ذمم تعاقد — بدون تقسيم</SelectItem>
                <SelectItem value="sales_invoice_cogs_skipped">COGS محذوف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">نوع المصدر</TableHead>
                <TableHead className="text-right">المعرّف</TableHead>
                <TableHead className="text-right">نوع الحدث</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">المحاولات</TableHead>
                <TableHead className="text-right">رسالة الخطأ</TableHead>
                <TableHead className="text-right">الإعادة القادمة</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                <TableHead className="text-right">القيد</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    جارٍ التحميل...
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    لا توجد أحداث تطابق الفلتر
                  </TableCell>
                </TableRow>
              ) : (
                events.map((ev) => (
                  <TableRow key={ev.id} data-testid={`row-event-${ev.id}`}>
                    <TableCell className="font-medium">{sourceTypeLabel(ev.source_type)}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate" title={ev.source_id}>{ev.source_id}</TableCell>
                    <TableCell className="max-w-[170px]"><EventTypeBadge eventType={ev.event_type} /></TableCell>
                    <TableCell><StatusBadge status={ev.status} /></TableCell>
                    <TableCell className="text-center">{ev.attempt_count}</TableCell>
                    <TableCell
                      className="text-xs text-destructive max-w-[180px] truncate"
                      title={ev.error_message ?? ""}
                    >
                      {ev.error_message ?? "—"}
                    </TableCell>
                    <TableCell>
                      <NextRetryCell nextRetryAt={ev.next_retry_at} status={ev.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {ev.created_at ? format(new Date(ev.created_at), "dd/MM/yyyy HH:mm", { locale: ar }) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[80px] truncate" title={ev.journal_entry_id ?? ""}>
                      {ev.journal_entry_id ?? "—"}
                    </TableCell>
                    <TableCell>
                      {canRetry(ev.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(ev.id)}
                          data-testid={`button-retry-${ev.id}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5 ms-1" />
                          إعادة
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>الإجمالي: {total} حدث</span>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              data-testid="button-prev-page"
            >
              السابق
            </Button>
            <span className="px-2 py-1">{page + 1} / {totalPages}</span>
            <Button
              variant="outline" size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              data-testid="button-next-page"
            >
              التالي
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
