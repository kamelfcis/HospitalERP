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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Lock, Unlock, AlertTriangle } from "lucide-react";
import { formatDateShort, formatDateTime } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { FiscalPeriod, InsertFiscalPeriod } from "@shared/schema";

export default function FiscalPeriods() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [formData, setFormData] = useState<Partial<InsertFiscalPeriod>>({
    name: "",
    startDate: "",
    endDate: "",
    isClosed: false,
  });

  const { data: periods, isLoading } = useQuery<FiscalPeriod[]>({
    queryKey: ["/api/fiscal-periods"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertFiscalPeriod>) => {
      return apiRequest("POST", "/api/fiscal-periods", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal-periods"] });
      toast({ title: "تم إنشاء الفترة المحاسبية بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/fiscal-periods/${id}/close`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal-periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم إقفال الفترة بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/fiscal-periods/${id}/reopen`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal-periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم إعادة فتح الفترة بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = () => {
    setFormData({
      name: "",
      startDate: "",
      endDate: "",
      isClosed: false,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setFormData({
      name: "",
      startDate: "",
      endDate: "",
      isClosed: false,
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.startDate || !formData.endDate) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    if (formData.startDate > formData.endDate) {
      toast({ title: "خطأ", description: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية", variant: "destructive" });
      return;
    }

    createMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Page Header - Peachtree Toolbar */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-sm font-semibold text-foreground">الفترات المحاسبية</h1>
          <p className="text-xs text-muted-foreground">
            إدارة الفترات المحاسبية وإقفالها
          </p>
        </div>
        <Button size="sm" onClick={handleOpenDialog} data-testid="button-add-fiscal-period" className="h-7 text-xs px-3">
          <Plus className="h-3 w-3 ml-1" />
          فترة جديدة
        </Button>
      </div>

      {/* Warning Card - Compact */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-2 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-300">تنبيه هام</h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            إقفال الفترة المحاسبية يمنع إضافة أو تعديل أو ترحيل القيود داخل تلك الفترة.
          </p>
        </div>
      </div>

      {/* Periods Table - Peachtree Grid */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <table className="peachtree-grid w-full">
          <thead className="peachtree-grid-header">
            <tr>
              <th className="text-right">اسم الفترة</th>
              <th className="w-[100px]">تاريخ البداية</th>
              <th className="w-[100px]">تاريخ النهاية</th>
              <th className="w-[80px]">الحالة</th>
              <th className="w-[140px]">تاريخ الإقفال</th>
              <th className="w-[100px]">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {!periods || periods.length === 0 ? (
              <tr className="peachtree-grid-row">
                <td colSpan={6} className="text-center py-4 text-xs text-muted-foreground">
                  لا توجد فترات محاسبية
                </td>
              </tr>
            ) : (
              periods.map((period) => (
                <tr key={period.id} className="peachtree-grid-row" data-testid={`row-period-${period.id}`}>
                  <td className="font-medium text-xs">{period.name}</td>
                  <td className="text-xs text-center">{formatDateShort(period.startDate)}</td>
                  <td className="text-xs text-center">{formatDateShort(period.endDate)}</td>
                  <td className="text-center">
                    {period.isClosed ? (
                      <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 text-xs py-0 px-1">
                        <Lock className="h-2.5 w-2.5 ml-0.5" />
                        مقفلة
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-xs py-0 px-1">
                        <Unlock className="h-2.5 w-2.5 ml-0.5" />
                        مفتوحة
                      </Badge>
                    )}
                  </td>
                  <td className="text-xs text-muted-foreground text-center">
                    {period.closedAt ? formatDateTime(period.closedAt) : "-"}
                  </td>
                  <td className="text-center">
                    {period.isClosed ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => {
                          if (confirm("هل تريد إعادة فتح هذه الفترة المحاسبية؟")) {
                            reopenMutation.mutate(period.id);
                          }
                        }}
                        disabled={reopenMutation.isPending}
                        data-testid={`button-reopen-period-${period.id}`}
                      >
                        <Unlock className="h-3 w-3 ml-1" />
                        إعادة فتح
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => {
                          if (confirm("هل تريد إقفال هذه الفترة المحاسبية؟ لن يمكن إضافة قيود جديدة داخلها.")) {
                            closeMutation.mutate(period.id);
                          }
                        }}
                        disabled={closeMutation.isPending}
                        data-testid={`button-close-period-${period.id}`}
                      >
                        <Lock className="h-3 w-3 ml-1" />
                        إقفال
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>

      {/* Add Period Dialog - Compact Peachtree Style */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-sm p-0" dir="rtl">
          <DialogHeader className="peachtree-toolbar p-2 border-b">
            <DialogTitle className="text-sm font-semibold">إضافة فترة محاسبية جديدة</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 p-3">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">اسم الفترة *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: يناير 2024"
                className="peachtree-input h-7 text-xs"
                data-testid="input-period-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="startDate" className="text-xs">تاريخ البداية *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate || ""}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="peachtree-input h-7 text-xs"
                  data-testid="input-period-start-date"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="endDate" className="text-xs">تاريخ النهاية *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate || ""}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="peachtree-input h-7 text-xs"
                  data-testid="input-period-end-date"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 p-2 border-t bg-muted/30">
            <Button variant="outline" size="sm" onClick={handleCloseDialog} className="h-7 text-xs px-3" data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="h-7 text-xs px-3"
              data-testid="button-save-period"
            >
              {createMutation.isPending ? "جاري الحفظ..." : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
