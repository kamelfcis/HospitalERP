/**
 * accounting-events/index.tsx
 * صفحة مراقبة أحداث المحاسبة وإعادة محاولة القيود الفاشلة
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Ban, RotateCcw } from "lucide-react";
import { format } from "date-fns";
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
    sales_invoice:            "فاتورة مبيعات",
    cashier_collection:       "تحصيل كاشير",
    patient_invoice:          "فاتورة مريض",
    purchase_receiving:       "استلام مورد",
    doctor_payable_settlement:"تسوية مستحقات طبيب",
  };
  return m[t] ?? t;
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
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const buildQS = (p = page) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all")     params.set("status",     statusFilter);
    if (sourceTypeFilter !== "all") params.set("sourceType", sourceTypeFilter);
    params.set("limit",  String(pageSize));
    params.set("offset", String(p * pageSize));
    return params.toString();
  };

  const eventsKey = ["/api/accounting/events", statusFilter, sourceTypeFilter, page];
  const { data, isLoading, refetch } = useQuery<{ events: AcctEvent[]; total: number }>({
    queryKey: eventsKey,
    queryFn: () => fetch(`/api/accounting/events?${buildQS()}`).then((r) => r.json()),
  });

  const { data: summaryData } = useQuery<{ rows: SummaryRow[] }>({
    queryKey: ["/api/accounting/events/summary"],
    queryFn: () => fetch("/api/accounting/events/summary").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/accounting/events/${id}/retry`, {}),
    onSuccess: (_, id) => {
      toast({ title: "تمت إعادة المحاولة", description: "راجع الحالة المحدّثة في القائمة" });
      queryClient.invalidateQueries({ queryKey: eventsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/events/summary"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطأ أثناء إعادة المحاولة";
      toast({ title: "فشل", description: msg, variant: "destructive" });
    },
  });

  const events = data?.events ?? [];
  const total  = data?.total  ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const canRetry = (status: AcctEvent["status"]) => ["failed", "pending", "needs_retry"].includes(status);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">مراقبة أحداث المحاسبة</h1>
        <Button variant="outline" size="sm" onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["/api/accounting/events/summary"] }); }} data-testid="button-refresh-events">
          <RefreshCw className="h-4 w-4 ms-1" />
          تحديث
        </Button>
      </div>

      {summaryData?.rows && <SummaryBar rows={summaryData.rows} />}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm text-muted-foreground">فلترة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
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
                <SelectItem value="doctor_payable_settlement">تسوية مستحقات طبيب</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
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
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                <TableHead className="text-right">القيد</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    جارٍ التحميل...
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    لا توجد أحداث تطابق الفلتر
                  </TableCell>
                </TableRow>
              ) : (
                events.map((ev) => (
                  <TableRow key={ev.id} data-testid={`row-event-${ev.id}`}>
                    <TableCell className="font-medium">{sourceTypeLabel(ev.source_type)}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">{ev.source_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ev.event_type}</TableCell>
                    <TableCell><StatusBadge status={ev.status} /></TableCell>
                    <TableCell className="text-center">{ev.attempt_count}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate" title={ev.error_message ?? ""}>{ev.error_message ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {ev.created_at ? format(new Date(ev.created_at), "dd/MM/yyyy HH:mm", { locale: ar }) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[80px] truncate">{ev.journal_entry_id ?? "—"}</TableCell>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>الإجمالي: {total} حدث</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">السابق</Button>
            <span className="px-2 py-1">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">التالي</Button>
          </div>
        </div>
      )}
    </div>
  );
}
