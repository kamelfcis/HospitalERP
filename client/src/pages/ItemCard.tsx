import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  ShoppingCart,
  TrendingUp,
  Calculator,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ItemFormType, PurchaseTransaction, InsertItem } from "@shared/schema";
import { itemCategoryLabels, unitLevelLabels } from "@shared/schema";

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
    queryKey: ["/api/items", itemId, "last-purchases"],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/last-purchases?limit=3`);
      return res.json();
    },
    enabled: !!itemId,
  });

  const getSalesDates = () => {
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - parseInt(salesPeriod));
    return { startDate: startDate.toISOString().split("T")[0], endDate };
  };

  const { data: avgSales } = useQuery<AvgSalesResponse>({
    queryKey: ["/api/items", itemId, "avg-sales", salesPeriod],
    queryFn: async () => {
      const { startDate, endDate } = getSalesDates();
      const res = await fetch(`/api/items/${itemId}/avg-sales?startDate=${startDate}&endDate=${endDate}`);
      return res.json();
    },
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
    const medium = formData.mediumUnitName || "وحدة متوسطة";
    const minor = formData.minorUnitName || "وحدة صغرى";
    const toMedium = formData.majorToMedium || 1;
    const toMinor = formData.majorToMinor || 1;
    return `1 ${major} = ${toMedium} ${medium} = ${toMinor} ${minor}`;
  };

  if (isLoading && !isNew) {
    return (
      <div className="p-2 space-y-2">
        <div className="peachtree-toolbar">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="peachtree-grid p-4">
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="peachtree-grid p-4">
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      <div className="peachtree-toolbar flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">
            {isNew ? "إضافة صنف جديد" : "كارت الصنف"}
          </h1>
          {!isNew && (
            <>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="font-mono text-sm font-bold text-primary">{item?.itemCode}</span>
              <span className="font-semibold">{item?.nameAr}</span>
              {item?.isToxic && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  سموم
                </Badge>
              )}
              {!item?.isActive && (
                <Badge variant="outline" className="text-xs bg-red-50 text-red-700">موقوف</Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => isNew ? navigate("/items") : setIsEditing(false)}
                data-testid="button-cancel"
              >
                <X className="h-3 w-3" />
                إلغاء
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                حفظ
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsEditing(true)}
              data-testid="button-edit"
            >
              تعديل
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => navigate("/items")}
            data-testid="button-back"
          >
            <ArrowRight className="h-3 w-3" />
            رجوع
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="lg:col-span-2 space-y-2">
          <div className="peachtree-grid p-3">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">البيانات الأساسية</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">كود الصنف *</Label>
                <Input
                  value={formData.itemCode || ""}
                  onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
                  disabled={!isEditing || (!isNew && !!item)}
                  className="peachtree-input mt-1"
                  data-testid="input-item-code"
                />
              </div>
              <div>
                <Label className="text-xs">التصنيف *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v: any) => setFormData({ ...formData, category: v })}
                  disabled={!isEditing}
                >
                  <SelectTrigger className="peachtree-select mt-1" data-testid="select-category">
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
                <Label className="text-xs">الاسم عربي *</Label>
                <Input
                  value={formData.nameAr || ""}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  disabled={!isEditing}
                  className="peachtree-input mt-1"
                  data-testid="input-name-ar"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">الاسم إنجليزي</Label>
                <Input
                  value={formData.nameEn || ""}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  disabled={!isEditing}
                  className="peachtree-input mt-1"
                  data-testid="input-name-en"
                />
              </div>
              <div>
                <Label className="text-xs">نوع الشكل</Label>
                <div className="flex gap-1 mt-1">
                  <Select
                    value={formData.formTypeId || "none"}
                    onValueChange={(v) => setFormData({ ...formData, formTypeId: v === "none" ? null : v })}
                    disabled={!isEditing}
                  >
                    <SelectTrigger className="peachtree-select flex-1" data-testid="select-form-type">
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
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-[26px] w-[26px]"
                      onClick={() => setShowFormTypeDialog(true)}
                      data-testid="button-add-form-type"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isToxic"
                    checked={formData.isToxic || false}
                    onCheckedChange={(c) => setFormData({ ...formData, isToxic: !!c })}
                    disabled={!isEditing}
                    data-testid="checkbox-toxic"
                  />
                  <Label htmlFor="isToxic" className="text-xs text-red-600 font-medium">
                    صنف سموم
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isActive"
                    checked={formData.isActive || false}
                    onCheckedChange={(c) => setFormData({ ...formData, isActive: !!c })}
                    disabled={!isEditing}
                    data-testid="checkbox-active"
                  />
                  <Label htmlFor="isActive" className="text-xs">نشط</Label>
                </div>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">ملاحظات</Label>
                <Textarea
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={!isEditing}
                  className="peachtree-input mt-1 min-h-[60px]"
                  data-testid="input-description"
                />
              </div>
            </div>
          </div>

          <div className="peachtree-grid p-3">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <Calculator className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">الأسعار</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">سعر الشراء (آخر)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.purchasePriceLast || ""}
                  onChange={(e) => setFormData({ ...formData, purchasePriceLast: e.target.value })}
                  disabled={!isEditing}
                  className="peachtree-input mt-1"
                  data-testid="input-purchase-price"
                />
              </div>
              <div>
                <Label className="text-xs">سعر البيع (حالي)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.salePriceCurrent || ""}
                  onChange={(e) => setFormData({ ...formData, salePriceCurrent: e.target.value })}
                  disabled={!isEditing}
                  className="peachtree-input mt-1"
                  data-testid="input-sale-price"
                />
              </div>
              <div>
                <Label className="text-xs">هامش الربح</Label>
                <div className="peachtree-input mt-1 flex items-center justify-center bg-muted/50">
                  <span className="text-sm font-semibold text-emerald-600">{profitMargin()}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="peachtree-grid p-3">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">وحدات القياس والتحويل</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">الوحدة الكبرى</Label>
                <Input
                  value={formData.majorUnitName || ""}
                  onChange={(e) => setFormData({ ...formData, majorUnitName: e.target.value })}
                  disabled={!isEditing}
                  placeholder="مثال: علبة"
                  className="peachtree-input mt-1"
                  data-testid="input-major-unit"
                />
              </div>
              <div>
                <Label className="text-xs">الوحدة المتوسطة</Label>
                <Input
                  value={formData.mediumUnitName || ""}
                  onChange={(e) => setFormData({ ...formData, mediumUnitName: e.target.value })}
                  disabled={!isEditing}
                  placeholder="مثال: شريط"
                  className="peachtree-input mt-1"
                  data-testid="input-medium-unit"
                />
              </div>
              <div>
                <Label className="text-xs">الوحدة الصغرى</Label>
                <Input
                  value={formData.minorUnitName || ""}
                  onChange={(e) => setFormData({ ...formData, minorUnitName: e.target.value })}
                  disabled={!isEditing}
                  placeholder="مثال: قرص"
                  className="peachtree-input mt-1"
                  data-testid="input-minor-unit"
                />
              </div>
              <div>
                <Label className="text-xs">الكبرى = ؟ متوسطة</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.majorToMedium || ""}
                  onChange={(e) => setFormData({ ...formData, majorToMedium: e.target.value || null })}
                  disabled={!isEditing}
                  placeholder="مثال: 3"
                  className="peachtree-input mt-1"
                  data-testid="input-major-to-medium"
                />
              </div>
              <div>
                <Label className="text-xs">الكبرى = ؟ صغرى</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.majorToMinor || ""}
                  onChange={(e) => setFormData({ ...formData, majorToMinor: e.target.value || null })}
                  disabled={!isEditing}
                  placeholder="مثال: 21"
                  className="peachtree-input mt-1"
                  data-testid="input-major-to-minor"
                />
              </div>
              <div>
                <Label className="text-xs">المتوسطة = ؟ صغرى</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.mediumToMinor || ""}
                  onChange={(e) => setFormData({ ...formData, mediumToMinor: e.target.value || null })}
                  disabled={!isEditing}
                  placeholder="محسوب: 7"
                  className="peachtree-input mt-1"
                  data-testid="input-medium-to-minor"
                />
              </div>
            </div>
            {(formData.majorUnitName || formData.mediumUnitName || formData.minorUnitName) && (
              <div className="mt-3 p-2 bg-muted/30 rounded text-xs text-center">
                <span className="text-muted-foreground">مثال التحويل:</span>{" "}
                <span className="font-semibold">{conversionExample()}</span>
              </div>
            )}
          </div>
        </div>

        {!isNew && (
          <div className="space-y-2">
            <div className="peachtree-grid p-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">آخر 3 مشتريات</h2>
              </div>
              {lastPurchases && lastPurchases.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1 text-right">التاريخ</th>
                      <th className="py-1 text-right">المورد</th>
                      <th className="py-1 text-left">الكمية</th>
                      <th className="py-1 text-left">السعر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastPurchases.map((p) => (
                      <tr key={p.id} className="border-b border-dashed">
                        <td className="py-1">{formatDateShort(p.txDate)}</td>
                        <td className="py-1">{p.supplierName || "-"}</td>
                        <td className="py-1 text-left font-mono">{p.qty}</td>
                        <td className="py-1 text-left font-mono">{formatCurrency(p.purchasePrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  لا توجد مشتريات سابقة
                </div>
              )}
            </div>

            <div className="peachtree-grid p-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">متوسط المبيعات</h2>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs">الفترة:</span>
                <Select value={salesPeriod} onValueChange={setSalesPeriod}>
                  <SelectTrigger className="peachtree-select w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">آخر 3 شهور</SelectItem>
                    <SelectItem value="6">آخر 6 شهور</SelectItem>
                    <SelectItem value="12">آخر 12 شهر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {avgSales ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-lg font-bold text-primary">{formatCurrency(avgSales.avgPrice)}</div>
                    <div className="text-xs text-muted-foreground">متوسط السعر</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-lg font-bold">{avgSales.totalQty}</div>
                    <div className="text-xs text-muted-foreground">إجمالي الكميات</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-lg font-bold">{avgSales.invoiceCount}</div>
                    <div className="text-xs text-muted-foreground">عدد الفواتير</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  لا توجد مبيعات
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showFormTypeDialog} onOpenChange={setShowFormTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة نوع شكل جديد</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-xs">اسم نوع الشكل بالعربي</Label>
            <Input
              value={newFormTypeName}
              onChange={(e) => setNewFormTypeName(e.target.value)}
              placeholder="مثال: أقراص، كريم، فوار..."
              className="peachtree-input mt-1"
              data-testid="input-new-form-type"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormTypeDialog(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => createFormTypeMutation.mutate(newFormTypeName)}
              disabled={!newFormTypeName || createFormTypeMutation.isPending}
            >
              {createFormTypeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "إضافة"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
