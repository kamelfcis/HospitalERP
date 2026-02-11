import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Edit2, Trash2, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Patient, InsertPatient } from "@shared/schema";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Patients() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const [formData, setFormData] = useState<Partial<InsertPatient>>({
    fullName: "",
    phone: "",
    nationalId: "",
    age: undefined,
    isActive: true,
  });

  const searchParam = debouncedSearch.trim()
    ? `?search=${encodeURIComponent(debouncedSearch.trim())}`
    : "";

  const { data: patients, isLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients", debouncedSearch.trim()],
    queryFn: async () => {
      const res = await fetch(`/api/patients${searchParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch patients");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertPatient>) => {
      return apiRequest("POST", "/api/patients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "تم إضافة المريض بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertPatient> }) => {
      return apiRequest("PATCH", `/api/patients/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "تم تحديث بيانات المريض بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/patients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "تم حذف المريض بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (patient?: Patient) => {
    if (patient) {
      setEditingPatient(patient);
      setFormData({
        fullName: patient.fullName,
        phone: patient.phone || "",
        nationalId: patient.nationalId || "",
        age: patient.age ?? undefined,
        isActive: patient.isActive,
      });
    } else {
      setEditingPatient(null);
      setFormData({
        fullName: "",
        phone: "",
        nationalId: "",
        age: undefined,
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPatient(null);
    setFormData({
      fullName: "",
      phone: "",
      nationalId: "",
      age: undefined,
      isActive: true,
    });
  };

  const handleSubmit = () => {
    if (!formData.fullName?.trim()) {
      toast({ title: "خطأ", description: "اسم المريض مطلوب", variant: "destructive" });
      return;
    }
    if (formData.phone && formData.phone.length !== 11) {
      toast({ title: "خطأ", description: "رقم التليفون يجب أن يكون 11 رقم", variant: "destructive" });
      return;
    }
    if (formData.phone && !/^\d{11}$/.test(formData.phone)) {
      toast({ title: "خطأ", description: "رقم التليفون يجب أن يحتوي على أرقام فقط", variant: "destructive" });
      return;
    }
    if (formData.nationalId && formData.nationalId.length !== 14) {
      toast({ title: "خطأ", description: "الرقم القومي يجب أن يكون 14 رقم", variant: "destructive" });
      return;
    }
    if (formData.nationalId && !/^\d{14}$/.test(formData.nationalId)) {
      toast({ title: "خطأ", description: "الرقم القومي يجب أن يحتوي على أرقام فقط", variant: "destructive" });
      return;
    }
    if (formData.age !== undefined && formData.age !== null && (formData.age < 0 || !Number.isInteger(formData.age))) {
      toast({ title: "خطأ", description: "السن يجب أن يكون رقم صحيح موجب", variant: "destructive" });
      return;
    }

    const submitData = {
      ...formData,
      phone: formData.phone || null,
      nationalId: formData.nationalId || null,
      age: formData.age ?? null,
    };

    if (editingPatient) {
      updateMutation.mutate({ id: editingPatient.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

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
    <div className="p-3 space-y-3">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1">
            <Users className="h-4 w-4" />
            سجل المرضى
          </h1>
          <p className="text-xs text-muted-foreground">
            إدارة بيانات المرضى ({patients?.length || 0} مريض)
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => handleOpenDialog()} data-testid="button-add-patient" className="h-7 text-xs px-3">
            <Plus className="h-3 w-3 ml-1" />
            إضافة مريض
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar rounded flex items-center gap-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="بحث عن مريض... (استخدم % للبحث المتقدم)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="peachtree-input flex-1 max-w-md text-xs"
          data-testid="input-search-patients"
        />
      </div>

      <div className="peachtree-grid rounded">
        <ScrollArea className="h-[calc(100vh-220px)]">
          <table className="w-full text-xs">
            <thead className="peachtree-grid-header sticky top-0">
              <tr>
                <th className="text-right">الاسم</th>
                <th className="w-[130px] text-right">التليفون</th>
                <th className="w-[160px] text-right">الرقم القومي</th>
                <th className="w-[60px] text-center">السن</th>
                <th className="w-[80px] text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {!patients || patients.length === 0 ? (
                <tr className="peachtree-grid-row">
                  <td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">
                    لا يوجد مرضى
                  </td>
                </tr>
              ) : (
                patients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="peachtree-grid-row"
                    data-testid={`row-patient-${patient.id}`}
                  >
                    <td className="text-xs font-medium" data-testid={`text-name-${patient.id}`}>{patient.fullName}</td>
                    <td className="font-mono text-xs" data-testid={`text-phone-${patient.id}`}>{patient.phone || "—"}</td>
                    <td className="font-mono text-xs" data-testid={`text-nationalid-${patient.id}`}>{patient.nationalId || "—"}</td>
                    <td className="text-center text-xs" data-testid={`text-age-${patient.id}`}>{patient.age ?? "—"}</td>
                    <td>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleOpenDialog(patient)}
                          data-testid={`button-edit-patient-${patient.id}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذا المريض؟")) {
                              deleteMutation.mutate(patient.id);
                            }
                          }}
                          data-testid={`button-delete-patient-${patient.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-sm p-4" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold">
              {editingPatient ? "تعديل بيانات مريض" : "إضافة مريض جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="fullName" className="text-xs">اسم المريض *</Label>
              <input
                id="fullName"
                value={formData.fullName || ""}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="الاسم الكامل"
                className="peachtree-input w-full text-xs"
                data-testid="input-patient-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone" className="text-xs">التليفون (11 رقم)</Label>
              <input
                id="phone"
                value={formData.phone || ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                  setFormData({ ...formData, phone: v });
                }}
                placeholder="01xxxxxxxxx"
                className="peachtree-input w-full font-mono text-xs"
                maxLength={11}
                data-testid="input-patient-phone"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nationalId" className="text-xs">الرقم القومي (14 رقم)</Label>
              <input
                id="nationalId"
                value={formData.nationalId || ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 14);
                  setFormData({ ...formData, nationalId: v });
                }}
                placeholder="الرقم القومي"
                className="peachtree-input w-full font-mono text-xs"
                maxLength={14}
                data-testid="input-patient-nationalid"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="age" className="text-xs">السن</Label>
              <input
                id="age"
                type="number"
                min={0}
                max={200}
                value={formData.age ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormData({ ...formData, age: v === "" ? undefined : parseInt(v, 10) });
                }}
                placeholder="السن"
                className="peachtree-input w-full text-xs"
                data-testid="input-patient-age"
              />
            </div>
          </div>
          <DialogFooter className="gap-1 pt-2">
            <Button variant="outline" size="sm" onClick={handleCloseDialog} className="h-7 text-xs px-3" data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="h-7 text-xs px-3"
              data-testid="button-save-patient"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingPatient
                ? "تحديث"
                : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
