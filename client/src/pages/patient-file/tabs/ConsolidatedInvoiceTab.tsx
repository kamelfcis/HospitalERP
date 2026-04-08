import { memo, useState, useCallback, useMemo } from "react";
import {
  Loader2, Lock, CheckCircle2, AlertTriangle, History,
  User, Stethoscope, CalendarDays, FileText, RefreshCw,
  ChevronRight, ChevronLeft, Banknote, Building2,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, fmtMoney, fmtQty, PAYMENT_METHOD_LABELS, LINE_TYPE_LABELS } from "../shared/formatters";
import { useInvoiceLines, usePaymentsList } from "../hooks/useInvoiceLines";
import type {
  AggregatedInvoice, AggregatedViewData, InvoiceLine, VisitGroup,
} from "../shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PatientVisit {
  id: string;
  visit_number: string;
  visit_type: "inpatient" | "outpatient";
  admission_id: string | null;
  department_name: string | null;
  status: string;
  created_at: string;
  doctor_name: string | null;
  admission_notes: string | null;
  admission_date: string | null;
  discharge_date: string | null;
  admission_number: string | null;
}

interface Props {
  data: AggregatedViewData | undefined;
  isLoading: boolean;
  patientId: string;
  patientName: string;
  patientCode: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pvToVisitKey(pv: PatientVisit): string {
  if (pv.visit_type === "inpatient" && pv.admission_id) return `admission:${pv.admission_id}`;
  return `visit:${pv.id}`;
}

function findPrimaryInvoice(invoices: AggregatedInvoice[]): AggregatedInvoice | undefined {
  return (
    invoices.find(i => i.isConsolidated && i.status === "finalized") ??
    invoices.find(i => i.status === "finalized" && !i.isConsolidated && invoices.length === 1) ??
    undefined
  );
}

// ─── FinancialRow helper ───────────────────────────────────────────────────────
function FinRow({ label, value, highlight, muted, border }: {
  label: string; value: number; highlight?: boolean; muted?: boolean; border?: boolean;
}) {
  const cls = highlight
    ? "text-green-700 font-bold text-base"
    : muted
      ? "text-muted-foreground text-sm"
      : "font-semibold text-sm";
  const neg = value < 0;
  return (
    <div className={`flex justify-between items-center py-1.5 ${border ? "border-t border-dashed mt-1 pt-2" : ""}`}>
      <span className={`text-sm ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>{label}</span>
      <span className={`font-mono ${cls} ${neg ? "text-red-600" : ""}`}>
        {neg ? `(${fmtMoney(Math.abs(value))})` : fmtMoney(value)}
      </span>
    </div>
  );
}

// ─── Financial Sidebar ────────────────────────────────────────────────────────
const FinancialSidebar = memo(function FinancialSidebar({
  totals, isFinalClosed, canFinalClose, onFinalClose, isPending, finalClosedAt, invoiceNumber,
}: {
  totals: VisitGroup | { totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number; remaining: number };
  isFinalClosed: boolean;
  canFinalClose: boolean;
  onFinalClose: () => void;
  isPending: boolean;
  finalClosedAt?: string | null;
  invoiceNumber?: string;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <div className="bg-slate-50 border rounded-xl p-4 flex flex-col gap-0.5">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">الملخص المالي</p>

        <FinRow label="إجمالي الخدمات" value={totals.totalAmount} />
        <FinRow label="الخصم"          value={totals.discountAmount} muted />
        <FinRow label="الصافي"         value={totals.netAmount} highlight border />

        <div className="my-2 border-t border-slate-200" />
        <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">الدفعات</p>
        <FinRow label="المدفوع"  value={totals.paidAmount} />
        <FinRow label="الباقي"   value={totals.remaining}  />
      </div>

      {isFinalClosed ? (
        <div className="flex flex-col items-center gap-1 mt-3 p-3 rounded-xl border border-green-200 bg-green-50">
          <Lock className="h-5 w-5 text-green-600" />
          <span className="text-xs font-semibold text-green-700">مغلق نهائياً</span>
          {finalClosedAt && (
            <span className="text-[10px] text-green-600">{fmtDate(finalClosedAt)}</span>
          )}
        </div>
      ) : canFinalClose ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
              disabled={isPending}
              data-testid="button-final-close"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              إغلاق نهائي
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                تأكيد الإغلاق النهائي
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم إغلاق الفاتورة <strong>{invoiceNumber}</strong> نهائياً.
                بعد الإغلاق لن يمكن إجراء أي تعديلات عليها إلا بصلاحية خاصة.
                <br /><br />
                <strong>الشروط:</strong> الرصيد المتبقي = صفر، لا فواتير مسودة في الإقامة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={onFinalClose}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-confirm-final-close"
              >
                تأكيد الإغلاق النهائي
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
});

// ─── Services Tab ─────────────────────────────────────────────────────────────
const LINE_CLASS: Record<string, string> = {
  service:    "bg-blue-50   text-blue-700   border-blue-200",
  drug:       "bg-green-50  text-green-700  border-green-200",
  consumable: "bg-amber-50  text-amber-700  border-amber-200",
  equipment:  "bg-purple-50 text-purple-700 border-purple-200",
};

const ServicesTab = memo(function ServicesTab({
  patientId, admissionId, visitId, isFinalClosed,
}: {
  patientId: string;
  admissionId?: string;
  visitId?: string;
  isFinalClosed: boolean;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, dataUpdatedAt } = useInvoiceLines({
    patientId,
    page,
    limit: 50,
    admissionId,
    visitId,
    refetchInterval: isFinalClosed ? false : 15_000,
  });

  if (isLoading) return (
    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  );
  if (isError || !data) return (
    <div className="text-center py-8 text-red-500 text-sm">حدث خطأ أثناء تحميل الخدمات</div>
  );
  if (data.data.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">لا توجد خدمات مسجلة لهذه الزيارة</div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{data.total} خدمة</span>
        {!isFinalClosed && (
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            تحديث تلقائي كل 15 ث
            {dataUpdatedAt ? ` — آخر تحديث: ${new Date(dataUpdatedAt).toLocaleTimeString("ar-EG")}` : ""}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
              <th className="p-2 text-right w-6">#</th>
              <th className="p-2 text-right whitespace-nowrap">التاريخ</th>
              <th className="p-2 text-right">القسم</th>
              <th className="p-2 text-right">النوع</th>
              <th className="p-2 text-right">الخدمة / البيان</th>
              <th className="p-2 text-center whitespace-nowrap">الكمية</th>
              <th className="p-2 text-center whitespace-nowrap">السعر</th>
              <th className="p-2 text-center whitespace-nowrap">الخصم</th>
              <th className="p-2 text-center whitespace-nowrap font-semibold">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((line: InvoiceLine, idx: number) => (
              <tr key={line.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-line-${line.id}`}>
                <td className="p-2 text-xs text-muted-foreground text-center">{(page - 1) * 50 + idx + 1}</td>
                <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(line.invoice_date)}</td>
                <td className="p-2 text-xs">{line.department_name}</td>
                <td className="p-2">
                  <Badge variant="outline" className={`text-[10px] px-1 py-0 ${LINE_CLASS[line.line_type] ?? ""}`}>
                    {LINE_TYPE_LABELS[line.line_type] ?? line.line_type}
                  </Badge>
                </td>
                <td className="p-2 text-sm max-w-[200px] truncate" title={line.description}>{line.description}</td>
                <td className="p-2 text-center font-mono text-sm">{fmtQty(line.quantity)}</td>
                <td className="p-2 text-center font-mono text-sm">{fmtMoney(line.unit_price)}</td>
                <td className="p-2 text-center font-mono text-sm text-purple-600">
                  {parseFloat(line.discount_amount) > 0 ? `(${fmtMoney(line.discount_amount)})` : "—"}
                </td>
                <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(line.total_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 border-t-2 text-sm font-semibold">
              <td className="p-2" colSpan={5}>الإجمالي</td>
              <td className="p-2" colSpan={2}></td>
              <td className="p-2 text-center font-mono text-purple-600">
                ({fmtMoney(data.data.reduce((s, l) => s + parseFloat(l.discount_amount || "0"), 0))})
              </td>
              <td className="p-2 text-center font-mono">
                {fmtMoney(data.data.reduce((s, l) => s + parseFloat(l.total_price || "0"), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= data.totalPages} data-testid="btn-next-lines">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {data.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} data-testid="btn-prev-lines">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
});

// ─── Payments Tab ─────────────────────────────────────────────────────────────
const PAY_METHOD_CLASS: Record<string, string> = {
  cash:          "bg-green-50  text-green-700  border-green-200",
  card:          "bg-blue-50   text-blue-700   border-blue-200",
  bank_transfer: "bg-purple-50 text-purple-700 border-purple-200",
  insurance:     "bg-amber-50  text-amber-700  border-amber-200",
};

const PaymentsTab = memo(function PaymentsTab({
  patientId, admissionId, visitId, isFinalClosed,
}: {
  patientId: string;
  admissionId?: string;
  visitId?: string;
  isFinalClosed: boolean;
}) {
  const { data, isLoading } = usePaymentsList({
    patientId, admissionId, visitId,
    refetchInterval: isFinalClosed ? false : 15_000,
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const payments: any[] = data ?? [];

  if (payments.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">لا توجد مدفوعات لهذه الزيارة</div>
  );

  const total = payments.reduce((s: number, p: any) => s + parseFloat(p.amount || "0"), 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-1.5">
          <Banknote className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">إجمالي المدفوعات: {fmtMoney(total)}</span>
          <span className="text-xs opacity-70">({payments.length} دفعة)</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
              <th className="p-2.5 text-right whitespace-nowrap">التاريخ</th>
              <th className="p-2.5 text-center">المبلغ</th>
              <th className="p-2.5 text-right">طريقة الدفع</th>
              <th className="p-2.5 text-right">الخزنة</th>
              <th className="p-2.5 text-right">سُجِّل بواسطة</th>
              <th className="p-2.5 text-right">رقم الفاتورة</th>
              <th className="p-2.5 text-right">المرجع</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p: any) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-pay-${p.id}`}>
                <td className="p-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                <td className="p-2.5 text-center font-mono font-semibold text-green-600">{fmtMoney(p.amount)}</td>
                <td className="p-2.5">
                  <Badge variant="outline" className={`text-xs ${PAY_METHOD_CLASS[p.payment_method] ?? ""}`}>
                    {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                  </Badge>
                </td>
                <td className="p-2.5 text-sm">{p.treasury_name}</td>
                <td className="p-2.5 text-sm text-muted-foreground">{p.recorded_by ?? "—"}</td>
                <td className="p-2.5 font-mono text-xs text-muted-foreground">{p.invoice_number}</td>
                <td className="p-2.5 text-xs text-muted-foreground">{p.reference_number ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-semibold text-sm border-t-2">
              <td className="p-2.5">الإجمالي</td>
              <td className="p-2.5 text-center font-mono text-green-600">{fmtMoney(total)}</td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});

// ─── Invoice Header Card ──────────────────────────────────────────────────────
const InvoiceHeaderCard = memo(function InvoiceHeaderCard({
  patientName, patientCode, visit, invoiceNumber, isFinalClosed,
}: {
  patientName: string;
  patientCode: string;
  visit: PatientVisit | null;
  invoiceNumber?: string;
  isFinalClosed: boolean;
}) {
  return (
    <div className="rounded-xl border bg-gradient-to-l from-slate-50 to-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Right: patient + doctor */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-blue-500 shrink-0" />
            <div>
              <p className="font-bold text-base leading-tight">{patientName}</p>
              {patientCode && (
                <span className="font-mono text-xs text-muted-foreground">{patientCode}</span>
              )}
            </div>
            {isFinalClosed && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs mr-auto">
                <Lock className="h-3 w-3" />مغلق نهائياً
              </Badge>
            )}
          </div>

          {visit?.doctor_name && (
            <div className="flex items-center gap-2">
              <Stethoscope className="h-3.5 w-3.5 text-teal-500 shrink-0" />
              <span className="text-sm">{visit.doctor_name}</span>
            </div>
          )}

          {visit?.department_name && (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="text-sm text-muted-foreground">{visit.department_name}</span>
            </div>
          )}
        </div>

        {/* Left: dates + invoice number */}
        <div className="flex flex-col gap-2">
          {invoiceNumber && (
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-mono text-sm font-semibold">{invoiceNumber}</span>
            </div>
          )}

          {visit?.admission_date && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-sm">
                دخول: <span className="font-medium">{fmtDate(visit.admission_date)}</span>
                {visit.discharge_date && (
                  <> — خروج: <span className="font-medium">{fmtDate(visit.discharge_date)}</span></>
                )}
                {!visit.discharge_date && <span className="text-amber-600 text-xs mr-2">لم يخرج بعد</span>}
              </span>
            </div>
          )}

          {visit?.visit_number && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs ${visit.visit_type === "inpatient"
                  ? "border-indigo-400 text-indigo-700 bg-indigo-50"
                  : "border-teal-400 text-teal-700 bg-teal-50"}`}
              >
                {visit.visit_type === "inpatient" ? "داخلي" : "خارجي"}
              </Badge>
              <span className="font-mono text-sm">{visit.visit_number}</span>
            </div>
          )}
        </div>
      </div>

      {visit?.admission_notes && (
        <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
          <span className="font-medium text-foreground/70">ملاحظات: </span>
          {visit.admission_notes}
        </div>
      )}
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export const ConsolidatedInvoiceTab = memo(function ConsolidatedInvoiceTab({
  data, isLoading, patientId, patientName, patientCode,
}: Props) {
  const [selectedVisitKey, setSelectedVisitKey] = useState<string>("");
  const { toast } = useToast();

  const { data: patientVisits = [] } = useQuery<PatientVisit[]>({
    queryKey: ["/api/patients", patientId, "visits"],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/visits`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!patientId,
  });

  const selectedVisit = useMemo(
    () => patientVisits.find(pv => pvToVisitKey(pv) === selectedVisitKey) ?? null,
    [patientVisits, selectedVisitKey],
  );

  const visitTotals = useMemo(() => {
    if (!data) return null;
    if (!selectedVisitKey) return data.totals;
    return data.byVisit.find(v => v.visitKey === selectedVisitKey) ?? null;
  }, [data, selectedVisitKey]);

  const primaryInvoice = useMemo(() => {
    if (!data) return undefined;
    if (!selectedVisitKey) return findPrimaryInvoice(data.invoices);
    const admId = selectedVisit?.admission_id ?? null;
    const visId = selectedVisit?.id ?? null;
    const inv = data.invoices.find(i =>
      (admId && i.admissionId === admId && i.isConsolidated) ||
      (!admId && visId && i.visitGroupId === null && i.admissionId === null)
    );
    return inv ?? findPrimaryInvoice(data.invoices);
  }, [data, selectedVisitKey, selectedVisit]);

  const isFinalClosed = primaryInvoice?.isFinalClosed ?? false;
  const canFinalClose  = !!primaryInvoice && !isFinalClosed && primaryInvoice.status === "finalized";

  const finalCloseMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/patient-invoices/${id}/final-close`),
    onSuccess: () => {
      toast({ title: "تم الإغلاق النهائي", description: "تم إغلاق الفاتورة نهائياً بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex justify-center items-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (!data || data.totals.invoiceCount === 0) return (
    <div className="text-center py-12 text-muted-foreground text-sm">لا توجد فواتير طبية لهذا المريض</div>
  );

  const admissionId = selectedVisit?.admission_id ?? undefined;
  const visitId     = (!admissionId && selectedVisit?.id) ? selectedVisit.id : undefined;

  const totalsForSidebar = visitTotals ?? data.totals;
  const serviceCount = data.byVisit.find(v => v.visitKey === selectedVisitKey)?.invoiceCount ?? data.totals.invoiceCount;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Visit Selector Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <History className="h-4 w-4 text-muted-foreground shrink-0" />
        {patientVisits.length > 0 ? (
          <Select
            value={selectedVisitKey || "__all__"}
            onValueChange={val => setSelectedVisitKey(val === "__all__" ? "" : val)}
          >
            <SelectTrigger className="h-8 text-xs w-[280px]" data-testid="select-visit-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل الزيارات ({patientVisits.length})</SelectItem>
              {patientVisits.map(pv => (
                <SelectItem key={pv.id} value={pvToVisitKey(pv)}>
                  <span className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1 py-0 ${pv.visit_type === "inpatient" ? "border-indigo-400 text-indigo-700" : "border-teal-400 text-teal-700"}`}
                    >
                      {pv.visit_type === "inpatient" ? "داخلي" : "خارجي"}
                    </Badge>
                    {pv.visit_number}
                    {pv.department_name && <span className="text-muted-foreground text-[10px]">— {pv.department_name}</span>}
                    {pv.admission_date && <span className="text-muted-foreground text-[10px]">({fmtDate(pv.admission_date)})</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">لا توجد زيارات مسجلة — عرض إجمالي المريض</span>
        )}

        {selectedVisitKey && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setSelectedVisitKey("")}
          >مسح</button>
        )}
      </div>

      {/* ── Invoice Header ──────────────────────────────────────────────────── */}
      <InvoiceHeaderCard
        patientName={patientName}
        patientCode={patientCode}
        visit={selectedVisit}
        invoiceNumber={primaryInvoice?.invoiceNumber}
        isFinalClosed={isFinalClosed}
      />

      {/* ── Body: Sidebar + Tabs ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* Financial Sidebar */}
        <div className="w-full lg:w-48 shrink-0">
          <FinancialSidebar
            totals={totalsForSidebar}
            isFinalClosed={isFinalClosed}
            canFinalClose={canFinalClose}
            onFinalClose={() => primaryInvoice && finalCloseMutation.mutate(primaryInvoice.id)}
            isPending={finalCloseMutation.isPending}
            finalClosedAt={primaryInvoice?.finalClosedAt}
            invoiceNumber={primaryInvoice?.invoiceNumber}
          />
        </div>

        {/* Tabbed Content */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="services">
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="services" className="text-xs px-3" data-testid="tab-services">
                الخدمات
              </TabsTrigger>
              <TabsTrigger value="payments" className="text-xs px-3" data-testid="tab-payments">
                المدفوعات
              </TabsTrigger>
            </TabsList>

            <TabsContent value="services" className="mt-0">
              <ServicesTab
                patientId={patientId}
                admissionId={admissionId}
                visitId={visitId}
                isFinalClosed={isFinalClosed}
              />
            </TabsContent>

            <TabsContent value="payments" className="mt-0">
              <PaymentsTab
                patientId={patientId}
                admissionId={admissionId}
                visitId={visitId}
                isFinalClosed={isFinalClosed}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
});
