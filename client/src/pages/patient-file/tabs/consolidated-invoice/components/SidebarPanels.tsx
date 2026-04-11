import { memo, useState, useEffect } from "react";
import {
  Loader2, Lock, CheckCircle2,
  ShieldCheck, XCircle, Banknote, Percent,
  Stethoscope as DoctorIcon,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DoctorLookup } from "@/components/lookups";
import { fmtMoney } from "../../../shared/formatters";
import { CLASSIFICATION_LABELS } from "../constants";
import type { VisitInvoiceSummary } from "../types";

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

export const FinalizationPanel = memo(function FinalizationPanel({
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

export const HeaderDiscountPanel = memo(function HeaderDiscountPanel({
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
    <div className="flex flex-col gap-2">
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

export const DoctorTransferPanel = memo(function DoctorTransferPanel({
  invoiceId, isFinalClosed, invoiceStatus, netAmount, patientId,
  onTransferred,
}: {
  invoiceId: string;
  isFinalClosed: boolean;
  invoiceStatus: string;
  netAmount: number;
  patientId: string;
  onTransferred?: () => void;
}) {
  const { toast } = useToast();
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedDoctorName, setSelectedDoctorName] = useState("");
  const [amount, setAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canTransfer = !isFinalClosed;

  useEffect(() => {
    setSelectedDoctorId("");
    setSelectedDoctorName("");
    setAmount("");
    setTransferNotes("");
    setConfirmOpen(false);
  }, [invoiceId]);

  const { data: transfers = [], refetch: refetchTransfers } = useQuery<any[]>({
    queryKey: ["/api/patient-invoices", invoiceId, "transfers"],
    queryFn: async () => {
      const r = await fetch(`/api/patient-invoices/${invoiceId}/transfers`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!invoiceId,
  });

  const alreadyTransferred = transfers.reduce((s: number, t: any) => s + parseFloat(t.amount || "0"), 0);
  const remaining = Math.max(0, netAmount - alreadyTransferred);

  const showDoctorSelect = !!amount && parseFloat(amount) > 0;

  const transferMutation = useMutation({
    mutationFn: () => {
      const clientRequestId = crypto.randomUUID();
      return apiRequest("POST", `/api/patient-invoices/${invoiceId}/transfer-to-doctor`, {
        doctorName: selectedDoctorName,
        amount: parseFloat(amount),
        notes: transferNotes.trim() || undefined,
        clientRequestId,
      });
    },
    onSuccess: () => {
      toast({ title: "تم التحويل", description: "تم تحويل المستحقات للطبيب بنجاح" });
      setSelectedDoctorId("");
      setSelectedDoctorName("");
      setAmount("");
      setTransferNotes("");
      setConfirmOpen(false);
      refetchTransfers();
      onTransferred?.();
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      toast({ title: "خطأ في التحويل", description: err.message, variant: "destructive" });
    },
  });

  function handleConfirm() {
    if (!selectedDoctorId) { toast({ variant: "destructive", title: "اختر الطبيب" }); return; }
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return; }
    if (amt > remaining + 0.001) { toast({ variant: "destructive", title: `المبلغ يتجاوز المتبقي (${fmtMoney(remaining)})` }); return; }
    setConfirmOpen(true);
  }

  return (
    <div className="flex flex-col gap-2">
      {transfers.length > 0 && (
        <div className="flex flex-col gap-1">
          {transfers.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between text-[10px] bg-slate-50 border rounded px-2 py-1">
              <span className="font-medium truncate max-w-[120px]">{t.doctor_name}</span>
              <span className="font-mono text-green-700">{fmtMoney(t.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[10px] text-muted-foreground border-t pt-1">
            <span>المحوّل: {fmtMoney(alreadyTransferred)}</span>
            <span>المتبقي: {fmtMoney(remaining)}</span>
          </div>
        </div>
      )}

      {canTransfer && remaining > 0 && (
        <>
          <Input
            type="number"
            placeholder={`المبلغ (الحد الأقصى: ${fmtMoney(remaining)})`}
            min="0.01"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="h-8 text-xs"
            dir="ltr"
            data-testid="input-transfer-amount"
          />
          {remaining > 0 && (
            <button
              type="button"
              className="text-[10px] text-teal-600 hover:text-teal-800 underline self-start"
              onClick={() => setAmount(String(remaining))}
              data-testid="btn-fill-remaining"
            >
              كامل المبلغ المتبقي ({fmtMoney(remaining)})
            </button>
          )}

          {showDoctorSelect && (
            <DoctorLookup
              value={selectedDoctorId}
              onChange={(item) => {
                setSelectedDoctorId(item?.id ?? "");
                setSelectedDoctorName(item?.name ?? "");
              }}
              placeholder="ابحث عن طبيب..."
              data-testid="select-transfer-doctor"
            />
          )}

          {showDoctorSelect && selectedDoctorId && (
            <>
              <Input
                placeholder="ملاحظات (اختياري)"
                value={transferNotes}
                onChange={e => setTransferNotes(e.target.value)}
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
                  تحويل {fmtMoney(parseFloat(amount) || 0)} لـ {selectedDoctorName}
                </Button>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد التحويل</AlertDialogTitle>
                    <AlertDialogDescription>
                      تحويل <strong>{fmtMoney(parseFloat(amount) || 0)}</strong> للطبيب <strong>{selectedDoctorName}</strong>
                      {parseFloat(amount) >= remaining - 0.001 && (
                        <span className="block mt-2 text-amber-600 font-semibold">
                          هذا كامل المبلغ المتبقي — سيصبح رصيد الفاتورة صفر
                        </span>
                      )}
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
        </>
      )}

      {canTransfer && remaining <= 0 && (
        <div className="text-center text-[10px] text-green-600 font-semibold py-2 flex flex-col items-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          تم تحويل كامل المبلغ — يمكنك الحفظ النهائي
        </div>
      )}

      {isFinalClosed && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-2">
          <Lock className="h-3 w-3" />
          مغلقة نهائياً
        </div>
      )}
    </div>
  );
});
