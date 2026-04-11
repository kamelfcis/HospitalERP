import { memo, useState, useEffect } from "react";
import {
  Loader2, Banknote, Plus, CreditCard, Save,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { usePaymentTreasuries } from "@/hooks/lookups/usePaymentTreasuries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, fmtMoney, PAYMENT_METHOD_LABELS } from "../../../shared/formatters";
import { usePaymentsList } from "../../../hooks/useInvoiceLines";
import { PAY_METHOD_CLASS } from "../constants";

export const InvoicePaymentsTab = memo(function InvoicePaymentsTab({
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

  const { treasuries, isLocked: treasuryLocked } = usePaymentTreasuries();

  useEffect(() => {
    if (treasuryLocked && treasuries.length === 1 && payTreasuryId === "__none__") {
      setPayTreasuryId(treasuries[0].id);
    }
  }, [treasuryLocked, treasuries, payTreasuryId]);

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
              {treasuryLocked && treasuries.length === 1 ? (
                <div className="h-8 flex items-center px-2 text-xs bg-muted rounded-md border" data-testid="text-pay-treasury-locked">
                  {treasuries[0].name}
                </div>
              ) : (
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
              )}
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
