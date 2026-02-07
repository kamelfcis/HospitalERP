import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Edit2, Trash2, Loader2, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Department, InsertDepartment } from "@shared/schema";

export default function Departments() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  const [formData, setFormData] = useState<Partial<InsertDepartment>>({
    code: "",
    nameAr: "",
    isActive: true,
  });

  const { data: departments, isLoading } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertDepartment>) => {
      return apiRequest("POST", "/api/departments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "تم إنشاء القسم بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertDepartment> }) => {
      return apiRequest("PUT", `/api/departments/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "تم تحديث القسم بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/departments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "تم حذف القسم بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (department?: Department) => {
    if (department) {
      setEditingDepartment(department);
      setFormData({
        code: department.code,
        nameAr: department.nameAr,
        isActive: department.isActive,
      });
    } else {
      setEditingDepartment(null);
      setFormData({
        code: "",
        nameAr: "",
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingDepartment(null);
    setFormData({
      code: "",
      nameAr: "",
      isActive: true,
    });
  };

  const handleSubmit = () => {
    if (!formData.code || !formData.nameAr) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    if (editingDepartment) {
      updateMutation.mutate({ id: editingDepartment.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredDepartments = departments?.filter((dept) => {
    return (
      searchQuery === "" ||
      dept.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dept.nameAr.toLowerCase().includes(searchQuery.toLowerCase())
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
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1">
            <Building2 className="h-4 w-4" />
            الأقسام
          </h1>
          <p className="text-xs text-muted-foreground">
            إدارة الأقسام ({departments?.length || 0} قسم)
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => handleOpenDialog()} data-testid="button-add-department" className="h-7 text-xs px-3">
            <Plus className="h-3 w-3 ml-1" />
            قسم جديد
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar rounded flex items-center gap-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="بحث بالكود أو اسم القسم..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="peachtree-input flex-1 max-w-xs text-xs"
          data-testid="input-search-departments"
        />
      </div>

      <div className="peachtree-grid rounded">
        <ScrollArea className="h-[calc(100vh-220px)]">
          <table className="w-full text-xs">
            <thead className="peachtree-grid-header sticky top-0">
              <tr>
                <th className="w-[120px] text-right">الكود</th>
                <th className="text-right">الاسم</th>
                <th className="w-[80px] text-center">الحالة</th>
                <th className="w-[80px] text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredDepartments.length === 0 ? (
                <tr className="peachtree-grid-row">
                  <td colSpan={4} className="text-center py-6 text-muted-foreground text-xs">
                    لا توجد أقسام
                  </td>
                </tr>
              ) : (
                filteredDepartments.map((dept) => (
                  <tr
                    key={dept.id}
                    className={`peachtree-grid-row ${!dept.isActive ? "opacity-50" : ""}`}
                    data-testid={`row-department-${dept.id}`}
                  >
                    <td className="font-mono text-xs font-medium" data-testid={`text-code-${dept.id}`}>{dept.code}</td>
                    <td className="text-xs font-medium" data-testid={`text-name-${dept.id}`}>{dept.nameAr}</td>
                    <td className="text-center" data-testid={`text-status-${dept.id}`}>
                      <Badge
                        variant={dept.isActive ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {dept.isActive ? "نشط" : "غير نشط"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleOpenDialog(dept)}
                          data-testid={`button-edit-department-${dept.id}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذا القسم؟")) {
                              deleteMutation.mutate(dept.id);
                            }
                          }}
                          data-testid={`button-delete-department-${dept.id}`}
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
              {editingDepartment ? "تعديل قسم" : "إضافة قسم جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="code" className="text-xs">كود القسم *</Label>
              <input
                id="code"
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="مثال: DEP001"
                className="peachtree-input w-full font-mono text-xs"
                data-testid="input-department-code"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nameAr" className="text-xs">اسم القسم *</Label>
              <input
                id="nameAr"
                value={formData.nameAr || ""}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                placeholder="اسم القسم بالعربية"
                className="peachtree-input w-full text-xs"
                data-testid="input-department-name"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked as boolean })
                }
                className="h-3.5 w-3.5"
                data-testid="checkbox-department-active"
              />
              <Label htmlFor="isActive" className="text-xs">قسم نشط</Label>
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
              data-testid="button-save-department"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingDepartment
                ? "تحديث"
                : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
