import { useState } from "react";
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
import { Plus, Search, Edit2, Trash2, Stethoscope } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Doctor, InsertDoctor } from "@shared/schema";

export default function Doctors() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);

  const [formData, setFormData] = useState<Partial<InsertDoctor>>({
    name: "",
    specialty: "",
  });

  const { data: doctors, isLoading } = useQuery<Doctor[]>({
    queryKey: ["/api/doctors"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertDoctor>) => {
      return apiRequest("POST", "/api/doctors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctors"] });
      toast({ title: "تم إضافة الطبيب بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertDoctor> }) => {
      return apiRequest("PATCH", `/api/doctors/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctors"] });
      toast({ title: "تم تحديث بيانات الطبيب بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/doctors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctors"] });
      toast({ title: "تم حذف الطبيب بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (doctor?: Doctor) => {
    if (doctor) {
      setEditingDoctor(doctor);
      setFormData({
        name: doctor.name,
        specialty: doctor.specialty || "",
      });
    } else {
      setEditingDoctor(null);
      setFormData({
        name: "",
        specialty: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingDoctor(null);
    setFormData({
      name: "",
      specialty: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم الطبيب", variant: "destructive" });
      return;
    }

    const payload = {
      name: formData.name,
      specialty: formData.specialty || null,
    };

    if (editingDoctor) {
      updateMutation.mutate({ id: editingDoctor.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredDoctors = doctors?.filter((doc) => {
    return (
      searchQuery === "" ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.specialty && doc.specialty.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }) || [];

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
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1" data-testid="text-page-title">
            <Stethoscope className="h-4 w-4" />
            سجل الأطباء
          </h1>
          <p className="text-xs text-muted-foreground">
            إدارة بيانات الأطباء ({doctors?.length || 0} طبيب)
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => handleOpenDialog()} data-testid="button-add-doctor" className="h-7 text-xs px-3">
            <Plus className="h-3 w-3 ml-1" />
            إضافة طبيب
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar rounded flex items-center gap-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="بحث عن طبيب..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
                <th className="w-[80px] text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoctors.length === 0 ? (
                <tr className="peachtree-grid-row">
                  <td colSpan={3} className="text-center py-6 text-muted-foreground text-xs">
                    لا يوجد أطباء
                  </td>
                </tr>
              ) : (
                filteredDoctors.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`peachtree-grid-row ${!doc.isActive ? "opacity-50" : ""}`}
                    data-testid={`row-doctor-${doc.id}`}
                  >
                    <td className="text-xs font-medium" data-testid={`text-name-${doc.id}`}>{doc.name}</td>
                    <td className="text-xs text-muted-foreground" data-testid={`text-specialty-${doc.id}`}>{doc.specialty || "—"}</td>
                    <td>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleOpenDialog(doc)}
                          data-testid={`button-edit-doctor-${doc.id}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذا الطبيب؟")) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                          data-testid={`button-delete-doctor-${doc.id}`}
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
              {editingDoctor ? "تعديل بيانات طبيب" : "إضافة طبيب جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="doctorName" className="text-xs">اسم الطبيب *</Label>
              <input
                id="doctorName"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم الطبيب"
                className="peachtree-input w-full text-xs"
                data-testid="input-doctor-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="specialty" className="text-xs">التخصص</Label>
              <input
                id="specialty"
                value={formData.specialty || ""}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                placeholder="التخصص (اختياري)"
                className="peachtree-input w-full text-xs"
                data-testid="input-doctor-specialty"
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
              data-testid="button-save-doctor"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingDoctor
                ? "تحديث"
                : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
