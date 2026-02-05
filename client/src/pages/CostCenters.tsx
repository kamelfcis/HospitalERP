import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Edit2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostCenter, InsertCostCenter } from "@shared/schema";

export default function CostCenters() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);

  const [formData, setFormData] = useState<Partial<InsertCostCenter>>({
    code: "",
    name: "",
    description: "",
    parentId: null,
    isActive: true,
  });

  const { data: costCenters, isLoading } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertCostCenter>) => {
      return apiRequest("POST", "/api/cost-centers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم إنشاء مركز التكلفة بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCostCenter> }) => {
      return apiRequest("PATCH", `/api/cost-centers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      toast({ title: "تم تحديث مركز التكلفة بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/cost-centers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم حذف مركز التكلفة بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (center?: CostCenter) => {
    if (center) {
      setEditingCenter(center);
      setFormData({
        code: center.code,
        name: center.name,
        description: center.description || "",
        parentId: center.parentId,
        isActive: center.isActive,
      });
    } else {
      setEditingCenter(null);
      setFormData({
        code: "",
        name: "",
        description: "",
        parentId: null,
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCenter(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      parentId: null,
      isActive: true,
    });
  };

  const handleSubmit = () => {
    if (!formData.code || !formData.name) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    if (editingCenter) {
      updateMutation.mutate({ id: editingCenter.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredCenters = costCenters?.filter((center) => {
    return (
      searchQuery === "" ||
      center.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      center.name.toLowerCase().includes(searchQuery.toLowerCase())
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
      {/* Page Header - Peachtree Toolbar Style */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground">مراكز التكلفة</h1>
          <p className="text-xs text-muted-foreground">
            إدارة مراكز التكلفة ({costCenters?.length || 0} مركز)
          </p>
        </div>
        <Button size="sm" onClick={() => handleOpenDialog()} data-testid="button-add-cost-center" className="h-7 text-xs px-3">
          <Plus className="h-3 w-3 ml-1" />
          مركز تكلفة جديد
        </Button>
      </div>

      {/* Search - Compact Peachtree Style */}
      <div className="peachtree-toolbar rounded flex items-center gap-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="بحث برقم أو اسم مركز التكلفة..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="peachtree-input flex-1 max-w-xs text-xs"
          data-testid="input-search-cost-centers"
        />
      </div>

      {/* Cost Centers Table - Peachtree Grid Style */}
      <div className="peachtree-grid rounded">
        <ScrollArea className="h-[calc(100vh-220px)]">
          <table className="w-full text-xs">
            <thead className="peachtree-grid-header sticky top-0">
              <tr>
                <th className="w-[100px] text-right">الرمز</th>
                <th className="text-right">الاسم</th>
                <th className="text-right">الوصف</th>
                <th className="w-[140px] text-right">المركز الرئيسي</th>
                <th className="w-[70px] text-center">الحالة</th>
                <th className="w-[80px] text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredCenters.length === 0 ? (
                <tr className="peachtree-grid-row">
                  <td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                    لا توجد مراكز تكلفة
                  </td>
                </tr>
              ) : (
                filteredCenters.map((center) => {
                  const parentCenter = costCenters?.find((c) => c.id === center.parentId);
                  return (
                    <tr
                      key={center.id}
                      className={`peachtree-grid-row ${!center.isActive ? "opacity-50" : ""}`}
                      data-testid={`row-cost-center-${center.id}`}
                    >
                      <td className="font-mono text-xs font-medium">{center.code}</td>
                      <td className="text-xs font-medium">{center.name}</td>
                      <td className="text-xs text-muted-foreground">
                        {center.description || "-"}
                      </td>
                      <td className="text-xs">
                        {parentCenter ? (
                          <span className="font-mono">{parentCenter.code}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="text-center">
                        <Badge 
                          variant={center.isActive ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {center.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleOpenDialog(center)}
                            data-testid={`button-edit-cost-center-${center.id}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              if (confirm("هل أنت متأكد من حذف مركز التكلفة هذا؟")) {
                                deleteMutation.mutate(center.id);
                              }
                            }}
                            data-testid={`button-delete-cost-center-${center.id}`}
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
          </table>
        </ScrollArea>
      </div>

      {/* Add/Edit Dialog - Compact Peachtree Style */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-sm p-4" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold">
              {editingCenter ? "تعديل مركز تكلفة" : "إضافة مركز تكلفة جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="code" className="text-xs">رمز المركز *</Label>
              <input
                id="code"
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="مثال: CC001"
                className="peachtree-input w-full font-mono text-xs"
                data-testid="input-cost-center-code"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">اسم المركز *</Label>
              <input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم مركز التكلفة"
                className="peachtree-input w-full text-xs"
                data-testid="input-cost-center-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="parentId" className="text-xs">المركز الرئيسي</Label>
              <Select
                value={formData.parentId || "none"}
                onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? null : value })}
              >
                <SelectTrigger id="parentId" className="h-7 text-xs" data-testid="select-parent-cost-center">
                  <SelectValue placeholder="اختر المركز الرئيسي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">بدون مركز رئيسي</SelectItem>
                  {costCenters
                    ?.filter((c) => c.id !== editingCenter?.id)
                    .map((center) => (
                      <SelectItem key={center.id} value={center.id} className="text-xs">
                        <span className="font-mono">{center.code}</span> - {center.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف إضافي (اختياري)"
                rows={2}
                className="text-xs min-h-[50px] resize-none"
                data-testid="input-cost-center-description"
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
                data-testid="checkbox-cost-center-active"
              />
              <Label htmlFor="isActive" className="text-xs">مركز نشط</Label>
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
              data-testid="button-save-cost-center"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingCenter
                ? "تحديث"
                : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
