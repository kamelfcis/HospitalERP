import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { UserCard } from "./components/UserCard";
import { UserFormDialog } from "./components/UserFormDialog";
import { PermissionsDialog } from "./components/PermissionsDialog";
import type { UserData, UserFormData } from "./types";

const EMPTY_FORM: UserFormData = {
  username: "", password: "", fullName: "",
  role: "data_entry", departmentId: "", pharmacyId: "", isActive: true,
};

export default function UsersManagement() {
  const { hasPermission } = useAuth();
  const { toast }         = useToast();

  const canCreate = hasPermission("users.create");
  const canEdit   = hasPermission("users.edit");
  const canDelete = hasPermission("users.delete");

  // ── نافذة إضافة / تعديل
  const [showDialog,  setShowDialog]  = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData,    setFormData]    = useState<UserFormData>(EMPTY_FORM);

  // ── نافذة الصلاحيات
  const [showPermDialog, setShowPermDialog] = useState(false);
  const [permUserId,     setPermUserId]     = useState<string | null>(null);

  // ── جلب البيانات
  const { data: users = [], isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
  });

  const { data: departments = [] } = useQuery<{ id: string; nameAr: string }[]>({
    queryKey: ["/api/departments"],
  });

  const { data: pharmacies = [] } = useQuery<{ id: string; nameAr: string }[]>({
    queryKey: ["/api/pharmacies"],
  });

  // ── Mutations
  const createMutation = useMutation({
    mutationFn: async (data: any) => (await apiRequest("POST", "/api/users", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowDialog(false);
      toast({ title: "تم إنشاء المستخدم بنجاح" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) =>
      (await apiRequest("PATCH", `/api/users/${id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowDialog(false);
      toast({ title: "تم تحديث المستخدم بنجاح" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "تم حذف المستخدم" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  // ── Handlers
  function handleOpenNew() {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  }

  function handleOpenEdit(user: UserData) {
    setEditingUser(user);
    setFormData({
      username:     user.username,
      password:     "",
      fullName:     user.fullName,
      role:         user.role,
      departmentId: user.departmentId || "",
      pharmacyId:   user.pharmacyId  || "",
      isActive:     user.isActive,
    });
    setShowDialog(true);
  }

  function handleSave() {
    const payload: any = {
      username:     formData.username,
      fullName:     formData.fullName,
      role:         formData.role,
      departmentId: formData.departmentId || null,
      pharmacyId:   formData.pharmacyId   || null,
      isActive:     formData.isActive,
    };

    if (editingUser) {
      if (formData.password) payload.password = formData.password;
      updateMutation.mutate({ id: editingUser.id, data: payload });
    } else {
      if (!formData.password) {
        toast({ title: "يرجى إدخال كلمة المرور", variant: "destructive" });
        return;
      }
      payload.password = formData.password;
      createMutation.mutate(payload);
    }
  }

  function handleOpenPerms(userId: string) {
    setPermUserId(userId);
    setShowPermDialog(true);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 space-y-2" dir="rtl">

      <div className="flex items-center justify-between flex-wrap gap-1">
        <h1 className="text-lg font-bold" data-testid="text-page-title">إدارة المستخدمين</h1>
        {canCreate && (
          <Button onClick={handleOpenNew} data-testid="button-add-user">
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
            <UserCard
              key={user.id}
              user={user}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={handleOpenEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
              onOpenPerms={handleOpenPerms}
            />
          ))}
        </div>
      )}

      <UserFormDialog
        open={showDialog}
        editingUser={editingUser}
        formData={formData}
        departments={departments}
        pharmacies={pharmacies}
        isPending={isPending}
        onFormChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
        onSave={handleSave}
        onOpenChange={setShowDialog}
      />

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
