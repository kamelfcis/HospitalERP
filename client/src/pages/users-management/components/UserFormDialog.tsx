import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch }   from "@/components/ui/switch";
import { Badge }    from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, ChevronDown, ChevronUp, Info, Stethoscope, Plus, Globe, Users, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ROLE_LABELS } from "@shared/permissions";
import { ScopeSelector } from "./ScopeSelector";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import type { UserData, UserFormData } from "../types";
import type { Account } from "@shared/schema";

const ROLES = Object.entries(ROLE_LABELS);

// ─────────────────────────────────────────────────────────────────────────────
//  Doctor Assignment — ربط المستخدم بطبيب
// ─────────────────────────────────────────────────────────────────────────────
interface DoctorOption { id: string; name: string; }

function DoctorAssignmentRow({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [selectedDoctorId, setSelectedDoctorId] = useState("");

  const { data: doctors = [] } = useQuery<DoctorOption[]>({
    queryKey: ["/api/doctors", "includeInactive"],
    queryFn: () => apiRequest("GET", "/api/doctors?includeInactive=true").then(r => r.json()),
    staleTime: 30_000,
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

  if (isLoading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        ربط المستخدم بطبيب يتيح له استخدام ميزات الطبيب (المفضلة، كشف الحساب، نماذج الاستشارة...)
      </p>
      {assignedDoctor ? (
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
      ) : (
        <div className="flex items-center gap-2">
          <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
            <SelectTrigger className="flex-1 h-8 text-sm" data-testid="select-assign-doctor">
              <SelectValue placeholder="اختر طبيباً للربط..." />
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
            type="button"
            size="sm"
            variant="outline"
            className="gap-1 h-8"
            disabled={!selectedDoctorId || assignMutation.isPending}
            onClick={() => assignMutation.mutate(selectedDoctorId)}
            data-testid="button-assign-doctor"
          >
            {assignMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            ربط
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main Dialog
// ─────────────────────────────────────────────────────────────────────────────
interface UserFormDialogProps {
  open:              boolean;
  editingUser:       UserData | null;
  formData:          UserFormData;
  departments:       { id: string; nameAr: string }[];
  pharmacies:        { id: string; nameAr: string }[];
  clinics:           { id: string; nameAr: string }[];
  warehouses:        { id: string; nameAr: string }[];
  cashierAccounts:   { glAccountId: string; code: string; name: string; hasPassword: boolean }[];
  varianceAccounts:  Account[];
  isPending:         boolean;
  onFormChange:      (patch: Partial<UserFormData>) => void;
  onSave:            () => void;
  onOpenChange:      (v: boolean) => void;
}

export function UserFormDialog({
  open, editingUser, formData, departments, pharmacies, clinics, warehouses,
  cashierAccounts, varianceAccounts,
  isPending, onFormChange, onSave, onOpenChange,
}: UserFormDialogProps) {
  const showCashierScope = !!formData.cashierGlAccountId;
  const [showAdvancedVariance, setShowAdvancedVariance] = useState(
    !!(formData.cashierVarianceShortAccountId || formData.cashierVarianceOverAccountId)
  );
  const hasNoVarianceAccount = !formData.cashierVarianceAccountId &&
    !formData.cashierVarianceShortAccountId && !formData.cashierVarianceOverAccountId;

  const { data: groups = [] } = useQuery<{ id: string; name: string; isSystem: boolean; permissionCount: number; memberCount: number }[]>({
    queryKey: ["/api/permission-groups"],
    staleTime: 60_000,
  });

  const selectedGroup = groups.find(g => g.id === formData.permissionGroupId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {editingUser ? "تعديل مستخدم" : "إضافة مستخدم جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* ══ 1. البيانات الأساسية ══════════════════════════════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground pb-1 border-b">
              <Settings2 className="h-4 w-4" />
              البيانات الأساسية
            </div>

            <div className="space-y-1">
              <Label>اسم المستخدم</Label>
              <Input
                data-testid="input-user-username"
                value={formData.username}
                onChange={e => onFormChange({ username: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>{editingUser ? "تغيير كلمة المرور" : "كلمة المرور"}</Label>
              <Input
                data-testid="input-user-password"
                type="password"
                value={formData.password}
                placeholder={editingUser ? "اتركها فارغة للإبقاء على كلمة المرور الحالية" : ""}
                onChange={e => onFormChange({ password: e.target.value })}
              />
              {editingUser && !formData.password && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  كلمة المرور الحالية محفوظة
                </p>
              )}
              {editingUser && formData.password && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  سيتم تغيير كلمة المرور عند الحفظ
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input
                data-testid="input-user-fullname"
                value={formData.fullName}
                onChange={e => onFormChange({ fullName: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>الدور (Legacy)</Label>
              <Select
                value={formData.role}
                onValueChange={v => onFormChange({ role: v })}
              >
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                data-testid="checkbox-user-active"
                checked={formData.isActive}
                onCheckedChange={checked => onFormChange({ isActive: !!checked })}
              />
              <Label htmlFor="isActive">نشط</Label>
            </div>
          </div>

          {/* ══ 2. المجموعة ══════════════════════════════════════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground pb-1 border-b">
              <Users className="h-4 w-4" />
              مجموعة الصلاحيات
            </div>
            <div className="space-y-1">
              <Label>المجموعة المُسنَدة</Label>
              <Select
                value={formData.permissionGroupId || "__none__"}
                onValueChange={v => onFormChange({ permissionGroupId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger data-testid="select-user-permission-group">
                  <SelectValue placeholder="بدون مجموعة (يستخدم الدور)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون مجموعة (يستخدم دور legacy)</SelectItem>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="flex items-center gap-1.5">
                        {g.name}
                        {g.isSystem && (
                          <span className="text-[9px] text-blue-600 bg-blue-100 dark:bg-blue-900/40 rounded px-1">نظام</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                المجموعة هي المصدر الوحيد للصلاحيات — تُدار من صفحة مجموعات الصلاحيات
              </p>
            </div>

            {selectedGroup ? (
              <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="font-semibold text-blue-800 dark:text-blue-200">{selectedGroup.name}</span>
                  {selectedGroup.isSystem ? (
                    <Badge variant="secondary" className="text-[9px] mr-auto">نظام</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] mr-auto">مخصصة</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 pr-5 text-xs text-muted-foreground">
                  <span><span className="font-medium text-blue-700 dark:text-blue-300">{selectedGroup.permissionCount}</span> صلاحية نشطة</span>
                  <span>·</span>
                  <span><span className="font-medium">{selectedGroup.memberCount}</span> مستخدم في المجموعة</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
                <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-muted-foreground">بدون مجموعة — يعمل بصلاحيات الدور Legacy</span>
              </div>
            )}
          </div>

          {/* ══ 3. النطاق التشغيلي ═══════════════════════════════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground pb-1 border-b">
              <Globe className="h-4 w-4" />
              النطاق التشغيلي والإعدادات
            </div>

            <div className="space-y-1">
              <Label>الصيدلية الرئيسية</Label>
              <Select
                value={formData.pharmacyId || "none"}
                onValueChange={v => onFormChange({ pharmacyId: v === "none" ? "" : v })}
              >
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
              <Label>القسم الرئيسي</Label>
              <Select
                value={formData.departmentId || "none"}
                onValueChange={v => onFormChange({ departmentId: v === "none" ? "" : v })}
              >
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

            <div className="space-y-1">
              <Label>المخزن الافتراضي للبيع</Label>
              <Select
                value={formData.defaultWarehouseId || "none"}
                onValueChange={v => onFormChange({ defaultWarehouseId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-user-default-warehouse">
                  <SelectValue placeholder="اختر المخزن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">يُختار تلقائياً عند إنشاء فاتورة بيع</p>
            </div>

            <div className="space-y-1">
              <Label>المخزن الافتراضي للشراء</Label>
              <Select
                value={formData.defaultPurchaseWarehouseId || "none"}
                onValueChange={v => onFormChange({ defaultPurchaseWarehouseId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-user-default-purchase-warehouse">
                  <SelectValue placeholder="اختر المخزن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">يُختار تلقائياً عند إنشاء استلام أو فاتورة شراء</p>
            </div>

            {/* ── حساب الخزنة (الكاشير) ─────────────────────────────────── */}
            <div className="space-y-1">
              <Label>حساب الخزنة (للكاشير)</Label>
              <Select
                value={formData.cashierGlAccountId || "none"}
                onValueChange={v => onFormChange({ cashierGlAccountId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-user-cashier-gl">
                  <SelectValue placeholder="اختر حساب الخزنة..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون (لا يعمل كاشير)</SelectItem>
                  {cashierAccounts.map(a => (
                    <SelectItem key={a.glAccountId} value={a.glAccountId}>
                      <span className="flex items-center gap-1.5">
                        {a.code} - {a.name}
                        {a.hasPassword && (
                          <span className="text-[9px] text-amber-600 bg-amber-100 dark:bg-amber-900/40 rounded px-1">محمية</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">الحساب المحاسبي المخصص لهذا الكاشير</p>
            </div>

            {showCashierScope && (
              <>
                {/* ── نطاق الكاشير: كل الوحدات ──────────────────────────── */}
                <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/20">
                  <div className="space-y-0.5">
                    <Label htmlFor="all-cashier-units" className="text-sm font-medium cursor-pointer">
                      وصول لكل وحدات الكاشير
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      يتيح للكاشير العمل على جميع الصيدليات والأقسام بدون قيود
                    </p>
                  </div>
                  <Switch
                    id="all-cashier-units"
                    checked={formData.allCashierUnits}
                    onCheckedChange={v => onFormChange({ allCashierUnits: v })}
                    data-testid="switch-all-cashier-units"
                  />
                </div>

                {/* ── حساب فروق الجرد ────────────────────────────────────── */}
                <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">حساب فروق الجرد النقدي</p>
                  </div>

                  <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 p-2 text-xs text-blue-700 dark:text-blue-300">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong>حساب واحد يكفي:</strong> العجز يُسجَّل مديناً، والفائض يُسجَّل دائناً في نفس الحساب.
                      لتفصيل العجز عن الفائض، فعّل "إعدادات متقدمة".
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label>
                      حساب فروق الجرد
                      {!showAdvancedVariance && (
                        <span className="text-muted-foreground text-xs mr-1">— العجز مدين | الفائض دائن</span>
                      )}
                    </Label>
                    <div className={`flex items-center gap-1 ${hasNoVarianceAccount ? "ring-1 ring-destructive rounded-md" : ""}`}>
                      <div className="flex-1">
                        <AccountSearchSelect
                          accounts={varianceAccounts}
                          value={formData.cashierVarianceAccountId || ""}
                          onChange={v => onFormChange({ cashierVarianceAccountId: v })}
                          placeholder="ابحث عن حساب فروق الجرد..."
                          data-testid="select-user-variance-account"
                        />
                      </div>
                      {formData.cashierVarianceAccountId && (
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                          onClick={() => onFormChange({ cashierVarianceAccountId: "" })}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {hasNoVarianceAccount && (
                      <p className="text-xs text-destructive font-medium">
                        يجب تحديد حساب فروق — بدونه لن يتمكن الكاشير من إغلاق وردية بها فرق نقدي
                      </p>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedVariance(v => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="toggle-advanced-variance"
                    >
                      {showAdvancedVariance ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      إعدادات متقدمة — حسابات مفصّلة للعجز والفائض
                    </button>

                    {showAdvancedVariance && (
                      <div className="mt-2 space-y-3 border-r-2 border-muted pr-3">
                        <p className="text-xs text-muted-foreground">
                          اختياري — إن حُدِّدا، يأخذان الأولوية على الحساب الموحد أعلاه
                        </p>

                        <div className="space-y-1">
                          <Label className="text-xs">
                            حساب العجز
                            <span className="text-muted-foreground mr-1">(مدين عند عجز الكاشير)</span>
                          </Label>
                          <div className="flex items-center gap-1">
                            <div className="flex-1">
                              <AccountSearchSelect
                                accounts={varianceAccounts}
                                value={formData.cashierVarianceShortAccountId || ""}
                                onChange={v => onFormChange({ cashierVarianceShortAccountId: v })}
                                placeholder="ابحث عن حساب العجز..."
                                data-testid="select-user-variance-short-account"
                              />
                            </div>
                            {formData.cashierVarianceShortAccountId && (
                              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                                onClick={() => onFormChange({ cashierVarianceShortAccountId: "" })}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">
                            حساب الفائض
                            <span className="text-muted-foreground mr-1">(دائن عند فائض الكاشير)</span>
                          </Label>
                          <div className="flex items-center gap-1">
                            <div className="flex-1">
                              <AccountSearchSelect
                                accounts={varianceAccounts}
                                value={formData.cashierVarianceOverAccountId || ""}
                                onChange={v => onFormChange({ cashierVarianceOverAccountId: v })}
                                placeholder="ابحث عن حساب الفائض..."
                                data-testid="select-user-variance-over-account"
                              />
                            </div>
                            {formData.cashierVarianceOverAccountId && (
                              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                                onClick={() => onFormChange({ cashierVarianceOverAccountId: "" })}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── نطاق الوحدات (صيدليات / أقسام / عيادات) ──────────── */}
                {!formData.allCashierUnits && (
                  <ScopeSelector
                    pharmacies={pharmacies}
                    departments={departments}
                    clinics={clinics}
                    allowedPharmacyIds={formData.allowedPharmacyIds}
                    allowedDepartmentIds={formData.allowedDepartmentIds}
                    allowedClinicIds={formData.allowedClinicIds}
                    onPharmaciesChange={ids => onFormChange({ allowedPharmacyIds: ids })}
                    onDepartmentsChange={ids => onFormChange({ allowedDepartmentIds: ids })}
                    onClinicsChange={ids => onFormChange({ allowedClinicIds: ids })}
                  />
                )}
              </>
            )}

            {/* ── نطاق الأقسام والعيادات لغير الكاشير ──────── */}
            {!showCashierScope && (departments.length > 0 || clinics.length > 0) && (
              <ScopeSelector
                variant="general"
                pharmacies={[]}
                departments={departments}
                clinics={clinics}
                allowedPharmacyIds={[]}
                allowedDepartmentIds={formData.allowedDepartmentIds}
                allowedClinicIds={formData.allowedClinicIds}
                onPharmaciesChange={() => {}}
                onDepartmentsChange={ids => onFormChange({ allowedDepartmentIds: ids })}
                onClinicsChange={ids => onFormChange({ allowedClinicIds: ids })}
              />
            )}

            {/* ── ربط بطبيب (للمستخدمين الأطباء) ───────────────────────── */}
            {editingUser && (
              <div className="space-y-2 rounded-md border p-3 bg-muted/10">
                <div className="flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-medium text-blue-700">ربط بطبيب</p>
                </div>
                <DoctorAssignmentRow userId={editingUser.id} />
              </div>
            )}

          </div>

        </div>

        <DialogFooter>
          <Button onClick={onSave} disabled={isPending} data-testid="button-save-user">
            {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
