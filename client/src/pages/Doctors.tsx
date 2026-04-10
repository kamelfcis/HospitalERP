import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, Search, Edit2, Trash2, Stethoscope, FileText, BarChart3 } from "lucide-react";
import { AccountLookup, CostCenterLookup } from "@/components/lookups";
import type { Doctor, InsertDoctor } from "@shared/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

type DoctorBalance = {
  id: string;
  name: string;
  specialty: string | null;
  totalTransferred: string;
  totalSettled: string;
  remaining: string;
};

// ─── Doctor Form Dialog ───────────────────────────────────────────────────────

function DoctorFormDialog({
  open, doctor, onClose,
}: {
  open: boolean;
  doctor: Doctor | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName]         = useState(doctor?.name ?? "");
  const [specialty, setSpecialty] = useState(doctor?.specialty ?? "");
  const [financialMode, setFinancialMode] = useState(doctor?.financialMode ?? "payable_only");
  const [payableAccountId, setPayableAccountId] = useState(doctor?.payableAccountId ?? "");
  const [receivableAccountId, setReceivableAccountId] = useState(doctor?.receivableAccountId ?? "");
  const [costCenterId, setCostCenterId] = useState(doctor?.costCenterId ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("اسم الطبيب مطلوب");
      const body: Partial<InsertDoctor> = {
        name: name.trim(),
        specialty: specialty.trim() || null,
        financialMode,
        payableAccountId: payableAccountId || null,
        receivableAccountId: receivableAccountId || null,
        costCenterId: costCenterId || null,
      };
      return doctor
        ? apiRequest("PATCH", `/api/doctors/${doctor.id}`, body)
        : apiRequest("POST", "/api/doctors", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctors/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctors"] });
      toast({ title: doctor ? "تم تحديث الطبيب" : "تم إضافة الطبيب" });
      onClose();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-4" dir="rtl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm font-bold">
            {doctor ? "تعديل بيانات طبيب" : "إضافة طبيب جديد"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">اسم الطبيب *</Label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="اسم الطبيب"
                className="peachtree-input w-full text-xs"
                data-testid="input-doctor-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">التخصص</Label>
              <input
                value={specialty}
                onChange={e => setSpecialty(e.target.value)}
                placeholder="التخصص (اختياري)"
                className="peachtree-input w-full text-xs"
                data-testid="input-doctor-specialty"
              />
            </div>
          </div>
          <div className="border-t pt-3 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground">الإعدادات المالية</Label>
            <div className="space-y-1">
              <Label className="text-xs">النموذج المالي</Label>
              <Select value={financialMode} onValueChange={setFinancialMode}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-financial-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payable_only">مستحق فقط (payable)</SelectItem>
                  <SelectItem value="hospital_collect">تحصيل المستشفى</SelectItem>
                  <SelectItem value="doctor_collect">تحصيل الطبيب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">حساب الدائنين (مستحقات الطبيب)</Label>
                <AccountLookup
                  value={payableAccountId}
                  onChange={(item) => setPayableAccountId(item?.id || "")}
                  placeholder="حساب الدائنين..."
                  data-testid="lookup-doctor-payable"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">حساب المدينين</Label>
                <AccountLookup
                  value={receivableAccountId}
                  onChange={(item) => setReceivableAccountId(item?.id || "")}
                  placeholder="حساب المدينين..."
                  data-testid="lookup-doctor-receivable"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">مركز التكلفة</Label>
              <CostCenterLookup
                value={costCenterId}
                onChange={(item) => setCostCenterId(item?.id || "")}
                placeholder="مركز التكلفة..."
                data-testid="lookup-doctor-cost-center"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-1 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs px-3" data-testid="button-cancel">
            إلغاء
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="h-7 text-xs px-3" data-testid="button-save-doctor">
            {save.isPending ? "جاري الحفظ..." : doctor ? "تحديث" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ProfitRow = {
  doctorId: string;
  doctorName: string;
  specialty: string | null;
  financialMode: string | null;
  totalRevenue: string;
  totalDoctorCost: string;
  margin: string;
  invoiceCount: number;
};

export default function Doctors() {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const [search, setSearch]           = useState("");
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<Doctor | null>(null);
  const [tab, setTab]                 = useState<"doctors" | "profitability">("doctors");
  const [profitDateFrom, setProfitDateFrom] = useState("");
  const [profitDateTo, setProfitDateTo]     = useState("");

  const { data: balances = [], isLoading } = useQuery<DoctorBalance[]>({
    queryKey: ["/api/doctors/balances"],
  });

  const { data: profitData = [], isLoading: profitLoading } = useQuery<ProfitRow[]>({
    queryKey: ["/api/doctors/profitability", profitDateFrom, profitDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (profitDateFrom) params.set("dateFrom", profitDateFrom);
      if (profitDateTo) params.set("dateTo", profitDateTo);
      const res = await fetch(`/api/doctors/profitability?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: tab === "profitability",
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/doctors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctors/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doctors"] });
      toast({ title: "تم حذف الطبيب" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  const filtered = balances.filter(d =>
    !search ||
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.specialty ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totals = filtered.reduce(
    (acc, d) => ({
      transferred: acc.transferred + parseFloat(d.totalTransferred),
      settled:     acc.settled     + parseFloat(d.totalSettled),
      remaining:   acc.remaining   + parseFloat(d.remaining),
    }),
    { transferred: 0, settled: 0, remaining: 0 }
  );

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3" dir="rtl">
      {/* ── شريط الأدوات ── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold flex items-center gap-1" data-testid="text-page-title">
            <Stethoscope className="h-4 w-4" />
            سجل الأطباء
          </h1>
          <div className="flex items-center gap-1 border rounded-md overflow-hidden">
            <button
              className={`px-2 py-1 text-[11px] ${tab === "doctors" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setTab("doctors")}
              data-testid="tab-doctors"
            >
              الأطباء
            </button>
            <button
              className={`px-2 py-1 text-[11px] flex items-center gap-1 ${tab === "profitability" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setTab("profitability")}
              data-testid="tab-profitability"
            >
              <BarChart3 className="h-3 w-3" />
              الربحية
            </button>
          </div>
        </div>
        {tab === "doctors" && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="h-7 text-xs px-3" data-testid="button-add-doctor">
            <Plus className="h-3 w-3 ml-1" />
            إضافة طبيب
          </Button>
        )}
      </div>

      {tab === "doctors" && (
        <>
          <div className="peachtree-toolbar rounded flex items-center gap-2">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث عن طبيب..."
              className="peachtree-input flex-1 max-w-xs text-xs"
              data-testid="input-search-doctors"
            />
          </div>
          <div className="peachtree-grid rounded">
            <ScrollArea className="h-[calc(100vh-220px)]">
              <table className="w-full text-xs">
                <thead className="peachtree-grid-header sticky top-0">
                  <tr>
                    <th className="text-right">اسم الطبيب</th>
                    <th className="text-right">التخصص</th>
                    <th className="text-left">إجمالي المستحق</th>
                    <th className="text-left">المدفوع</th>
                    <th className="text-left">المتبقي</th>
                    <th className="w-[100px] text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr className="peachtree-grid-row">
                      <td colSpan={6} className="text-center py-6 text-muted-foreground">لا يوجد أطباء</td>
                    </tr>
                  ) : (
                    filtered.map(doc => {
                      const rem = parseFloat(doc.remaining);
                      return (
                        <tr key={doc.id} className="peachtree-grid-row" data-testid={`row-doctor-${doc.id}`}>
                          <td className="font-medium" data-testid={`text-name-${doc.id}`}>{doc.name}</td>
                          <td className="text-muted-foreground" data-testid={`text-specialty-${doc.id}`}>
                            {doc.specialty || "—"}
                          </td>
                          <td className="text-left tabular-nums">
                            {formatCurrency(parseFloat(doc.totalTransferred))}
                          </td>
                          <td className="text-left tabular-nums text-green-700">
                            {formatCurrency(parseFloat(doc.totalSettled))}
                          </td>
                          <td className="text-left tabular-nums">
                            {rem > 0.001
                              ? <Badge variant="outline" className="text-xs bg-red-50 border-red-200 text-red-700">{formatCurrency(rem)}</Badge>
                              : <span className="text-green-600">—</span>}
                          </td>
                          <td>
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                title="كشف حساب"
                                onClick={() => nav(`/doctor-statement/${encodeURIComponent(doc.name)}`)}
                                data-testid={`button-statement-${doc.id}`}
                              >
                                <FileText className="h-3 w-3 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => { setEditing(doc as any); setDialogOpen(true); }}
                                data-testid={`button-edit-doctor-${doc.id}`}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => { if (confirm("هل أنت متأكد من حذف هذا الطبيب؟")) deleteMutation.mutate(doc.id); }}
                                data-testid={`button-delete-doctor-${doc.id}`}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot className="bg-muted/50 font-semibold border-t">
                    <tr>
                      <td colSpan={2} className="py-1.5 px-2">الإجمالي</td>
                      <td className="text-left tabular-nums py-1.5 px-2">{formatCurrency(totals.transferred)}</td>
                      <td className="text-left tabular-nums py-1.5 px-2 text-green-700">{formatCurrency(totals.settled)}</td>
                      <td className="text-left tabular-nums py-1.5 px-2 text-destructive">{formatCurrency(totals.remaining)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </ScrollArea>
          </div>
        </>
      )}

      {tab === "profitability" && (
        <>
          <div className="peachtree-toolbar rounded flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">من</span>
            <Input type="date" value={profitDateFrom} onChange={e => setProfitDateFrom(e.target.value)} className="h-7 text-xs w-36" data-testid="input-profit-date-from" />
            <span className="text-[11px] text-muted-foreground">إلى</span>
            <Input type="date" value={profitDateTo} onChange={e => setProfitDateTo(e.target.value)} className="h-7 text-xs w-36" data-testid="input-profit-date-to" />
          </div>
          <div className="peachtree-grid rounded">
            <ScrollArea className="h-[calc(100vh-220px)]">
              {profitLoading ? (
                <div className="p-6 text-center text-muted-foreground text-xs">جاري التحميل...</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="peachtree-grid-header sticky top-0">
                    <tr>
                      <th className="text-right">الطبيب</th>
                      <th className="text-right">التخصص</th>
                      <th className="text-center">عدد الفواتير</th>
                      <th className="text-left">الإيرادات</th>
                      <th className="text-left">أجر الطبيب</th>
                      <th className="text-left">الهامش</th>
                      <th className="text-center">نسبة الهامش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitData.length === 0 ? (
                      <tr className="peachtree-grid-row">
                        <td colSpan={7} className="text-center py-6 text-muted-foreground">لا توجد بيانات</td>
                      </tr>
                    ) : (
                      profitData.map(row => {
                        const rev = parseFloat(row.totalRevenue);
                        const cost = parseFloat(row.totalDoctorCost);
                        const margin = parseFloat(row.margin);
                        const pct = rev > 0 ? ((margin / rev) * 100).toFixed(1) : "—";
                        return (
                          <tr key={row.doctorId} className="peachtree-grid-row" data-testid={`row-profit-${row.doctorId}`}>
                            <td className="font-medium">{row.doctorName}</td>
                            <td className="text-muted-foreground">{row.specialty || "—"}</td>
                            <td className="text-center tabular-nums">{row.invoiceCount}</td>
                            <td className="text-left tabular-nums">{formatCurrency(rev)}</td>
                            <td className="text-left tabular-nums text-red-600">{formatCurrency(cost)}</td>
                            <td className={`text-left tabular-nums ${margin >= 0 ? "text-green-700" : "text-red-700"}`}>
                              {formatCurrency(margin)}
                            </td>
                            <td className="text-center tabular-nums">{pct === "—" ? pct : `${pct}%`}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {profitData.length > 0 && (() => {
                    const tRev = profitData.reduce((s, r) => s + parseFloat(r.totalRevenue), 0);
                    const tCost = profitData.reduce((s, r) => s + parseFloat(r.totalDoctorCost), 0);
                    const tMargin = tRev - tCost;
                    const tPct = tRev > 0 ? ((tMargin / tRev) * 100).toFixed(1) : "—";
                    return (
                      <tfoot className="bg-muted/50 font-semibold border-t">
                        <tr>
                          <td colSpan={2} className="py-1.5 px-2">الإجمالي</td>
                          <td className="text-center tabular-nums py-1.5 px-2">{profitData.reduce((s, r) => s + r.invoiceCount, 0)}</td>
                          <td className="text-left tabular-nums py-1.5 px-2">{formatCurrency(tRev)}</td>
                          <td className="text-left tabular-nums py-1.5 px-2 text-red-600">{formatCurrency(tCost)}</td>
                          <td className={`text-left tabular-nums py-1.5 px-2 ${tMargin >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(tMargin)}</td>
                          <td className="text-center tabular-nums py-1.5 px-2">{tPct === "—" ? tPct : `${tPct}%`}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              )}
            </ScrollArea>
          </div>
        </>
      )}

      <DoctorFormDialog
        open={dialogOpen}
        doctor={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />
    </div>
  );
}
