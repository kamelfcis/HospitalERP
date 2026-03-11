import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useClinicsLookup } from "@/hooks/lookups/useClinicsLookup";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Checkbox }   from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X, Plus, Stethoscope } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";

interface PermissionsDialogProps {
  userId:       string | null;
  open:         boolean;
  onOpenChange: (v: boolean) => void;
}

interface DoctorOption { id: string; name: string; }

function DoctorAssignmentSection({ userId }: { userId: string }) {
  const { toast } = useToast();

  const { data: doctors = [] } = useQuery<DoctorOption[]>({
    queryKey: ["/api/doctors", "includeInactive"],
    queryFn: () => apiRequest("GET", "/api/doctors?includeInactive=true").then((r) => r.json()),
    staleTime: 0,
  });

  const { data: assignedData, isLoading } = useQuery<{ doctorId: string | null }>({
    queryKey: ["/api/clinic-user-doctor", userId],
    queryFn: () => apiRequest("GET", `/api/clinic-user-doctor/${userId}`).then((r) => r.json()),
    enabled: !!userId,
    staleTime: 0,
  });

  const assignedDoctorId = assignedData?.doctorId ?? null;
  const assignedDoctor = doctors.find((d) => d.id === assignedDoctorId);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");

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
    mutationFn: () =>
      apiRequest("DELETE", `/api/clinic-user-doctor/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-user-doctor", userId] });
      toast({ title: "تم إلغاء ربط الطبيب" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-2">
      {assignedDoctor ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1.5 bg-green-50 text-green-700 border-green-200 pr-1.5 py-1">
            <Stethoscope className="h-3 w-3" />
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
            <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-assign-doctor">
              <SelectValue placeholder="اختر طبيباً لربطه بهذا المستخدم..." />
            </SelectTrigger>
            <SelectContent>
              {doctors.length === 0 ? (
                <SelectItem value="__none__" disabled>لا يوجد أطباء</SelectItem>
              ) : (
                doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={!selectedDoctorId || selectedDoctorId === "__none__" || assignMutation.isPending}
            onClick={() => assignMutation.mutate(selectedDoctorId)}
            data-testid="button-assign-doctor"
          >
            {assignMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            ربط
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        ربط المستخدم بطبيب يتيح له استخدام ميزات الطبيب (المفضلة، كشف الحساب...)
      </p>
    </div>
  );
}

function ClinicAssignmentsSection({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [selectedClinicId, setSelectedClinicId] = useState("");

  const { items: allClinics } = useClinicsLookup();

  const { data: assignedClinicIds = [], isLoading } = useQuery<string[]>({
    queryKey: ["/api/clinic-user-clinic", userId],
    queryFn: () => apiRequest("GET", `/api/clinic-user-clinic/${userId}`).then((r) => r.json()),
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
    (c) => c.isActive !== false && !assignedClinicIds.includes(c.id)
  );

  const assignedClinics = allClinics.filter((c) => assignedClinicIds.includes(c.id));

  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={selectedClinicId} onValueChange={setSelectedClinicId}>
          <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-assign-clinic">
            <SelectValue placeholder="اختر عيادة لتعيينها..." />
          </SelectTrigger>
          <SelectContent>
            {unassignedClinics.length === 0 ? (
              <SelectItem value="__none__" disabled>لا توجد عيادات متاحة</SelectItem>
            ) : (
              unassignedClinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={!selectedClinicId || selectedClinicId === "__none__" || assignMutation.isPending}
          onClick={() => assignMutation.mutate(selectedClinicId)}
          data-testid="button-assign-clinic"
        >
          {assignMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          تعيين
        </Button>
      </div>

      {assignedClinics.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          لم يتم تعيين أي عيادة — المستخدم لن يرى أي عيادة (إلا إذا كان أدمن)
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignedClinics.map((c) => (
            <Badge
              key={c.id}
              variant="outline"
              className="text-xs gap-1 bg-blue-50 text-blue-700 border-blue-200 pr-1"
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
    onError: (err: Error) => {
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

            {userId && (
              <div>
                <p className="font-medium text-sm mb-1">ربط بطبيب</p>
                <DoctorAssignmentSection userId={userId} />
              </div>
            )}

            {userId && (
              <div>
                <p className="font-medium text-sm mb-1">تعيين العيادات</p>
                <p className="text-xs text-muted-foreground mb-2">
                  حدد العيادات التي يمكن لهذا المستخدم العمل عليها (الأدمن يرى كل العيادات تلقائيًا)
                </p>
                <ClinicAssignmentsSection userId={userId} />
              </div>
            )}
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
