import { memo, useState, useMemo, useCallback, useEffect } from "react";
import {
  Loader2, Lock, LockOpen, CheckCircle2, AlertTriangle, History,
  User, Stethoscope, CalendarDays, FileText, RefreshCw,
  ChevronRight, ChevronLeft, Banknote, Building2,
  Activity, ShieldCheck, XCircle, Clock, CircleDot,
  Printer, CreditCard, Percent, Save, Plus, Stethoscope as DoctorIcon,
  Scissors, FileCheck, Filter,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, fmtMoney, fmtQty, PAYMENT_METHOD_LABELS, LINE_TYPE_LABELS } from "../shared/formatters";
import { useInvoiceLines, usePaymentsList } from "../hooks/useInvoiceLines";
import type {
  AggregatedInvoice, AggregatedViewData, InvoiceLine, VisitGroup,
} from "../shared/types";

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

const ENCOUNTER_TYPE_LABELS: Record<string, string> = {
  clinic: "عيادة",
  lab: "معمل",
  radiology: "أشعة",
  surgery: "عمليات",
  icu: "عناية مركزة",
  ward: "إقامة",
  nursery: "حضّانة",
};

const ENCOUNTER_TYPE_COLORS: Record<string, string> = {
  clinic: "bg-teal-50 text-teal-700 border-teal-200",
  lab: "bg-orange-50 text-orange-700 border-orange-200",
  radiology: "bg-violet-50 text-violet-700 border-violet-200",
  surgery: "bg-red-50 text-red-700 border-red-200",
  icu: "bg-rose-50 text-rose-700 border-rose-200",
  ward: "bg-indigo-50 text-indigo-700 border-indigo-200",
  nursery: "bg-pink-50 text-pink-700 border-pink-200",
};

const ENCOUNTER_STATUS_LABELS: Record<string, { label: string; icon: typeof CheckCircle2 }> = {
  active: { label: "نشط", icon: Activity },
  completed: { label: "مكتمل", icon: CheckCircle2 },
  cancelled: { label: "ملغي", icon: XCircle },
};

const LINE_CLASS: Record<string, string> = {
  service: "bg-blue-50 text-blue-700 border-blue-200",
  drug: "bg-green-50 text-green-700 border-green-200",
  consumable: "bg-amber-50 text-amber-700 border-amber-200",
  equipment: "bg-purple-50 text-purple-700 border-purple-200",
};

const PAY_METHOD_CLASS: Record<string, string> = {
  cash: "bg-green-50 text-green-700 border-green-200",
  card: "bg-blue-50 text-blue-700 border-blue-200",
  bank_transfer: "bg-purple-50 text-purple-700 border-purple-200",
  insurance: "bg-amber-50 text-amber-700 border-amber-200",
};

function pvToVisitKey(pv: PatientVisit): string {
  if (pv.visit_type === "inpatient" && pv.admission_id) return `admission:${pv.admission_id}`;
  return `visit:${pv.id}`;
}

function findPrimaryInvoice(invoices: AggregatedInvoice[]): AggregatedInvoice | undefined {
  return (
    invoices.find(i => i.isConsolidated && i.status === "finalized") ??
    invoices.find(i => i.isConsolidated && i.status === "draft") ??
    invoices.find(i => i.status === "finalized" && !i.isConsolidated && invoices.length === 1) ??
    invoices.find(i => i.status === "draft"     && !i.isConsolidated && invoices.length === 1) ??
    undefined
  );
}

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

const FinancialSidebar = memo(function FinancialSidebar({
  totals, isFinalClosed, canFinalClose, onFinalClose, isPending, finalClosedAt, invoiceNumber,
}: {
  totals: { totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number; remaining: number };
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
        <FinRow label="الخصم" value={totals.discountAmount} muted />
        <FinRow label="الصافي" value={totals.netAmount} highlight border />

        <div className="my-2 border-t border-slate-200" />
        <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">الدفعات</p>
        <FinRow label="المدفوع" value={totals.paidAmount} />
        <FinRow label="الباقي" value={totals.remaining} />
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

const ServicesTab = memo(function ServicesTab({
  patientId, admissionId, visitId, isFinalClosed,
}: {
  patientId: string;
  admissionId?: string;
  visitId?: string;
  isFinalClosed: boolean;
}) {
  const [page, setPage] = useState(1);
  const [deptFilter, setDeptFilter] = useState<string>("__all__");
  const { data, isLoading, isError, dataUpdatedAt } = useInvoiceLines({
    patientId,
    page,
    limit: 100,
    admissionId,
    visitId,
    refetchInterval: isFinalClosed ? false : 15_000,
  });

  const departments = useMemo(() => {
    if (!data?.data) return [];
    const seen = new Set<string>();
    const result: Array<{ id: string | null; name: string }> = [];
    for (const line of data.data) {
      const key = line.department_name || "__none__";
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ id: line.department_id, name: line.department_name || "غير محدد" });
      }
    }
    return result;
  }, [data?.data]);

  const filteredLines = useMemo(() => {
    if (!data?.data) return [];
    if (deptFilter === "__all__") return data.data;
    return data.data.filter(l => (l.department_name || "غير محدد") === deptFilter);
  }, [data?.data, deptFilter]);

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
      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {departments.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-7 text-xs w-[180px]" data-testid="select-dept-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">كل الأقسام ({data.data.length})</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.name} value={d.name}>
                      {d.name} ({data.data.filter(l => (l.department_name || "غير محدد") === d.name).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <span>{filteredLines.length} خدمة</span>
        </div>
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
            {filteredLines.map((line: InvoiceLine, idx: number) => (
              <tr key={line.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-line-${line.id}`}>
                <td className="p-2 text-xs text-muted-foreground text-center">{(page - 1) * 100 + idx + 1}</td>
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
                ({fmtMoney(filteredLines.reduce((s: number, l: InvoiceLine) => s + parseFloat(l.discount_amount || "0"), 0))})
              </td>
              <td className="p-2 text-center font-mono">
                {fmtMoney(filteredLines.reduce((s: number, l: InvoiceLine) => s + parseFloat(l.total_price || "0"), 0))}
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

const InvoicePaymentsTab = memo(function InvoicePaymentsTab({
  patientId, admissionId, visitId, isFinalClosed,
  primaryInvoiceId, primaryInvoiceStatus,
  onPaymentAdded,
}: {
  patientId: string;
  admissionId?: string;
  visitId?: string;
  isFinalClosed: boolean;
  primaryInvoiceId?: string;
  primaryInvoiceStatus?: string;
  onPaymentAdded?: () => void;
}) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payTreasuryId, setPayTreasuryId] = useState<string>("__none__");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");

  const { data, isLoading } = usePaymentsList({
    patientId, admissionId, visitId,
    refetchInterval: isFinalClosed ? false : 15_000,
  });

  const { data: treasuries = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/treasuries/mine"],
    queryFn: async () => {
      const r = await fetch("/api/treasuries/mine", { credentials: "include" });
      if (!r.ok) return [];
      const result = await r.json();
      return Array.isArray(result) ? result : [];
    },
    enabled: !!primaryInvoiceId && primaryInvoiceStatus === "draft",
  });

  const addPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!primaryInvoiceId) throw new Error("لا توجد فاتورة نشطة");
      const amt = parseFloat(payAmount);
      if (!payAmount || isNaN(amt) || amt <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      return apiRequest("POST", `/api/patient-invoices/${primaryInvoiceId}/add-payment`, {
        amount: amt,
        paymentMethod: payMethod,
        treasuryId: payTreasuryId !== "__none__" ? payTreasuryId : undefined,
        paymentDate: payDate,
        notes: payNotes || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "تم تسجيل الدفعة", description: "تمت إضافة الدفعة بنجاح" });
      setShowForm(false);
      setPayAmount("");
      setPayMethod("cash");
      setPayTreasuryId("__none__");
      setPayDate(new Date().toISOString().split("T")[0]);
      setPayNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices", primaryInvoiceId] });
      onPaymentAdded?.();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const payments: any[] = data ?? [];
  const total = payments.reduce((s: number, p: any) => s + parseFloat(p.amount || "0"), 0);
  const canAddPayment = !isFinalClosed && primaryInvoiceStatus === "draft" && !!primaryInvoiceId;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-1.5">
          <Banknote className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">إجمالي المدفوعات: {fmtMoney(total)}</span>
          <span className="text-xs opacity-70">({payments.length} دفعة)</span>
        </div>
        {canAddPayment && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={() => setShowForm(v => !v)}
            data-testid="button-toggle-add-payment"
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة دفعة
          </Button>
        )}
      </div>

      {canAddPayment && showForm && (
        <div className="border rounded-xl p-4 bg-blue-50/50 flex flex-col gap-3" data-testid="form-add-payment">
          <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            تسجيل دفعة جديدة
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">المبلغ *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                className="h-8 text-sm"
                dir="ltr"
                data-testid="input-pay-amount"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">طريقة الدفع</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-pay-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="insurance">تأمين</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">التاريخ</Label>
              <Input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="h-8 text-sm"
                data-testid="input-pay-date"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">الخزنة</Label>
              <Select value={payTreasuryId} onValueChange={setPayTreasuryId}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-pay-treasury">
                  <SelectValue placeholder="اختر الخزنة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— بدون خزنة —</SelectItem>
                  {treasuries.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">ملاحظات</Label>
            <Input
              type="text"
              placeholder="ملاحظات اختيارية..."
              value={payNotes}
              onChange={e => setPayNotes(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-pay-notes"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowForm(false)}
              disabled={addPaymentMutation.isPending}
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={() => addPaymentMutation.mutate()}
              disabled={addPaymentMutation.isPending || !payAmount}
              data-testid="button-submit-payment"
            >
              {addPaymentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              حفظ الدفعة
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : payments.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">لا توجد مدفوعات لهذه الزيارة</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
                <th className="p-2.5 text-right whitespace-nowrap">التاريخ</th>
                <th className="p-2.5 text-center">المبلغ</th>
                <th className="p-2.5 text-right">طريقة الدفع</th>
                <th className="p-2.5 text-right">الخزنة</th>
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
                  <td className="p-2.5 font-mono text-xs text-muted-foreground">{p.invoice_number}</td>
                  <td className="p-2.5 text-xs text-muted-foreground">{p.reference_number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold text-sm border-t-2">
                <td className="p-2.5">الإجمالي</td>
                <td className="p-2.5 text-center font-mono text-green-600">{fmtMoney(total)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
});

const InvoiceHeaderCard = memo(function InvoiceHeaderCard({
  patientName, patientCode, visit, invoiceNumber, isFinalClosed, invoiceStatus,
}: {
  patientName: string;
  patientCode: string;
  visit: PatientVisit | null;
  invoiceNumber?: string;
  isFinalClosed: boolean;
  invoiceStatus?: string;
}) {
  const isDraft = !invoiceStatus || invoiceStatus === "draft";
  return (
    <div className="rounded-xl border bg-gradient-to-l from-slate-50 to-white px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Lock icon - prominent */}
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${
            isFinalClosed
              ? "bg-gradient-to-br from-green-500 to-green-700 text-white shadow"
              : isDraft
                ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow"
                : "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow"
          }`}
          data-testid={isFinalClosed ? "badge-lock-closed" : "badge-lock-open"}
          title={isFinalClosed ? "مغلق نهائياً" : isDraft ? "مسودة" : "معتمد"}
        >
          {isFinalClosed
            ? <Lock className="h-5 w-5" />
            : isDraft
              ? <LockOpen className="h-5 w-5" />
              : <Lock className="h-5 w-5 opacity-80" />}
        </div>

        {/* Patient info */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <p className="font-bold text-sm leading-tight">{patientName}</p>
            {patientCode && <span className="font-mono text-xs text-muted-foreground">{patientCode}</span>}
          </div>
          {visit?.doctor_name && (
            <div className="flex items-center gap-1.5">
              <Stethoscope className="h-3 w-3 text-teal-500 shrink-0" />
              <span className="text-xs text-muted-foreground">{visit.doctor_name}</span>
            </div>
          )}
          {visit?.department_name && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-indigo-400 shrink-0" />
              <span className="text-xs text-muted-foreground">{visit.department_name}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-10 bg-border shrink-0" />

        {/* Invoice info */}
        <div className="flex flex-col gap-0.5">
          {invoiceNumber && (
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="font-mono text-sm font-semibold">{invoiceNumber}</span>
            </div>
          )}
          {visit?.admission_date && (
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="text-xs">
                دخول: <span className="font-medium">{fmtDate(visit.admission_date)}</span>
                {visit.discharge_date && <> — خروج: <span className="font-medium">{fmtDate(visit.discharge_date)}</span></>}
                {!visit.discharge_date && <span className="text-amber-600 text-xs mr-1">لم يخرج بعد</span>}
              </span>
            </div>
          )}
          {visit?.visit_number && (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={`text-[10px] px-1 py-0 ${visit.visit_type === "inpatient" ? "border-indigo-400 text-indigo-700 bg-indigo-50" : "border-teal-400 text-teal-700 bg-teal-50"}`}>
                {visit.visit_type === "inpatient" ? "داخلي" : "خارجي"}
              </Badge>
              <span className="font-mono text-xs">{visit.visit_number}</span>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="mr-auto">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
            isFinalClosed
              ? "border-green-300 bg-green-50 text-green-700"
              : isDraft
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-blue-300 bg-blue-50 text-blue-700"
          }`}>
            {isFinalClosed ? <Lock className="h-3.5 w-3.5" /> : isDraft ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {isFinalClosed ? "مغلق نهائياً" : isDraft ? "مسودة" : invoiceStatus === "finalized" ? "معتمد" : "جارٍ..."}
          </div>
        </div>
      </div>

      {visit?.admission_notes && (
        <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">ملاحظات: </span>
          {visit.admission_notes}
        </div>
      )}
    </div>
  );
});

interface EncounterLineSummary {
  id: string;
  lineType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  totalPrice: string;
  businessClassification: string | null;
  createdAt: string;
  notes: string | null;
}

interface EncounterSummary {
  id: string;
  encounterType: string;
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  doctorId: string | null;
  doctorName: string | null;
  startedAt: string;
  endedAt: string | null;
  lines: EncounterLineSummary[];
  totals: { gross: number; discount: number; net: number; lineCount: number };
}

interface VisitInvoiceSummary {
  visit: {
    id: string;
    visitNumber: string;
    patientId: string;
    patientName: string;
    visitType: string;
    status: string;
    departmentId: string | null;
    departmentName: string | null;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    isFinalClosed: boolean;
    invoiceDate: string;
  } | null;
  encounters: EncounterSummary[];
  unlinkedLines: EncounterLineSummary[];
  totals: {
    gross: number;
    discount: number;
    net: number;
    paid: number;
    remaining: number;
    lineCount: number;
    encounterCount: number;
  };
  departmentBreakdown: Array<{
    departmentId: string | null;
    departmentName: string | null;
    gross: number;
    discount: number;
    net: number;
    lineCount: number;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    paymentMethod: string;
    treasuryName: string | null;
    notes: string | null;
    paymentDate: string;
  }>;
  readiness: {
    hasInvoice: boolean;
    allLinesHaveEncounter: boolean;
    totalsMatch: boolean;
    isFullyPaid: boolean;
    canFinalize: boolean;
    issues: string[];
  };
}

const EncounterTimeline = memo(function EncounterTimeline({ encounters }: { encounters: EncounterSummary[] }) {
  if (encounters.length === 0) return null;
  return (
    <div className="flex flex-col gap-0 relative pr-4" data-testid="encounter-timeline">
      <div className="absolute right-[7px] top-3 bottom-3 w-0.5 bg-slate-200" />
      {encounters.map((enc, idx) => {
        const StatusIcon = ENCOUNTER_STATUS_LABELS[enc.status]?.icon ?? CircleDot;
        const colorClass = ENCOUNTER_TYPE_COLORS[enc.encounterType] ?? "bg-slate-50 text-slate-700 border-slate-200";
        return (
          <div key={enc.id} className="flex items-start gap-3 relative" data-testid={`timeline-enc-${enc.id}`}>
            <div className={`z-10 w-4 h-4 rounded-full border-2 shrink-0 mt-1 ${
              enc.status === "completed" ? "bg-green-500 border-green-500" :
              enc.status === "cancelled" ? "bg-red-400 border-red-400" :
              "bg-blue-500 border-blue-500"
            }`} />
            <div className={`flex-1 rounded-lg border p-3 mb-2 ${
              enc.status === "cancelled" ? "opacity-50" : ""
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colorClass}`}>
                  {ENCOUNTER_TYPE_LABELS[enc.encounterType] ?? enc.encounterType}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                  <StatusIcon className="h-2.5 w-2.5" />
                  {ENCOUNTER_STATUS_LABELS[enc.status]?.label ?? enc.status}
                </Badge>
                {enc.departmentName && (
                  <span className="text-[10px] text-muted-foreground">{enc.departmentName}</span>
                )}
                {enc.doctorName && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Stethoscope className="h-2.5 w-2.5" />{enc.doctorName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {fmtDate(enc.startedAt, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                </span>
                {enc.endedAt && (
                  <span>← {fmtDate(enc.endedAt, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                )}
                <span className="font-mono">{enc.totals.lineCount} بند • {fmtMoney(enc.totals.net)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const EncounterLinesTable = memo(function EncounterLinesTable({ lines }: { lines: EncounterLineSummary[] }) {
  if (lines.length === 0) return (
    <div className="text-center py-6 text-muted-foreground text-sm">لا توجد بنود</div>
  );
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" dir="rtl">
        <thead>
          <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
            <th className="p-2 text-right w-6">#</th>
            <th className="p-2 text-right">النوع</th>
            <th className="p-2 text-right">البيان</th>
            <th className="p-2 text-center">الكمية</th>
            <th className="p-2 text-center">السعر</th>
            <th className="p-2 text-center">الخصم</th>
            <th className="p-2 text-center font-semibold">الصافي</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={line.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-enc-line-${line.id}`}>
              <td className="p-2 text-xs text-muted-foreground text-center">{idx + 1}</td>
              <td className="p-2">
                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${LINE_CLASS[line.lineType] ?? ""}`}>
                  {LINE_TYPE_LABELS[line.lineType] ?? line.lineType}
                </Badge>
              </td>
              <td className="p-2 text-sm max-w-[200px] truncate" title={line.description}>{line.description}</td>
              <td className="p-2 text-center font-mono text-sm">{fmtQty(line.quantity)}</td>
              <td className="p-2 text-center font-mono text-sm">{fmtMoney(line.unitPrice)}</td>
              <td className="p-2 text-center font-mono text-sm text-purple-600">
                {parseFloat(line.discountAmount) > 0 ? `(${fmtMoney(line.discountAmount)})` : "—"}
              </td>
              <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(line.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 border-t-2 text-sm font-semibold">
            <td className="p-2" colSpan={3}>الإجمالي</td>
            <td className="p-2" colSpan={2}></td>
            <td className="p-2 text-center font-mono text-purple-600">
              ({fmtMoney(lines.reduce((s, l) => s + parseFloat(l.discountAmount || "0"), 0))})
            </td>
            <td className="p-2 text-center font-mono">
              {fmtMoney(lines.reduce((s, l) => s + parseFloat(l.totalPrice || "0"), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
});

const EncounterBreakdownView = memo(function EncounterBreakdownView({
  summary, visitId, patientId, admissionId, onFinalize, isFinalizePending,
}: {
  summary: VisitInvoiceSummary;
  visitId: string;
  patientId: string;
  admissionId?: string;
  onFinalize: () => void;
  isFinalizePending: boolean;
}) {
  const [activeEnc, setActiveEnc] = useState<string>("__all__");

  const outpatientVisitId = !admissionId ? visitId : undefined;
  const { data: livePayments, isLoading: paymentsLoading } = usePaymentsList({
    patientId,
    admissionId,
    visitId: outpatientVisitId,
    refetchInterval: summary.invoice?.isFinalClosed ? false : 15_000,
  });

  const normalizedPayments: VisitInvoiceSummary["payments"] = (livePayments ?? summary.payments).map((p: any) => ({
    id:            p.id,
    amount:        String(p.amount ?? "0"),
    paymentMethod: p.payment_method ?? p.paymentMethod ?? "",
    treasuryId:    p.treasury_id   ?? p.treasuryId   ?? null,
    treasuryName:  p.treasury_name ?? p.treasuryName  ?? null,
    notes:         p.notes         ?? null,
    paymentDate:   p.payment_date  ?? p.paymentDate   ?? "",
    createdAt:     String(p.created_at ?? p.createdAt ?? ""),
  }));

  const paymentsCount = livePayments ? livePayments.length : summary.payments.length;

  const encounterTabs = useMemo(() => {
    const tabs: Array<{ value: string; label: string; count: number; net: number }> = [
      { value: "__all__", label: "الكل", count: summary.totals.lineCount, net: summary.totals.net },
    ];
    for (const enc of summary.encounters) {
      tabs.push({
        value: enc.id,
        label: `${ENCOUNTER_TYPE_LABELS[enc.encounterType] ?? enc.encounterType}${enc.departmentName ? ` — ${enc.departmentName}` : ""}`,
        count: enc.totals.lineCount,
        net: enc.totals.net,
      });
    }
    if (summary.unlinkedLines.length > 0) {
      tabs.push({
        value: "__unlinked__",
        label: "بدون مقابلة",
        count: summary.unlinkedLines.length,
        net: summary.unlinkedLines.reduce((s, l) => s + parseFloat(l.totalPrice || "0"), 0),
      });
    }
    return tabs;
  }, [summary]);

  const activeLines = useMemo(() => {
    if (activeEnc === "__all__") {
      return summary.encounters.flatMap(e => e.lines).concat(summary.unlinkedLines);
    }
    if (activeEnc === "__unlinked__") return summary.unlinkedLines;
    const enc = summary.encounters.find(e => e.id === activeEnc);
    return enc?.lines ?? [];
  }, [activeEnc, summary]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="w-full lg:w-48 shrink-0 flex flex-col gap-3">
          <div className="bg-slate-50 border rounded-xl p-4 flex flex-col gap-0.5">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">ملخص الزيارة</p>
            <FinRow label="إجمالي" value={summary.totals.gross} />
            <FinRow label="الخصم" value={summary.totals.discount} muted />
            <FinRow label="الصافي" value={summary.totals.net} highlight border />
            <div className="my-2 border-t border-slate-200" />
            <FinRow label="المدفوع" value={summary.totals.paid} />
            <FinRow label="الباقي" value={summary.totals.remaining} />
            <div className="mt-2 text-[10px] text-muted-foreground">
              {summary.totals.encounterCount} مقابلة • {summary.totals.lineCount} بند
            </div>
          </div>

          {summary.departmentBreakdown.length > 1 && (
            <div className="bg-slate-50 border rounded-xl p-3 flex flex-col gap-1">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">حسب القسم</p>
              {summary.departmentBreakdown.map((dept, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground truncate max-w-[80px]">{dept.departmentName ?? "—"}</span>
                  <span className="font-mono">{fmtMoney(dept.net)}</span>
                </div>
              ))}
            </div>
          )}

          <FinalizationPanel
            readiness={summary.readiness}
            invoiceStatus={summary.invoice?.status}
            isFinalClosed={summary.invoice?.isFinalClosed ?? false}
            onFinalize={onFinalize}
            isPending={isFinalizePending}
            totals={summary.totals}
          />
        </div>

        <div className="flex-1 min-w-0">
          <Tabs defaultValue="encounters" dir="rtl">
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="encounters" className="text-xs px-3" data-testid="tab-encounters">
                المقابلات
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs px-3" data-testid="tab-timeline">
                الجدول الزمني
              </TabsTrigger>
              <TabsTrigger value="enc-payments" className="text-xs px-3" data-testid="tab-enc-payments">
                المدفوعات ({paymentsCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="encounters" className="mt-0">
              <div className="flex flex-col gap-3">
                {encounterTabs.length > 2 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {encounterTabs.map(tab => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setActiveEnc(tab.value)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          activeEnc === tab.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-border"
                        }`}
                        data-testid={`btn-enc-filter-${tab.value}`}
                      >
                        {tab.label}
                        <span className="mr-1 opacity-70">({tab.count})</span>
                      </button>
                    ))}
                  </div>
                )}

                <EncounterLinesTable lines={activeLines} />
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <EncounterTimeline encounters={summary.encounters} />
            </TabsContent>

            <TabsContent value="enc-payments" className="mt-0">
              {paymentsLoading && !livePayments ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <EncounterPaymentsView payments={normalizedPayments} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
});

const EncounterPaymentsView = memo(function EncounterPaymentsView({
  payments,
}: {
  payments: VisitInvoiceSummary["payments"];
}) {
  if (payments.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">لا توجد مدفوعات</div>
  );
  const total = payments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-1.5">
        <Banknote className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">إجمالي المدفوعات: {fmtMoney(total)}</span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
              <th className="p-2.5 text-right">التاريخ</th>
              <th className="p-2.5 text-center">المبلغ</th>
              <th className="p-2.5 text-right">طريقة الدفع</th>
              <th className="p-2.5 text-right">الخزنة</th>
              <th className="p-2.5 text-right">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-enc-pay-${p.id}`}>
                <td className="p-2.5 text-xs text-muted-foreground">{fmtDate(p.paymentDate)}</td>
                <td className="p-2.5 text-center font-mono font-semibold text-green-600">{fmtMoney(p.amount)}</td>
                <td className="p-2.5">
                  <Badge variant="outline" className={`text-xs ${PAY_METHOD_CLASS[p.paymentMethod] ?? ""}`}>
                    {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                  </Badge>
                </td>
                <td className="p-2.5 text-sm">{p.treasuryName ?? "—"}</td>
                <td className="p-2.5 text-xs text-muted-foreground">{p.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const CLASSIFICATION_LABELS: Record<string, { label: string; colorClass: string }> = {
  fully_paid: { label: "مدفوعة بالكامل", colorClass: "text-green-700 bg-green-50 border-green-200" },
  accounts_receivable: { label: "ذمم مدينة (AR)", colorClass: "text-amber-700 bg-amber-50 border-amber-200" },
  refund_due: { label: "مردود مستحق", colorClass: "text-red-700 bg-red-50 border-red-200" },
};

const FinalizationPanel = memo(function FinalizationPanel({
  readiness, invoiceStatus, isFinalClosed, onFinalize, isPending, totals,
}: {
  readiness: VisitInvoiceSummary["readiness"];
  invoiceStatus: string | undefined;
  isFinalClosed: boolean;
  onFinalize: () => void;
  isPending: boolean;
  totals: VisitInvoiceSummary["totals"];
}) {
  if (isFinalClosed) {
    return (
      <div className="flex flex-col items-center gap-1 p-3 rounded-xl border border-green-200 bg-green-50">
        <Lock className="h-5 w-5 text-green-600" />
        <span className="text-xs font-semibold text-green-700">معتمد ومغلق نهائياً</span>
      </div>
    );
  }

  if (invoiceStatus === "finalizing") {
    return (
      <div className="flex flex-col items-center gap-1 p-3 rounded-xl border border-amber-200 bg-amber-50">
        <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
        <span className="text-xs font-semibold text-amber-700">جاري الاعتماد...</span>
      </div>
    );
  }

  if (invoiceStatus === "finalized") {
    return (
      <div className="flex flex-col items-center gap-1 p-3 rounded-xl border border-blue-200 bg-blue-50">
        <CheckCircle2 className="h-5 w-5 text-blue-600" />
        <span className="text-xs font-semibold text-blue-700">معتمد</span>
      </div>
    );
  }

  const remaining = totals.remaining;
  const classification = remaining <= 0.01 && remaining >= -0.01
    ? "fully_paid"
    : remaining > 0.01
      ? "accounts_receivable"
      : "refund_due";
  const classInfo = CLASSIFICATION_LABELS[classification];

  return (
    <div className="border rounded-xl p-3 flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <ShieldCheck className="h-3 w-3" />
        فحص الاعتماد
      </p>

      <div className="flex flex-col gap-1">
        <ReadinessCheck label="فاتورة موجودة" ok={readiness.hasInvoice} />
        <ReadinessCheck label="كل البنود مرتبطة" ok={readiness.allLinesHaveEncounter} />
        <ReadinessCheck label="الإجماليات متطابقة" ok={readiness.totalsMatch} />
      </div>

      {classInfo && (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium ${classInfo.colorClass}`} data-testid="badge-payment-classification">
          <Banknote className="h-3 w-3" />
          <span>{classInfo.label}</span>
          {classification !== "fully_paid" && (
            <span className="font-mono mr-auto">{fmtMoney(Math.abs(remaining))}</span>
          )}
        </div>
      )}

      {readiness.issues.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-1">
          {readiness.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-800">
              <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{issue}</span>
            </div>
          ))}
        </div>
      )}

      {readiness.canFinalize && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-green-300 text-green-700 hover:bg-green-50 gap-1.5 mt-1"
              disabled={isPending}
              data-testid="button-finalize-visit"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              اعتماد الفاتورة
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                تأكيد الاعتماد
              </AlertDialogTitle>
              <AlertDialogDescription>
                {classification === "accounts_receivable"
                  ? `سيتم اعتماد الفاتورة مع تسجيل ${fmtMoney(Math.abs(remaining))} كذمم مدينة`
                  : classification === "refund_due"
                    ? `سيتم اعتماد الفاتورة مع تسجيل ${fmtMoney(Math.abs(remaining))} كمردود مستحق`
                    : "سيتم اعتماد فاتورة الزيارة — لن يمكن تعديل البنود بعد الاعتماد."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={onFinalize}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-confirm-finalize"
              >
                تأكيد الاعتماد
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
});

function ReadinessCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {ok ? (
        <CheckCircle2 className="h-3 w-3 text-green-600" />
      ) : (
        <XCircle className="h-3 w-3 text-red-400" />
      )}
      <span className={ok ? "text-green-700" : "text-red-600"}>{label}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// NEW PANELS
// ──────────────────────────────────────────────────────────────────────────────

const ClinicalInfoPanel = memo(function ClinicalInfoPanel({
  invoiceId, isFinalClosed, invoiceStatus, initialDiagnosis, initialNotes, onSaved,
}: {
  invoiceId: string;
  isFinalClosed: boolean;
  invoiceStatus: string;
  initialDiagnosis: string;
  initialNotes: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [notes, setNotes] = useState(initialNotes);
  const isDirty = diagnosis !== initialDiagnosis || notes !== initialNotes;
  const isEditable = !isFinalClosed && invoiceStatus === "draft";

  useEffect(() => {
    setDiagnosis(initialDiagnosis);
    setNotes(initialNotes);
  }, [initialDiagnosis, initialNotes]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/patient-invoices/${invoiceId}/clinical-info`, { diagnosis, notes }),
    onSuccess: () => {
      toast({ title: "تم الحفظ", description: "تم حفظ التشخيص والملاحظات" });
      onSaved();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="border rounded-xl p-3 flex flex-col gap-2 bg-white">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <FileCheck className="h-3.5 w-3.5" />
        التشخيص والملاحظات
      </p>
      <div className="flex flex-col gap-1.5">
        <Label className="text-[10px] text-muted-foreground">التشخيص</Label>
        <Textarea
          value={diagnosis}
          onChange={e => setDiagnosis(e.target.value)}
          disabled={!isEditable}
          placeholder={isEditable ? "أدخل التشخيص..." : "—"}
          rows={2}
          className="text-xs resize-none"
          data-testid="textarea-diagnosis"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={!isEditable}
          placeholder={isEditable ? "ملاحظات إضافية..." : "—"}
          rows={2}
          className="text-xs resize-none"
          data-testid="textarea-notes"
        />
      </div>
      {isEditable && isDirty && (
        <Button
          size="sm"
          className="w-full text-xs gap-1 h-7"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-clinical"
        >
          {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          حفظ
        </Button>
      )}
      {isFinalClosed && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" /> مغلق — غير قابل للتعديل
        </p>
      )}
    </div>
  );
});

const HeaderDiscountPanel = memo(function HeaderDiscountPanel({
  invoiceId, isFinalClosed, invoiceStatus,
  currentDiscountPercent, currentDiscountAmount, netAmount,
  onUpdated,
}: {
  invoiceId: string;
  isFinalClosed: boolean;
  invoiceStatus: string;
  currentDiscountPercent: number;
  currentDiscountAmount: number;
  netAmount: number;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [discType, setDiscType] = useState<"percent" | "amount">("percent");
  const [discValue, setDiscValue] = useState("");
  const isEditable = !isFinalClosed && invoiceStatus === "draft";

  const applyMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/patient-invoices/${invoiceId}/header-discount`, {
      discountType: discType,
      discountValue: parseFloat(discValue),
    }),
    onSuccess: () => {
      toast({ title: "تم تطبيق الخصم", description: "تم تحديث خصم الإجمالي" });
      setDiscValue("");
      onUpdated();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  if (!isEditable) return null;

  return (
    <div className="border rounded-xl p-3 flex flex-col gap-2 bg-white">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Scissors className="h-3.5 w-3.5" />
        خصم الإجمالي
      </p>
      {(currentDiscountPercent > 0 || currentDiscountAmount > 0) && (
        <div className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded-lg px-2 py-1">
          الخصم الحالي: {currentDiscountPercent > 0 ? `${currentDiscountPercent}%` : ""} {currentDiscountAmount > 0 ? `— ${fmtMoney(currentDiscountAmount)}` : ""}
        </div>
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setDiscType("percent")}
          className={`flex-1 text-xs py-1 px-2 rounded border transition-colors ${discType === "percent" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          data-testid="btn-disc-percent"
        >
          <Percent className="h-3 w-3 inline ml-1" />
          نسبة
        </button>
        <button
          type="button"
          onClick={() => setDiscType("amount")}
          className={`flex-1 text-xs py-1 px-2 rounded border transition-colors ${discType === "amount" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          data-testid="btn-disc-amount"
        >
          <Banknote className="h-3 w-3 inline ml-1" />
          مبلغ
        </button>
      </div>
      <Input
        type="number"
        min="0"
        step={discType === "percent" ? "0.01" : "1"}
        max={discType === "percent" ? "100" : undefined}
        placeholder={discType === "percent" ? "0.00%" : "0.00 ج.م"}
        value={discValue}
        onChange={e => setDiscValue(e.target.value)}
        className="h-8 text-sm"
        dir="ltr"
        data-testid="input-disc-value"
      />
      <Button
        size="sm"
        className="w-full text-xs gap-1 h-7"
        onClick={() => applyMutation.mutate()}
        disabled={applyMutation.isPending || !discValue}
        data-testid="button-apply-discount"
      >
        {applyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        تطبيق
      </Button>
    </div>
  );
});

const DoctorTransferPanel = memo(function DoctorTransferPanel({
  invoiceId, isFinalClosed, invoiceStatus, netAmount, patientId,
}: {
  invoiceId: string;
  isFinalClosed: boolean;
  invoiceStatus: string;
  netAmount: number;
  patientId: string;
}) {
  const { toast } = useToast();
  const [doctorName, setDoctorName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canTransfer = !isFinalClosed && invoiceStatus === "finalized";

  const { data: transfers = [], refetch: refetchTransfers } = useQuery<any[]>({
    queryKey: ["/api/patient-invoices", invoiceId, "transfers"],
    queryFn: async () => {
      const r = await fetch(`/api/patient-invoices/${invoiceId}/transfers`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!invoiceId && invoiceStatus === "finalized",
  });

  const alreadyTransferred = transfers.reduce((s: number, t: any) => s + parseFloat(t.amount || "0"), 0);
  const remaining = Math.max(0, netAmount - alreadyTransferred);

  const transferMutation = useMutation({
    mutationFn: () => {
      const clientRequestId = crypto.randomUUID();
      return apiRequest("POST", `/api/patient-invoices/${invoiceId}/transfer-to-doctor`, {
        doctorName: doctorName.trim(),
        amount: parseFloat(amount),
        notes: notes.trim() || undefined,
        clientRequestId,
      });
    },
    onSuccess: () => {
      toast({ title: "تم التحويل", description: "تم تحويل المستحقات للطبيب بنجاح" });
      setDoctorName("");
      setAmount("");
      setNotes("");
      setConfirmOpen(false);
      refetchTransfers();
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      toast({ title: "خطأ في التحويل", description: err.message, variant: "destructive" });
    },
  });

  function handleConfirm() {
    if (!doctorName.trim()) { toast({ variant: "destructive", title: "اسم الطبيب مطلوب" }); return; }
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return; }
    if (amt > remaining + 0.001) { toast({ variant: "destructive", title: `المبلغ يتجاوز المتبقي (${fmtMoney(remaining)})` }); return; }
    setConfirmOpen(true);
  }

  if (!canTransfer && invoiceStatus !== "finalized") return null;

  return (
    <div className="border rounded-xl p-3 flex flex-col gap-2 bg-white">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <DoctorIcon className="h-3.5 w-3.5" />
        تحويل مستحقات طبيب
      </p>

      {transfers.length > 0 && (
        <div className="flex flex-col gap-1">
          {transfers.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between text-[10px] bg-slate-50 border rounded px-2 py-1">
              <span className="font-medium truncate max-w-[80px]">{t.doctor_name}</span>
              <span className="font-mono text-green-700">{fmtMoney(t.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[10px] text-muted-foreground border-t pt-1">
            <span>المحوّل: {fmtMoney(alreadyTransferred)}</span>
            <span>المتبقي: {fmtMoney(remaining)}</span>
          </div>
        </div>
      )}

      {canTransfer && (
        <>
          <Input
            placeholder="اسم الطبيب *"
            value={doctorName}
            onChange={e => setDoctorName(e.target.value)}
            className="h-7 text-xs"
            data-testid="input-transfer-doctor"
          />
          <Input
            type="number"
            placeholder="المبلغ"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="h-7 text-xs"
            dir="ltr"
            data-testid="input-transfer-amount"
          />
          <Input
            placeholder="ملاحظات (اختياري)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="h-7 text-xs"
            data-testid="input-transfer-notes"
          />
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs gap-1 h-7 border-teal-300 text-teal-700 hover:bg-teal-50"
              onClick={handleConfirm}
              disabled={transferMutation.isPending}
              data-testid="button-transfer-doctor"
            >
              {transferMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <DoctorIcon className="h-3 w-3" />}
              تحويل
            </Button>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد التحويل</AlertDialogTitle>
                <AlertDialogDescription>
                  تحويل <strong>{fmtMoney(parseFloat(amount) || 0)}</strong> للطبيب <strong>{doctorName}</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => transferMutation.mutate()} className="bg-teal-600 hover:bg-teal-700">
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
});

const InvoicePrintTab = memo(function InvoicePrintTab({
  patientName, patientCode, invoiceNumber, invoiceDate,
  totals, payments, byDepartment, byClassification, isFinalClosed,
}: {
  patientName: string;
  patientCode: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  totals: { totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number; remaining: number };
  payments: any[];
  byDepartment: Array<{ departmentName: string; netAmount: number; totalAmount: number; discountAmount: number }>;
  byClassification: Array<{ lineTypeLabel: string; netAmount: number; lineCount: number }>;
  isFinalClosed: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">معاينة الطباعة</p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => window.print()}
          data-testid="button-print-invoice"
        >
          <Printer className="h-3.5 w-3.5" />
          طباعة
        </Button>
      </div>

      <div className="print-area border rounded-xl p-6 bg-white flex flex-col gap-4" dir="rtl">
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold">فاتورة مريض</h2>
            {invoiceNumber && <p className="font-mono text-sm text-muted-foreground">رقم: {invoiceNumber}</p>}
            {invoiceDate && <p className="text-sm text-muted-foreground">التاريخ: {fmtDate(invoiceDate)}</p>}
          </div>
          <div className="text-left">
            <p className="font-bold text-lg">{patientName}</p>
            {patientCode && <p className="font-mono text-xs text-muted-foreground">{patientCode}</p>}
            {isFinalClosed && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs mt-1">
                <Lock className="h-3 w-3" />مغلق نهائياً
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Banknote className="h-4 w-4" />
            الإجماليات المالية
          </h3>
          <div className="bg-slate-50 rounded-lg p-3 flex flex-col gap-1">
            <FinRow label="إجمالي الخدمات" value={totals.totalAmount} />
            <FinRow label="الخصم" value={totals.discountAmount} muted />
            <FinRow label="الصافي" value={totals.netAmount} highlight border />
            <FinRow label="المدفوع" value={totals.paidAmount} />
            <FinRow label="المتبقي" value={totals.remaining} />
          </div>
        </div>

        {byDepartment.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              إجماليات الأقسام
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
                    <th className="p-2 text-right">القسم</th>
                    <th className="p-2 text-center">الإجمالي</th>
                    <th className="p-2 text-center">الخصم</th>
                    <th className="p-2 text-center font-semibold">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {byDepartment.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-sm">{d.departmentName || "—"}</td>
                      <td className="p-2 text-center font-mono text-sm">{fmtMoney(d.totalAmount)}</td>
                      <td className="p-2 text-center font-mono text-sm text-purple-600">
                        {d.discountAmount > 0 ? `(${fmtMoney(d.discountAmount)})` : "—"}
                      </td>
                      <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(d.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {byClassification.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              إجماليات التصنيف
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
                    <th className="p-2 text-right">التصنيف</th>
                    <th className="p-2 text-center">عدد البنود</th>
                    <th className="p-2 text-center font-semibold">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {byClassification.map((c, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-sm">{c.lineTypeLabel}</td>
                      <td className="p-2 text-center text-sm">{c.lineCount}</td>
                      <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(c.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {payments.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <CreditCard className="h-4 w-4" />
              المدفوعات
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
                    <th className="p-2 text-right">التاريخ</th>
                    <th className="p-2 text-center">المبلغ</th>
                    <th className="p-2 text-right">طريقة الدفع</th>
                    <th className="p-2 text-right">المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any, i: number) => (
                    <tr key={p.id || i} className="border-b last:border-0">
                      <td className="p-2 text-xs">{fmtDate(p.payment_date)}</td>
                      <td className="p-2 text-center font-mono text-green-700">{fmtMoney(p.amount)}</td>
                      <td className="p-2 text-xs">{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                      <td className="p-2 text-xs text-muted-foreground">{p.reference_number ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────────────────────
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

  const selectedVisitId = useMemo(() => {
    if (!selectedVisit) return null;
    return selectedVisit.id;
  }, [selectedVisit]);

  const { data: visitSummary, isLoading: isSummaryLoading } = useQuery<VisitInvoiceSummary>({
    queryKey: ["/api/visits", selectedVisitId, "invoice-summary"],
    queryFn: async () => {
      const r = await fetch(`/api/visits/${selectedVisitId}/invoice-summary`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل ملخص الزيارة");
      return r.json();
    },
    enabled: !!selectedVisitId,
    refetchInterval: 30_000,
  });

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

  // ── Full invoice details (diagnosis, notes, header discount) ───────────────
  const { data: fullInvoice, refetch: refetchFullInvoice } = useQuery<any>({
    queryKey: ["/api/patient-invoices", primaryInvoice?.id],
    queryFn: async () => {
      const r = await fetch(`/api/patient-invoices/${primaryInvoice!.id}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!primaryInvoice?.id,
  });

  const isFinalClosed = visitSummary?.invoice?.isFinalClosed ?? primaryInvoice?.isFinalClosed ?? false;
  const canFinalClose = !!primaryInvoice && !isFinalClosed && primaryInvoice.status === "finalized";

  const finalCloseMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/patient-invoices/${id}/final-close`),
    onSuccess: () => {
      toast({ title: "تم الإغلاق النهائي", description: "تم إغلاق الفاتورة نهائياً بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
      if (selectedVisitId) queryClient.invalidateQueries({ queryKey: ["/api/visits", selectedVisitId, "invoice-summary"] });
      if (primaryInvoice?.id) queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices", primaryInvoice.id] });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: async (visitId: string) => apiRequest("POST", `/api/visits/${visitId}/finalize-invoice`),
    onSuccess: () => {
      toast({ title: "تم الاعتماد", description: "تم اعتماد فاتورة الزيارة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
      if (selectedVisitId) queryClient.invalidateQueries({ queryKey: ["/api/visits", selectedVisitId, "invoice-summary"] });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const handleClinicalSaved = useCallback(() => {
    refetchFullInvoice();
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
  }, [patientId, refetchFullInvoice]);

  const handleDiscountUpdated = useCallback(() => {
    refetchFullInvoice();
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
  }, [patientId, refetchFullInvoice]);

  const handlePaymentAdded = useCallback(() => {
    refetchFullInvoice();
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
  }, [patientId, refetchFullInvoice]);

  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  useEffect(() => {
    if (primaryInvoice) setHeaderCollapsed(true);
  }, [primaryInvoice?.id]);

  if (isLoading) return (
    <div className="flex justify-center items-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (!data || data.totals.invoiceCount === 0) return (
    <div className="text-center py-12 text-muted-foreground text-sm">لا توجد فواتير طبية لهذا المريض</div>
  );

  const admissionId = selectedVisit?.admission_id ?? undefined;
  const visitId = (!admissionId && selectedVisit?.id) ? selectedVisit.id : undefined;
  const totalsForSidebar = visitTotals ?? data.totals;
  const hasEncounterView = !!selectedVisitId && !!visitSummary && visitSummary.encounters.length > 0;

  const invoiceStatus = primaryInvoice?.status;
  const invoiceNumber = visitSummary?.invoice?.invoiceNumber ?? primaryInvoice?.invoiceNumber;
  const diagnosis = fullInvoice?.diagnosis ?? "";
  const notes = fullInvoice?.notes ?? "";
  const headerDiscountPercent = parseFloat(String(fullInvoice?.headerDiscountPercent ?? primaryInvoice?.["headerDiscountPercent"] ?? "0"));
  const headerDiscountAmount = parseFloat(String(fullInvoice?.headerDiscountAmount ?? primaryInvoice?.["headerDiscountAmount"] ?? "0"));

  const printPayments = data.invoices.flatMap((inv: any) => inv.payments ?? []);
  const printByDept = (data.byDepartment ?? []).map(d => ({
    departmentName: d.departmentName,
    totalAmount: d.totalAmount,
    discountAmount: d.discountAmount,
    netAmount: d.netAmount,
  }));
  const printByClass = (data.byClassification ?? []).map(c => ({
    lineTypeLabel: c.lineTypeLabel,
    lineCount: c.lineCount,
    netAmount: c.netAmount,
  }));

  return (
    <div className="h-full flex flex-col xl:flex-row gap-3">
      {/* ── Main 2/3 ── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col gap-3 min-h-0 order-2 xl:order-1">
        {/* Visit selector */}
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
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

          {selectedVisitId && isSummaryLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Collapsible header card */}
        <div className="shrink-0">
          <button
            type="button"
            className="w-full text-start"
            onClick={() => setHeaderCollapsed(p => !p)}
            data-testid="btn-toggle-header"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5">
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${headerCollapsed ? "" : "rotate-90"}`} />
              <span className="font-medium">{headerCollapsed ? "عرض بيانات الزيارة" : "إخفاء بيانات الزيارة"}</span>
              {headerCollapsed && invoiceNumber && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">PI-{invoiceNumber}</Badge>
              )}
            </div>
          </button>
          {!headerCollapsed && (
            <div className="mt-1">
              <InvoiceHeaderCard
                patientName={patientName}
                patientCode={patientCode}
                visit={selectedVisit}
                invoiceNumber={invoiceNumber}
                isFinalClosed={isFinalClosed}
                invoiceStatus={invoiceStatus}
              />
            </div>
          )}
        </div>

        {hasEncounterView ? (
          <div className="flex-1 overflow-y-auto">
            <EncounterBreakdownView
              summary={visitSummary!}
              visitId={selectedVisitId!}
              patientId={patientId}
              admissionId={admissionId}
              onFinalize={() => finalizeMutation.mutate(selectedVisitId!)}
              isFinalizePending={finalizeMutation.isPending}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Tabs defaultValue="services" className="flex flex-col h-full">
              <TabsList className="h-8 shrink-0">
                <TabsTrigger value="services" className="text-xs px-3" data-testid="tab-services">
                  الخدمات
                </TabsTrigger>
                <TabsTrigger value="print" className="text-xs px-3" data-testid="tab-print">
                  <Printer className="h-3 w-3 ml-1" />
                  طباعة
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="flex-1 overflow-y-auto mt-2 min-h-0">
                <ServicesTab
                  patientId={patientId}
                  admissionId={admissionId}
                  visitId={visitId}
                  isFinalClosed={isFinalClosed}
                />
              </TabsContent>

              <TabsContent value="print" className="flex-1 overflow-y-auto mt-2 min-h-0">
                <InvoicePrintTab
                  patientName={patientName}
                  patientCode={patientCode}
                  invoiceNumber={invoiceNumber}
                  invoiceDate={primaryInvoice?.invoiceDate}
                  totals={totalsForSidebar}
                  payments={printPayments}
                  byDepartment={printByDept}
                  byClassification={printByClass}
                  isFinalClosed={isFinalClosed}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* ── Sidebar toggle + panel ── */}
      {!hasEncounterView && (
        <div className={`shrink-0 flex flex-col order-1 xl:order-2 transition-all duration-200 ${sidebarVisible ? "w-full xl:w-1/3" : "w-8"}`}>
          <button
            type="button"
            onClick={() => setSidebarVisible(v => !v)}
            className="self-start mb-1 p-1.5 rounded-md border bg-background hover:bg-muted transition-colors"
            title={sidebarVisible ? "إخفاء اللوحة الجانبية" : "إظهار اللوحة الجانبية"}
            data-testid="btn-toggle-sidebar"
          >
            {sidebarVisible
              ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
              : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />}
          </button>

          {sidebarVisible && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-2">
              <FinancialSidebar
                totals={totalsForSidebar}
                isFinalClosed={isFinalClosed}
                canFinalClose={canFinalClose}
                onFinalClose={() => primaryInvoice && finalCloseMutation.mutate(primaryInvoice.id)}
                isPending={finalCloseMutation.isPending}
                finalClosedAt={primaryInvoice?.finalClosedAt}
                invoiceNumber={invoiceNumber}
              />

              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-b">
                  <Banknote className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-700">المدفوعات</span>
                </div>
                <div className="p-2">
                  <InvoicePaymentsTab
                    patientId={patientId}
                    admissionId={admissionId}
                    visitId={visitId}
                    isFinalClosed={isFinalClosed}
                    primaryInvoiceId={primaryInvoice?.id}
                    primaryInvoiceStatus={invoiceStatus}
                    onPaymentAdded={handlePaymentAdded}
                  />
                </div>
              </div>

              {primaryInvoice && (
                <>
                  {!isFinalClosed && invoiceStatus === "draft" && (
                    <HeaderDiscountPanel
                      invoiceId={primaryInvoice.id}
                      isFinalClosed={isFinalClosed}
                      invoiceStatus={invoiceStatus ?? "draft"}
                      currentDiscountPercent={headerDiscountPercent}
                      currentDiscountAmount={headerDiscountAmount}
                      netAmount={totalsForSidebar.netAmount}
                      onUpdated={handleDiscountUpdated}
                    />
                  )}

                  {invoiceStatus === "finalized" && (
                    <DoctorTransferPanel
                      invoiceId={primaryInvoice.id}
                      isFinalClosed={isFinalClosed}
                      invoiceStatus={invoiceStatus}
                      netAmount={primaryInvoice.netAmount}
                      patientId={patientId}
                    />
                  )}

                  <ClinicalInfoPanel
                    invoiceId={primaryInvoice.id}
                    isFinalClosed={isFinalClosed}
                    invoiceStatus={invoiceStatus ?? "draft"}
                    initialDiagnosis={diagnosis}
                    initialNotes={notes}
                    onSaved={handleClinicalSaved}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
