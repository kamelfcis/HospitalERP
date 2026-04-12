/**
 * توريد نقدية من خزنة إلى خزنة
 * ─────────────────────────────
 * - نموذج التحويل مع عرض رصيد الخزنة المصدر
 * - إيصال طباعة بعد الإنشاء
 * - جدول سجل التحويلات مع فلاتر
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Printer, ArrowLeftRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function formatMoney(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

type TreasurySummary = {
  id: string; name: string; balance: string;
  glAccountCode: string; glAccountName: string;
};

type CashTransfer = {
  id: string; serialNumber: number;
  fromTreasuryId: string; toTreasuryId: string;
  amount: string; notes: string | null;
  transferredAt: string; transferredById: string | null;
};

const transferSchema = z.object({
  fromTreasuryId: z.string().min(1, "الخزنة المصدر مطلوبة"),
  toTreasuryId:   z.string().min(1, "الخزنة الوجهة مطلوبة"),
  amount:         z.string().refine(v => parseFloat(v) > 0, "المبلغ يجب أن يكون أكبر من الصفر"),
  notes:          z.string().optional(),
});
type TransferFormValues = z.infer<typeof transferSchema>;

function useIdempotencyKey() {
  const keyRef = useRef(crypto.randomUUID());
  const reset  = useCallback(() => { keyRef.current = crypto.randomUUID(); }, []);
  return { key: keyRef.current, reset };
}

export default function CashTransfersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { key: idempotencyKey, reset: resetKey } = useIdempotencyKey();

  const [lastTransfer, setLastTransfer] = useState<(CashTransfer & {
    fromTreasuryName: string; toTreasuryName: string;
  }) | null>(null);

  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo,   setDateTo]   = useState(todayISO());
  const [filterTreasuryId, setFilterTreasuryId] = useState("__all__");

  const { data: treasuries = [], isLoading: loadingT } = useQuery<TreasurySummary[]>({
    queryKey: ["/api/treasuries"],
    select: (d: any) => {
      const arr: TreasurySummary[] = Array.isArray(d) ? d : (d?.rows ?? []);
      return arr.map((t: any) => ({
        id: t.id, name: t.name,
        balance:      t.balance      ?? "0",
        glAccountCode: t.glAccountCode ?? "",
        glAccountName: t.glAccountName ?? "",
      }));
    },
  });

  const { data: history, isLoading: loadingH, refetch: refetchH } = useQuery<{ rows: CashTransfer[]; total: number }>({
    queryKey: ["/api/cash-transfers", dateFrom, dateTo, filterTreasuryId],
    queryFn: async () => {
      const p = new URLSearchParams({ dateFrom, dateTo });
      if (filterTreasuryId !== "__all__") p.set("treasuryId", filterTreasuryId);
      const r = await apiRequest("GET", `/api/cash-transfers?${p}`);
      return r.json();
    },
  });

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { fromTreasuryId: "", toTreasuryId: "", amount: "", notes: "" },
  });

  const fromId = form.watch("fromTreasuryId");
  const toId   = form.watch("toTreasuryId");
  const fromTreasury = treasuries.find(t => t.id === fromId);
  const toTreasury   = treasuries.find(t => t.id === toId);

  const mutation = useMutation({
    mutationFn: async (vals: TransferFormValues) => {
      const r = await apiRequest("POST", "/api/cash-transfers", {
        ...vals, idempotencyKey,
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || "فشل التحويل");
      }
      return r.json() as Promise<CashTransfer>;
    },
    onSuccess: (transfer) => {
      resetKey();
      form.reset({ fromTreasuryId: "", toTreasuryId: "", amount: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-transfers"] });
      setLastTransfer({
        ...transfer,
        fromTreasuryName: fromTreasury?.name ?? fromId,
        toTreasuryName:   toTreasury?.name   ?? toId,
      });
      toast({ title: "تم التحويل بنجاح", description: `إيصال رقم #${transfer.serialNumber}` });
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  function onSubmit(vals: TransferFormValues) {
    if (vals.fromTreasuryId === vals.toTreasuryId) {
      toast({ title: "خطأ", description: "لا يمكن التحويل من وإلى نفس الخزنة", variant: "destructive" });
      return;
    }
    mutation.mutate(vals);
  }

  function handlePrint() {
    window.print();
  }

  const historyRows = history?.rows ?? [];

  return (
    <div className="p-4 max-w-5xl mx-auto" dir="rtl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" />
            توريد نقدية بين الخزن
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            تحويل نقدية من خزنة إلى خزنة مع قيد محاسبي آلي
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 no-print">
        {/* نموذج التحويل */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">بيانات التحويل</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* الخزنة المصدر */}
              <div className="space-y-1">
                <Label>الخزنة المصدر <span className="text-destructive">*</span></Label>
                <Select
                  value={form.watch("fromTreasuryId")}
                  onValueChange={v => form.setValue("fromTreasuryId", v, { shouldValidate: true })}
                  disabled={loadingT}
                >
                  <SelectTrigger data-testid="select-from-treasury">
                    <SelectValue placeholder="اختر الخزنة المصدر" />
                  </SelectTrigger>
                  <SelectContent>
                    {treasuries.map(t => (
                      <SelectItem key={t.id} value={t.id} data-testid={`option-from-${t.id}`}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.fromTreasuryId && (
                  <p className="text-xs text-destructive">{form.formState.errors.fromTreasuryId.message}</p>
                )}
                {fromTreasury && (
                  <div className="text-xs text-muted-foreground bg-muted rounded p-2 flex justify-between">
                    <span>الرصيد الحالي</span>
                    <span className="font-semibold tabular-nums">{formatMoney(fromTreasury.balance)} ج.م</span>
                  </div>
                )}
              </div>

              {/* الخزنة الوجهة */}
              <div className="space-y-1">
                <Label>الخزنة الوجهة <span className="text-destructive">*</span></Label>
                <Select
                  value={form.watch("toTreasuryId")}
                  onValueChange={v => form.setValue("toTreasuryId", v, { shouldValidate: true })}
                  disabled={loadingT}
                >
                  <SelectTrigger data-testid="select-to-treasury">
                    <SelectValue placeholder="اختر الخزنة الوجهة" />
                  </SelectTrigger>
                  <SelectContent>
                    {treasuries.map(t => (
                      <SelectItem key={t.id} value={t.id} data-testid={`option-to-${t.id}`}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.toTreasuryId && (
                  <p className="text-xs text-destructive">{form.formState.errors.toTreasuryId.message}</p>
                )}
                {toTreasury && (
                  <div className="text-xs text-muted-foreground bg-muted rounded p-2 flex justify-between">
                    <span>الرصيد الحالي</span>
                    <span className="font-semibold tabular-nums">{formatMoney(toTreasury.balance)} ج.م</span>
                  </div>
                )}
              </div>

              {/* المبلغ */}
              <div className="space-y-1">
                <Label>المبلغ (ج.م) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  data-testid="input-amount"
                  {...form.register("amount")}
                />
                {form.formState.errors.amount && (
                  <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                )}
              </div>

              {/* ملاحظات */}
              <div className="space-y-1">
                <Label>ملاحظات</Label>
                <Textarea
                  placeholder="أسباب التحويل أو أي ملاحظات..."
                  rows={2}
                  data-testid="input-notes"
                  {...form.register("notes")}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
                data-testid="button-submit-transfer"
              >
                {mutation.isPending ? "جارٍ التحويل..." : "تنفيذ التحويل"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* إيصال آخر تحويل */}
        {lastTransfer ? (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-green-700 dark:text-green-400">
                  إيصال التحويل
                </CardTitle>
                <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1" data-testid="button-print">
                  <Printer className="h-4 w-4" />
                  طباعة
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">رقم الإيصال</span>
                <Badge variant="outline">#{lastTransfer.serialNumber}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">من خزنة</span>
                <span className="font-medium">{lastTransfer.fromTreasuryName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إلى خزنة</span>
                <span className="font-medium">{lastTransfer.toTreasuryName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المبلغ</span>
                <span className="font-bold text-lg tabular-nums">{formatMoney(lastTransfer.amount)} ج.م</span>
              </div>
              {lastTransfer.notes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ملاحظات</span>
                  <span>{lastTransfer.notes}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">التاريخ</span>
                <span className="tabular-nums text-xs">{fmtDate(lastTransfer.transferredAt)}</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed flex items-center justify-center min-h-[200px]">
            <p className="text-muted-foreground text-sm text-center px-6">
              بعد تنفيذ التحويل سيظهر الإيصال هنا
            </p>
          </Card>
        )}
      </div>

      {/* منطقة الطباعة */}
      {lastTransfer && (
        <div className="print-only hidden print:block border p-8 mb-6 rounded text-sm" dir="rtl">
          <h2 className="text-xl font-bold text-center mb-4">إيصال تحويل نقدية</h2>
          <Separator className="mb-4" />
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">رقم الإيصال</span>
            <span className="font-bold">#{lastTransfer.serialNumber}</span>
            <span className="text-muted-foreground">من خزنة</span>
            <span>{lastTransfer.fromTreasuryName}</span>
            <span className="text-muted-foreground">إلى خزنة</span>
            <span>{lastTransfer.toTreasuryName}</span>
            <span className="text-muted-foreground">المبلغ</span>
            <span className="font-bold">{formatMoney(lastTransfer.amount)} ج.م</span>
            {lastTransfer.notes && (
              <>
                <span className="text-muted-foreground">ملاحظات</span>
                <span>{lastTransfer.notes}</span>
              </>
            )}
            <span className="text-muted-foreground">التاريخ والوقت</span>
            <span>{fmtDate(lastTransfer.transferredAt)}</span>
          </div>
          <Separator className="mt-4 mb-6" />
          <div className="grid grid-cols-2 gap-8 mt-8">
            <div className="text-center">
              <div className="h-12 border-b border-gray-400 mb-1" />
              <span className="text-xs text-muted-foreground">توقيع المُحوِّل</span>
            </div>
            <div className="text-center">
              <div className="h-12 border-b border-gray-400 mb-1" />
              <span className="text-xs text-muted-foreground">توقيع المُستلِم</span>
            </div>
          </div>
        </div>
      )}

      {/* سجل التحويلات */}
      <Card className="no-print">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">سجل التحويلات</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-36"
                data-testid="filter-date-from"
              />
              <span className="text-muted-foreground text-sm">إلى</span>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-36"
                data-testid="filter-date-to"
              />
              <Select
                value={filterTreasuryId}
                onValueChange={setFilterTreasuryId}
              >
                <SelectTrigger className="w-44" data-testid="filter-treasury">
                  <SelectValue placeholder="كل الخزن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">كل الخزن</SelectItem>
                  {treasuries.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="outline" onClick={() => refetchH()} data-testid="button-refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingH ? (
            <p className="text-center text-muted-foreground py-6">جارٍ التحميل...</p>
          ) : historyRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">لا توجد تحويلات في الفترة المحددة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right">
                    <th className="pb-2 px-2 font-medium text-muted-foreground">رقم الإيصال</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">من خزنة</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">إلى خزنة</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground text-start">المبلغ</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">التاريخ</th>
                    <th className="pb-2 px-2 font-medium text-muted-foreground">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map(row => {
                    const fromName = treasuries.find(t => t.id === row.fromTreasuryId)?.name ?? row.fromTreasuryId;
                    const toName   = treasuries.find(t => t.id === row.toTreasuryId)?.name   ?? row.toTreasuryId;
                    return (
                      <tr key={row.id} className="border-b hover:bg-muted/40 transition-colors" data-testid={`row-transfer-${row.id}`}>
                        <td className="py-2 px-2 text-center">
                          <Badge variant="outline">#{row.serialNumber}</Badge>
                        </td>
                        <td className="py-2 px-2">{fromName}</td>
                        <td className="py-2 px-2">{toName}</td>
                        <td className="py-2 px-2 text-start tabular-nums font-medium">
                          {formatMoney(row.amount)} ج.م
                        </td>
                        <td className="py-2 px-2 text-xs tabular-nums whitespace-nowrap">
                          {fmtDate(row.transferredAt)}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground text-xs">{row.notes ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {history && history.total > historyRows.length && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  يُعرض {historyRows.length} من أصل {history.total} تحويل
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
