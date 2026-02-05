import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">مراكز التكلفة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة مراكز التكلفة ({costCenters?.length || 0} مركز)
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="button-add-cost-center">
          <Plus className="h-4 w-4 ml-2" />
          مركز تكلفة جديد
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم أو اسم مركز التكلفة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
              data-testid="input-search-cost-centers"
            />
          </div>
        </CardContent>
      </Card>

      {/* Cost Centers Table */}
      <Card>
        <ScrollArea className="h-[calc(100vh-320px)]">
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">الرمز</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead className="w-[150px]">المركز الرئيسي</TableHead>
                <TableHead className="w-[80px]">الحالة</TableHead>
                <TableHead className="w-[100px]">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCenters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد مراكز تكلفة
                  </TableCell>
                </TableRow>
              ) : (
                filteredCenters.map((center) => {
                  const parentCenter = costCenters?.find((c) => c.id === center.parentId);
                  return (
                    <TableRow
                      key={center.id}
                      className={!center.isActive ? "opacity-50" : ""}
                      data-testid={`row-cost-center-${center.id}`}
                    >
                      <TableCell className="font-mono font-medium">{center.code}</TableCell>
                      <TableCell className="font-medium">{center.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {center.description || "-"}
                      </TableCell>
                      <TableCell>
                        {parentCenter ? (
                          <span>{parentCenter.code} - {parentCenter.name}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={center.isActive ? "default" : "secondary"}>
                          {center.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(center)}
                            data-testid={`button-edit-cost-center-${center.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("هل أنت متأكد من حذف مركز التكلفة هذا؟")) {
                                deleteMutation.mutate(center.id);
                              }
                            }}
                            data-testid={`button-delete-cost-center-${center.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingCenter ? "تعديل مركز تكلفة" : "إضافة مركز تكلفة جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">رمز المركز *</Label>
              <Input
                id="code"
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="مثال: CC001"
                data-testid="input-cost-center-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">اسم المركز *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم مركز التكلفة"
                data-testid="input-cost-center-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentId">المركز الرئيسي</Label>
              <Select
                value={formData.parentId || "none"}
                onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? null : value })}
              >
                <SelectTrigger id="parentId" data-testid="select-parent-cost-center">
                  <SelectValue placeholder="اختر المركز الرئيسي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مركز رئيسي</SelectItem>
                  {costCenters
                    ?.filter((c) => c.id !== editingCenter?.id)
                    .map((center) => (
                      <SelectItem key={center.id} value={center.id}>
                        {center.code} - {center.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف إضافي (اختياري)"
                rows={2}
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
                data-testid="checkbox-cost-center-active"
              />
              <Label htmlFor="isActive" className="text-sm">مركز نشط</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
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
