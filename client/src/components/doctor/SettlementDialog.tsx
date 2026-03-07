import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatters";
import type { DoctorTransfer } from "@shared/schema";

type OutstandingRow = DoctorTransfer & { settled: string; remaining: string };

export interface SettlementDialogProps {
  open: boolean;
  onClose: () => void;
  doctorName: string;
  preselectedTransferId?: string;
  preselectedRemaining?: string;
}

function genUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 18);
}

const METHOD_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنكي", card: "بطاقة" };

export function SettlementDialog({
  open, onClose, doctorName, preselectedTransferId, preselectedRemaining,
}: SettlementDialogProps) {
  const { toast } = useToast();

  const [date, setDate]     = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState(preselectedRemaining ?? "");
  const [notes, setNotes]   = useState("");
  const [mode, setMode]     = useState<"single" | "fifo" | "manual">(preselectedTransferId ? "single" : "fifo");
  const [manualAllocs, setManualAllocs] = useState<Record<string, string>>({});

  const { data: outstanding = [], isLoading } = useQuery<OutstandingRow[]>({
    queryKey: ["/api/doctor-settlements/outstanding", doctorName],
    enabled: open && !!doctorName,
    queryFn: () =>
      fetch(`/api/doctor-settlements/outstanding?doctorName=${encodeURIComponent(doctorName)}`, {
        credentials: "include",
      }).then(r => r.json()),
  });

  const totalOutstanding = outstanding.reduce((s, t) => s + parseFloat(t.remaining), 0);

  const fifoAllocations = useMemo(() => {
    if (mode !== "fifo") return [];
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return [];
    const out: { transferId: string; amount: number }[] = [];
    let left = amt;
    for (const t of outstanding) {
      if (left <= 0.001) break;
      const rem = parseFloat(t.remaining);
      const take = Math.min(rem, left);
      out.push({ transferId: t.id, amount: take });
      left = Math.round((left - take) * 100) / 100;
    }
    return out;
  }, [amount, outstanding, mode]);

  const singleAllocation = useMemo(() => {
    if (mode !== "single" || !preselectedTransferId) return [];
    const t = outstanding.find(o => o.id === preselectedTransferId);
    if (!t) return [];
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return [];
    return [{ transferId: preselectedTransferId, amount: Math.min(amt, parseFloat(t.remaining)) }];
  }, [mode, preselectedTransferId, outstanding, amount]);

  const manualAllocSum = Object.values(manualAllocs).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const activeAllocations =
    mode === "fifo"   ? fifoAllocations   :
    mode === "single" ? singleAllocation  :
    Object.entries(manualAllocs)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([transferId, amt]) => ({ transferId, amount: parseFloat(amt) }));

  const mutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!doctorName || !date || isNaN(amt) || amt <= 0)
        throw new Error("تأكد من اكتمال البيانات");
      if (amt > totalOutstanding + 0.001)
        throw new Error(`المبلغ يتجاوز المستحقات (${formatCurrency(totalOutstanding)})`);

      const allocPayload =
        mode === "single" ? singleAllocation.map(a => ({ transferId: a.transferId, amount: String(a.amount) })) :
        mode === "manual"  ? Object.entries(manualAllocs).filter(([, v]) => parseFloat(v) > 0).map(([id, v]) => ({ transferId: id, amount: v })) :
        undefined;

      return apiRequest("POST", "/api/doctor-settlements", {
        doctorName, paymentDate: date, amount: amt, paymentMethod: method,
        settlementUuid: genUUID(), notes: notes.trim() || undefined,
        allocations: allocPayload,
      });
    },
    onSuccess: () => {
      toast({ title: "تمت التسوية بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-settlements/outstanding", doctorName] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctors/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-statement"] });
      handleClose();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطأ", description: err.message }),
  });

  function handleClose() {
    setAmount(preselectedRemaining ?? "");
    setNotes("");
    setManualAllocs({});
    setMode(preselectedTransferId ? "single" : "fifo");
    onClose();
  }

  const preselected = outstanding.find(o => o.id === preselectedTransferId);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            تسوية مستحقات — {doctorName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* ── ملخص المستحق المحدد ── */}
          {preselected && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الفاتورة:</span>
                <span className="font-medium">{preselected.invoiceId.slice(0, 8)}…</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المستحق الأصلي:</span>
                <span>{formatCurrency(parseFloat(preselected.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المتبقي:</span>
                <span className="font-bold text-destructive">{formatCurrency(parseFloat(preselected.remaining))}</span>
              </div>
            </div>
          )}

          {/* ── بيانات الدفع ── */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">تاريخ الدفع</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">طريقة الدفع</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">المبلغ *</Label>
            <Input
              type="number" min="0.01" step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" className="h-7 text-xs"
              data-testid="input-settle-amount"
            />
            <p className="text-xs text-muted-foreground">
              إجمالي المتبقي للطبيب: <span className="font-bold text-destructive">{formatCurrency(totalOutstanding)}</span>
            </p>
          </div>

          {/* ── وضع التوزيع ── */}
          {!preselectedTransferId && outstanding.length > 1 && (
            <div className="flex gap-2">
              {(["fifo", "manual"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setManualAllocs({}); }}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${mode === m ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-muted"}`}
                >
                  {m === "fifo" ? "تلقائي FIFO" : "يدوي"}
                </button>
              ))}
            </div>
          )}

          {/* ── جدول التوزيع اليدوي ── */}
          {mode === "manual" && outstanding.length > 0 && (
            <div className="border rounded overflow-auto max-h-40">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-right p-1.5">فاتورة</th>
                    <th className="text-right p-1.5">متبقي</th>
                    <th className="text-right p-1.5">مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="p-1.5 text-muted-foreground">{t.invoiceId.slice(0, 8)}…</td>
                      <td className="p-1.5 text-destructive">{formatCurrency(parseFloat(t.remaining))}</td>
                      <td className="p-1.5">
                        <Input
                          type="number" min="0" step="0.01" max={parseFloat(t.remaining)}
                          value={manualAllocs[t.id] ?? ""}
                          onChange={e => setManualAllocs(p => ({ ...p, [t.id]: e.target.value }))}
                          className="h-6 text-xs w-20"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-1.5 text-xs text-left border-t">
                مجموع: <span className={Math.abs(manualAllocSum - parseFloat(amount || "0")) > 0.01 ? "text-destructive font-bold" : "text-green-600 font-bold"}>
                  {formatCurrency(manualAllocSum)}
                </span>
              </div>
            </div>
          )}

          {/* ── معاينة التوزيع ── */}
          {activeAllocations.length > 0 && mode !== "manual" && (
            <div className="bg-muted/40 rounded p-2 text-xs space-y-1">
              <p className="font-medium text-muted-foreground">معاينة التوزيع ({mode === "single" ? "هذه الفاتورة" : "FIFO"}):</p>
              {activeAllocations.map((a, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">{a.transferId.slice(0, 8)}…</span>
                  <span className="font-medium">{formatCurrency(a.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> جاري تحميل المستحقات...
            </div>
          )}

          {!isLoading && outstanding.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <AlertCircle className="h-3 w-3" /> لا توجد مستحقات معلقة لهذا الطبيب
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">ملاحظات</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="اختياري" className="h-7 text-xs" />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-row-reverse">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || outstanding.length === 0 || !amount}
            className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"
            data-testid="button-settle-submit"
          >
            {mutation.isPending
              ? <><Loader2 className="h-3 w-3 animate-spin ml-1" />جاري الحفظ...</>
              : <><CheckCircle className="h-3 w-3 ml-1" />تأكيد التسوية</>}
          </Button>
          <Button variant="outline" onClick={handleClose} className="h-8 text-xs" data-testid="button-settle-cancel">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
