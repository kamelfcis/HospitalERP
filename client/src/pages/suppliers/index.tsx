/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  شاشة إدارة الموردين — Supplier Management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  لوحتان RTL:
 *   - يمين: قائمة الموردين + بحث + فلاتر
 *   - يسار: نموذج الإنشاء/التعديل (3 sections)
 *
 *  المحاسبة: glAccountId اختياري
 *   - محدد → حساب ذمم مورد خاص في قيود الشراء
 *   - فارغ → النظام يعود للنموذج المجمّع (payables_drugs / payables_consumables)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ===== Imports =====
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search, Plus, CheckCircle, XCircle, Building2,
  CreditCard, Clock, Wallet, Phone, User, FileText, Hash, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AccountLookup } from "@/components/lookups/AccountLookup";
import type { LookupItem } from "@/lib/lookupTypes";
import type { Supplier } from "@shared/schema";

// ===== Constants =====
const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash:   "نقدي",
  credit: "آجل",
  mixed:  "مختلط",
};

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  drugs:       "أدوية",
  consumables: "مستلزمات",
};

// ===== Types =====
interface SuppliersListResponse {
  suppliers: Supplier[];
  total: number;
}

// ===== Form State Shape =====
interface SupplierFormState {
  code:                string;
  nameAr:              string;
  nameEn:              string;
  supplierType:        string;
  phone:               string;
  taxId:               string;
  address:             string;
  contactPerson:       string;
  isActive:            boolean;
  paymentMode:         string;
  creditLimit:         string;
  defaultPaymentTerms: string;
  openingBalance:      string;
  glAccountId:         string;
}

const EMPTY_FORM: SupplierFormState = {
  code: "", nameAr: "", nameEn: "", supplierType: "drugs",
  phone: "", taxId: "", address: "", contactPerson: "",
  isActive: true, paymentMode: "cash",
  creditLimit: "", defaultPaymentTerms: "", openingBalance: "", glAccountId: "",
};

function supplierToForm(s: Supplier): SupplierFormState {
  const ss = s as any;
  return {
    code:                s.code,
    nameAr:              s.nameAr,
    nameEn:              s.nameEn ?? "",
    supplierType:        s.supplierType,
    phone:               s.phone ?? "",
    taxId:               s.taxId ?? "",
    address:             s.address ?? "",
    contactPerson:       ss.contactPerson ?? "",
    isActive:            s.isActive,
    paymentMode:         ss.paymentMode || "cash",
    creditLimit:         ss.creditLimit != null ? String(ss.creditLimit) : "",
    defaultPaymentTerms: ss.defaultPaymentTerms != null ? String(ss.defaultPaymentTerms) : "",
    openingBalance:      ss.openingBalance != null ? String(ss.openingBalance) : "",
    glAccountId:         ss.glAccountId ?? "",
  };
}

function formToPayload(f: SupplierFormState): Record<string, unknown> {
  return {
    code:                f.code.trim(),
    nameAr:              f.nameAr.trim(),
    nameEn:              f.nameEn.trim() || null,
    supplierType:        f.supplierType,
    phone:               f.phone.trim() || null,
    taxId:               f.taxId.trim() || null,
    address:             f.address.trim() || null,
    contactPerson:       f.contactPerson.trim() || null,
    isActive:            f.isActive,
    paymentMode:         f.paymentMode,
    creditLimit:         f.creditLimit.trim() !== "" ? parseFloat(f.creditLimit) : null,
    defaultPaymentTerms: f.defaultPaymentTerms.trim() !== "" ? parseInt(f.defaultPaymentTerms) : null,
    openingBalance:      f.openingBalance.trim() !== "" ? parseFloat(f.openingBalance) : null,
    glAccountId:         f.glAccountId.trim() || null,
  };
}

// ===== Helper: Supplier Row =====
function SupplierRow({
  supplier,
  isSelected,
  onClick,
}: {
  supplier: Supplier;
  isSelected: boolean;
  onClick: () => void;
}) {
  const ss = supplier as any;
  return (
    <div
      onClick={onClick}
      data-testid={`row-supplier-${supplier.id}`}
      className={`
        flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 transition-colors
        text-[11px] hover:bg-muted/50
        ${isSelected ? "bg-primary/10 border-r-2 border-r-primary" : ""}
      `}
    >
      <span className="w-16 font-mono text-muted-foreground shrink-0">{supplier.code}</span>
      <span className="flex-1 font-medium truncate">{supplier.nameAr}</span>
      <Badge variant="outline" className="text-[9px] h-4 shrink-0">
        {SUPPLIER_TYPE_LABELS[supplier.supplierType] || supplier.supplierType}
      </Badge>
      <Badge
        variant="outline"
        className={`text-[9px] h-4 shrink-0 ${
          ss.paymentMode === "credit" ? "border-blue-400 text-blue-600" :
          ss.paymentMode === "mixed"  ? "border-amber-400 text-amber-600" :
          "border-gray-300 text-gray-500"
        }`}
      >
        {PAYMENT_MODE_LABELS[ss.paymentMode || "cash"]}
      </Badge>
      {ss.glAccountId && <CheckCircle className="h-3 w-3 text-green-500 shrink-0" title="حساب AP خاص" />}
      {!supplier.isActive && <XCircle className="h-3 w-3 text-destructive shrink-0" title="غير نشط" />}
    </div>
  );
}

// ===== Main Component =====
export default function SuppliersPage() {
  const { toast } = useToast();

  // ===== List State =====
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // ===== Form State =====
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const setField = (field: keyof SupplierFormState, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ===== Queries =====
  const { data, isLoading } = useQuery<SuppliersListResponse>({
    queryKey: ["/api/suppliers/management", search, typeFilter, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "300" });
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("supplierType", typeFilter);
      if (activeFilter === "inactive") params.set("isActive", "false");
      else if (activeFilter === "all") params.set("isActive", "all");
      const res = await fetch(`/api/suppliers?${params}`);
      if (!res.ok) throw new Error("فشل تحميل الموردين");
      return res.json();
    },
  });

  const suppliers = data?.suppliers ?? [];
  const selectedSupplier = suppliers.find(s => s.id === selectedId) ?? null;

  // ===== Derived Values =====
  const showForm  = isCreating || !!selectedId;
  const formTitle = isCreating
    ? "مورد جديد"
    : selectedSupplier ? `تعديل: ${selectedSupplier.nameAr}` : "";

  // Sync form when selection changes
  useEffect(() => {
    if (selectedSupplier) {
      setForm(supplierToForm(selectedSupplier));
    } else if (isCreating) {
      setForm(EMPTY_FORM);
    }
  }, [selectedId, isCreating]);

  // ===== Mutations =====
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.nameAr.trim()) {
        throw new Error("الكود والاسم بالعربي مطلوبان");
      }
      const payload = formToPayload(form);
      if (isCreating) {
        const res = await apiRequest("POST", "/api/suppliers", payload);
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || "فشل الإنشاء"); }
        return res.json();
      } else {
        const res = await apiRequest("PATCH", `/api/suppliers/${selectedId}`, payload);
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || "فشل التحديث"); }
        return res.json();
      }
    },
    onSuccess: (supplier: Supplier) => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: isCreating ? "تم إضافة المورد بنجاح" : "تم تحديث بيانات المورد" });
      setIsCreating(false);
      setSelectedId(supplier.id);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // ===== Event Handlers =====
  const handleNewSupplier = () => { setSelectedId(null); setIsCreating(true); };
  const handleSelect = (id: string) => { setIsCreating(false); setSelectedId(id); };
  const handleCancel = () => { setIsCreating(false); setSelectedId(null); setForm(EMPTY_FORM); };

  // ===== Layout =====
  return (
    <div className="flex flex-col h-full" dir="rtl">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">إدارة الموردين</h1>
          <Badge variant="outline" className="text-[10px]">{data?.total ?? 0} مورد</Badge>
        </div>
        <Button size="sm" className="h-7 text-[11px] gap-1" onClick={handleNewSupplier} data-testid="button-new-supplier">
          <Plus className="h-3 w-3" />مورد جديد
        </Button>
      </div>

      {/* ── Two-Panel Layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ===== Right Panel: Supplier List ===== */}
        <div className="w-80 border-l flex flex-col bg-background shrink-0">
          <div className="p-2 border-b space-y-1.5">
            <div className="relative">
              <Search className="absolute right-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الكود..."
                className="h-7 text-[11px] pr-7"
                data-testid="input-search-suppliers"
              />
            </div>
            <div className="flex gap-1">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="flex-1 h-6 text-[10px] border rounded px-1 bg-background"
                data-testid="select-filter-type">
                <option value="all">كل الأنواع</option>
                <option value="drugs">أدوية</option>
                <option value="consumables">مستلزمات</option>
              </select>
              <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)}
                className="flex-1 h-6 text-[10px] border rounded px-1 bg-background"
                data-testid="select-filter-active">
                <option value="all">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-[11px] text-muted-foreground">جاري التحميل...</div>
            ) : suppliers.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-muted-foreground">لا توجد نتائج</div>
            ) : (
              suppliers.map(s => (
                <SupplierRow key={s.id} supplier={s} isSelected={selectedId === s.id} onClick={() => handleSelect(s.id)} />
              ))
            )}
          </div>
        </div>

        {/* ===== Left Panel: Detail / Edit Form ===== */}
        <div className="flex-1 overflow-y-auto bg-muted/5 p-4">
          {!showForm ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Building2 className="h-12 w-12 opacity-20" />
              <p className="text-sm">اختر مورداً من القائمة أو أضف مورداً جديداً</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">

              {/* Form Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{formTitle}</h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={handleCancel} data-testid="button-cancel-supplier">إلغاء</Button>
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-supplier">
                    {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                </div>
              </div>

              {/* ===== Section 1: Basic Data ===== */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <User className="h-3.5 w-3.5" />البيانات الأساسية
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px]">كود المورد *</Label>
                    <Input value={form.code} onChange={e => setField("code", e.target.value)}
                      className="h-7 text-[11px]" dir="ltr" data-testid="input-supplier-code" />
                  </div>
                  <div>
                    <Label className="text-[10px]">نوع المورد *</Label>
                    <Select value={form.supplierType} onValueChange={v => setField("supplierType", v)}>
                      <SelectTrigger className="h-7 text-[11px]" data-testid="select-supplier-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="drugs">أدوية</SelectItem>
                        <SelectItem value="consumables">مستلزمات</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">الاسم بالعربي *</Label>
                  <Input value={form.nameAr} onChange={e => setField("nameAr", e.target.value)}
                    className="h-7 text-[11px]" data-testid="input-supplier-name-ar" />
                </div>
                <div>
                  <Label className="text-[10px]">الاسم بالإنجليزي</Label>
                  <Input value={form.nameEn} onChange={e => setField("nameEn", e.target.value)}
                    className="h-7 text-[11px]" dir="ltr" data-testid="input-supplier-name-en" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] flex items-center gap-1"><Phone className="h-2.5 w-2.5" />الهاتف</Label>
                    <Input value={form.phone} onChange={e => setField("phone", e.target.value)}
                      className="h-7 text-[11px]" dir="ltr" data-testid="input-supplier-phone" />
                  </div>
                  <div>
                    <Label className="text-[10px] flex items-center gap-1"><Hash className="h-2.5 w-2.5" />الرقم الضريبي</Label>
                    <Input value={form.taxId} onChange={e => setField("taxId", e.target.value)}
                      className="h-7 text-[11px]" dir="ltr" data-testid="input-supplier-tax-id" />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] flex items-center gap-1"><User className="h-2.5 w-2.5" />المسؤول / جهة الاتصال</Label>
                  <Input value={form.contactPerson} onChange={e => setField("contactPerson", e.target.value)}
                    className="h-7 text-[11px]" data-testid="input-supplier-contact" />
                </div>
                <div>
                  <Label className="text-[10px] flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />العنوان</Label>
                  <Input value={form.address} onChange={e => setField("address", e.target.value)}
                    className="h-7 text-[11px]" data-testid="input-supplier-address" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isActive} onChange={e => setField("isActive", e.target.checked)}
                    className="h-3.5 w-3.5" id="chk-active" data-testid="checkbox-supplier-active" />
                  <Label htmlFor="chk-active" className="text-[10px] cursor-pointer">مورد نشط</Label>
                </div>
              </div>

              {/* ===== Section 2: Financial Settings ===== */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <CreditCard className="h-3.5 w-3.5" />الإعدادات المالية
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px]">طريقة الدفع</Label>
                    <Select value={form.paymentMode} onValueChange={v => setField("paymentMode", v)}>
                      <SelectTrigger className="h-7 text-[11px]" data-testid="select-supplier-payment-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">نقدي</SelectItem>
                        <SelectItem value="credit">آجل</SelectItem>
                        <SelectItem value="mixed">مختلط</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] flex items-center gap-1"><Wallet className="h-2.5 w-2.5" />الحد الائتماني (ج.م)</Label>
                    <Input type="number" min="0" step="0.01"
                      value={form.creditLimit} onChange={e => setField("creditLimit", e.target.value)}
                      className="h-7 text-[11px]" dir="ltr" placeholder="بلا حد"
                      data-testid="input-supplier-credit-limit" />
                  </div>
                  <div>
                    <Label className="text-[10px] flex items-center gap-1"><Clock className="h-2.5 w-2.5" />أيام السداد</Label>
                    <Input type="number" min="0" step="1"
                      value={form.defaultPaymentTerms} onChange={e => setField("defaultPaymentTerms", e.target.value)}
                      className="h-7 text-[11px]" dir="ltr" placeholder="مثال: 30"
                      data-testid="input-supplier-payment-terms" />
                  </div>
                </div>
                <div className="w-1/3">
                  <Label className="text-[10px]">الرصيد الافتتاحي (ج.م)</Label>
                  <Input type="number" step="0.01"
                    value={form.openingBalance} onChange={e => setField("openingBalance", e.target.value)}
                    className="h-7 text-[11px]" dir="ltr" placeholder="0.00"
                    data-testid="input-supplier-opening-balance" />
                  <p className="text-[9px] text-muted-foreground mt-0.5">معلومة إرشادية — لا تولّد قيوداً تلقائية</p>
                </div>
              </div>

              {/* ===== Section 3: Account Linkage ===== */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <FileText className="h-3.5 w-3.5" />ربط الحسابات (اختياري)
                </div>
                <Separator />
                <div className="space-y-1.5">
                  <Label className="text-[10px]">حساب ذمم المورد في دليل الحسابات</Label>
                  {/* Reuse existing AccountLookup component — no new lookup created */}
                  <AccountLookup
                    value={form.glAccountId}
                    onChange={(item: LookupItem | null) => setField("glAccountId", item?.id ?? "")}
                    filter="liability"
                    placeholder="اختر حساباً مخصصاً... (اختياري)"
                    clearable
                    data-testid="lookup-supplier-gl-account"
                  />
                  <p className="text-[9px] text-muted-foreground leading-relaxed">
                    {form.glAccountId
                      ? "✓ هذا الحساب سيُستخدم كحساب دائن في قيود فواتير الشراء لهذا المورد تحديداً."
                      : "إذا تُرك فارغاً، يستخدم النظام الحساب المجمّع (ذمم أدوية / ذمم مستلزمات) حسب نوع المورد."}
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
