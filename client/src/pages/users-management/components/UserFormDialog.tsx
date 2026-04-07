import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, ChevronDown, ChevronUp, Info }  from "lucide-react";
import { ROLE_LABELS } from "@shared/permissions";
import { ScopeSelector } from "./ScopeSelector";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import type { UserData, UserFormData } from "../types";
import type { Account } from "@shared/schema";

const ROLES = Object.entries(ROLE_LABELS);

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
  const showScope = !!formData.cashierGlAccountId;
  const [showAdvancedVariance, setShowAdvancedVariance] = useState(
    !!(formData.cashierVarianceShortAccountId || formData.cashierVarianceOverAccountId)
  );
  const hasNoVarianceAccount = !formData.cashierVarianceAccountId &&
    !formData.cashierVarianceShortAccountId && !formData.cashierVarianceOverAccountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
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
                كلمة المرور الحالية محفوظة — لن تتغير عند الحفظ
              </p>
            )}
            {editingUser && formData.password && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
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
            <Label>الدور</Label>
            <Select value={formData.role} onValueChange={v => onFormChange({ role: v })}>
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
                <SelectValue placeholder="اختر المخزن الافتراضي للبيع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              يُختار تلقائياً عند إنشاء فاتورة بيع جديدة
            </p>
          </div>

          <div className="space-y-1">
            <Label>المخزن الافتراضي للشراء</Label>
            <Select
              value={formData.defaultPurchaseWarehouseId || "none"}
              onValueChange={v => onFormChange({ defaultPurchaseWarehouseId: v === "none" ? "" : v })}
            >
              <SelectTrigger data-testid="select-user-default-purchase-warehouse">
                <SelectValue placeholder="اختر المخزن الافتراضي للشراء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              يُختار تلقائياً عند إنشاء استلام أو فاتورة شراء جديدة
            </p>
          </div>

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
            <p className="text-xs text-muted-foreground">
              الحساب المحاسبي المخصص لهذا الكاشير
            </p>
          </div>

          {formData.cashierGlAccountId && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">حساب فروق الجرد النقدي</p>
              </div>

              {/* إشعار توضيحي */}
              <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 p-2 text-xs text-blue-700 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>حساب واحد يكفي:</strong> العجز يُسجَّل مديناً، والفائض يُسجَّل دائناً في نفس الحساب.
                  لتفصيل العجز عن الفائض في حسابين منفصلين، فعّل "إعدادات متقدمة" أدناه.
                </span>
              </div>

              {/* الحقل الرئيسي — حساب الفروق الموحد */}
              <div className="space-y-1">
                <Label>
                  حساب فروق الجرد
                  {!showAdvancedVariance && (
                    <span className="text-muted-foreground text-xs mr-1">
                      — العجز مدين | الفائض دائن
                    </span>
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

              {/* إعدادات متقدمة — حسابات عجز/فائض منفصلة */}
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
          )}

          {showScope && (
            <ScopeSelector
              pharmacies={pharmacies}
              departments={departments}
              clinics={clinics}
              allowedPharmacyIds={formData.allowedPharmacyIds}
              allowedDepartmentIds={formData.allowedDepartmentIds}
              allowedClinicIds={formData.allowedClinicIds}
              hasAllUnits={formData.hasAllUnits}
              onPharmaciesChange={ids => onFormChange({ allowedPharmacyIds: ids })}
              onDepartmentsChange={ids => onFormChange({ allowedDepartmentIds: ids })}
              onClinicsChange={ids => onFormChange({ allowedClinicIds: ids })}
              onAllUnitsChange={v => onFormChange({ hasAllUnits: v })}
            />
          )}

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
