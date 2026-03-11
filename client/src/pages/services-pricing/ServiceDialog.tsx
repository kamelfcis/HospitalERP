import { useState, useEffect } from "react";
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
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { serviceTypeLabels } from "@shared/schema";
import type {
  ServiceWithDepartment, CostCenter, Warehouse, Item, ServiceConsumableWithItem,
} from "@shared/schema";
import { DepartmentLookup, DoctorLookup } from "@/components/lookups";

// ─── 1. ثوابت ─────────────────────────────────────────────────────────────────
const SERVICE_TYPES = ["SERVICE", "ACCOMMODATION", "OPERATING_ROOM", "DEVICE", "GAS", "OTHER"] as const;

// ─── 2. أنواع ─────────────────────────────────────────────────────────────────
export interface ServiceFormState {
  code: string;
  nameAr: string;
  nameEn: string;
  departmentId: string;
  category: string;
  serviceType: string;
  defaultWarehouseId: string;
  revenueAccountId: string;
  costCenterId: string;
  basePrice: string;
  requiresDoctor: boolean;
  requiresNurse: boolean;
  isActive: boolean;
}

export type ConsumableRow = {
  itemId: string;
  quantity: string;
  unitLevel: string;
  notes: string;
  item?: Item;
};

export const defaultServiceForm: ServiceFormState = {
  code: "", nameAr: "", nameEn: "", departmentId: "", category: "",
  serviceType: "SERVICE", defaultWarehouseId: "", revenueAccountId: "",
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
 * يشمل حقول الخدمة الأساسية + محرر المستهلكات المرتبطة.
 */
export default function ServiceDialog({
  open, onClose, editingService, form, setForm, consumables, setConsumables, onSave, saving,
}: Props) {
  const [consumableSearch, setConsumableSearch] = useState("");
  const [consumableResults, setConsumableResults] = useState<Item[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);

  const { data: warehouses }  = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });
  const { data: revenueAccounts } = useRevenueAccounts();
  const { data: costCenters } = useQuery<CostCenter[]>({ queryKey: ["/api/cost-centers"] });

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

  // بحث الأصناف للمستهلكات
  useEffect(() => {
    if (!consumableSearch || consumableSearch.length < 2) {
      setConsumableResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingItems(true);
    fetch(`/api/items?search=${encodeURIComponent(consumableSearch)}&limit=10&page=1`, {
      signal: controller.signal, credentials: "include",
    })
      .then(r => r.json())
      .then(data => {
        const existingIds = new Set(consumables.map(c => c.itemId));
        setConsumableResults((data.items || []).filter((i: Item) => !existingIds.has(i.id)));
        setSearchingItems(false);
      })
      .catch(() => setSearchingItems(false));
    return () => controller.abort();
  }, [consumableSearch]);

  function handleClose() {
    setConsumableSearch("");
    setConsumableResults([]);
    onClose();
  }

  function addConsumable(item: Item) {
    setConsumables(prev => [...prev, { itemId: item.id, quantity: "1", unitLevel: "minor", notes: "", item }]);
    setConsumableSearch("");
    setConsumableResults([]);
  }

  function removeConsumable(idx: number) {
    setConsumables(prev => prev.filter((_, i) => i !== idx));
  }

  function updateConsumable(idx: number, field: string, value: string) {
    setConsumables(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  const canSave = !!(
    form.code && form.nameAr && form.departmentId &&
    form.serviceType && form.revenueAccountId && form.costCenterId && form.basePrice
  );

  const set = (key: keyof ServiceFormState, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editingService ? "تعديل خدمة" : "إضافة خدمة جديدة"}</DialogTitle>
        </DialogHeader>

        {/* ─── حقول الخدمة ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">

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

          <div className="space-y-1">
            <Label>الفئة</Label>
            <Input data-testid="input-service-category" value={form.category}
              onChange={e => set("category", e.target.value)} />
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

          <div className="space-y-1">
            <Label>السعر الأساسي *</Label>
            <Input data-testid="input-service-basePrice" type="number" min="0" step="0.01"
              value={form.basePrice} onChange={e => set("basePrice", e.target.value)} />
          </div>

          <div className="flex items-center gap-6 col-span-2 flex-wrap">
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

        {/* ─── المستهلكات ────────────────────────────────────────────────── */}
        <div className="border-t pt-3 mt-2">
          <Label className="text-sm font-semibold">المستهلكات المرتبطة بالخدمة</Label>
          <p className="text-xs text-muted-foreground mb-2">
            حدد الأصناف التي تُستهلك عند تقديم هذه الخدمة (مثال: سرنجة، كوب تحليل)
          </p>

          <div className="relative mb-2">
            <Input
              data-testid="input-consumable-search"
              placeholder="ابحث عن صنف لإضافته..."
              value={consumableSearch}
              onChange={e => setConsumableSearch(e.target.value)}
              className="peachtree-input"
            />
            {searchingItems && (
              <Loader2 className="h-3 w-3 animate-spin absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            )}
            {consumableResults.length > 0 && (
              <div className="absolute z-50 top-full right-0 left-0 mt-1 bg-background border rounded-md shadow-md max-h-40 overflow-auto">
                {consumableResults.map(item => (
                  <div
                    key={item.id}
                    className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex items-center justify-between"
                    onClick={() => addConsumable(item)}
                    data-testid={`consumable-result-${item.id}`}
                  >
                    <span>{item.nameAr} ({item.itemCode})</span>
                    <span className="text-muted-foreground">{item.minorUnitName || item.majorUnitName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {consumables.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-right p-1.5">الصنف</th>
                    <th className="text-right p-1.5 w-20">الكمية</th>
                    <th className="text-right p-1.5 w-28">الوحدة</th>
                    <th className="text-right p-1.5 w-32">ملاحظات</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {consumables.map((c, idx) => (
                    <tr key={c.itemId} className="border-t" data-testid={`consumable-row-${idx}`}>
                      <td className="p-1.5">
                        <span className="font-medium">{c.item?.nameAr || c.itemId}</span>
                        {c.item?.itemCode && (
                          <span className="text-muted-foreground mr-1">({c.item.itemCode})</span>
                        )}
                      </td>
                      <td className="p-1.5">
                        <Input data-testid={`input-consumable-qty-${idx}`} type="number"
                          min="0.01" step="0.01" value={c.quantity}
                          onChange={e => updateConsumable(idx, "quantity", e.target.value)}
                          className="h-7 text-xs w-full" />
                      </td>
                      <td className="p-1.5">
                        <Select value={c.unitLevel} onValueChange={v => updateConsumable(idx, "unitLevel", v)}>
                          <SelectTrigger className="h-7 text-xs" data-testid={`select-consumable-unit-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {c.item?.minorUnitName  && <SelectItem value="minor">{c.item.minorUnitName}</SelectItem>}
                            {c.item?.mediumUnitName && <SelectItem value="medium">{c.item.mediumUnitName}</SelectItem>}
                            {c.item?.majorUnitName  && <SelectItem value="major">{c.item.majorUnitName}</SelectItem>}
                            {!c.item?.minorUnitName && !c.item?.mediumUnitName && !c.item?.majorUnitName && (
                              <>
                                <SelectItem value="minor">صغرى</SelectItem>
                                <SelectItem value="medium">وسطى</SelectItem>
                                <SelectItem value="major">كبرى</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1.5">
                        <Input data-testid={`input-consumable-notes-${idx}`} value={c.notes}
                          onChange={e => updateConsumable(idx, "notes", e.target.value)}
                          className="h-7 text-xs w-full" placeholder="اختياري" />
                      </td>
                      <td className="p-1.5">
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => removeConsumable(idx)}
                          data-testid={`button-remove-consumable-${idx}`}>
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
              لا توجد مستهلكات مرتبطة - ابحث عن صنف لإضافته
            </div>
          )}
        </div>

        {editingService && <DoctorPricingSection serviceId={editingService.id} />}

        <DialogFooter>
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
    <div className="border-t pt-3 mt-2">
      <Label className="text-sm font-semibold">تخصيص السعر حسب الطبيب</Label>
      <p className="text-xs text-muted-foreground mb-2">
        حدد سعر مختلف لكل طبيب — لو مفيش تخصيص بيستخدم السعر الأساسي
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
          لم يتم تخصيص أسعار لأطباء بعد — سيتم استخدام السعر الأساسي لجميع الأطباء
        </div>
      )}
    </div>
  );
}
