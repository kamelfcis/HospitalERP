/**
 * UserPermissionsPanel — لوح صلاحيات المستخدم الفردية
 *
 * يعرض:
 *  - الصلاحيات الفردية للمستخدم (مع بادجات مضاف/محجوب فوق الدور)
 *  - ربط بطبيب
 *  - تعيين العيادات
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useClinicsLookup } from "@/hooks/lookups/useClinicsLookup";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Checkbox }   from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserCircle, X, Plus, Stethoscope } from "lucide-react";
import { ROLE_LABELS, PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";

// ─────────────────────────────────────────────────────────────────────────────
//  Doctor Assignment
// ─────────────────────────────────────────────────────────────────────────────
interface DoctorOption { id: string; name: string; }

function DoctorAssignmentSection({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [selectedDoctorId, setSelectedDoctorId] = useState("");

  const { data: doctors = [] } = useQuery<DoctorOption[]>({
    queryKey: ["/api/doctors", "includeInactive"],
    queryFn: () => apiRequest("GET", "/api/doctors?includeInactive=true").then(r => r.json()),
    staleTime: 0,
  });

  const { data: assignedData, isLoading } = useQuery<{ doctorId: string | null }>({
    queryKey: ["/api/clinic-user-doctor", userId],
    queryFn: () => apiRequest("GET", `/api/clinic-user-doctor/${userId}`).then(r => r.json()),
    enabled: !!userId,
    staleTime: 0,
  });

  const assignedDoctorId = assignedData?.doctorId ?? null;
  const assignedDoctor   = doctors.find(d => d.id === assignedDoctorId);

  const assignMutation = useMutation({
    mutationFn: (doctorId: string) =>
      apiRequest("POST", "/api/clinic-user-doctor", { userId, doctorId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-user-doctor", userId] });
      setSelectedDoctorId("");
      toast({ title: "تم ربط المستخدم بالطبيب" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/clinic-user-doctor/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-user-doctor", userId] });
      toast({ title: "تم إلغاء ربط الطبيب" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex justify-center py-4">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        ربط المستخدم بطبيب يتيح له استخدام ميزات الطبيب (المفضلة، كشف الحساب...)
      </p>
      {assignedDoctor ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm gap-2 bg-green-50 text-green-700 border-green-200 pr-2 py-1.5">
            <Stethoscope className="h-4 w-4" />
            {assignedDoctor.name}
            <button
              type="button"
              className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              data-testid="button-remove-doctor"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
            <SelectTrigger className="flex-1" data-testid="select-assign-doctor">
              <SelectValue placeholder="اختر طبيباً لربطه بهذا المستخدم..." />
            </SelectTrigger>
            <SelectContent>
              {doctors.length === 0 ? (
                <SelectItem value="__none__" disabled>لا يوجد أطباء</SelectItem>
              ) : (
                doctors.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
          <Button
            className="gap-1"
            disabled={!selectedDoctorId || selectedDoctorId === "__none__" || assignMutation.isPending}
            onClick={() => assignMutation.mutate(selectedDoctorId)}
            data-testid="button-assign-doctor"
          >
            {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            ربط
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Clinic Assignments
// ─────────────────────────────────────────────────────────────────────────────
function ClinicAssignmentsSection({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [selectedClinicId, setSelectedClinicId] = useState("");

  const { items: allClinics } = useClinicsLookup();

  const { data: assignedClinicIds = [], isLoading } = useQuery<string[]>({
    queryKey: ["/api/clinic-user-clinic", userId],
    queryFn: () => apiRequest("GET", `/api/clinic-user-clinic/${userId}`).then(r => r.json()),
    enabled: !!userId,
    staleTime: 0,
  });

  const assignMutation = useMutation({
    mutationFn: (clinicId: string) =>
      apiRequest("POST", "/api/clinic-user-clinic", { userId, clinicId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-user-clinic", userId] });
      setSelectedClinicId("");
      toast({ title: "تم تعيين العيادة" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (clinicId: string) =>
      apiRequest("DELETE", "/api/clinic-user-clinic", { userId, clinicId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-user-clinic", userId] });
      toast({ title: "تم إلغاء تعيين العيادة" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const unassignedClinics = allClinics.filter(
    c => c.isActive !== false && !assignedClinicIds.includes(c.id)
  );
  const assignedClinics = allClinics.filter(c => assignedClinicIds.includes(c.id));

  if (isLoading) return (
    <div className="flex justify-center py-4">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        حدد العيادات التي يمكن لهذا المستخدم العمل عليها (الأدمن يرى كل العيادات تلقائيًا)
      </p>
      <div className="flex items-center gap-2">
        <Select value={selectedClinicId} onValueChange={setSelectedClinicId}>
          <SelectTrigger className="flex-1" data-testid="select-assign-clinic">
            <SelectValue placeholder="اختر عيادة لتعيينها..." />
          </SelectTrigger>
          <SelectContent>
            {unassignedClinics.length === 0 ? (
              <SelectItem value="__none__" disabled>لا توجد عيادات متاحة</SelectItem>
            ) : (
              unassignedClinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
            )}
          </SelectContent>
        </Select>
        <Button
          className="gap-1"
          disabled={!selectedClinicId || selectedClinicId === "__none__" || assignMutation.isPending}
          onClick={() => assignMutation.mutate(selectedClinicId)}
          data-testid="button-assign-clinic"
        >
          {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          تعيين
        </Button>
      </div>

      {assignedClinics.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3 border rounded-md bg-muted/20">
          لم يتم تعيين أي عيادة — المستخدم لن يرى أي عيادة (إلا إذا كان أدمن)
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignedClinics.map(c => (
            <Badge
              key={c.id}
              variant="outline"
              className="text-sm gap-1.5 bg-blue-50 text-blue-700 border-blue-200 pr-1.5 py-1"
              data-testid={`badge-assigned-clinic-${c.id}`}
            >
              {c.name}
              <button
                type="button"
                className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                onClick={() => removeMutation.mutate(c.id)}
                disabled={removeMutation.isPending}
                data-testid={`button-remove-clinic-${c.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main Panel
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  userId: string;
}

export function UserPermissionsPanel({ userId }: Props) {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const { data: usersData = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const user = usersData.find((u: any) => u.id === userId);
  const rolePerms = new Set<string>(DEFAULT_ROLE_PERMISSIONS[user?.role] || []);

  const { data: userPermsData = [], isLoading: permsLoading } = useQuery<any[]>({
    queryKey: ["/api/users", userId, "permissions"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/permissions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
    staleTime: 0,
  });

  useEffect(() => {
    if (userPermsData.length > 0) {
      const o: Record<string, boolean> = {};
      for (const up of userPermsData) o[up.permission] = up.granted;
      setOverrides(o);
    } else {
      setOverrides({});
    }
  }, [userPermsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const permissions = Object.entries(overrides).map(([permission, granted]) => ({ permission, granted }));
      await apiRequest("PUT", `/api/users/${userId}/permissions`, { permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "permissions"] });
      toast({ title: "تم حفظ الصلاحيات" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const isPermGranted = (permKey: string) => {
    if (permKey in overrides) return overrides[permKey];
    return rolePerms.has(permKey);
  };

  const togglePerm = (permKey: string) => {
    const fromRole       = rolePerms.has(permKey);
    const currentOverride = overrides[permKey];
    if (currentOverride === undefined) {
      setOverrides({ ...overrides, [permKey]: !fromRole });
    } else {
      const next = { ...overrides };
      delete next[permKey];
      setOverrides(next);
    }
  };

  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="flex flex-col gap-4">
      {/* رأس المستخدم */}
      <div className="flex items-center gap-2 pb-3 border-b flex-row-reverse">
        <UserCircle className="h-5 w-5 text-primary" />
        <div className="flex-1 text-right">
          <h2 className="text-base font-bold">{user?.fullName ?? "..."}</h2>
          <p className="text-xs text-muted-foreground">
            الدور: {ROLE_LABELS[user?.role] || user?.role}
          </p>
        </div>
        {overrideCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {overrideCount} تعديل
          </Badge>
        )}
      </div>

      {/* التبويبات */}
      <Tabs defaultValue="permissions">
        <TabsList className="mb-1 w-full justify-start flex-row-reverse">
          <TabsTrigger value="permissions" data-testid="tab-user-permissions">
            الصلاحيات
            {overrideCount > 0 && (
              <Badge variant="secondary" className="mr-1.5 h-4 px-1 text-[10px]">
                {overrideCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="doctor" data-testid="tab-user-doctor">
            ربط بطبيب
          </TabsTrigger>
          <TabsTrigger value="clinics" data-testid="tab-user-clinics">
            العيادات
          </TabsTrigger>
        </TabsList>

        {/* ─── صلاحيات المستخدم ─── */}
        <TabsContent value="permissions" className="mt-0">
          {permsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                يمكنك إضافة أو سحب صلاحيات محددة فوق الدور الأساسي للمستخدم.
                التعديلات المظللة تُشير لتجاوز الدور.
              </p>
              <ScrollArea className="h-[50vh]">
                <div className="space-y-4 pe-2">
                  {PERMISSION_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="font-medium text-sm mb-1">{group.label}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {group.permissions.map(perm => {
                          const fromRole      = rolePerms.has(perm.key);
                          const isOverridden  = perm.key in overrides;
                          const granted       = isPermGranted(perm.key);
                          return (
                            <label
                              key={perm.key}
                              className={`flex items-center gap-2 text-sm p-1.5 rounded cursor-pointer transition-colors ${
                                isOverridden ? "bg-primary/5" : "hover:bg-muted/50"
                              }`}
                              data-testid={`perm-toggle-${perm.key}`}
                            >
                              <Checkbox
                                checked={granted}
                                onCheckedChange={() => togglePerm(perm.key)}
                              />
                              <span className="flex-1">{perm.label}</span>
                              {isOverridden && (
                                <Badge variant="outline" className="text-xs shrink-0">
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
              <div className="pt-3 border-t mt-3">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-permissions"
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  حفظ الصلاحيات
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── ربط بطبيب ─── */}
        <TabsContent value="doctor" className="mt-0">
          <DoctorAssignmentSection userId={userId} />
        </TabsContent>

        {/* ─── العيادات ─── */}
        <TabsContent value="clinics" className="mt-0">
          <ClinicAssignmentsSection userId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
