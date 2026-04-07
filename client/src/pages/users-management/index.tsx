import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDepartmentsLookup } from "@/hooks/lookups/useDepartmentsLookup";
import { useClinicsLookup } from "@/hooks/lookups/useClinicsLookup";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { UserCard } from "./components/UserCard";
import { UserFormDialog } from "./components/UserFormDialog";
import { AccountScopeDialog } from "./components/AccountScopeDialog";
import type { UserData, UserFormData } from "./types";
import type { Account } from "@shared/schema";

const EMPTY_FORM: UserFormData = {
  username: "", password: "", fullName: "",
  role: "data_entry", departmentId: "", pharmacyId: "",
  isActive: true,
  cashierGlAccountId: "", cashierVarianceAccountId: "",
  cashierVarianceShortAccountId: "", cashierVarianceOverAccountId: "",
  defaultWarehouseId: "", defaultPurchaseWarehouseId: "",
  allowedPharmacyIds: [], allowedDepartmentIds: [], allowedClinicIds: [], hasAllUnits: false,
};

export default function UsersManagement() {
  const { hasPermission } = useAuth();
  const { toast }         = useToast();
  const [, navigate]      = useLocation();

  const canCreate = hasPermission("users.create");
  const canEdit   = hasPermission("users.edit");
  const canDelete = hasPermission("users.delete");

  const [showDialog,  setShowDialog]  = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData,    setFormData]    = useState<UserFormData>(EMPTY_FORM);
  const [scopeLoading, setScopeLoading] = useState(false);

  const [showScopeDialog, setShowScopeDialog] = useState(false);
  const [scopeUser,        setScopeUser]       = useState<UserData | null>(null);

  const { data: users = [], isLoading } = useQuery<UserData[]>({ queryKey: ["/api/users"] });
  const { items: departmentItems }      = useDepartmentsLookup();
  const { data: pharmacies = [] }       = useQuery<{ id: string; nameAr: string }[]>({ queryKey: ["/api/pharmacies"] });
  const { data: warehouses = [] }       = useQuery<{ id: string; nameAr: string }[]>({ queryKey: ["/api/warehouses"] });
  const { data: cashierAccounts = [] }  = useQuery<{ glAccountId: string; code: string; name: string; hasPassword: boolean }[]>({ queryKey: ["/api/drawer-passwords"] });
  const { data: allAccounts = [] }      = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { items: clinicItems }          = useClinicsLookup();

  // حسابات طرفية نشطة — بدون فلتر كود ثابت لتوافق أي دليل حسابات
  const parentAccountIds = new Set(allAccounts.map(a => a.parentId).filter(Boolean));
  const varianceAccounts = allAccounts.filter(a => a.isActive && !parentAccountIds.has(a.id));

  const createMutation = useMutation({
    mutationFn: async (data: Partial<UserData>) => (await apiRequest("POST", "/api/users", data)).json(),
    onSuccess: async (newUser) => {
      await saveScopeForUser(newUser.id);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowDialog(false);
      toast({ title: "تم إنشاء المستخدم بنجاح" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserData> }) =>
      (await apiRequest("PATCH", `/api/users/${id}`, data)).json(),
    onSuccess: async (_, { id }) => {
      await saveScopeForUser(id);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", id, "cashier-scope"] });
      setShowDialog(false);
      toast({ title: "تم تحديث المستخدم بنجاح" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "تم حذف المستخدم" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  async function saveScopeForUser(userId: string) {
    if (formData.cashierGlAccountId) {
      try {
        await apiRequest("PUT", `/api/users/${userId}/cashier-scope`, {
          departmentIds: formData.allowedDepartmentIds,
          hasAllUnits:   formData.hasAllUnits,
        });
      } catch {
      }
    }
    // Save clinic assignments always (independent from cashier scope)
    try {
      await apiRequest("PUT", `/api/users/${userId}/clinics`, {
        clinicIds: formData.allowedClinicIds,
      });
    } catch {
    }
  }

  async function handleOpenEdit(user: UserData) {
    setEditingUser(user);
    const base: UserFormData = {
      username:            user.username,
      password:            "",
      fullName:            user.fullName,
      role:                user.role,
      departmentId:        user.departmentId || "",
      pharmacyId:          user.pharmacyId  || "",
      isActive:            user.isActive,
      cashierGlAccountId:            user.cashierGlAccountId              || "",
      cashierVarianceAccountId:      user.cashierVarianceAccountId        || "",
      cashierVarianceShortAccountId: user.cashierVarianceShortAccountId   || "",
      cashierVarianceOverAccountId:  user.cashierVarianceOverAccountId    || "",
      defaultWarehouseId:            user.defaultWarehouseId              || "",
      defaultPurchaseWarehouseId:  user.defaultPurchaseWarehouseId    || "",
      allowedPharmacyIds:  user.pharmacyId ? [user.pharmacyId] : [],
      allowedDepartmentIds: [],
      allowedClinicIds:    [],
      hasAllUnits:         false,
    };
    setFormData(base);
    setShowDialog(true);

    setScopeLoading(true);
    try {
      const [scopeRes, clinicsRes] = await Promise.all([
        user.cashierGlAccountId
          ? apiRequest("GET", `/api/users/${user.id}/cashier-scope`).then(r => r.json())
          : Promise.resolve(null),
        apiRequest("GET", `/api/users/${user.id}/clinics`).then(r => r.json()),
      ]);
      setFormData(prev => ({
        ...prev,
        ...(scopeRes ? {
          allowedPharmacyIds:   scopeRes.allowedPharmacyIds || [],
          allowedDepartmentIds: (scopeRes.assignedDepartments || []).map((d: any) => d.id),
          hasAllUnits:          scopeRes.isFullAccess && user.role !== "admin" && user.role !== "owner",
        } : {}),
        allowedClinicIds: clinicsRes.clinicIds || [],
      }));
    } catch {
    } finally {
      setScopeLoading(false);
    }
  }

  function handleOpenNew() {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  }

  function handleSave() {
    // ── تحقق محاسبي: حساب GL كاشير بدون أي حساب فروق ──────────────────────
    const hasAnyVariance = !!(formData.cashierVarianceAccountId || formData.cashierVarianceShortAccountId || formData.cashierVarianceOverAccountId);
    if (formData.cashierGlAccountId && !hasAnyVariance) {
      toast({
        title: "تحذير: حساب فروق الجرد غير مُحدَّد",
        description: "هذا المستخدم له حساب كاشير ولكن لم يُعيَّن له أي حساب فروق الجرد — لن يتمكن من إغلاق الوردية إذا كان هناك فرق نقدي.",
        variant: "destructive",
      });
      return;
    }

    const payload: Partial<UserData> = {
      username:           formData.username,
      fullName:           formData.fullName,
      role:               formData.role,
      departmentId:       formData.departmentId || null,
      pharmacyId:         formData.pharmacyId   || null,
      isActive:           formData.isActive,
      cashierGlAccountId:            formData.cashierGlAccountId              || null,
      cashierVarianceAccountId:      formData.cashierVarianceAccountId        || null,
      cashierVarianceShortAccountId: formData.cashierVarianceShortAccountId   || null,
      cashierVarianceOverAccountId:  formData.cashierVarianceOverAccountId    || null,
      defaultWarehouseId:            formData.defaultWarehouseId              || null,
      defaultPurchaseWarehouseId:  formData.defaultPurchaseWarehouseId      || null,
    };

    if (editingUser) {
      if (formData.password) (payload as any).password = formData.password;
      updateMutation.mutate({ id: editingUser.id, data: payload });
    } else {
      if (!formData.password) {
        toast({ title: "يرجى إدخال كلمة المرور", variant: "destructive" });
        return;
      }
      (payload as any).password = formData.password;
      createMutation.mutate(payload);
    }
  }

  function handleOpenPerms(userId: string) {
    navigate(`/permission-groups?userId=${userId}`);
  }

  function handleOpenAcctScope(user: UserData) {
    setScopeUser(user);
    setShowScopeDialog(true);
  }

  const isPending = createMutation.isPending || updateMutation.isPending || scopeLoading;

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
              departments={departmentItems.map(d => ({ id: d.id, nameAr: d.label }))}
              pharmacies={pharmacies}
              warehouses={warehouses}
              onEdit={handleOpenEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
              onOpenPerms={handleOpenPerms}
              onOpenAcctScope={handleOpenAcctScope}
            />
          ))}
        </div>
      )}

      <UserFormDialog
        open={showDialog}
        editingUser={editingUser}
        formData={formData}
        departments={departmentItems.map(i => ({ id: i.id, nameAr: i.name }))}
        pharmacies={pharmacies}
        clinics={clinicItems.map(i => ({ id: i.id, nameAr: i.name }))}
        warehouses={warehouses}
        cashierAccounts={cashierAccounts}
        varianceAccounts={varianceAccounts}
        isPending={isPending}
        onFormChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
        onSave={handleSave}
        onOpenChange={setShowDialog}
      />

      <AccountScopeDialog
        userId={scopeUser?.id ?? null}
        userFullName={scopeUser?.fullName ?? ""}
        open={showScopeDialog}
        onOpenChange={(open) => {
          setShowScopeDialog(open);
          if (!open) setScopeUser(null);
        }}
      />

    </div>
  );
}
