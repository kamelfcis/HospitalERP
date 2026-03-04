import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Checkbox }   from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 }    from "lucide-react";
import { ROLE_LABELS, PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";

interface PermissionsDialogProps {
  userId:       string | null;
  open:         boolean;
  onOpenChange: (v: boolean) => void;
}

export function PermissionsDialog({ userId, open, onOpenChange }: PermissionsDialogProps) {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const { data: userData } = useQuery<any>({
    queryKey: ["/api/users"],
    enabled: !!userId,
  });

  const user = (userData || []).find((u: any) => u.id === userId);
  const rolePerms = new Set(DEFAULT_ROLE_PERMISSIONS[user?.role] || []);

  const { data: userPermsData = [] } = useQuery<any[]>({
    queryKey: ["/api/users", userId, "permissions"],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/users/${userId}/permissions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId && open,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const permissions = Object.entries(overrides).map(([permission, granted]) => ({ permission, granted }));
      await apiRequest("PUT", `/api/users/${userId}/permissions`, { permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "permissions"] });
      toast({ title: "تم حفظ الصلاحيات" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (open && userPermsData.length > 0) {
      const o: Record<string, boolean> = {};
      for (const up of userPermsData) o[up.permission] = up.granted;
      setOverrides(o);
    } else if (open) {
      setOverrides({});
    }
  }, [open, userPermsData]);

  const isPermGranted = (permKey: string) => {
    if (permKey in overrides) return overrides[permKey];
    return rolePerms.has(permKey);
  };

  const togglePerm = (permKey: string) => {
    const currentFromRole = rolePerms.has(permKey);
    const currentOverride = overrides[permKey];
    if (currentOverride === undefined) {
      setOverrides({ ...overrides, [permKey]: !currentFromRole });
    } else {
      const newOverrides = { ...overrides };
      delete newOverrides[permKey];
      setOverrides(newOverrides);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle data-testid="text-perm-dialog-title">
            صلاحيات المستخدم: {user?.fullName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            الدور: {ROLE_LABELS[user?.role] || user?.role} — يمكنك إضافة أو سحب صلاحيات محددة
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pe-2">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="font-medium text-sm mb-1">{group.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {group.permissions.map((perm) => {
                    const fromRole     = rolePerms.has(perm.key);
                    const isOverridden = perm.key in overrides;
                    const granted      = isPermGranted(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-center gap-2 text-sm p-1 rounded cursor-pointer ${
                          isOverridden ? "bg-primary/5" : ""
                        }`}
                        data-testid={`perm-toggle-${perm.key}`}
                      >
                        <Checkbox
                          checked={granted}
                          onCheckedChange={() => togglePerm(perm.key)}
                        />
                        <span>{perm.label}</span>
                        {isOverridden && (
                          <Badge variant="outline" className="text-xs">
                            {granted ? "مضاف" : "محجوب"}
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-permissions"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ الصلاحيات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
