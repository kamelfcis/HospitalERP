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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Lock, Unlock, Calendar, AlertTriangle } from "lucide-react";
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الفترات المحاسبية</h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة الفترات المحاسبية وإقفالها
          </p>
        </div>
        <Button onClick={handleOpenDialog} data-testid="button-add-fiscal-period">
          <Plus className="h-4 w-4 ml-2" />
          فترة جديدة
        </Button>
      </div>

      {/* Warning Card */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-800">تنبيه هام</h3>
              <p className="text-sm text-amber-700 mt-1">
                إقفال الفترة المحاسبية يمنع إضافة أو تعديل أو ترحيل القيود داخل تلك الفترة.
                يمكن إعادة فتح الفترة عند الحاجة.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Periods Table */}
      <Card>
        <ScrollArea className="h-[calc(100vh-400px)]">
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead>اسم الفترة</TableHead>
                <TableHead className="w-[140px]">تاريخ البداية</TableHead>
                <TableHead className="w-[140px]">تاريخ النهاية</TableHead>
                <TableHead className="w-[100px]">الحالة</TableHead>
                <TableHead className="w-[180px]">تاريخ الإقفال</TableHead>
                <TableHead className="w-[120px]">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!periods || periods.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد فترات محاسبية
                  </TableCell>
                </TableRow>
              ) : (
                periods.map((period) => (
                  <TableRow key={period.id} data-testid={`row-period-${period.id}`}>
                    <TableCell className="font-medium">{period.name}</TableCell>
                    <TableCell>{formatDateShort(period.startDate)}</TableCell>
                    <TableCell>{formatDateShort(period.endDate)}</TableCell>
                    <TableCell>
                      {period.isClosed ? (
                        <Badge className="bg-red-100 text-red-800 border-red-200">
                          <Lock className="h-3 w-3 ml-1" />
                          مقفلة
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          <Unlock className="h-3 w-3 ml-1" />
                          مفتوحة
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {period.closedAt ? formatDateTime(period.closedAt) : "-"}
                    </TableCell>
                    <TableCell>
                      {period.isClosed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm("هل تريد إعادة فتح هذه الفترة المحاسبية؟")) {
                              reopenMutation.mutate(period.id);
                            }
                          }}
                          disabled={reopenMutation.isPending}
                          data-testid={`button-reopen-period-${period.id}`}
                        >
                          <Unlock className="h-4 w-4 ml-2" />
                          إعادة فتح
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (confirm("هل تريد إقفال هذه الفترة المحاسبية؟ لن يمكن إضافة قيود جديدة داخلها.")) {
                              closeMutation.mutate(period.id);
                            }
                          }}
                          disabled={closeMutation.isPending}
                          data-testid={`button-close-period-${period.id}`}
                        >
                          <Lock className="h-4 w-4 ml-2" />
                          إقفال
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Add Period Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة فترة محاسبية جديدة</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">اسم الفترة *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: يناير 2024"
                data-testid="input-period-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">تاريخ البداية *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate || ""}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  data-testid="input-period-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">تاريخ النهاية *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate || ""}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  data-testid="input-period-end-date"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
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
