import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, Shield, Loader2, UserCircle } from "lucide-react";
import { ROLE_LABELS, PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";

interface UserData {
  id: string;
  username: string;
  fullName: string;
  role: string;
  departmentId: string | null;
  pharmacyId: string | null;
  isActive: boolean;
  createdAt: string;
}

const ROLES = Object.entries(ROLE_LABELS);

export default function UsersManagement() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [showPermDialog, setShowPermDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [permUserId, setPermUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "data_entry" as string,
    departmentId: "",
    pharmacyId: "",
    isActive: true,
  });

  const { data: users = [], isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
  });

  const { data: departments = [] } = useQuery<any[]>({
    queryKey: ["/api/departments"],
  });

  const { data: pharmacies = [] } = useQuery<any[]>({
    queryKey: ["/api/pharmacies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowDialog(false);
      toast({ title: "تم إنشاء المستخدم بنجاح" });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowDialog(false);
      toast({ title: "تم تحديث المستخدم بنجاح" });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "تم حذف المستخدم" });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setEditingUser(null);
    setFormData({
      username: "",
      password: "",
      fullName: "",
      role: "data_entry",
      departmentId: "",
      pharmacyId: "",
      isActive: true,
    });
    setShowDialog(true);
  };

  const openEdit = (user: UserData) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "",
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId || "",
      pharmacyId: user.pharmacyId || "",
      isActive: user.isActive,
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    const data: any = {
      username: formData.username,
      fullName: formData.fullName,
      role: formData.role,
      departmentId: formData.departmentId || null,
      pharmacyId: formData.pharmacyId || null,
      isActive: formData.isActive,
    };
    if (formData.password) {
      data.password = formData.password;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      if (!formData.password) {
        toast({ title: "يرجى إدخال كلمة المرور", variant: "destructive" });
        return;
      }
      data.password = formData.password;
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-4 space-y-2" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <h1 className="text-lg font-bold" data-testid="text-page-title">إدارة المستخدمين</h1>
        {hasPermission("users.create") && (
          <Button onClick={openNew} data-testid="button-add-user">
            <Plus className="h-4 w-4 ml-2" />
            إضافة مستخدم
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-1">
          {users.map((user) => (
            <Card key={user.id} data-testid={`card-user-${user.id}`}>
              <CardContent className="px-3 py-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium text-sm" data-testid={`text-user-fullname-${user.id}`}>{user.fullName}</span>
                    <span className="text-xs text-muted-foreground" data-testid={`text-user-username-${user.id}`}>@{user.username}</span>
                    <Badge variant={user.isActive ? "default" : "secondary"} data-testid={`badge-user-status-${user.id}`}>
                      {user.isActive ? "نشط" : "معطل"}
                    </Badge>
                    <Badge variant="outline" data-testid={`badge-user-role-${user.id}`}>
                      {ROLE_LABELS[user.role] || user.role}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasPermission("users.edit") && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPermUserId(user.id);
                            setShowPermDialog(true);
                          }}
                          data-testid={`button-user-perms-${user.id}`}
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(user)} data-testid={`button-edit-user-${user.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {hasPermission("users.delete") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("هل تريد حذف هذا المستخدم؟")) {
                            deleteMutation.mutate(user.id);
                          }
                        }}
                        data-testid={`button-delete-user-${user.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingUser ? "تعديل مستخدم" : "إضافة مستخدم جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>اسم المستخدم</Label>
              <Input
                data-testid="input-user-username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{editingUser ? "كلمة المرور الجديدة (اتركها فارغة لعدم التغيير)" : "كلمة المرور"}</Label>
              <Input
                data-testid="input-user-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input
                data-testid="input-user-fullname"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>الدور</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الصيدلية</Label>
              <Select value={formData.pharmacyId || "none"} onValueChange={(v) => setFormData({ ...formData, pharmacyId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-user-pharmacy">
                  <SelectValue placeholder="اختر الصيدلية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {pharmacies.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>القسم</Label>
              <Select value={formData.departmentId || "none"} onValueChange={(v) => setFormData({ ...formData, departmentId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-user-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                data-testid="checkbox-user-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: !!checked })}
              />
              <Label htmlFor="isActive">نشط</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-user"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PermissionsDialog
        userId={permUserId}
        open={showPermDialog}
        onOpenChange={(open) => {
          setShowPermDialog(open);
          if (!open) setPermUserId(null);
        }}
      />
    </div>
  );
}

function PermissionsDialog({ userId, open, onOpenChange }: { userId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
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
      for (const up of userPermsData) {
        o[up.permission] = up.granted;
      }
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
            الدور: {ROLE_LABELS[user?.role] || user?.role} - يمكنك إضافة أو سحب صلاحيات محددة
          </p>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pe-2">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="font-medium text-sm mb-1">{group.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {group.permissions.map((perm) => {
                    const fromRole = rolePerms.has(perm.key);
                    const isOverridden = perm.key in overrides;
                    const granted = isPermGranted(perm.key);
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
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-permissions">
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ الصلاحيات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
