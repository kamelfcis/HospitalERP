import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatters";
import type { DoctorTransfer } from "@shared/schema";

type OutstandingRow = DoctorTransfer & {
  settled: string;
  remaining: string;
  invoiceNumber: string;
  patientName: string;
};

type TreasuryOption = { id: string; name: string; glAccountId: string };

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

export function SettlementDialog({
  open, onClose, doctorName, preselectedTransferId, preselectedRemaining,
}: SettlementDialogProps) {
  const { toast } = useToast();

  const [date, setDate]           = useState(new Date().toISOString().split("T")[0]);
  const [treasuryId, setTreasuryId] = useState("");
  const [amount, setAmount]       = useState(preselectedRemaining ?? "");
  const [notes, setNotes]         = useState("");
  const [mode, setMode]           = useState<"fifo" | "manual">(
    preselectedTransferId ? "fifo" : "fifo",
  );
  const [manualAllocs, setManualAllocs] = useState<Record<string, string>>({});

  const { data: outstanding = [], isLoading } = useQuery<OutstandingRow[]>({
    queryKey: ["/api/doctor-settlements/outstanding", doctorName],
    enabled: open && !!doctorName,
    queryFn: () =>
      fetch(`/api/doctor-settlements/outstanding?doctorName=${encodeURIComponent(doctorName)}`, {
        credentials: "include",
      }).then(r => r.json()),
  });

  const { data: opdDeductionsData } = useQuery<{ totalOpdDeductions: string; deductionCount: number }>({
    queryKey: ["/api/doctor-settlements/opd-deductions", doctorName],
    enabled: open && !!doctorName,
    queryFn: () =>
      fetch(`/api/doctor-settlements/opd-deductions?doctorName=${encodeURIComponent(doctorName)}`, {
        credentials: "include",
      }).then(r => r.json()),
  });

  const { data: treasuries = [] } = useQuery<TreasuryOption[]>({
    queryKey: ["/api/treasuries"],
    enabled: open,
  });

  const totalOpdDeductions = parseFloat(opdDeductionsData?.totalOpdDeductions ?? "0");
  const totalOutstanding   = outstanding.reduce((s, t) => s + parseFloat(t.remaining), 0);

  const fifoAllocations = useMemo(() => {
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
  }, [amount, outstanding]);

  const manualAllocSum = Object.values(manualAllocs).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const activeAllocations =
    mode === "fifo"
      ? fifoAllocations
      : Object.entries(manualAllocs)
          .filter(([, v]) => parseFloat(v) > 0)
          .map(([tid, amt]) => ({ transferId: tid, amount: parseFloat(amt) }));

  const mutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!doctorName || !date || isNaN(amt) || amt <= 0)
        throw new Error("تأكد من اكتمال البيانات");
      if (amt > totalOutstanding + 0.001)
        throw new Error(`المبلغ يتجاوز المستحقات (${formatCurrency(totalOutstanding)})`);

      const allocPayload =
        mode === "manual"
          ? Object.entries(manualAllocs)
              .filter(([, v]) => parseFloat(v) > 0)
              .map(([id, v]) => ({ transferId: id, amount: v }))
          : undefined;

      return apiRequest("POST", "/api/doctor-settlements", {
        doctorName,
        paymentDate: date,
        amount: amt,
        paymentMethod: "cash",
        settlementUuid: genUUID(),
        treasuryId: treasuryId || undefined,
        notes: notes.trim() || undefined,
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
    setMode("fifo");
    onClose();
  }

  const preselected = outstanding.find(o => o.id === preselectedTransferId);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
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
                <span className="font-medium">{(preselected as any).invoiceNumber || preselected.invoiceId.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المريض:</span>
                <span>{(preselected as any).patientName || "—"}</span>
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

          {/* ── المستحقات المعلقة (قائمة موجزة) ── */}
          {!preselectedTransferId && outstanding.length > 0 && (
            <div className="border rounded overflow-auto max-h-32">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-right p-1.5 font-medium">فاتورة</th>
                    <th className="text-right p-1.5 font-medium">مريض</th>
                    <th className="text-left  p-1.5 font-medium">متبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map(t => (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="p-1.5 font-mono">{(t as any).invoiceNumber || t.invoiceId.slice(0, 8)}</td>
                      <td className="p-1.5 text-muted-foreground max-w-[120px] truncate">{(t as any).patientName || "—"}</td>
                      <td className="p-1.5 text-left text-destructive font-medium">{formatCurrency(parseFloat(t.remaining))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── بيانات الدفع ── */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">تاريخ الاستلام *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الخزنة (للقيد المحاسبي)</Label>
              <Select value={treasuryId} onValueChange={setTreasuryId}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-settlement-treasury">
                  <SelectValue placeholder="اختر خزنة..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون قيد محاسبي</SelectItem>
                  {treasuries.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">المبلغ المستلم *</Label>
            <Input
              type="number" min="0.01" step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" className="h-7 text-xs"
              data-testid="input-settle-amount"
            />
            <p className="text-xs text-muted-foreground">
              إجمالي المتبقي للطبيب: <span className="font-bold text-destructive">{formatCurrency(totalOutstanding)}</span>
            </p>
            {totalOpdDeductions > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                خصومات عيادات OPD: <span className="font-bold">{formatCurrency(totalOpdDeductions)}</span>
                {opdDeductionsData?.deductionCount ? ` (${opdDeductionsData.deductionCount} موعد)` : ""}
                {" "}— للعلم عند التسوية
              </p>
            )}
          </div>

          {/* ── وضع التوزيع (يدوي فقط إذا أكثر من حالة) ── */}
          {!preselectedTransferId && outstanding.length > 1 && (
            <div className="flex gap-2">
              {(["fifo", "manual"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setManualAllocs({}); }}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${mode === m ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-muted"}`}
                >
                  {m === "fifo" ? "تلقائي FIFO" : "يدوي لكل حالة"}
                </button>
              ))}
            </div>
          )}

          {/* ── جدول التوزيع اليدوي ── */}
          {mode === "manual" && outstanding.length > 0 && (
            <div className="border rounded overflow-auto max-h-36">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-right p-1.5">فاتورة</th>
                    <th className="text-right p-1.5">مريض</th>
                    <th className="text-right p-1.5">متبقي</th>
                    <th className="text-right p-1.5">مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="p-1.5 font-mono">{(t as any).invoiceNumber || t.invoiceId.slice(0, 8)}</td>
                      <td className="p-1.5 text-muted-foreground max-w-[80px] truncate">{(t as any).patientName || "—"}</td>
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

          {/* ── معاينة FIFO ── */}
          {mode === "fifo" && activeAllocations.length > 0 && (
            <div className="bg-muted/40 rounded p-2 text-xs space-y-1">
              <p className="font-medium text-muted-foreground">توزيع تلقائي (FIFO):</p>
              {activeAllocations.map((a, i) => {
                const t = outstanding.find(o => o.id === a.transferId);
                return (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {(t as any)?.invoiceNumber || a.transferId.slice(0, 8)}
                      {(t as any)?.patientName ? ` — ${(t as any).patientName}` : ""}
                    </span>
                    <span className="font-medium">{formatCurrency(a.amount)}</span>
                  </div>
                );
              })}
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

          {treasuryId && treasuryId !== "__none__" && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
              ✓ سيُسجَّل قيد محاسبي: مدين الخزنة — دائن ذمم مدينة من الأطباء
            </p>
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
