import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X, Lock, Unlock } from "lucide-react";
import type { Account } from "@shared/schema";

interface AccountScopeDialogProps {
  userId:       string | null;
  userFullName: string;
  open:         boolean;
  onOpenChange: (v: boolean) => void;
}

export function AccountScopeDialog({
  userId, userFullName, open, onOpenChange,
}: AccountScopeDialogProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerValue, setPickerValue] = useState("");

  const { data: allAccounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: open,
  });

  const { data: scopeData, isLoading: scopeLoading } = useQuery<{ accountIds: string[] }>({
    queryKey: ["/api/users", userId, "account-scope"],
    queryFn: () => apiRequest("GET", `/api/users/${userId}/account-scope`).then(r => r.json()),
    enabled: open && !!userId,
    staleTime: 0,
  });

  useEffect(() => {
    if (scopeData) setSelectedIds(scopeData.accountIds);
  }, [scopeData]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/users/${userId}/account-scope`, { accountIds: selectedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "account-scope"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "تم حفظ نطاق الحسابات بنجاح" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const isLoading = accountsLoading || scopeLoading;
  const isUnrestricted = selectedIds.length === 0;

  function addAccount(id: string) {
    if (!id || selectedIds.includes(id)) return;
    setSelectedIds(prev => [...prev, id]);
    setPickerValue("");
  }

  function removeAccount(id: string) {
    setSelectedIds(prev => prev.filter(x => x !== id));
  }

  const assignedAccounts = allAccounts.filter(a => selectedIds.includes(a.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            نطاق الحسابات المرئية — {userFullName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${isUnrestricted ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
              {isUnrestricted ? (
                <>
                  <Unlock className="h-4 w-4 shrink-0" />
                  <span>المستخدم غير مقيّد — يرى جميع الحسابات</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>مستخدم مقيّد — يرى <strong>{selectedIds.length}</strong> حساباً فقط</span>
                </>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">إضافة حساب إلى النطاق:</p>
              <AccountSearchSelect
                accounts={allAccounts.filter(a => a.isActive && !selectedIds.includes(a.id))}
                value={pickerValue}
                onChange={addAccount}
                placeholder="ابحث عن حساب لإضافته..."
                data-testid="account-scope-picker"
              />
            </div>

            {assignedAccounts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">الحسابات المُعيَّنة ({assignedAccounts.length}):</p>
                <ScrollArea className="max-h-[240px] border rounded-md p-2">
                  <div className="space-y-1">
                    {assignedAccounts.map(a => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded-sm hover:bg-muted/50"
                        data-testid={`scope-account-${a.id}`}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-[11px] text-muted-foreground w-14 shrink-0">{a.code}</span>
                          <span>{a.name}</span>
                          {a.accountType && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {a.accountType === "asset"     && "أصول"}
                              {a.accountType === "liability" && "خصوم"}
                              {a.accountType === "equity"    && "ملكية"}
                              {a.accountType === "revenue"   && "إيرادات"}
                              {a.accountType === "expense"   && "مصروفات"}
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="icon" variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeAccount(a.id)}
                          data-testid={`button-remove-scope-${a.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {!isUnrestricted && (
              <Button
                variant="outline" size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setSelectedIds([])}
                data-testid="button-clear-scope"
              >
                إزالة القيد — منح وصول كامل
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-scope">
            إلغاء
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-scope"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
