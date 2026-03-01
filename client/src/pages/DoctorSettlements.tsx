import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, CheckCircle, ChevronDown, ChevronUp, Stethoscope, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { DoctorSettlement, DoctorSettlementAllocation, DoctorTransfer } from "@shared/schema";

function genUUID(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 18);
}

type OutstandingTransfer = DoctorTransfer & { settled: string; remaining: string };
type SettlementWithAllocs = DoctorSettlement & { allocations: DoctorSettlementAllocation[] };

const paymentMethodLabels: Record<string, string> = {
  cash: "نقدي",
  bank: "بنكي",
  card: "بطاقة",
};

export default function DoctorSettlements() {
  const { toast } = useToast();

  const [filterDoctor, setFilterDoctor] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formDoctor, setFormDoctor] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState("cash");
  const [formNotes, setFormNotes] = useState("");
  const [useManualAlloc, setUseManualAlloc] = useState(false);
  const [manualAllocs, setManualAllocs] = useState<Record<string, string>>({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmUUID, setConfirmUUID] = useState("");

  const { data: settlements = [], isLoading: loadingSettlements } = useQuery<SettlementWithAllocs[]>({
    queryKey: ["/api/doctor-settlements", filterDoctor],
    queryFn: () => {
      const url = filterDoctor
        ? `/api/doctor-settlements?doctorName=${encodeURIComponent(filterDoctor)}`
        : "/api/doctor-settlements";
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
  });

  const { data: outstanding = [], isLoading: loadingOutstanding } = useQuery<OutstandingTransfer[]>({
    queryKey: ["/api/doctor-settlements/outstanding", formDoctor],
    enabled: !!formDoctor.trim(),
    queryFn: () =>
      fetch(`/api/doctor-settlements/outstanding?doctorName=${encodeURIComponent(formDoctor.trim())}`, { credentials: "include" }).then(r => r.json()),
  });

  const totalOutstanding = outstanding.reduce((s, t) => s + parseFloat(t.remaining), 0);

  const fifoAllocations = useMemo(() => {
    if (useManualAlloc) return [];
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) return [];
    const allocs: { transferId: string; amount: number; remaining: number }[] = [];
    let left = amt;
    for (const t of outstanding) {
      if (left <= 0.001) break;
      const rem = parseFloat(t.remaining);
      const take = Math.min(rem, left);
      allocs.push({ transferId: t.id, amount: take, remaining: rem });
      left = Math.round((left - take) * 100) / 100;
    }
    return allocs;
  }, [formAmount, outstanding, useManualAlloc]);

  const manualAllocSum = Object.values(manualAllocs).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  function openConfirm() {
    if (!formDoctor.trim()) { toast({ variant: "destructive", title: "اسم الطبيب مطلوب" }); return; }
    if (!formDate) { toast({ variant: "destructive", title: "تاريخ الدفع مطلوب" }); return; }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return; }
    if (amt > totalOutstanding + 0.001) {
      toast({ variant: "destructive", title: `المبلغ يتجاوز المستحقات المتبقية (${formatCurrency(totalOutstanding)})` });
      return;
    }
    if (useManualAlloc && Math.abs(manualAllocSum - amt) > 0.01) {
      toast({ variant: "destructive", title: `مجموع التخصيص اليدوي (${manualAllocSum.toFixed(2)}) لا يساوي المبلغ (${amt.toFixed(2)})` });
      return;
    }
    setConfirmUUID(genUUID());
    setConfirmOpen(true);
  }

  const settleMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(formAmount);
      let allocations: { transferId: string; amount: string }[] | undefined;

      if (useManualAlloc) {
        allocations = Object.entries(manualAllocs)
          .filter(([, v]) => parseFloat(v) > 0)
          .map(([transferId, amount]) => ({ transferId, amount }));
        if (allocations.length === 0) throw new Error("يجب تخصيص مبلغ لمستحق واحد على الأقل");
      }

      return apiRequest("POST", "/api/doctor-settlements", {
        doctorName: formDoctor.trim(),
        paymentDate: formDate,
        amount: amt,
        paymentMethod: formMethod,
        settlementUuid: confirmUUID,
        notes: formNotes.trim() || undefined,
        allocations,
      });
    },
    onSuccess: () => {
      toast({ title: "تمت التسوية", description: "تم تسجيل دفعة مستحقات الطبيب بنجاح" });
      setConfirmOpen(false);
      setFormAmount("");
      setFormNotes("");
      setManualAllocs({});
      setUseManualAlloc(false);
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-settlements/outstanding", formDoctor] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "خطأ في التسوية", description: error.message });
    },
  });

  return (
    <div className="p-3 space-y-3" dir="rtl" lang="ar" data-testid="page-doctor-settlements">
      <div className="flex flex-row-reverse items-center gap-2">
        <Banknote className="h-5 w-5 text-blue-600" />
        <h1 className="text-lg font-bold">تسوية مستحقات الأطباء</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2 border rounded-md p-3 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground border-b pb-1">إنشاء تسوية جديدة</h2>

          <div className="space-y-2">
            <div className="flex flex-row-reverse items-center gap-1">
              <Label className="text-xs whitespace-nowrap w-20 text-left">الطبيب *</Label>
              <Input
                value={formDoctor}
                onChange={e => { setFormDoctor(e.target.value); setManualAllocs({}); }}
                placeholder="اسم الطبيب"
                className="h-7 text-xs"
                data-testid="input-settle-doctor"
              />
            </div>

            <div className="flex flex-row-reverse items-center gap-1">
              <Label className="text-xs whitespace-nowrap w-20 text-left">تاريخ الدفع *</Label>
              <Input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="h-7 text-xs"
                data-testid="input-settle-date"
              />
            </div>

            <div className="flex flex-row-reverse items-center gap-1">
              <Label className="text-xs whitespace-nowrap w-20 text-left">طريقة الدفع</Label>
              <Select value={formMethod} onValueChange={setFormMethod}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-settle-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank">بنكي</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-row-reverse items-center gap-1">
              <Label className="text-xs whitespace-nowrap w-20 text-left">المبلغ *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                placeholder="0.00"
                className="h-7 text-xs"
                data-testid="input-settle-amount"
              />
            </div>

            <div className="flex flex-row-reverse items-center gap-1">
              <Label className="text-xs whitespace-nowrap w-20 text-left">ملاحظات</Label>
              <Input
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="اختياري"
                className="h-7 text-xs"
                data-testid="input-settle-notes"
              />
            </div>
          </div>

          {formDoctor.trim() && (
            <div className="space-y-2">
              <div className="flex flex-row-reverse items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  المستحقات المتبقية:{" "}
                  <span className="text-destructive font-bold">{formatCurrency(totalOutstanding)}</span>
                </span>
                <label className="flex flex-row-reverse items-center gap-1 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useManualAlloc}
                    onChange={e => { setUseManualAlloc(e.target.checked); setManualAllocs({}); }}
                    data-testid="checkbox-manual-alloc"
                  />
                  تخصيص يدوي
                </label>
              </div>

              {loadingOutstanding ? (
                <p className="text-xs text-muted-foreground text-center py-2">جاري التحميل...</p>
              ) : outstanding.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">لا توجد مستحقات معلقة</p>
              ) : (
                <div className="border rounded text-xs overflow-auto max-h-52">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-right p-1.5">الفاتورة</th>
                        <th className="text-right p-1.5">المستحق</th>
                        <th className="text-right p-1.5">المتبقي</th>
                        {!useManualAlloc && <th className="text-right p-1.5 text-blue-600">تخصيص FIFO</th>}
                        {useManualAlloc && <th className="text-right p-1.5">مبلغ يدوي</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {outstanding.map((t, idx) => {
                        const fifo = fifoAllocations.find(f => f.transferId === t.id);
                        return (
                          <tr key={t.id} className="border-t" data-testid={`row-outstanding-${t.id}`}>
                            <td className="p-1.5 text-muted-foreground">{t.invoiceId.slice(0, 8)}…</td>
                            <td className="p-1.5">{formatCurrency(parseFloat(t.amount))}</td>
                            <td className="p-1.5 font-medium text-destructive">{formatCurrency(parseFloat(t.remaining))}</td>
                            {!useManualAlloc && (
                              <td className="p-1.5 text-blue-700 font-medium">
                                {fifo ? formatCurrency(fifo.amount) : "—"}
                              </td>
                            )}
                            {useManualAlloc && (
                              <td className="p-1.5">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  max={parseFloat(t.remaining)}
                                  value={manualAllocs[t.id] ?? ""}
                                  onChange={e => setManualAllocs(prev => ({ ...prev, [t.id]: e.target.value }))}
                                  className="h-6 text-xs w-20"
                                  data-testid={`input-manual-alloc-${idx}`}
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {useManualAlloc && outstanding.length > 0 && (
                <div className="text-xs text-left text-muted-foreground">
                  مجموع التخصيص: <span className={Math.abs(manualAllocSum - parseFloat(formAmount || "0")) > 0.01 ? "text-destructive font-bold" : "text-green-600 font-bold"}>{formatCurrency(manualAllocSum)}</span>
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={openConfirm}
            disabled={!formDoctor.trim() || !formAmount || outstanding.length === 0}
            data-testid="button-settle-open-confirm"
          >
            <CheckCircle className="h-4 w-4 ml-1" />
            متابعة التسوية
          </Button>
        </div>

        <div className="lg:col-span-3 border rounded-md p-3 space-y-2">
          <div className="flex flex-row-reverse items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">سجل التسويات</h2>
            <div className="flex-1" />
            <div className="flex flex-row-reverse items-center gap-1">
              <Search className="h-3 w-3 text-muted-foreground" />
              <Input
                value={filterDoctor}
                onChange={e => setFilterDoctor(e.target.value)}
                placeholder="فلترة بالطبيب"
                className="h-7 text-xs w-36"
                data-testid="input-filter-doctor"
              />
            </div>
          </div>

          {loadingSettlements ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد تسويات</p>
          ) : (
            <div className="space-y-1">
              {settlements.map(s => (
                <div key={s.id} className="border rounded" data-testid={`card-settlement-${s.id}`}>
                  <div
                    className="flex flex-row-reverse items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    <Stethoscope className="h-3 w-3 text-blue-600" />
                    <span className="text-sm font-medium">{s.doctorName}</span>
                    <Badge variant="outline" className="text-xs">{paymentMethodLabels[s.paymentMethod] || s.paymentMethod}</Badge>
                    {s.glPosted && <Badge className="text-xs bg-green-100 text-green-700 border-green-300">GL</Badge>}
                    <div className="flex-1" />
                    <span className="text-xs text-muted-foreground">{formatDateShort(s.paymentDate as any)}</span>
                    <span className="font-bold text-sm">{formatCurrency(parseFloat(s.amount))}</span>
                    {expandedId === s.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>

                  {expandedId === s.id && (
                    <div className="border-t p-2 bg-muted/20 space-y-2">
                      {s.notes && <p className="text-xs text-muted-foreground">ملاحظات: {s.notes}</p>}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right text-xs">المستحق</TableHead>
                            <TableHead className="text-right text-xs">المبلغ المخصص</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {s.allocations.map(a => (
                            <TableRow key={a.id} data-testid={`row-alloc-${a.id}`}>
                              <TableCell className="text-xs text-muted-foreground">{a.transferId.slice(0, 8)}…</TableCell>
                              <TableCell className="text-xs font-medium">{formatCurrency(parseFloat(a.amount))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom" dir="rtl" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle className="flex flex-row-reverse items-center gap-2">
              <Banknote className="h-4 w-4 text-blue-600" />
              تأكيد تسوية المستحقات
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-3 text-right">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex flex-row-reverse gap-2">
                <span className="text-muted-foreground">الطبيب:</span>
                <strong>{formDoctor}</strong>
              </div>
              <div className="flex flex-row-reverse gap-2">
                <span className="text-muted-foreground">التاريخ:</span>
                <strong>{formDate}</strong>
              </div>
              <div className="flex flex-row-reverse gap-2">
                <span className="text-muted-foreground">المبلغ:</span>
                <strong className="text-blue-700 text-base">{formatCurrency(parseFloat(formAmount || "0"))}</strong>
              </div>
              <div className="flex flex-row-reverse gap-2">
                <span className="text-muted-foreground">طريقة الدفع:</span>
                <strong>{paymentMethodLabels[formMethod] || formMethod}</strong>
              </div>
            </div>
            {formNotes && (
              <p className="text-xs text-muted-foreground">ملاحظات: {formNotes}</p>
            )}
            <div className="text-xs space-y-1">
              <p className="font-medium">التخصيص ({useManualAlloc ? "يدوي" : "تلقائي FIFO"}):</p>
              {(useManualAlloc
                ? Object.entries(manualAllocs).filter(([, v]) => parseFloat(v) > 0).map(([id, amt]) => ({ transferId: id, amount: parseFloat(amt) }))
                : fifoAllocations
              ).map((a, i) => (
                <div key={i} className="flex flex-row-reverse justify-between text-muted-foreground">
                  <span>مستحق {a.transferId.slice(0, 8)}…</span>
                  <span className="font-medium">{formatCurrency(a.amount)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground border rounded p-2 bg-muted">
              سيتم تسجيل هذه التسوية وتخصيصها تلقائياً. القيد المحاسبي يُنشأ تلقائياً إن كانت أكواد الحسابات مُعيَّنة.
            </p>
          </div>
          <SheetFooter className="flex-row-reverse gap-2 pb-2">
            <Button
              onClick={() => settleMutation.mutate()}
              disabled={settleMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-settle-submit"
            >
              {settleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <CheckCircle className="h-3 w-3 ml-1" />}
              تأكيد التسوية
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="button-settle-cancel">
              إلغاء
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
