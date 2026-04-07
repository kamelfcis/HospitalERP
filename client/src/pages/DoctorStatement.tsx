import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Stethoscope, Banknote, CalendarRange } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { SettlementDialog } from "@/components/doctor/SettlementDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatementRow = {
  id: string;
  invoiceId: string;
  doctorName: string;
  amount: string;
  transferredAt: string;
  notes: string | null;
  settled: string;
  remaining: string;
  patientName: string | null;
  invoiceDate: string | null;
  invoiceTotal: string | null;
  invoiceStatus: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة", finalized: "نهائي", cancelled: "ملغي",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-yellow-50 text-yellow-700 border-yellow-200",
  finalized: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DoctorStatement() {
  const [, nav]       = useLocation();
  const [, params]    = useRoute("/doctor-statement/:name");
  const doctorName    = params?.name ? decodeURIComponent(params.name) : "";

  const today     = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";

  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo,   setDateTo]   = useState(today);

  const [settleDlgOpen,      setSettleDlgOpen]      = useState(false);
  const [settleTransferId,   setSettleTransferId]    = useState<string | undefined>();
  const [settleRemaining,    setSettleRemaining]     = useState<string | undefined>();

  const { data: rows = [], isLoading, refetch } = useQuery<StatementRow[]>({
    queryKey: ["/api/doctor-statement", doctorName, dateFrom, dateTo],
    enabled: !!doctorName,
    queryFn: () => {
      const qp = new URLSearchParams({ doctorName, dateFrom, dateTo });
      return fetch(`/api/doctor-statement?${qp}`, { credentials: "include" }).then(r => r.json());
    },
  });

  // ── إحصائيات ──
  const totals = rows.reduce(
    (a, r) => ({
      transferred: a.transferred + parseFloat(r.amount),
      settled:     a.settled     + parseFloat(r.settled),
      remaining:   a.remaining   + parseFloat(r.remaining),
    }),
    { transferred: 0, settled: 0, remaining: 0 }
  );

  function openSettle(row: StatementRow) {
    setSettleTransferId(row.id);
    setSettleRemaining(row.remaining);
    setSettleDlgOpen(true);
  }

  if (!doctorName) {
    return <div className="p-6 text-center text-muted-foreground">طبيب غير محدد</div>;
  }

  return (
    <div className="p-3 space-y-3" dir="rtl">
      {/* ── هيدر ── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => nav("/doctors")}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Stethoscope className="h-4 w-4 text-blue-600" />
          <div>
            <h1 className="text-sm font-bold">كشف حساب — {doctorName}</h1>
            <p className="text-xs text-muted-foreground">المستحقات والمدفوعات</p>
          </div>
        </div>

        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs px-3"
          onClick={() => { setSettleTransferId(undefined); setSettleRemaining(undefined); setSettleDlgOpen(true); }}
          disabled={totals.remaining < 0.001}
          data-testid="button-settle-all"
        >
          <Banknote className="h-3 w-3 ml-1" />
          سداد إجمالي
        </Button>
      </div>

      {/* ── فلتر التاريخ ── */}
      <div className="peachtree-toolbar rounded flex items-center gap-3 flex-wrap">
        <CalendarRange className="h-3 w-3 text-muted-foreground" />
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">من:</label>
          <input
            type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="peachtree-input h-7 text-xs"
            data-testid="input-date-from"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">إلى:</label>
          <input
            type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="peachtree-input h-7 text-xs"
            data-testid="input-date-to"
          />
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
          تطبيق
        </Button>
      </div>

      {/* ── بطاقات الملخص ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "إجمالي المستحق",  value: totals.transferred, cls: "text-foreground" },
          { label: "إجمالي المدفوع",  value: totals.settled,     cls: "text-green-700"  },
          { label: "المتبقي",         value: totals.remaining,   cls: "text-destructive" },
        ].map(c => (
          <div key={c.label} className="border rounded p-2 bg-card text-center">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-sm font-bold tabular-nums ${c.cls}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      {/* ── الجدول ── */}
      <div className="border rounded-md overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-10">لا توجد بيانات في هذه الفترة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="peachtree-grid w-full text-xs">
              <thead className="peachtree-grid-header">
                <tr>
                  <th className="text-right">المريض / الحالة</th>
                  <th className="text-right">تاريخ الفاتورة</th>
                  <th className="text-right">تاريخ التحويل</th>
                  <th className="text-left">قيمة الفاتورة</th>
                  <th className="text-left">المحوَّل للطبيب</th>
                  <th className="text-left">المسدَّد</th>
                  <th className="text-left">المتبقي</th>
                  <th className="w-[60px] text-center">الحالة</th>
                  <th className="w-[70px] text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const rem = parseFloat(row.remaining);
                  return (
                    <tr key={row.id} className="peachtree-grid-row" data-testid={`row-statement-${row.id}`}>
                      <td className="font-medium">{row.patientName || "—"}</td>
                      <td className="text-muted-foreground">{row.invoiceDate ? formatDateShort(row.invoiceDate as any) : "—"}</td>
                      <td className="text-muted-foreground">{formatDateShort(row.transferredAt as any)}</td>
                      <td className="text-left tabular-nums">{row.invoiceTotal ? formatCurrency(parseFloat(row.invoiceTotal)) : "—"}</td>
                      <td className="text-left tabular-nums">{formatCurrency(parseFloat(row.amount))}</td>
                      <td className="text-left tabular-nums text-green-700">{formatCurrency(parseFloat(row.settled))}</td>
                      <td className="text-left tabular-nums">
                        {rem > 0.001
                          ? <span className="text-destructive font-semibold">{formatCurrency(rem)}</span>
                          : <span className="text-green-600">مُسدَّد</span>}
                      </td>
                      <td className="text-center">
                        {row.invoiceStatus && (
                          <Badge variant="outline" className={`text-xs ${STATUS_CLASS[row.invoiceStatus] ?? ""}`}>
                            {STATUS_LABEL[row.invoiceStatus] ?? row.invoiceStatus}
                          </Badge>
                        )}
                      </td>
                      <td className="text-center">
                        {rem > 0.001 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => openSettle(row)}
                            data-testid={`button-settle-${row.id}`}
                          >
                            سداد
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/50 font-semibold border-t">
                <tr>
                  <td colSpan={4} className="py-1.5 px-2">الإجمالي ({rows.length} سجل)</td>
                  <td className="text-left tabular-nums py-1.5 px-2">{formatCurrency(totals.transferred)}</td>
                  <td className="text-left tabular-nums py-1.5 px-2 text-green-700">{formatCurrency(totals.settled)}</td>
                  <td className="text-left tabular-nums py-1.5 px-2 text-destructive">{formatCurrency(totals.remaining)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Settlement Dialog ── */}
      <SettlementDialog
        open={settleDlgOpen}
        onClose={() => { setSettleDlgOpen(false); setSettleTransferId(undefined); setSettleRemaining(undefined); }}
        doctorName={doctorName}
        preselectedTransferId={settleTransferId}
        preselectedRemaining={settleRemaining}
      />
    </div>
  );
}
