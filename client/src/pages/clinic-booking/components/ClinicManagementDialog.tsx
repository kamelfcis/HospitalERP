import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Check, X, Loader2 } from "lucide-react";
import type { ClinicClinic } from "../types";

interface Department { id: string; nameAr: string; }
interface Warehouse { id: string; name_ar?: string; name?: string; }

interface Props {
  open: boolean;
  onClose: () => void;
}

function ClinicForm({ clinic, onSave, onCancel, isPending }: {
  clinic?: ClinicClinic;
  onSave: (data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [nameAr, setNameAr] = useState(clinic?.nameAr || "");
  const [departmentId, setDepartmentId] = useState(clinic?.departmentId || "__none__");
  const [pharmacyId, setPharmacyId] = useState(clinic?.defaultPharmacyId || "__none__");

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) return;
    onSave({
      nameAr: nameAr.trim(),
      departmentId: departmentId !== "__none__" ? departmentId : undefined,
      defaultPharmacyId: pharmacyId !== "__none__" ? pharmacyId : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border rounded-lg p-3 bg-muted/20">
      <div className="space-y-1">
        <Label className="text-xs">اسم العيادة *</Label>
        <Input
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          placeholder="مثال: عيادة الباطنة"
          className="h-8 text-sm"
          autoFocus
          data-testid="input-clinic-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">القسم (اختياري)</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-clinic-department">
              <SelectValue placeholder="اختر قسم..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون قسم</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الصيدلية الافتراضية (اختياري)</Label>
          <Select value={pharmacyId} onValueChange={setPharmacyId}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-clinic-pharmacy">
              <SelectValue placeholder="اختر صيدلية..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون صيدلية</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name_ar || w.name || w.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          إلغاء
        </Button>
        <Button type="submit" size="sm" className="h-7 text-xs gap-1" disabled={!nameAr.trim() || isPending}>
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {clinic ? "تحديث" : "إضافة"}
        </Button>
      </div>
    </form>
  );
}

export function ClinicManagementDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingClinic, setEditingClinic] = useState<ClinicClinic | undefined>();

  const { data: clinics = [], isLoading } = useQuery<ClinicClinic[]>({
    queryKey: ["/api/clinic-clinics"],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string }) =>
      apiRequest("POST", "/api/clinic-clinics", data).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "تم إضافة العيادة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-clinics"] });
      setShowForm(false);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "خطأ", description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; nameAr?: string; departmentId?: string; defaultPharmacyId?: string; isActive?: boolean }) =>
      apiRequest("PATCH", `/api/clinic-clinics/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "تم التحديث" });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-clinics"] });
      setEditingClinic(undefined);
      setShowForm(false);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "خطأ", description: err.message }),
  });

  const handleSave = (data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string }) => {
    if (editingClinic) {
      updateMutation.mutate({ id: editingClinic.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (clinic: ClinicClinic) => {
    setEditingClinic(clinic);
    setShowForm(true);
  };

  const handleToggleActive = (clinic: ClinicClinic) => {
    updateMutation.mutate({ id: clinic.id, isActive: !clinic.isActive });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إدارة العيادات</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!showForm && (
            <Button
              size="sm"
              className="gap-1 h-8 text-xs"
              onClick={() => { setEditingClinic(undefined); setShowForm(true); }}
              data-testid="button-add-clinic"
            >
              <Plus className="h-3 w-3" />
              إضافة عيادة جديدة
            </Button>
          )}

          {showForm && (
            <ClinicForm
              clinic={editingClinic}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingClinic(undefined); }}
              isPending={createMutation.isPending || updateMutation.isPending}
            />
          )}

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : clinics.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm border rounded-lg">
              لا توجد عيادات مُضافة بعد
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right">العيادة</TableHead>
                    <TableHead className="text-right w-28">الحالة</TableHead>
                    <TableHead className="text-right w-20">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clinics.map((c) => (
                    <TableRow key={c.id} data-testid={`clinic-row-${c.id}`}>
                      <TableCell>
                        <div className="text-sm font-medium">{c.nameAr}</div>
                        <div className="text-xs text-muted-foreground">
                          {[c.departmentName, c.pharmacyName].filter(Boolean).join(" — ") || "بدون تخصيص"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs cursor-pointer ${c.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}
                          onClick={() => handleToggleActive(c)}
                          data-testid={`badge-active-${c.id}`}
                        >
                          {c.isActive ? "مفعّلة" : "معطّلة"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleEdit(c)}
                          data-testid={`button-edit-clinic-${c.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
