import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, Copy, Settings2, Eye, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/formatters";
import type {
  Service, ServiceWithDepartment, PriceList, PriceListItem,
  PriceListItemWithService, Department, Account, CostCenter, Warehouse,
  Item, ServiceConsumableWithItem
} from "@shared/schema";
import { serviceTypeLabels } from "@shared/schema";
import { Trash2 } from "lucide-react";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const SERVICE_TYPES = ["SERVICE", "ACCOMMODATION", "DEVICE", "GAS", "OTHER"] as const;

function ServicesTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filterDept, setFilterDept] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterActive, setFilterActive] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceWithDepartment | null>(null);

  const [form, setForm] = useState({
    code: "", nameAr: "", nameEn: "", departmentId: "", category: "",
    serviceType: "SERVICE", defaultWarehouseId: "", revenueAccountId: "",
    costCenterId: "", basePrice: "0", isActive: true,
  });

  const [consumables, setConsumables] = useState<{ itemId: string; quantity: string; unitLevel: string; notes: string; item?: any }[]>([]);
  const [consumableSearch, setConsumableSearch] = useState("");
  const [consumableResults, setConsumableResults] = useState<Item[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);

  useEffect(() => { setPage(1); }, [debouncedSearch, filterDept, filterCategory, filterActive]);

  useEffect(() => {
    if (!consumableSearch || consumableSearch.length < 2) {
      setConsumableResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingItems(true);
    fetch(`/api/items?search=${encodeURIComponent(consumableSearch)}&limit=10&page=1`, { signal: controller.signal, credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const existingIds = new Set(consumables.map(c => c.itemId));
        setConsumableResults((data.items || []).filter((i: Item) => !existingIds.has(i.id)));
        setSearchingItems(false);
      })
      .catch(() => setSearchingItems(false));
    return () => controller.abort();
  }, [consumableSearch]);

  useEffect(() => {
    if (editingService) {
      fetch(`/api/services/${editingService.id}/consumables`, { credentials: "include" })
        .then(r => r.json())
        .then((data: ServiceConsumableWithItem[]) => {
          setConsumables(data.map(c => ({
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

  const qp = new URLSearchParams();
  if (debouncedSearch) qp.set("search", debouncedSearch);
  if (filterDept !== "all") qp.set("departmentId", filterDept);
  if (filterCategory !== "all") qp.set("category", filterCategory);
  if (filterActive !== "all") qp.set("active", filterActive);
  qp.set("page", String(page));
  qp.set("pageSize", String(pageSize));

  const { data: servicesData, isLoading } = useQuery<{ data: ServiceWithDepartment[]; total: number }>({
    queryKey: ["/api/services", qp.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/services?${qp.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });
  const { data: categories } = useQuery<string[]>({ queryKey: ["/api/service-categories"] });
  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ["/api/accounts?pageSize=5000"] });
  const { data: costCenters } = useQuery<CostCenter[]>({ queryKey: ["/api/cost-centers"] });

  const services = servicesData?.data || [];
  const total = servicesData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/services", data);
      return res.json();
    },
    onSuccess: async (created: any) => {
      if (created?.id && consumables.length > 0) {
        await apiRequest("PUT", `/api/services/${created.id}/consumables`, consumables.map(c => ({
          itemId: c.itemId, quantity: c.quantity, unitLevel: c.unitLevel, notes: c.notes || null,
        })));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "تم إنشاء الخدمة بنجاح" });
      closeModal();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PUT", `/api/services/${id}`, data);
      return id;
    },
    onSuccess: async (serviceId: string) => {
      await apiRequest("PUT", `/api/services/${serviceId}/consumables`, consumables.map(c => ({
        itemId: c.itemId, quantity: c.quantity, unitLevel: c.unitLevel, notes: c.notes || null,
      })));
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "تم تحديث الخدمة بنجاح" });
      closeModal();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/services/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingService(null);
    setForm({ code: "", nameAr: "", nameEn: "", departmentId: "", category: "", serviceType: "SERVICE", defaultWarehouseId: "", revenueAccountId: "", costCenterId: "", basePrice: "0", isActive: true });
    setConsumables([]);
    setConsumableSearch("");
    setConsumableResults([]);
    setModalOpen(true);
  }

  function openEdit(s: ServiceWithDepartment) {
    setEditingService(s);
    setForm({
      code: s.code, nameAr: s.nameAr, nameEn: s.nameEn || "",
      departmentId: s.departmentId, category: s.category || "",
      serviceType: s.serviceType, defaultWarehouseId: s.defaultWarehouseId || "",
      revenueAccountId: s.revenueAccountId, costCenterId: s.costCenterId,
      basePrice: String(s.basePrice), isActive: s.isActive,
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditingService(null); setConsumables([]); setConsumableSearch(""); setConsumableResults([]); }

  function handleSave() {
    const payload = {
      ...form,
      basePrice: form.basePrice,
      defaultWarehouseId: form.defaultWarehouseId || null,
      nameEn: form.nameEn || null,
      category: form.category || null,
    };
    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function addConsumable(item: Item) {
    setConsumables(prev => [...prev, {
      itemId: item.id,
      quantity: "1",
      unitLevel: "minor",
      notes: "",
      item,
    }]);
    setConsumableSearch("");
    setConsumableResults([]);
  }

  function removeConsumable(idx: number) {
    setConsumables(prev => prev.filter((_, i) => i !== idx));
  }

  function updateConsumable(idx: number, field: string, value: string) {
    setConsumables(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  const canSave = form.code && form.nameAr && form.departmentId && form.serviceType && form.revenueAccountId && form.costCenterId && form.basePrice;

  if (isLoading) {
    return (
      <div className="p-2 space-y-2" dir="rtl">
        <div className="peachtree-toolbar">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="peachtree-grid">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 border-b">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1" dir="rtl">
      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <Button size="sm" className="text-xs gap-1" onClick={openCreate} data-testid="button-add-service">
          <Plus className="h-3 w-3" />
          إضافة خدمة
        </Button>
        <div className="flex items-center gap-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input
            data-testid="input-search-services"
            placeholder="بحث بالكود أو الاسم..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="peachtree-input w-64"
          />
        </div>
        <span className="text-xs font-medium">القسم:</span>
        <Select value={filterDept} onValueChange={setFilterDept} data-testid="select-filter-department">
          <SelectTrigger className="peachtree-select w-28" data-testid="select-trigger-filter-department">
            <SelectValue placeholder="القسم" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {(departments || []).map(d => (
              <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-medium">الفئة:</span>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="peachtree-select w-28" data-testid="select-trigger-filter-category">
            <SelectValue placeholder="الفئة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفئات</SelectItem>
            {(categories || []).map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-medium">الحالة:</span>
        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="peachtree-select w-24" data-testid="select-trigger-filter-active">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="true">نشط</SelectItem>
            <SelectItem value="false">غير نشط</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="peachtree-grid overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="peachtree-grid-header" data-testid="header-services-table">
              <th>الكود</th>
              <th>الاسم</th>
              <th>القسم</th>
              <th>الفئة</th>
              <th>النوع</th>
              <th>السعر الأساسي</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground" data-testid="text-empty-services">
                  لا توجد خدمات
                </td>
              </tr>
            ) : (
              services.map(s => (
                <tr key={s.id} className="peachtree-grid-row" data-testid={`row-service-${s.id}`}>
                  <td className="font-mono leading-tight">{s.code}</td>
                  <td className="leading-tight">{s.nameAr}</td>
                  <td className="leading-tight">{s.department?.nameAr || "-"}</td>
                  <td className="leading-tight">{s.category || "-"}</td>
                  <td className="leading-tight">{serviceTypeLabels[s.serviceType] || s.serviceType}</td>
                  <td className="peachtree-amount leading-tight">{formatNumber(s.basePrice)}</td>
                  <td>
                    {s.isActive ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 leading-tight bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer no-default-active-elevate"
                        onClick={() => toggleActiveMutation.mutate({ id: s.id, isActive: !s.isActive })}
                        data-testid={`badge-active-${s.id}`}
                      >
                        نشط
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 leading-tight bg-red-50 text-red-700 border-red-200 cursor-pointer no-default-active-elevate"
                        onClick={() => toggleActiveMutation.mutate({ id: s.id, isActive: !s.isActive })}
                        data-testid={`badge-active-${s.id}`}
                      >
                        غير نشط
                      </Badge>
                    )}
                  </td>
                  <td>
                    <Button size="icon" variant="ghost" className="[&_svg]:h-2.5 [&_svg]:w-2.5" onClick={() => openEdit(s)} data-testid={`button-edit-service-${s.id}`}>
                      <Pencil className="h-2.5 w-2.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="peachtree-toolbar flex items-center justify-between">
          <span className="text-xs text-muted-foreground" data-testid="text-services-pagination">
            صفحة {page} من {totalPages} ({total} خدمة)
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page-services">
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page-services">
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={v => { if (!v) closeModal(); }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingService ? "تعديل خدمة" : "إضافة خدمة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>الكود *</Label>
              <Input data-testid="input-service-code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>الاسم (عربي) *</Label>
              <Input data-testid="input-service-nameAr" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>الاسم (إنجليزي)</Label>
              <Input data-testid="input-service-nameEn" value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>القسم *</Label>
              <Select value={form.departmentId} onValueChange={v => setForm(f => ({ ...f, departmentId: v }))}>
                <SelectTrigger data-testid="select-trigger-service-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {(departments || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الفئة</Label>
              <Input data-testid="input-service-category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>النوع *</Label>
              <Select value={form.serviceType} onValueChange={v => setForm(f => ({ ...f, serviceType: v }))}>
                <SelectTrigger data-testid="select-trigger-service-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{serviceTypeLabels[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المستودع الافتراضي</Label>
              <Select value={form.defaultWarehouseId || "none"} onValueChange={v => setForm(f => ({ ...f, defaultWarehouseId: v === "none" ? "" : v }))}>
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
              <Select value={form.revenueAccountId} onValueChange={v => setForm(f => ({ ...f, revenueAccountId: v }))}>
                <SelectTrigger data-testid="select-trigger-service-revenue-account">
                  <SelectValue placeholder="اختر الحساب" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts || []).filter(a => a.accountType === "revenue").map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>مركز التكلفة *</Label>
              <Select value={form.costCenterId} onValueChange={v => setForm(f => ({ ...f, costCenterId: v }))}>
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
              <Input data-testid="input-service-basePrice" type="number" min="0" step="0.01" value={form.basePrice} onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Checkbox
                id="svc-active"
                checked={form.isActive}
                onCheckedChange={v => setForm(f => ({ ...f, isActive: !!v }))}
                data-testid="checkbox-service-active"
              />
              <Label htmlFor="svc-active">نشط</Label>
            </div>
          </div>

          <div className="border-t pt-3 mt-2">
            <Label className="text-sm font-semibold">المستهلكات المرتبطة بالخدمة</Label>
            <p className="text-xs text-muted-foreground mb-2">حدد الأصناف التي تُستهلك عند تقديم هذه الخدمة (مثال: سرنجة، كوب تحليل)</p>

            <div className="relative mb-2">
              <Input
                data-testid="input-consumable-search"
                placeholder="ابحث عن صنف لإضافته..."
                value={consumableSearch}
                onChange={e => setConsumableSearch(e.target.value)}
                className="peachtree-input"
              />
              {searchingItems && <Loader2 className="h-3 w-3 animate-spin absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />}
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

            {consumables.length > 0 && (
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
                          {c.item?.itemCode && <span className="text-muted-foreground mr-1">({c.item.itemCode})</span>}
                        </td>
                        <td className="p-1.5">
                          <Input
                            data-testid={`input-consumable-qty-${idx}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={c.quantity}
                            onChange={e => updateConsumable(idx, "quantity", e.target.value)}
                            className="h-7 text-xs w-full"
                          />
                        </td>
                        <td className="p-1.5">
                          <Select value={c.unitLevel} onValueChange={v => updateConsumable(idx, "unitLevel", v)}>
                            <SelectTrigger className="h-7 text-xs" data-testid={`select-consumable-unit-${idx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {c.item?.minorUnitName && <SelectItem value="minor">{c.item.minorUnitName}</SelectItem>}
                              {c.item?.mediumUnitName && <SelectItem value="medium">{c.item.mediumUnitName}</SelectItem>}
                              {c.item?.majorUnitName && <SelectItem value="major">{c.item.majorUnitName}</SelectItem>}
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
                          <Input
                            data-testid={`input-consumable-notes-${idx}`}
                            value={c.notes}
                            onChange={e => updateConsumable(idx, "notes", e.target.value)}
                            className="h-7 text-xs w-full"
                            placeholder="اختياري"
                          />
                        </td>
                        <td className="p-1.5">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeConsumable(idx)} data-testid={`button-remove-consumable-${idx}`}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {consumables.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-3 border rounded-md bg-muted/20">
                لا توجد مستهلكات مرتبطة - ابحث عن صنف لإضافته
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal} data-testid="button-cancel-service">إلغاء</Button>
            <Button onClick={handleSave} disabled={saving || !canSave} data-testid="button-save-service">
              {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PriceListsTab() {
  const { toast } = useToast();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [plModalOpen, setPlModalOpen] = useState(false);
  const [editingPl, setEditingPl] = useState<PriceList | null>(null);
  const [plForm, setPlForm] = useState({ code: "", name: "", currency: "EGP", validFrom: "", validTo: "", isActive: true, notes: "" });

  const [itemSearch, setItemSearch] = useState("");
  const debouncedItemSearch = useDebounce(itemSearch, 300);
  const [itemFilterDept, setItemFilterDept] = useState("all");
  const [itemFilterCat, setItemFilterCat] = useState("all");
  const [itemPage, setItemPage] = useState(1);
  const itemPageSize = 50;

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  const [addPricesOpen, setAddPricesOpen] = useState(false);
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);

  useEffect(() => { setItemPage(1); }, [debouncedItemSearch, itemFilterDept, itemFilterCat, selectedListId]);

  const { data: priceLists, isLoading: plLoading } = useQuery<PriceList[]>({ queryKey: ["/api/price-lists"] });
  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });

  const filteredLists = useMemo(() => {
    if (!priceLists) return [];
    if (!listSearch) return priceLists;
    const s = listSearch.toLowerCase();
    return priceLists.filter(pl => pl.name.toLowerCase().includes(s) || pl.code.toLowerCase().includes(s));
  }, [priceLists, listSearch]);

  const itemQp = new URLSearchParams();
  if (debouncedItemSearch) itemQp.set("search", debouncedItemSearch);
  if (itemFilterDept !== "all") itemQp.set("departmentId", itemFilterDept);
  if (itemFilterCat !== "all") itemQp.set("category", itemFilterCat);
  itemQp.set("page", String(itemPage));
  itemQp.set("pageSize", String(itemPageSize));

  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ data: PriceListItemWithService[]; total: number }>({
    queryKey: ["/api/price-lists", selectedListId, "items?" + itemQp.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/price-lists/${selectedListId}/items?${itemQp.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!selectedListId,
  });

  const items = itemsData?.data || [];
  const itemTotal = itemsData?.total || 0;
  const itemTotalPages = Math.max(1, Math.ceil(itemTotal / itemPageSize));

  const plCreateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/price-lists", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "تم إنشاء قائمة الأسعار" });
      setPlModalOpen(false);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const plUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/price-lists/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "تم تحديث قائمة الأسعار" });
      setPlModalOpen(false);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updatePriceMutation = useMutation({
    mutationFn: ({ listId, serviceId, price }: { listId: string; serviceId: string; price: string }) =>
      apiRequest("POST", `/api/price-lists/${listId}/items`, { serviceId, price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", selectedListId] });
      setEditingPriceId(null);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function openPlCreate() {
    setEditingPl(null);
    setPlForm({ code: "", name: "", currency: "EGP", validFrom: "", validTo: "", isActive: true, notes: "" });
    setPlModalOpen(true);
  }

  function openPlEdit(pl: PriceList) {
    setEditingPl(pl);
    setPlForm({
      code: pl.code, name: pl.name, currency: pl.currency,
      validFrom: pl.validFrom || "", validTo: pl.validTo || "",
      isActive: pl.isActive, notes: pl.notes || "",
    });
    setPlModalOpen(true);
  }

  function savePl() {
    const payload = {
      ...plForm,
      validFrom: plForm.validFrom || null,
      validTo: plForm.validTo || null,
      notes: plForm.notes || null,
    };
    if (editingPl) {
      plUpdateMutation.mutate({ id: editingPl.id, data: payload });
    } else {
      plCreateMutation.mutate(payload);
    }
  }

  function startEditPrice(item: PriceListItemWithService) {
    setEditingPriceId(item.id);
    setEditingPriceValue(String(item.price));
  }

  function savePrice(item: PriceListItemWithService) {
    if (!selectedListId || !item.serviceId) return;
    updatePriceMutation.mutate({ listId: selectedListId, serviceId: item.serviceId, price: editingPriceValue });
  }

  const plSaving = plCreateMutation.isPending || plUpdateMutation.isPending;
  const selectedList = priceLists?.find(pl => pl.id === selectedListId);

  return (
    <div className="flex gap-2" style={{ height: "calc(100vh - 8rem)" }} dir="rtl">
      <div className="flex flex-col gap-1" style={{ width: "320px", minWidth: "320px" }}>
        <div className="peachtree-toolbar flex items-center justify-between">
          <h3 className="text-sm font-semibold" data-testid="text-price-lists-title">قوائم الأسعار</h3>
          <Button size="sm" className="text-xs gap-1" onClick={openPlCreate} data-testid="button-add-price-list">
            <Plus className="h-3 w-3" />
            إضافة
          </Button>
        </div>
        <div className="peachtree-toolbar flex items-center gap-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input
            data-testid="input-search-price-lists"
            placeholder="بحث..."
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            className="peachtree-input flex-1"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {plLoading ? (
            <div className="peachtree-grid overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-2 border-b"><Skeleton className="h-4 w-full" /></div>
              ))}
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="peachtree-grid overflow-hidden">
              <p className="text-muted-foreground text-xs text-center py-4" data-testid="text-empty-price-lists">لا توجد قوائم أسعار</p>
            </div>
          ) : (
            <div className="peachtree-grid overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th>الكود</th>
                    <th>الاسم</th>
                    <th>العملة</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLists.map(pl => (
                    <tr
                      key={pl.id}
                      className={`peachtree-grid-row cursor-pointer ${selectedListId === pl.id ? "!bg-blue-100" : ""}`}
                      onClick={() => setSelectedListId(pl.id)}
                      data-testid={`row-price-list-${pl.id}`}
                    >
                      <td className="font-mono text-xs">{pl.code}</td>
                      <td className="text-xs font-medium">{pl.name}</td>
                      <td className="text-xs text-center">{pl.currency}</td>
                      <td>
                        {pl.isActive ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 no-default-active-elevate">نشط</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 no-default-active-elevate">غير نشط</Badge>
                        )}
                      </td>
                      <td>
                        <Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); openPlEdit(pl); }} data-testid={`button-edit-price-list-${pl.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {!selectedListId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs" data-testid="text-select-price-list-prompt">
            اختر قائمة أسعار من القائمة
          </div>
        ) : (
          <>
            <div className="peachtree-toolbar flex items-center justify-between">
              <h3 className="text-sm font-semibold" data-testid="text-selected-list-name">{selectedList?.name || ""}</h3>
              <div className="flex items-center gap-1">
                <Button size="sm" className="text-xs gap-1" onClick={() => setAddPricesOpen(true)} data-testid="button-add-prices">
                  <Plus className="h-3 w-3" />
                  إضافة أسعار
                </Button>
                <Button size="sm" className="text-xs gap-1" variant="outline" onClick={() => setCopyFromOpen(true)} data-testid="button-copy-from">
                  <Copy className="h-3 w-3" />
                  نسخ من قائمة أخرى
                </Button>
                <Button size="sm" className="text-xs gap-1" variant="outline" onClick={() => setBulkAdjustOpen(true)} data-testid="button-bulk-adjust">
                  <Settings2 className="h-3 w-3" />
                  تعديل جماعي
                </Button>
              </div>
            </div>

            <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Search className="h-3 w-3 text-muted-foreground" />
                <Input
                  data-testid="input-search-price-items"
                  placeholder="بحث بالكود أو الاسم..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="peachtree-input w-52"
                />
              </div>
              <span className="text-xs font-medium">القسم:</span>
              <Select value={itemFilterDept} onValueChange={setItemFilterDept}>
                <SelectTrigger className="peachtree-select w-28" data-testid="select-trigger-item-filter-dept">
                  <SelectValue placeholder="القسم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {(departments || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs font-medium">الفئة:</span>
              <Select value={itemFilterCat} onValueChange={setItemFilterCat}>
                <SelectTrigger className="peachtree-select w-28" data-testid="select-trigger-item-filter-cat">
                  <SelectValue placeholder="الفئة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفئات</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="peachtree-grid overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="peachtree-grid-header" data-testid="header-price-items-table">
                      <th>كود الخدمة</th>
                      <th>اسم الخدمة</th>
                      <th>القسم</th>
                      <th>الفئة</th>
                      <th>السعر</th>
                      <th>تحديث</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="peachtree-grid-row">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j}><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted-foreground p-8 text-xs" data-testid="text-empty-price-items">
                          لا توجد أسعار في هذه القائمة
                        </td>
                      </tr>
                    ) : (
                      items.map(item => (
                        <tr key={item.id} className="peachtree-grid-row" data-testid={`row-price-item-${item.id}`}>
                          <td className="font-mono text-xs">{item.service?.code || "-"}</td>
                          <td className="text-xs">{item.service?.nameAr || "-"}</td>
                          <td className="text-xs">{item.service?.department?.nameAr || "-"}</td>
                          <td className="text-xs">{item.service?.category || "-"}</td>
                          <td className="peachtree-amount text-xs">
                            {editingPriceId === item.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  data-testid={`input-price-${item.id}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editingPriceValue}
                                  onChange={e => setEditingPriceValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") savePrice(item); if (e.key === "Escape") setEditingPriceId(null); }}
                                  className="peachtree-input w-28"
                                  autoFocus
                                />
                                <Button size="icon" variant="ghost" onClick={() => savePrice(item)} data-testid={`button-save-price-${item.id}`}>
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingPriceId(null)} data-testid={`button-cancel-price-${item.id}`}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span
                                className="cursor-pointer hover:underline"
                                onClick={() => startEditPrice(item)}
                                data-testid={`text-price-${item.id}`}
                              >
                                {formatNumber(item.price)}
                              </span>
                            )}
                          </td>
                          <td className="text-xs text-muted-foreground">
                            {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("ar-EG") : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {itemTotalPages > 1 && (
              <div className="peachtree-toolbar flex items-center justify-between">
                <span className="text-xs text-muted-foreground" data-testid="text-items-pagination">
                  صفحة {itemPage} من {itemTotalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" disabled={itemPage <= 1} onClick={() => setItemPage(p => p - 1)} data-testid="button-prev-page-items">
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={itemPage >= itemTotalPages} onClick={() => setItemPage(p => p + 1)} data-testid="button-next-page-items">
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <PriceListModal
        open={plModalOpen}
        onClose={() => setPlModalOpen(false)}
        form={plForm}
        setForm={setPlForm}
        onSave={savePl}
        saving={plSaving}
        isEdit={!!editingPl}
      />

      {selectedListId && (
        <>
          <AddPricesModal
            open={addPricesOpen}
            onClose={() => setAddPricesOpen(false)}
            listId={selectedListId}
          />
          <CopyFromModal
            open={copyFromOpen}
            onClose={() => setCopyFromOpen(false)}
            listId={selectedListId}
            priceLists={(priceLists || []).filter(pl => pl.id !== selectedListId)}
          />
          <BulkAdjustModal
            open={bulkAdjustOpen}
            onClose={() => setBulkAdjustOpen(false)}
            listId={selectedListId}
          />
        </>
      )}
    </div>
  );
}

function PriceListModal({ open, onClose, form, setForm, onSave, saving, isEdit }: {
  open: boolean; onClose: () => void;
  form: any; setForm: (fn: any) => void;
  onSave: () => void; saving: boolean; isEdit: boolean;
}) {
  const canSave = form.code && form.name;
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل قائمة أسعار" : "إضافة قائمة أسعار"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>الكود *</Label>
            <Input data-testid="input-pl-code" value={form.code} onChange={e => setForm((f: any) => ({ ...f, code: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>الاسم *</Label>
            <Input data-testid="input-pl-name" value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>العملة</Label>
            <Input data-testid="input-pl-currency" value={form.currency} onChange={e => setForm((f: any) => ({ ...f, currency: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>صالح من</Label>
            <Input data-testid="input-pl-validFrom" type="date" value={form.validFrom} onChange={e => setForm((f: any) => ({ ...f, validFrom: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>صالح حتى</Label>
            <Input data-testid="input-pl-validTo" type="date" value={form.validTo} onChange={e => setForm((f: any) => ({ ...f, validTo: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="pl-active"
              checked={form.isActive}
              onCheckedChange={v => setForm((f: any) => ({ ...f, isActive: !!v }))}
              data-testid="checkbox-pl-active"
            />
            <Label htmlFor="pl-active">نشط</Label>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>ملاحظات</Label>
            <Textarea data-testid="input-pl-notes" value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-pl">إلغاء</Button>
          <Button onClick={onSave} disabled={saving || !canSave} data-testid="button-save-pl">
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPricesModal({ open, onClose, listId }: { open: boolean; onClose: () => void; listId: string }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [selected, setSelected] = useState<{ serviceId: string; code: string; nameAr: string; price: string }[]>([]);
  const [defaultPrice, setDefaultPrice] = useState("");

  const { data: servicesData } = useQuery<{ data: ServiceWithDepartment[]; total: number }>({
    queryKey: ["/api/services", "active=true&pageSize=200" + (debouncedSearch ? `&search=${debouncedSearch}` : "")],
    queryFn: async () => {
      const qs = "active=true&pageSize=200" + (debouncedSearch ? `&search=${debouncedSearch}` : "");
      const res = await fetch(`/api/services?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (items: { serviceId: string; price: string }[]) =>
      apiRequest("POST", `/api/price-lists/${listId}/items`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", listId] });
      toast({ title: "تم إضافة الأسعار" });
      onClose();
      setSelected([]);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function toggleService(s: ServiceWithDepartment) {
    setSelected(prev => {
      const exists = prev.find(x => x.serviceId === s.id);
      if (exists) return prev.filter(x => x.serviceId !== s.id);
      return [...prev, { serviceId: s.id, code: s.code, nameAr: s.nameAr, price: defaultPrice || String(s.basePrice) }];
    });
  }

  function handleSave() {
    if (selected.length === 0) return;
    addMutation.mutate(selected.map(s => ({ serviceId: s.serviceId, price: s.price })));
  }

  useEffect(() => { if (!open) { setSearch(""); setSelected([]); setDefaultPrice(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة أسعار</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              data-testid="input-search-add-services"
              placeholder="بحث عن خدمة..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="peachtree-input flex-1"
            />
            <Input
              data-testid="input-default-price"
              type="number"
              min="0"
              step="0.01"
              placeholder="السعر الافتراضي"
              value={defaultPrice}
              onChange={e => setDefaultPrice(e.target.value)}
              className="peachtree-input w-36"
            />
          </div>
          <div className="max-h-60 overflow-auto">
            <div className="peachtree-grid overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="peachtree-grid-header" data-testid="header-add-services-table">
                    <th className="w-10"></th>
                    <th>الكود</th>
                    <th>الاسم</th>
                    <th>السعر الأساسي</th>
                  </tr>
                </thead>
                <tbody>
                  {(servicesData?.data || []).map(s => {
                    const isSelected = selected.some(x => x.serviceId === s.id);
                    return (
                      <tr key={s.id} className="peachtree-grid-row cursor-pointer" onClick={() => toggleService(s)} data-testid={`row-add-service-${s.id}`}>
                        <td>
                          <Checkbox checked={isSelected} data-testid={`checkbox-service-${s.id}`} />
                        </td>
                        <td className="font-mono text-xs">{s.code}</td>
                        <td className="text-xs">{s.nameAr}</td>
                        <td className="peachtree-amount text-xs">{formatNumber(s.basePrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-selected-count">تم اختيار {selected.length} خدمة</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-add-prices">إلغاء</Button>
          <Button onClick={handleSave} disabled={addMutation.isPending || selected.length === 0} data-testid="button-save-add-prices">
            {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            إضافة ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyFromModal({ open, onClose, listId, priceLists }: {
  open: boolean; onClose: () => void; listId: string; priceLists: PriceList[];
}) {
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState("");

  const copyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/price-lists/${listId}/copy-from`, { sourceListId: sourceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", listId] });
      toast({ title: "تم نسخ الأسعار بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  useEffect(() => { if (!open) setSourceId(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>نسخ من قائمة أخرى</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>اختر القائمة المصدر</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger data-testid="select-trigger-copy-source">
                <SelectValue placeholder="اختر قائمة" />
              </SelectTrigger>
              <SelectContent>
                {priceLists.map(pl => (
                  <SelectItem key={pl.id} value={pl.id}>{pl.name} ({pl.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-copy">إلغاء</Button>
          <Button onClick={() => copyMutation.mutate()} disabled={copyMutation.isPending || !sourceId} data-testid="button-apply-copy">
            {copyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            نسخ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkAdjustModal({ open, onClose, listId }: { open: boolean; onClose: () => void; listId: string }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("PCT");
  const [direction, setDirection] = useState("INCREASE");
  const [value, setValue] = useState("");
  const [filterDeptId, setFilterDeptId] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [createMissing, setCreateMissing] = useState(true);
  const [preview, setPreview] = useState<any>(null);

  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });

  const previewMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/price-lists/${listId}/bulk-adjust/preview`, {
      mode, direction, value: parseFloat(value),
      departmentId: filterDeptId || null,
      category: filterCat || null,
      createMissingFromBasePrice: createMissing,
    }).then(r => r.json()),
    onSuccess: (data) => setPreview(data),
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/price-lists/${listId}/bulk-adjust/apply`, {
      mode, direction, value: parseFloat(value),
      departmentId: filterDeptId || null,
      category: filterCat || null,
      createMissingFromBasePrice: createMissing,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", listId] });
      toast({ title: "تم تطبيق التعديل الجماعي بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!open) {
      setMode("PCT"); setDirection("INCREASE"); setValue(""); setFilterDeptId(""); setFilterCat(""); setCreateMissing(true); setPreview(null);
    }
  }, [open]);

  useEffect(() => { setPreview(null); }, [mode, direction, value, filterDeptId, filterCat, createMissing]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل جماعي للأسعار</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>نوع التعديل</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger data-testid="select-trigger-bulk-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PCT">نسبة مئوية</SelectItem>
                  <SelectItem value="FIXED">مبلغ ثابت</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الاتجاه</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger data-testid="select-trigger-bulk-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCREASE">زيادة</SelectItem>
                  <SelectItem value="DECREASE">تخفيض</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>القيمة {mode === "PCT" ? "(%)" : ""}</Label>
              <Input data-testid="input-bulk-value" type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>القسم (اختياري)</Label>
              <Select value={filterDeptId || "all"} onValueChange={v => setFilterDeptId(v === "all" ? "" : v)}>
                <SelectTrigger data-testid="select-trigger-bulk-dept">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {(departments || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الفئة (اختياري)</Label>
              <Input data-testid="input-bulk-category" value={filterCat} onChange={e => setFilterCat(e.target.value)} placeholder="اتركه فارغاً للكل" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="bulk-create-missing"
                checked={createMissing}
                onCheckedChange={v => setCreateMissing(!!v)}
                data-testid="checkbox-create-missing"
              />
              <Label htmlFor="bulk-create-missing" className="text-sm">إنشاء أسعار مفقودة من السعر الأساسي</Label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || !value} data-testid="button-bulk-preview">
              {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Eye className="h-4 w-4 ml-1" />}
              معاينة
            </Button>
            {preview && (
              <span className="text-xs text-muted-foreground" data-testid="text-affected-count">
                عدد الخدمات المتأثرة: {preview.affectedCount}
              </span>
            )}
          </div>

          {preview?.preview && preview.preview.length > 0 && (
            <div className="max-h-48 overflow-auto">
              <div className="peachtree-grid overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="peachtree-grid-header" data-testid="header-bulk-preview-table">
                      <th>الخدمة</th>
                      <th>السعر القديم</th>
                      <th>السعر الجديد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((r: any, i: number) => (
                      <tr key={i} className="peachtree-grid-row">
                        <td className="text-xs">{r.serviceNameAr || r.serviceCode || "-"}</td>
                        <td className="peachtree-amount text-xs">{formatNumber(r.oldPrice)}</td>
                        <td className="peachtree-amount text-xs">{formatNumber(r.newPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-bulk">إلغاء</Button>
          <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending || !preview} data-testid="button-apply-bulk">
            {applyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            تطبيق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicesPricing() {
  return (
    <div className="p-2" dir="rtl">
      <Tabs defaultValue="services" className="w-full">
        <div className="peachtree-toolbar flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">إدارة الخدمات والتسعير</span>
            <span className="text-xs text-muted-foreground">|</span>
            <TabsList className="h-auto p-0 bg-transparent gap-0">
              <TabsTrigger value="services" data-testid="tab-services" className="text-xs px-3 py-1 rounded-none data-[state=active]:bg-blue-100 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600">الخدمات</TabsTrigger>
              <TabsTrigger value="price-lists" data-testid="tab-price-lists" className="text-xs px-3 py-1 rounded-none data-[state=active]:bg-blue-100 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600">قوائم الأسعار</TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="services" className="mt-0">
          <ServicesTab />
        </TabsContent>
        <TabsContent value="price-lists" className="mt-0">
          <PriceListsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
