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
import { Plus, Search, Edit2, Trash2, Stethoscope, FileText } from "lucide-react";
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

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("اسم الطبيب مطلوب");
      const body: Partial<InsertDoctor> = { name: name.trim(), specialty: specialty.trim() || null };
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
      <DialogContent className="max-w-sm p-4" dir="rtl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm font-bold">
            {doctor ? "تعديل بيانات طبيب" : "إضافة طبيب جديد"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
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

export default function Doctors() {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const [search, setSearch]           = useState("");
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<Doctor | null>(null);

  const { data: balances = [], isLoading } = useQuery<DoctorBalance[]>({
    queryKey: ["/api/doctors/balances"],
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
        <div>
          <h1 className="text-sm font-bold flex items-center gap-1" data-testid="text-page-title">
            <Stethoscope className="h-4 w-4" />
            سجل الأطباء
          </h1>
          <p className="text-xs text-muted-foreground">
            {balances.length} طبيب مسجّل
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="h-7 text-xs px-3" data-testid="button-add-doctor">
          <Plus className="h-3 w-3 ml-1" />
          إضافة طبيب
        </Button>
      </div>

      {/* ── بحث ── */}
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

      {/* ── الجدول ── */}
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

      <DoctorFormDialog
        open={dialogOpen}
        doctor={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />
    </div>
  );
}
