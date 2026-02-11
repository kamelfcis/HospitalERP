import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Lock, Unlock, KeyRound, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DrawerInfo {
  glAccountId: string;
  hasPassword: boolean;
  code: string;
  name: string;
}

export default function DrawerPasswords() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDrawer, setSelectedDrawer] = useState<DrawerInfo | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: drawers, isLoading } = useQuery<DrawerInfo[]>({
    queryKey: ["/api/drawer-passwords"],
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ glAccountId, password }: { glAccountId: string; password: string }) => {
      const res = await apiRequest("POST", "/api/drawer-passwords/set", { glAccountId, password });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم تعيين كلمة السر بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/drawer-passwords"] });
      setDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      setSelectedDrawer(null);
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const removePasswordMutation = useMutation({
    mutationFn: async (glAccountId: string) => {
      const res = await apiRequest("DELETE", `/api/drawer-passwords/${glAccountId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم إزالة كلمة السر" });
      queryClient.invalidateQueries({ queryKey: ["/api/drawer-passwords"] });
      setDeleteDialogOpen(false);
      setSelectedDrawer(null);
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleSetPassword = () => {
    if (!selectedDrawer) return;
    if (newPassword.length < 4) {
      toast({ title: "خطأ", description: "كلمة السر يجب أن تكون 4 أحرف على الأقل", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "خطأ", description: "كلمتا السر غير متطابقتين", variant: "destructive" });
      return;
    }
    setPasswordMutation.mutate({ glAccountId: selectedDrawer.glAccountId, password: newPassword });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">إدارة كلمات سر الخزن</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-right">حسابات الخزن والكاشير</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !drawers || drawers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد حسابات خزن</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الكود</TableHead>
                  <TableHead className="text-right">اسم الخزنة</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drawers.map((drawer) => (
                  <TableRow key={drawer.glAccountId} data-testid={`row-drawer-${drawer.glAccountId}`}>
                    <TableCell className="text-right font-mono" data-testid={`text-drawer-code-${drawer.glAccountId}`}>{drawer.code}</TableCell>
                    <TableCell className="text-right" data-testid={`text-drawer-name-${drawer.glAccountId}`}>{drawer.name}</TableCell>
                    <TableCell className="text-center">
                      {drawer.hasPassword ? (
                        <Badge className="bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid={`badge-status-${drawer.glAccountId}`}>
                          <Lock className="h-3 w-3 ml-1" />
                          محمية
                        </Badge>
                      ) : (
                        <Badge variant="outline" data-testid={`badge-status-${drawer.glAccountId}`}>
                          <Unlock className="h-3 w-3 ml-1" />
                          غير محمية
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedDrawer(drawer);
                            setNewPassword("");
                            setConfirmPassword("");
                            setDialogOpen(true);
                          }}
                          data-testid={`button-set-password-${drawer.glAccountId}`}
                        >
                          <KeyRound className="h-4 w-4 ml-1" />
                          {drawer.hasPassword ? "تغيير" : "تعيين"}
                        </Button>
                        {drawer.hasPassword && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedDrawer(drawer);
                              setDeleteDialogOpen(true);
                            }}
                            data-testid={`button-remove-password-${drawer.glAccountId}`}
                          >
                            <Trash2 className="h-4 w-4 ml-1" />
                            إزالة
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {selectedDrawer?.hasPassword ? "تغيير كلمة سر الخزنة" : "تعيين كلمة سر الخزنة"}
            </DialogTitle>
            <DialogDescription className="text-right">
              {selectedDrawer?.code} - {selectedDrawer?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-right block">كلمة السر الجديدة</label>
              <Input
                type="password"
                placeholder="أدخل كلمة السر (4 أحرف على الأقل)..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="text-right"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-right block">تأكيد كلمة السر</label>
              <Input
                type="password"
                placeholder="أعد إدخال كلمة السر..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="text-right"
                data-testid="input-confirm-password"
              />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={handleSetPassword}
              disabled={setPasswordMutation.isPending || !newPassword || !confirmPassword}
              data-testid="button-save-password"
            >
              {setPasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Lock className="h-4 w-4 ml-1" />}
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-password">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إزالة كلمة سر الخزنة</DialogTitle>
            <DialogDescription className="text-right">
              هل أنت متأكد من إزالة كلمة السر عن الخزنة: {selectedDrawer?.code} - {selectedDrawer?.name}؟
              بعد الإزالة سيتمكن أي شخص من فتح وردية على هذه الخزنة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              variant="destructive"
              onClick={() => selectedDrawer && removePasswordMutation.mutate(selectedDrawer.glAccountId)}
              disabled={removePasswordMutation.isPending}
              data-testid="button-confirm-remove"
            >
              {removePasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Trash2 className="h-4 w-4 ml-1" />}
              إزالة
            </Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-remove">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
