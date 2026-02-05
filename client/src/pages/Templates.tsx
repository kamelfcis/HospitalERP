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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Edit2, Trash2, FileText } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { JournalTemplate, InsertJournalTemplate } from "@shared/schema";

export default function Templates() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<JournalTemplate | null>(null);

  const [formData, setFormData] = useState<Partial<InsertJournalTemplate>>({
    name: "",
    description: "",
    isActive: true,
  });

  const { data: templates, isLoading } = useQuery<JournalTemplate[]>({
    queryKey: ["/api/templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertJournalTemplate>) => {
      return apiRequest("POST", "/api/templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "تم إنشاء النموذج بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertJournalTemplate> }) => {
      return apiRequest("PATCH", `/api/templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "تم تحديث النموذج بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "تم حذف النموذج بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (template?: JournalTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        description: template.description || "",
        isActive: template.isActive,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: "",
        description: "",
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      isActive: true,
    });
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم النموذج", variant: "destructive" });
      return;
    }

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredTemplates = templates?.filter((template) => {
    return (
      searchQuery === "" ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }) || [];

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3" dir="rtl">
      {/* Peachtree Toolbar Header */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">نماذج القيود</h1>
            <p className="text-xs text-muted-foreground">
              إنشاء وإدارة نماذج القيود المحاسبية
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="بحث..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="peachtree-input pr-7 w-40"
              data-testid="input-search-templates"
            />
          </div>
          <Button size="sm" onClick={() => handleOpenDialog()} data-testid="button-add-template" className="h-7 text-xs px-2">
            <Plus className="h-3 w-3 ml-1" />
            جديد
          </Button>
        </div>
      </div>

      {/* Templates Table */}
      {filteredTemplates.length === 0 ? (
        <div className="peachtree-grid">
          <div className="p-6 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium mb-1">لا توجد نماذج</p>
            <p className="text-xs text-muted-foreground mb-3">
              قم بإنشاء نموذج لتسريع إدخال القيود المتكررة
            </p>
            <Button size="sm" onClick={() => handleOpenDialog()} data-testid="button-add-template-empty" className="h-7 text-xs">
              <Plus className="h-3 w-3 ml-1" />
              إنشاء نموذج
            </Button>
          </div>
        </div>
      ) : (
        <div className="peachtree-grid overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="text-right w-8">#</th>
                <th className="text-right">اسم النموذج</th>
                <th className="text-right">الوصف</th>
                <th className="text-center w-20">الحالة</th>
                <th className="text-right w-32">تاريخ الإنشاء</th>
                <th className="text-center w-24">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((template, index) => (
                <tr
                  key={template.id}
                  className={`peachtree-grid-row ${!template.isActive ? "opacity-60" : ""}`}
                  data-testid={`row-template-${template.id}`}
                >
                  <td className="text-xs text-muted-foreground">{index + 1}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="text-xs font-medium">{template.name}</span>
                    </div>
                  </td>
                  <td className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {template.description || "-"}
                  </td>
                  <td className="text-center">
                    <Badge 
                      variant={template.isActive ? "default" : "secondary"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {template.isActive ? "نشط" : "غير نشط"}
                    </Badge>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {formatDateTime(template.createdAt)}
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(template)}
                        data-testid={`button-edit-template-${template.id}`}
                        className="h-6 w-6 p-0"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("هل أنت متأكد من حذف هذا النموذج؟")) {
                            deleteMutation.mutate(template.id);
                          }
                        }}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compact Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-sm p-0" dir="rtl">
          <div className="peachtree-toolbar">
            <DialogHeader className="p-0">
              <DialogTitle className="text-sm font-semibold">
                {editingTemplate ? "تعديل نموذج" : "إضافة نموذج جديد"}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">اسم النموذج *</Label>
              <input
                id="name"
                type="text"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: قيد الرواتب الشهرية"
                className="peachtree-input w-full"
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">الوصف</Label>
              <textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف إضافي للنموذج (اختياري)"
                rows={2}
                className="peachtree-input w-full resize-none"
                style={{ height: 'auto', minHeight: '52px' }}
                data-testid="input-template-description"
              />
            </div>
          </div>
          <div className="peachtree-toolbar flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCloseDialog} data-testid="button-cancel" className="h-7 text-xs">
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
              className="h-7 text-xs"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingTemplate
                ? "تحديث"
                : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
