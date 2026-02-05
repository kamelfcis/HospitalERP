import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Package,
  Save,
  X,
  ArrowRight,
  AlertTriangle,
  Plus,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ItemFormType, PurchaseTransaction, InsertItem, Department, ItemDepartmentPriceWithDepartment } from "@shared/schema";

interface ItemWithFormType extends Item {
  formType?: ItemFormType;
}

interface AvgSalesResponse {
  avgPrice: string;
  totalQty: string;
  invoiceCount: number;
}

export default function ItemCard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/items/:id");
  const isNew = params?.id === "new";
  const itemId = isNew ? null : params?.id;

  const [isEditing, setIsEditing] = useState(isNew);
  const [showFormTypeDialog, setShowFormTypeDialog] = useState(false);
  const [newFormTypeName, setNewFormTypeName] = useState("");
  const [salesPeriod, setSalesPeriod] = useState("3");
  const [showDeptPriceDialog, setShowDeptPriceDialog] = useState(false);
  const [selectedDeptPrice, setSelectedDeptPrice] = useState<ItemDepartmentPriceWithDepartment | null>(null);
  const [newDeptPrice, setNewDeptPrice] = useState<{ departmentId: string; salePrice: string }>({ departmentId: "", salePrice: "" });

  const [formData, setFormData] = useState<Partial<InsertItem>>({
    itemCode: "",
    nameAr: "",
    nameEn: "",
    category: "drug",
    isToxic: false,
    formTypeId: null,
    purchasePriceLast: "0",
    salePriceCurrent: "0",
    majorUnitName: "",
    mediumUnitName: "",
    minorUnitName: "",
    majorToMedium: null,
    majorToMinor: null,
    mediumToMinor: null,
    description: "",
    isActive: true,
  });

  const { data: item, isLoading } = useQuery<ItemWithFormType>({
    queryKey: ["/api/items", itemId],
    enabled: !!itemId,
  });

  const { data: formTypes, refetch: refetchFormTypes } = useQuery<ItemFormType[]>({
    queryKey: ["/api/form-types"],
  });

  const { data: lastPurchases } = useQuery<PurchaseTransaction[]>({
    queryKey: [`/api/items/${itemId}/last-purchases?limit=3`],
    enabled: !!itemId,
  });

  const getSalesDates = () => {
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - parseInt(salesPeriod));
    return { startDate: startDate.toISOString().split("T")[0], endDate };
  };

  const { startDate, endDate } = getSalesDates();

  const { data: avgSales } = useQuery<AvgSalesResponse>({
    queryKey: [`/api/items/${itemId}/avg-sales?startDate=${startDate}&endDate=${endDate}`],
    enabled: !!itemId,
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: departmentPrices, refetch: refetchDeptPrices } = useQuery<ItemDepartmentPriceWithDepartment[]>({
    queryKey: [`/api/items/${itemId}/department-prices`],
    enabled: !!itemId,
  });

  useEffect(() => {
    if (item) {
      setFormData({
        itemCode: item.itemCode,
        nameAr: item.nameAr,
        nameEn: item.nameEn || "",
        category: item.category,
        isToxic: item.isToxic,
        formTypeId: item.formTypeId,
        purchasePriceLast: item.purchasePriceLast,
        salePriceCurrent: item.salePriceCurrent,
        majorUnitName: item.majorUnitName || "",
        mediumUnitName: item.mediumUnitName || "",
        minorUnitName: item.minorUnitName || "",
        majorToMedium: item.majorToMedium,
        majorToMinor: item.majorToMinor,
        mediumToMinor: item.mediumToMinor,
        description: item.description || "",
        isActive: item.isActive,
      });
    }
  }, [item]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InsertItem>) => {
      if (isNew) {
        return apiRequest("POST", "/api/items", data);
      } else {
        return apiRequest("PUT", `/api/items/${itemId}`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: isNew ? "تم إنشاء الصنف بنجاح" : "تم حفظ التعديلات بنجاح" });
      if (isNew) {
        navigate("/items");
      } else {
        setIsEditing(false);
      }
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const createFormTypeMutation = useMutation({
    mutationFn: async (nameAr: string) => {
      return apiRequest("POST", "/api/form-types", { nameAr, sortOrder: 0, isActive: true });
    },
    onSuccess: (newFormType: any) => {
      refetchFormTypes();
      setFormData({ ...formData, formTypeId: newFormType.id });
      setShowFormTypeDialog(false);
      setNewFormTypeName("");
      toast({ title: "تم إضافة نوع الشكل بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const createDeptPriceMutation = useMutation({
    mutationFn: async (data: { departmentId: string; salePrice: string }) => {
      return apiRequest("POST", `/api/items/${itemId}/department-prices`, data);
    },
    onSuccess: () => {
      refetchDeptPrices();
      setShowDeptPriceDialog(false);
      setNewDeptPrice({ departmentId: "", salePrice: "" });
      setSelectedDeptPrice(null);
      toast({ title: "تم إضافة سعر القسم بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateDeptPriceMutation = useMutation({
    mutationFn: async (data: { id: string; salePrice: string }) => {
      return apiRequest("PUT", `/api/item-department-prices/${data.id}`, { salePrice: data.salePrice });
    },
    onSuccess: () => {
      refetchDeptPrices();
      setShowDeptPriceDialog(false);
      setNewDeptPrice({ departmentId: "", salePrice: "" });
      setSelectedDeptPrice(null);
      toast({ title: "تم تحديث سعر القسم بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteDeptPriceMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/item-department-prices/${id}`);
    },
    onSuccess: () => {
      refetchDeptPrices();
      toast({ title: "تم حذف سعر القسم" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!formData.itemCode || !formData.nameAr) {
      toast({ title: "خطأ", description: "الكود والاسم العربي مطلوبان", variant: "destructive" });
      return;
    }
    saveMutation.mutate(formData);
  };

  const profitMargin = () => {
    const purchase = parseFloat(formData.purchasePriceLast || "0");
    const sale = parseFloat(formData.salePriceCurrent || "0");
    if (purchase <= 0) return 0;
    return ((sale - purchase) / purchase * 100).toFixed(1);
  };

  const conversionExample = () => {
    const major = formData.majorUnitName || "وحدة كبرى";
    const medium = formData.mediumUnitName;
    const minor = formData.minorUnitName || "وحدة صغرى";
    const toMedium = formData.majorToMedium;
    const toMinor = formData.majorToMinor || 1;
    
    if (medium && toMedium) {
      return `1 ${major} = ${toMedium} ${medium} = ${toMinor} ${minor}`;
    }
    return `1 ${major} = ${toMinor} ${minor}`;
  };

  const availableDepartments = departments?.filter(
    (dept) => !departmentPrices?.some((dp) => dp.departmentId === dept.id)
  ) || [];

  const handleOpenDeptPriceDialog = (deptPrice?: ItemDepartmentPriceWithDepartment) => {
    if (deptPrice) {
      setSelectedDeptPrice(deptPrice);
      setNewDeptPrice({ departmentId: deptPrice.departmentId, salePrice: deptPrice.salePrice });
    } else {
      setSelectedDeptPrice(null);
      setNewDeptPrice({ departmentId: "", salePrice: "" });
    }
    setShowDeptPriceDialog(true);
  };

  const handleSaveDeptPrice = () => {
    const price = parseFloat(newDeptPrice.salePrice);
    if (!newDeptPrice.salePrice || price <= 0) {
      toast({ title: "خطأ", description: "سعر البيع يجب أن يكون موجب", variant: "destructive" });
      return;
    }
    if (selectedDeptPrice) {
      updateDeptPriceMutation.mutate({ id: selectedDeptPrice.id, salePrice: newDeptPrice.salePrice });
    } else {
      if (!newDeptPrice.departmentId) {
        toast({ title: "خطأ", description: "يرجى اختيار القسم", variant: "destructive" });
        return;
      }
      createDeptPriceMutation.mutate(newDeptPrice);
    }
  };

  if (isLoading && !isNew) {
    return (
      <div className="h-full flex items-center justify-center">
        <Skeleton className="h-[400px] w-full max-w-4xl" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="peachtree-toolbar flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {isNew ? "إضافة صنف جديد" : "كارت الصنف"}
          </span>
          {!isNew && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className="font-mono text-sm font-bold text-primary">{item?.itemCode}</span>
              <span className="font-semibold text-sm">{item?.nameAr}</span>
              {item?.isToxic && (
                <Badge variant="destructive" className="text-[10px] gap-0.5 h-5">
                  <AlertTriangle className="h-3 w-3" />
                  سموم
                </Badge>
              )}
              {!item?.isActive && (
                <Badge variant="outline" className="text-[10px] h-5 bg-red-50 text-red-700">موقوف</Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] gap-1 px-2"
                onClick={() => isNew ? navigate("/items") : setIsEditing(false)}
                data-testid="button-cancel"
              >
                <X className="h-3 w-3" />
                إلغاء
              </Button>
              <Button
                size="sm"
                className="text-[11px] gap-1 px-2"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                حفظ
              </Button>
            </>
          ) : (
            <Button size="sm" className="text-[11px] px-2" onClick={() => setIsEditing(true)} data-testid="button-edit">
              تعديل
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-[11px] gap-1 px-2" onClick={() => navigate("/items")} data-testid="button-back">
            <ArrowRight className="h-3 w-3" />
            رجوع
          </Button>
        </div>
      </div>

      <div className="flex-1 p-2 overflow-hidden">
        <div className="h-full grid grid-cols-12 gap-2">
          <div className="col-span-8 flex flex-col gap-2">
            <fieldset className="peachtree-grid p-2 flex-shrink-0">
              <legend className="text-[11px] font-semibold px-1 text-primary">البيانات الأساسية</legend>
              <div className="grid grid-cols-6 gap-x-3 gap-y-1">
                <div className="col-span-1">
                  <Label className="text-[10px] text-muted-foreground">كود الصنف</Label>
                  <Input
                    value={formData.itemCode || ""}
                    onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
                    disabled={!isEditing || (!isNew && !!item)}
                    className="h-6 text-[11px] px-1"
                    data-testid="input-item-code"
                  />
                </div>
                <div className="col-span-1">
                  <Label className="text-[10px] text-muted-foreground">التصنيف</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v: any) => setFormData({ ...formData, category: v })}
                    disabled={!isEditing}
                  >
                    <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drug">دواء</SelectItem>
                      <SelectItem value="supply">مستلزمات</SelectItem>
                      <SelectItem value="service">خدمة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">الاسم عربي</Label>
                  <Input
                    value={formData.nameAr || ""}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    disabled={!isEditing}
                    className="h-6 text-[11px] px-1"
                    data-testid="input-name-ar"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">الاسم إنجليزي</Label>
                  <Input
                    value={formData.nameEn || ""}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    disabled={!isEditing}
                    className="h-6 text-[11px] px-1"
                    data-testid="input-name-en"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">نوع الشكل</Label>
                  <div className="flex gap-1">
                    <Select
                      value={formData.formTypeId || "none"}
                      onValueChange={(v) => setFormData({ ...formData, formTypeId: v === "none" ? null : v })}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className="h-6 text-[11px] px-1 flex-1" data-testid="select-form-type">
                        <SelectValue placeholder="اختر..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون</SelectItem>
                        {formTypes?.map((ft) => (
                          <SelectItem key={ft.id} value={ft.id}>{ft.nameAr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isEditing && (
                      <Button variant="outline" size="icon" onClick={() => setShowFormTypeDialog(true)} data-testid="button-add-form-type">
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="col-span-2 flex items-end gap-4 pb-1">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="isToxic"
                      checked={formData.isToxic || false}
                      onCheckedChange={(c) => setFormData({ ...formData, isToxic: !!c })}
                      disabled={!isEditing}
                      className="h-3 w-3"
                      data-testid="checkbox-toxic"
                    />
                    <Label htmlFor="isToxic" className="text-[10px] text-red-600 font-medium">سموم</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="isActive"
                      checked={formData.isActive || false}
                      onCheckedChange={(c) => setFormData({ ...formData, isActive: !!c })}
                      disabled={!isEditing}
                      className="h-3 w-3"
                      data-testid="checkbox-active"
                    />
                    <Label htmlFor="isActive" className="text-[10px]">نشط</Label>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
                  <Input
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={!isEditing}
                    className="h-6 text-[11px] px-1"
                    data-testid="input-description"
                  />
                </div>
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-2 flex-shrink-0">
              <fieldset className="peachtree-grid p-2">
                <legend className="text-[11px] font-semibold px-1 text-primary">الأسعار</legend>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">سعر الشراء</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.purchasePriceLast || ""}
                      onChange={(e) => setFormData({ ...formData, purchasePriceLast: e.target.value })}
                      disabled={!isEditing}
                      className="h-6 text-[11px] px-1 font-mono text-left"
                      dir="ltr"
                      data-testid="input-purchase-price"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">سعر البيع</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.salePriceCurrent || ""}
                      onChange={(e) => setFormData({ ...formData, salePriceCurrent: e.target.value })}
                      disabled={!isEditing}
                      className="h-6 text-[11px] px-1 font-mono text-left"
                      dir="ltr"
                      data-testid="input-sale-price"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">هامش الربح</Label>
                    <div className="h-6 flex items-center justify-center bg-emerald-50 border rounded text-[11px] font-bold text-emerald-700">
                      {profitMargin()}%
                    </div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="peachtree-grid p-2">
                <legend className="text-[11px] font-semibold px-1 text-primary">وحدات القياس</legend>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">الكبرى</Label>
                    <Input
                      value={formData.majorUnitName || ""}
                      onChange={(e) => setFormData({ ...formData, majorUnitName: e.target.value })}
                      disabled={!isEditing}
                      placeholder="علبة"
                      className="h-6 text-[11px] px-1"
                      data-testid="input-major-unit"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">المتوسطة</Label>
                    <Input
                      value={formData.mediumUnitName || ""}
                      onChange={(e) => setFormData({ ...formData, mediumUnitName: e.target.value })}
                      disabled={!isEditing}
                      placeholder="شريط"
                      className="h-6 text-[11px] px-1"
                      data-testid="input-medium-unit"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">الصغرى</Label>
                    <Input
                      value={formData.minorUnitName || ""}
                      onChange={(e) => setFormData({ ...formData, minorUnitName: e.target.value })}
                      disabled={!isEditing}
                      placeholder="قرص"
                      className="h-6 text-[11px] px-1"
                      data-testid="input-minor-unit"
                    />
                  </div>
                </div>
              </fieldset>
            </div>

            <fieldset className="peachtree-grid p-2 flex-shrink-0">
              <legend className="text-[11px] font-semibold px-1 text-primary">معاملات التحويل</legend>
              <div className="grid grid-cols-4 gap-3 items-center">
                <div>
                  <Label className="text-[10px] text-muted-foreground">كبرى ← متوسطة</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.majorToMedium || ""}
                    onChange={(e) => setFormData({ ...formData, majorToMedium: e.target.value || null })}
                    disabled={!isEditing}
                    placeholder="3"
                    className="h-6 text-[11px] px-1 font-mono text-left"
                    dir="ltr"
                    data-testid="input-major-to-medium"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">كبرى ← صغرى</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.majorToMinor || ""}
                    onChange={(e) => setFormData({ ...formData, majorToMinor: e.target.value || null })}
                    disabled={!isEditing}
                    placeholder="30"
                    className="h-6 text-[11px] px-1 font-mono text-left"
                    dir="ltr"
                    data-testid="input-major-to-minor"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">متوسطة ← صغرى</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.mediumToMinor || ""}
                    onChange={(e) => setFormData({ ...formData, mediumToMinor: e.target.value || null })}
                    disabled={!isEditing}
                    placeholder="10"
                    className="h-6 text-[11px] px-1 font-mono text-left"
                    dir="ltr"
                    data-testid="input-medium-to-minor"
                  />
                </div>
                <div className="bg-muted/50 rounded px-2 py-1 text-center">
                  <span className="text-[10px] text-muted-foreground block">مثال:</span>
                  <span className="text-[11px] font-medium">{conversionExample()}</span>
                </div>
              </div>
            </fieldset>
          </div>

          {!isNew && (
            <div className="col-span-4 flex flex-col gap-2">
              <fieldset className="peachtree-grid p-2 flex-1">
                <legend className="text-[11px] font-semibold px-1 text-primary">آخر المشتريات</legend>
                {lastPurchases && lastPurchases.length > 0 ? (
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-1 px-1 text-right font-medium">التاريخ</th>
                        <th className="py-1 px-1 text-right font-medium">المورد</th>
                        <th className="py-1 px-1 text-left font-medium">ك</th>
                        <th className="py-1 px-1 text-left font-medium">السعر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastPurchases.map((p, i) => (
                        <tr key={p.id} className={i < lastPurchases.length - 1 ? "border-b border-dashed" : ""}>
                          <td className="py-1 px-1">{formatDateShort(p.txDate)}</td>
                          <td className="py-1 px-1 truncate max-w-[80px]" title={p.supplierName || "-"}>{p.supplierName || "-"}</td>
                          <td className="py-1 px-1 text-left font-mono">{p.qty}</td>
                          <td className="py-1 px-1 text-left font-mono">{formatCurrency(p.purchasePrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-[10px] text-muted-foreground text-center py-2">لا توجد مشتريات</div>
                )}
              </fieldset>

              <fieldset className="peachtree-grid p-2 flex-1">
                <legend className="text-[11px] font-semibold px-1 text-primary">إحصائيات المبيعات</legend>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-[10px]">الفترة:</Label>
                  <Select value={salesPeriod} onValueChange={setSalesPeriod}>
                    <SelectTrigger className="h-5 text-[10px] px-1 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 شهور</SelectItem>
                      <SelectItem value="6">6 شهور</SelectItem>
                      <SelectItem value="12">سنة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div className="bg-blue-50 rounded p-1">
                    <div className="text-[9px] text-muted-foreground">عدد الفواتير</div>
                    <div className="text-sm font-bold text-blue-700">{avgSales?.invoiceCount || 0}</div>
                  </div>
                  <div className="bg-green-50 rounded p-1">
                    <div className="text-[9px] text-muted-foreground">إجمالي الكمية</div>
                    <div className="text-sm font-bold text-green-700">{avgSales?.totalQty || "0"}</div>
                  </div>
                  <div className="bg-purple-50 rounded p-1">
                    <div className="text-[9px] text-muted-foreground">متوسط السعر</div>
                    <div className="text-sm font-bold text-purple-700">{formatCurrency(avgSales?.avgPrice || "0")}</div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="peachtree-grid p-2 flex-1">
                <legend className="text-[11px] font-semibold px-1 text-primary">أسعار حسب القسم (للوحدة الكبرى)</legend>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground">السعر الافتراضي/{item?.majorUnitName || "وحدة"}: {formatCurrency(item?.salePriceCurrent || "0")}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] gap-0.5 px-1"
                    onClick={() => handleOpenDeptPriceDialog()}
                    disabled={availableDepartments.length === 0}
                    data-testid="button-add-dept-price"
                  >
                    <Plus className="h-3 w-3" />
                    إضافة سعر لقسم
                  </Button>
                </div>
                {departmentPrices && departmentPrices.length > 0 ? (
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-1 px-1 text-right font-medium">القسم</th>
                        <th className="py-1 px-1 text-left font-medium">سعر البيع</th>
                        <th className="py-1 px-1 text-center font-medium w-12">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departmentPrices.map((dp, i) => (
                        <tr key={dp.id} className={i < departmentPrices.length - 1 ? "border-b border-dashed" : ""}>
                          <td className="py-1 px-1">{dp.department?.nameAr || "-"}</td>
                          <td className="py-1 px-1 text-left font-mono">{formatCurrency(dp.salePrice)}</td>
                          <td className="py-1 px-1 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDeptPriceDialog(dp)}
                                data-testid={`button-edit-dept-price-${dp.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => deleteDeptPriceMutation.mutate(dp.id)}
                                data-testid={`button-delete-dept-price-${dp.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-[10px] text-muted-foreground text-center py-2">
                    جميع الأقسام تستخدم السعر الافتراضي
                  </div>
                )}
                <div className="mt-2 pt-2 border-t">
                  <div className="text-[9px] text-muted-foreground mb-1">ملخص الأسعار:</div>
                  <div className="text-[10px] space-y-0.5">
                    <div className="flex justify-between">
                      <span>السعر الافتراضي:</span>
                      <span className="font-mono font-medium">{formatCurrency(item?.salePriceCurrent || "0")}</span>
                    </div>
                    {departmentPrices?.map((dp) => (
                      <div key={dp.id} className="flex justify-between text-primary">
                        <span>{dp.department?.nameAr}:</span>
                        <span className="font-mono font-medium">{formatCurrency(dp.salePrice)}</span>
                      </div>
                    ))}
                    {departments?.filter(d => !departmentPrices?.some(dp => dp.departmentId === d.id)).map((dept) => (
                      <div key={dept.id} className="flex justify-between text-muted-foreground">
                        <span>{dept.nameAr}:</span>
                        <span className="font-mono">(افتراضي)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </fieldset>
            </div>
          )}

          {isNew && (
            <div className="col-span-4 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p className="text-[11px]">سيتم عرض إحصائيات الصنف</p>
                <p className="text-[11px]">بعد الحفظ</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showFormTypeDialog} onOpenChange={setShowFormTypeDialog}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة نوع شكل جديد</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">اسم نوع الشكل</Label>
            <Input
              value={newFormTypeName}
              onChange={(e) => setNewFormTypeName(e.target.value)}
              placeholder="مثال: أقراص"
              className="mt-1 h-7 text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowFormTypeDialog(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => createFormTypeMutation.mutate(newFormTypeName)}
              disabled={!newFormTypeName || createFormTypeMutation.isPending}
            >
              {createFormTypeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeptPriceDialog} onOpenChange={setShowDeptPriceDialog}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {selectedDeptPrice ? "تعديل سعر القسم" : "إضافة سعر لقسم"} ({item?.majorUnitName || "الوحدة الكبرى"})
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">القسم</Label>
              {selectedDeptPrice ? (
                <div className="h-6 flex items-center text-[11px] px-1 bg-muted rounded">
                  {selectedDeptPrice.department?.nameAr}
                </div>
              ) : (
                <Select
                  value={newDeptPrice.departmentId}
                  onValueChange={(v) => setNewDeptPrice({ ...newDeptPrice, departmentId: v })}
                >
                  <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-department">
                    <SelectValue placeholder="اختر القسم..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDepartments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">سعر البيع</Label>
              <Input
                type="number"
                step="0.01"
                value={newDeptPrice.salePrice}
                onChange={(e) => setNewDeptPrice({ ...newDeptPrice, salePrice: e.target.value })}
                placeholder="0.00"
                className="h-6 text-[11px] px-1 font-mono text-left"
                dir="ltr"
                data-testid="input-dept-sale-price"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px]"
              onClick={() => {
                setShowDeptPriceDialog(false);
                setSelectedDeptPrice(null);
                setNewDeptPrice({ departmentId: "", salePrice: "" });
              }}
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-[10px]"
              onClick={handleSaveDeptPrice}
              disabled={createDeptPriceMutation.isPending || updateDeptPriceMutation.isPending}
            >
              {(createDeptPriceMutation.isPending || updateDeptPriceMutation.isPending) ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "حفظ"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
