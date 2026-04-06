import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/formatters";
import { serviceTypeLabels } from "@shared/schema";
import type { ServiceWithDepartment } from "@shared/schema";
import { useDebounce } from "./hooks";
import { useDepartmentsLookup } from "@/hooks/lookups/useDepartmentsLookup";
import ServiceDialog, {
  type ServiceFormState, type ConsumableRow, defaultServiceForm,
} from "./ServiceDialog";

// ─── 1. ServicesTab ────────────────────────────────────────────────────────────
/**
 * ServicesTab
 * تبويب الخدمات: قائمة قابلة للفلترة + ترقيم صفحات + ديالوج الإنشاء/التعديل.
 */
export default function ServicesTab() {
  const { toast } = useToast();

  // ─── حالة البحث والفلاتر ─────────────────────────────────────────────────
  const [search, setSearch]               = useState("");
  const debouncedSearch                   = useDebounce(search, 300);
  const [filterDept, setFilterDept]       = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterActive, setFilterActive]   = useState("all");
  const [page, setPage]                   = useState(1);
  const pageSize                          = 50;

  // ─── حالة الديالوج ────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]               = useState(false);
  const [editingService, setEditingService]     = useState<ServiceWithDepartment | null>(null);
  const [form, setForm]                         = useState<ServiceFormState>(defaultServiceForm);
  const [consumables, setConsumables]           = useState<ConsumableRow[]>([]);

  useEffect(() => { setPage(1); }, [debouncedSearch, filterDept, filterCategory, filterActive]);

  // ─── استعلامات ────────────────────────────────────────────────────────────
  const qp = new URLSearchParams();
  if (debouncedSearch)       qp.set("search",       debouncedSearch);
  if (filterDept !== "all")  qp.set("departmentId", filterDept);
  if (filterCategory !== "all") qp.set("category", filterCategory);
  if (filterActive !== "all") qp.set("active",      filterActive);
  qp.set("page",     String(page));
  qp.set("pageSize", String(pageSize));

  const { data: servicesData, isLoading } = useQuery<{ data: ServiceWithDepartment[]; total: number }>({
    queryKey: ["/api/services", qp.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/services?${qp.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { items: departmentItems } = useDepartmentsLookup();
  const { data: categories }       = useQuery<string[]>({ queryKey: ["/api/service-categories"] });

  const services    = servicesData?.data  || [];
  const total       = servicesData?.total || 0;
  const totalPages  = Math.max(1, Math.ceil(total / pageSize));

  // ─── mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/services", data);
      return res.json();
    },
    onSuccess: async (created: any) => {
      if (created?.id && consumables.length > 0) {
        await apiRequest("PUT", `/api/services/${created.id}/consumables`,
          consumables.map(c => ({ itemId: c.itemId, quantity: c.quantity, unitLevel: c.unitLevel, notes: c.notes || null }))
        );
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
      await apiRequest("PUT", `/api/services/${serviceId}/consumables`,
        consumables.map(c => ({ itemId: c.itemId, quantity: c.quantity, unitLevel: c.unitLevel, notes: c.notes || null }))
      );
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "تم تحديث الخدمة بنجاح" });
      closeModal();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/services/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/services"] }),
    onError:   (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ─── معالجات الديالوج ─────────────────────────────────────────────────────
  function openCreate() {
    setEditingService(null);
    setForm(defaultServiceForm);
    setConsumables([]);
    setModalOpen(true);
  }

  function openEdit(s: ServiceWithDepartment) {
    setEditingService(s);
    setForm({
      code: s.code, nameAr: s.nameAr, nameEn: s.nameEn || "",
      departmentId: s.departmentId, category: s.category || "",
      serviceType: s.serviceType,
      businessClassification: (s as any).businessClassification || "__none__",
      defaultWarehouseId: s.defaultWarehouseId || "",
      revenueAccountId: s.revenueAccountId, costCenterId: s.costCenterId,
      basePrice: String(s.basePrice), requiresDoctor: s.requiresDoctor ?? false,
      requiresNurse: s.requiresNurse ?? false, isActive: s.isActive,
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditingService(null); setConsumables([]); }

  function handleSave() {
    const payload = {
      ...form,
      defaultWarehouseId: form.defaultWarehouseId || null,
      nameEn:   form.nameEn   || null,
      category: form.category || null,
      businessClassification:
        form.businessClassification && form.businessClassification !== "__none__"
          ? form.businessClassification
          : null,
    };
    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  // ─── loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-2 space-y-2" dir="rtl">
        <div className="peachtree-toolbar"><Skeleton className="h-5 w-32" /></div>
        <div className="peachtree-grid">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="p-3 border-b"><Skeleton className="h-4 w-full" /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1" dir="rtl">

      {/* ─── شريط الأدوات ─────────────────────────────────────────────── */}
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
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="peachtree-select w-28" data-testid="select-trigger-filter-department">
            <SelectValue placeholder="القسم" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departmentItems.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
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

      {/* ─── جدول الخدمات ─────────────────────────────────────────────── */}
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
              <th>مطلوب</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground"
                  data-testid="text-empty-services">لا توجد خدمات</td>
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
                  <td className="leading-tight">
                    <div className="flex items-center gap-1 flex-wrap">
                      {s.requiresDoctor && (
                        <Badge variant="outline"
                          className="text-[10px] py-0 leading-tight bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 no-default-active-elevate"
                          data-testid={`badge-doctor-${s.id}`}>طبيب</Badge>
                      )}
                      {s.requiresNurse && (
                        <Badge variant="outline"
                          className="text-[10px] py-0 leading-tight bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800 no-default-active-elevate"
                          data-testid={`badge-nurse-${s.id}`}>ممرض</Badge>
                      )}
                      {!s.requiresDoctor && !s.requiresNurse && <span className="text-muted-foreground">-</span>}
                    </div>
                  </td>
                  <td>
                    <Badge
                      variant="outline"
                      className={`text-[10px] py-0 leading-tight cursor-pointer no-default-active-elevate ${
                        s.isActive
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                      onClick={() => toggleActiveMutation.mutate({ id: s.id, isActive: !s.isActive })}
                      data-testid={`badge-active-${s.id}`}
                    >
                      {s.isActive ? "نشط" : "غير نشط"}
                    </Badge>
                  </td>
                  <td>
                    <Button size="icon" variant="ghost" className="[&_svg]:h-2.5 [&_svg]:w-2.5"
                      onClick={() => openEdit(s)} data-testid={`button-edit-service-${s.id}`}>
                      <Pencil className="h-2.5 w-2.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── ترقيم الصفحات ─────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="peachtree-toolbar flex items-center justify-between">
          <span className="text-xs text-muted-foreground" data-testid="text-services-pagination">
            صفحة {page} من {totalPages} ({total} خدمة)
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1}
              onClick={() => setPage(p => p - 1)} data-testid="button-prev-page-services">
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)} data-testid="button-next-page-services">
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── ديالوج الإنشاء/التعديل ────────────────────────────────────── */}
      <ServiceDialog
        open={modalOpen}
        onClose={closeModal}
        editingService={editingService}
        form={form}
        setForm={setForm}
        consumables={consumables}
        setConsumables={setConsumables}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
