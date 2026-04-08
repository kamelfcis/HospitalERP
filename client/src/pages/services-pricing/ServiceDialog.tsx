import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRevenueAccounts } from "@/hooks/useAccounts";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { serviceTypeLabels } from "@shared/schema";
import { BUSINESS_CLASSIFICATION_LABELS } from "@shared/resolve-business-classification";
import type {
  ServiceWithDepartment, CostCenter, Warehouse, ServiceConsumableWithItem,
} from "@shared/schema";
import { DepartmentLookup, DoctorLookup } from "@/components/lookups";
import ConsumablesGrid from "@/components/ConsumablesGrid";

// ─── 1. ثوابت ─────────────────────────────────────────────────────────────────
const SERVICE_TYPES = ["SERVICE", "ACCOMMODATION", "OPERATING_ROOM", "NURSING", "DEVICE", "GAS", "OTHER"] as const;

/** فئات الخدمات الطبية الافتراضية — تُدمج مع الفئات الموجودة في قاعدة البيانات */
const DEFAULT_SERVICE_CATEGORIES = [
  "استشارات",
  "جراحات",
  "تحاليل مخبرية",
  "أشعة وتصوير",
  "إقامة",
  "اقامة",
  "غازات طبية",
  "غازات",
  "رعاية تمريضية",
  "طوارئ",
  "تخدير",
  "علاج طبيعي",
  "أخرى",
];

// ─── 2. أنواع ─────────────────────────────────────────────────────────────────
export interface ServiceFormState {
  code: string;
  nameAr: string;
  nameEn: string;
  departmentId: string;
  category: string;
  serviceType: string;
  businessClassification: string;
  defaultWarehouseId: string;
  revenueAccountId: string;
  costCenterId: string;
  basePrice: string;
  requiresDoctor: boolean;
  requiresNurse: boolean;
  isActive: boolean;
}

export type { ConsumableRow } from "@/components/ConsumablesGrid";
import type { ConsumableRow } from "@/components/ConsumablesGrid";

export const defaultServiceForm: ServiceFormState = {
  code: "", nameAr: "", nameEn: "", departmentId: "", category: "",
  serviceType: "SERVICE", businessClassification: "__none__",
  defaultWarehouseId: "", revenueAccountId: "",
  costCenterId: "", basePrice: "0", requiresDoctor: false, requiresNurse: false, isActive: true,
};

interface Props {
  open: boolean;
  onClose: () => void;
  editingService: ServiceWithDepartment | null;
  form: ServiceFormState;
  setForm: (fn: (prev: ServiceFormState) => ServiceFormState) => void;
  consumables: ConsumableRow[];
  setConsumables: (fn: (prev: ConsumableRow[]) => ConsumableRow[]) => void;
  onSave: () => void;
  saving: boolean;
}

// ─── 3. مكون رئيسي ────────────────────────────────────────────────────────────
/**
 * ServiceDialog
 * ديالوج إنشاء خدمة جديدة أو تعديل خدمة قائمة.
 *
 * ملاحظات التصميم:
 *  - محتوى النموذج قابل للتمرير بحيث يظل الرأس والتذييل ثابتَين دائماً.
 *  - حقل "الفئة" قائمة منسدلة مع دعم الفئات الموجودة في قاعدة البيانات.
 *  - حقل "السعر الاحتياطي" احتياطي فقط (Layer 3 في محرك التسعير) ولا يُمثّل
 *    سعر التشغيل الأساسي — التسعير يكون من خلال قوائم الأسعار.
 */
export default function ServiceDialog({
  open, onClose, editingService, form, setForm, consumables, setConsumables, onSave, saving,
}: Props) {
  const { data: warehouses }  = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });
  const { data: revenueAccounts } = useRevenueAccounts();
  const { data: costCenters } = useQuery<CostCenter[]>({ queryKey: ["/api/cost-centers"] });

  // تحميل فئات الخدمات من قاعدة البيانات
  const { data: dbCategories = [] } = useQuery<string[]>({ queryKey: ["/api/service-categories"] });

  // دمج الفئات الافتراضية مع الفئات الموجودة في DB (بدون تكرار)
  const allCategories = useMemo(() => {
    const merged = new Set([...DEFAULT_SERVICE_CATEGORIES, ...dbCategories]);
    return Array.from(merged).filter(Boolean);
  }, [dbCategories]);

  // تحميل مستهلكات الخدمة عند فتح التعديل
  useEffect(() => {
    if (editingService) {
      fetch(`/api/services/${editingService.id}/consumables`, { credentials: "include" })
        .then(r => r.json())
        .then((data: ServiceConsumableWithItem[]) => {
          setConsumables(() => data.map(c => ({
            itemId: c.itemId,
            quantity: String(c.quantity),
            unitLevel: c.unitLevel,
            notes: c.notes || "",
            item: c.item,
          })));
        })
        .catch(() => {});
    }
  }, [editingService]);

  function handleClose() { onClose(); }

  const canSave = !!(
    form.code && form.nameAr && form.departmentId &&
    form.serviceType && form.revenueAccountId && form.costCenterId
  );

  const set = (key: keyof ServiceFormState, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      {/* max-h-[90vh] + flex flex-col تضمن أن الرأس والتذييل ثابتان والمحتوى قابل للتمرير */}
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0" dir="rtl">

        {/* ── رأس ثابت ─────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>{editingService ? "تعديل خدمة" : "إضافة خدمة جديدة"}</DialogTitle>
        </DialogHeader>

        {/* ── منطقة التمرير ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* ─── حقول الخدمة الأساسية ─────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">

            <div className="space-y-1">
              <Label>الكود *</Label>
              <Input data-testid="input-service-code" value={form.code}
                onChange={e => set("code", e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>الاسم (عربي) *</Label>
              <Input data-testid="input-service-nameAr" value={form.nameAr}
                onChange={e => set("nameAr", e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>الاسم (إنجليزي)</Label>
              <Input data-testid="input-service-nameEn" value={form.nameEn}
                onChange={e => set("nameEn", e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>القسم *</Label>
              <DepartmentLookup
                value={form.departmentId}
                onChange={(item) => set("departmentId", item?.id || "")}
                placeholder="اختر القسم"
                clearable={false}
                data-testid="select-trigger-service-department"
              />
            </div>

            {/* الفئة: قائمة منسدلة بدلاً من نص حر */}
            <div className="space-y-1">
              <Label>الفئة</Label>
              <Select
                value={form.category || "__none__"}
                onValueChange={v => set("category", v === "__none__" ? "" : v)}
              >
                <SelectTrigger data-testid="select-trigger-service-category">
                  <SelectValue placeholder="اختر الفئة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— بدون فئة —</SelectItem>
                  {allCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>النوع *</Label>
              <Select value={form.serviceType} onValueChange={v => set("serviceType", v)}>
                <SelectTrigger data-testid="select-trigger-service-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{serviceTypeLabels[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>التصنيف التجاري</Label>
              <Select
                value={form.businessClassification || "__none__"}
                onValueChange={v => set("businessClassification", v === "__none__" ? "" : v)}
              >
                <SelectTrigger data-testid="select-trigger-service-biz-class">
                  <SelectValue placeholder="اختياري" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— غير محدد —</SelectItem>
                  {(Object.entries(BUSINESS_CLASSIFICATION_LABELS) as [string, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>المستودع الافتراضي</Label>
              <Select
                value={form.defaultWarehouseId || "none"}
                onValueChange={v => set("defaultWarehouseId", v === "none" ? "" : v)}
              >
                <SelectTrigger data-testid="select-trigger-service-warehouse">
                  <SelectValue placeholder="اختياري" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {(warehouses || []).map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>حساب الإيراد *</Label>
              <AccountSearchSelect
                accounts={revenueAccounts || []}
                value={form.revenueAccountId}
                onChange={v => set("revenueAccountId", v)}
                placeholder="ابحث عن حساب الإيراد..."
                data-testid="select-service-revenue-account"
              />
            </div>

            <div className="space-y-1">
              <Label>مركز التكلفة *</Label>
              <Select value={form.costCenterId} onValueChange={v => set("costCenterId", v)}>
                <SelectTrigger data-testid="select-trigger-service-cost-center">
                  <SelectValue placeholder="اختر مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  {(costCenters || []).map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* السعر الاحتياطي — المرحلة الثالثة في محرك التسعير */}
            <div className="space-y-1">
              <Label className="flex items-baseline gap-1">
                السعر الاحتياطي
                <span className="text-[10px] font-normal text-muted-foreground">(احتياطي عند غياب قائمة أسعار)</span>
              </Label>
              <Input data-testid="input-service-basePrice" type="number" min="0" step="0.01"
                value={form.basePrice} onChange={e => set("basePrice", e.target.value)} />
              <p className="text-[10px] text-muted-foreground leading-tight">
                يُستخدم أيضاً كسعر يومي لخدمات الإقامة. التسعير الرئيسي عبر قوائم الأسعار.
              </p>
            </div>

            <div className="flex items-center gap-6 col-span-2 flex-wrap pt-1">
              <div className="flex items-center gap-2">
                <Checkbox id="svc-requires-doctor" checked={form.requiresDoctor}
                  onCheckedChange={v => set("requiresDoctor", !!v)}
                  data-testid="checkbox-service-requires-doctor" />
                <Label htmlFor="svc-requires-doctor">تتطلب طبيب</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="svc-requires-nurse" checked={form.requiresNurse}
                  onCheckedChange={v => set("requiresNurse", !!v)}
                  data-testid="checkbox-service-requires-nurse" />
                <Label htmlFor="svc-requires-nurse">تتطلب ممرض</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="svc-active" checked={form.isActive}
                  onCheckedChange={v => set("isActive", !!v)}
                  data-testid="checkbox-service-active" />
                <Label htmlFor="svc-active">نشط</Label>
              </div>
            </div>
          </div>

          {/* ─── المستهلكات ────────────────────────────────────────────── */}
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold">المستهلكات المرتبطة بالخدمة</Label>
            <p className="text-xs text-muted-foreground mb-2">
              حدد الأصناف التي تُستهلك عند تقديم هذه الخدمة (مثال: سرنجة، كوب تحليل)
            </p>
            <ConsumablesGrid
              consumables={consumables}
              onChange={rows => setConsumables(() => rows)}
              isEditing={true}
            />
          </div>

          {/* ─── تخصيص السعر حسب الطبيب (تعديل فقط) ─────────────────── */}
          {editingService && <DoctorPricingSection serviceId={editingService.id} />}

        </div>

        {/* ── تذييل ثابت ───────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-service">إلغاء</Button>
          <Button onClick={onSave} disabled={saving || !canSave} data-testid="button-save-service">
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            حفظ
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

// ─── DoctorPricingSection ─────────────────────────────────────────────────────
interface DoctorPrice { id: string; serviceId: string; doctorId: string; price: string; doctorName: string; specialty?: string; }

function DoctorPricingSection({ serviceId }: { serviceId: string }) {
  const { toast } = useToast();
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [price, setPrice] = useState("");

  const { data: doctorPrices = [] } = useQuery<DoctorPrice[]>({
    queryKey: ["/api/clinic-service-doctor-prices", serviceId],
    queryFn: () => apiRequest("GET", `/api/clinic-service-doctor-prices/${serviceId}`).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (data: { serviceId: string; doctorId: string; price: number }) =>
      apiRequest("POST", "/api/clinic-service-doctor-prices", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-service-doctor-prices", serviceId] });
      setSelectedDoctorId("");
      setPrice("");
      toast({ title: "تم تخصيص السعر" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطأ", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/clinic-service-doctor-prices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-service-doctor-prices", serviceId] });
      toast({ title: "تم الحذف" });
    },
  });

  const handleAdd = () => {
    if (!selectedDoctorId || !price) return;
    addMutation.mutate({ serviceId, doctorId: selectedDoctorId, price: parseFloat(price) || 0 });
  };

  return (
    <div className="border-t pt-4">
      <Label className="text-sm font-semibold">تخصيص السعر حسب الطبيب</Label>
      <p className="text-xs text-muted-foreground mb-2">
        حدد سعر مختلف لكل طبيب — لو مفيش تخصيص بيستخدم السعر الاحتياطي
      </p>

      <div className="flex items-end gap-2 mb-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">الطبيب</Label>
          <DoctorLookup
            value={selectedDoctorId}
            onChange={(item) => setSelectedDoctorId(item?.id || "")}
            placeholder="ابحث عن طبيب..."
            clearable
            data-testid="select-doctor-price"
          />
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-xs">السعر</Label>
          <Input
            type="number" min="0" step="0.01" value={price}
            onChange={e => setPrice(e.target.value)}
            className="h-8 text-xs"
            data-testid="input-doctor-price"
          />
        </div>
        <Button
          size="sm" className="h-8 gap-1 text-xs"
          onClick={handleAdd}
          disabled={!selectedDoctorId || !price || addMutation.isPending}
          data-testid="button-add-doctor-price"
        >
          {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
          إضافة
        </Button>
      </div>

      {doctorPrices.length > 0 ? (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-right p-1.5">الطبيب</th>
                <th className="text-right p-1.5 w-24">السعر</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {doctorPrices.map(dp => (
                <tr key={dp.id} className="border-t" data-testid={`doctor-price-row-${dp.doctorId}`}>
                  <td className="p-1.5">
                    <span className="font-medium">{dp.doctorName}</span>
                    {dp.specialty && <span className="text-muted-foreground mr-1">({dp.specialty})</span>}
                  </td>
                  <td className="p-1.5 font-semibold text-emerald-700">
                    {parseFloat(String(dp.price)).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </td>
                  <td className="p-1.5">
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => deleteMutation.mutate(dp.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-remove-doctor-price-${dp.doctorId}`}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground text-center py-3 border rounded-md bg-muted/20">
          لم يتم تخصيص أسعار لأطباء بعد — سيتم استخدام السعر الاحتياطي لجميع الأطباء
        </div>
      )}
    </div>
  );
}
