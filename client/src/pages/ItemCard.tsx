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
  Barcode,
  CalendarClock,
} from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ItemFormType, PurchaseTransaction, InsertItem, Department, ItemDepartmentPriceWithDepartment, ItemBarcode, ItemUom } from "@shared/schema";

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
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [newBarcodeValue, setNewBarcodeValue] = useState("");
  const [newBarcodeType, setNewBarcodeType] = useState("EAN-13");
  const [showUomDialog, setShowUomDialog] = useState(false);
  const [newUomCode, setNewUomCode] = useState("");
  const [newUomNameAr, setNewUomNameAr] = useState("");
  const [newUomNameEn, setNewUomNameEn] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [uniquenessResult, setUniquenessResult] = useState<{ codeUnique: boolean; nameArUnique: boolean; nameEnUnique: boolean } | null>(null);

  const [formData, setFormData] = useState<Partial<InsertItem>>({
    itemCode: "",
    nameAr: "",
    nameEn: "",
    category: "drug",
    isToxic: false,
    hasExpiry: true,
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

  const { data: uoms, refetch: refetchUoms } = useQuery<ItemUom[]>({
    queryKey: ["/api/uoms"],
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

  const { data: barcodes, refetch: refetchBarcodes } = useQuery<ItemBarcode[]>({
    queryKey: [`/api/items/${itemId}/barcodes`],
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
        hasExpiry: item.hasExpiry,
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

  useEffect(() => {
    if (isNew) {
      const cat = formData.category;
      if (cat === "service") {
        setFormData(prev => ({ ...prev, hasExpiry: false }));
      } else if (cat === "drug") {
        setFormData(prev => ({ ...prev, hasExpiry: true }));
      } else if (cat === "supply") {
        setFormData(prev => ({ ...prev, hasExpiry: false }));
      }
    }
  }, [formData.category, isNew]);

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

  const addBarcodeMutation = useMutation({
    mutationFn: async (data: { barcodeValue: string; barcodeType: string }) => {
      const res = await apiRequest("POST", `/api/items/${itemId}/barcodes`, data);
      return res.json();
    },
    onSuccess: () => {
      refetchBarcodes();
      setShowBarcodeDialog(false);
      setNewBarcodeValue("");
      setNewBarcodeType("EAN-13");
      toast({ title: "تم إضافة الباركود بنجاح" });
    },
    onError: (error: any) => {
      const msg = error.message || "";
      if (msg.includes("409") || msg.includes("مسجل")) {
        toast({ title: "خطأ", description: "هذا الباركود مسجل بالفعل لصنف آخر", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: msg, variant: "destructive" });
      }
    },
  });

  const deleteBarcodeMutation = useMutation({
    mutationFn: async (barcodeId: string) => {
      return apiRequest("DELETE", `/api/barcodes/${barcodeId}`);
    },
    onSuccess: () => {
      refetchBarcodes();
      toast({ title: "تم حذف الباركود" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const expirySettingMutation = useMutation({
    mutationFn: async (hasExpiry: boolean) => {
      const res = await apiRequest("PUT", `/api/items/${itemId}/expiry-settings`, { hasExpiry });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId] });
      toast({ title: data.hasExpiry ? "تم تفعيل الصلاحية" : "تم إلغاء الصلاحية" });
    },
    onError: (error: any) => {
      const msg = error.message || "";
      if (msg.includes("409")) {
        toast({ title: "خطأ", description: "لا يمكن إلغاء الصلاحية: يوجد دفعات نشطة بصلاحية", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: msg, variant: "destructive" });
      }
    },
  });

  const createUomMutation = useMutation({
    mutationFn: async (data: { code: string; nameAr: string; nameEn?: string }) => {
      return apiRequest("POST", "/api/uoms", data);
    },
    onSuccess: async () => {
      refetchUoms();
      setShowUomDialog(false);
      setNewUomCode("");
      setNewUomNameAr("");
      setNewUomNameEn("");
      toast({ title: "تم إضافة وحدة القياس بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!formData.itemCode?.trim()) errors.itemCode = "مطلوب";
    if (!formData.nameAr?.trim()) errors.nameAr = "مطلوب";
    if (!formData.nameEn?.trim()) errors.nameEn = "مطلوب";
    if (!formData.formTypeId) errors.formTypeId = "مطلوب";
    if (!formData.majorUnitName?.trim()) errors.majorUnitName = "مطلوب";

    const hasMedium = !!formData.mediumUnitName?.trim();
    const hasMinor = !!formData.minorUnitName?.trim();

    if (hasMinor && !hasMedium) {
      errors.mediumUnitName = "يجب اختيار المتوسطة قبل الصغرى";
    }

    if (hasMedium) {
      const majorToMedium = parseFloat(formData.majorToMedium as string || "0");
      if (majorToMedium <= 0) errors.majorToMedium = "يجب > 0";
    }
    if (hasMinor) {
      const majorToMinor = parseFloat(formData.majorToMinor as string || "0");
      if (majorToMinor <= 0) errors.majorToMinor = "يجب > 0";
      if (hasMedium) {
        const mediumToMinor = parseFloat(formData.mediumToMinor as string || "0");
        if (mediumToMinor <= 0) errors.mediumToMinor = "يجب > 0";
      }
    }

    const units = [formData.majorUnitName, formData.mediumUnitName, formData.minorUnitName].filter(Boolean);
    const uniqueUnits = new Set(units.map(u => u?.trim().toLowerCase()));
    if (units.length > 0 && uniqueUnits.size < units.length) {
      errors.unitDuplicate = "لا يمكن تكرار نفس الوحدة";
    }

    return errors;
  };

  useEffect(() => {
    if (!isEditing) return;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (formData.itemCode?.trim()) params.set("code", formData.itemCode.trim());
      if (formData.nameAr?.trim()) params.set("nameAr", formData.nameAr.trim());
      if (formData.nameEn?.trim()) params.set("nameEn", formData.nameEn.trim());
      if (itemId) params.set("excludeId", itemId);
      if (params.toString()) {
        try {
          const res = await fetch(`/api/items/check-unique?${params}`);
          const data = await res.json();
          setUniquenessResult(data);
        } catch {}
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.itemCode, formData.nameAr, formData.nameEn, isEditing, itemId]);

  const handleSave = () => {
    const errors = validateForm();

    if (uniquenessResult) {
      if (!uniquenessResult.codeUnique) errors.itemCode = "كود مكرر";
      if (!uniquenessResult.nameArUnique) errors.nameAr = "اسم عربي مكرر";
      if (!uniquenessResult.nameEnUnique) errors.nameEn = "اسم إنجليزي مكرر";
    }

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "خطأ", description: "يرجى تصحيح الحقول المطلوبة", variant: "destructive" });
      return;
    }
    const dataToSave = { ...formData };
    if (!dataToSave.mediumUnitName?.trim()) {
      dataToSave.mediumUnitName = "";
      dataToSave.majorToMedium = null;
    }
    if (!dataToSave.minorUnitName?.trim()) {
      dataToSave.minorUnitName = "";
      dataToSave.majorToMinor = null;
      dataToSave.mediumToMinor = null;
    }
    saveMutation.mutate(dataToSave);
  };

  const profitMargin = () => {
    const purchase = parseFloat(formData.purchasePriceLast || "0");
    const sale = parseFloat(formData.salePriceCurrent || "0");
    if (purchase <= 0) return 0;
    return ((sale - purchase) / purchase * 100).toFixed(1);
  };

  const hasMediumUnit = !!formData.mediumUnitName?.trim();
  const hasMinorUnit = !!formData.minorUnitName?.trim();

  const conversionExample = () => {
    const major = formData.majorUnitName || "وحدة كبرى";
    const medium = formData.mediumUnitName;
    const minor = formData.minorUnitName;
    const toMedium = formData.majorToMedium;
    const toMinor = formData.majorToMinor;
    
    if (medium && minor && toMedium && toMinor) {
      return `1 ${major} = ${toMedium} ${medium} = ${toMinor} ${minor}`;
    }
    if (medium && toMedium) {
      return `1 ${major} = ${toMedium} ${medium}`;
    }
    return `وحدة واحدة فقط: ${major}`;
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

  const handleAddBarcode = () => {
    const trimmed = newBarcodeValue.trim();
    if (!trimmed) {
      toast({ title: "خطأ", description: "قيمة الباركود مطلوبة", variant: "destructive" });
      return;
    }
    if (!/^[a-zA-Z0-9\-\.]+$/.test(trimmed)) {
      toast({ title: "خطأ", description: "الباركود يجب أن يحتوي على أرقام وحروف إنجليزية فقط", variant: "destructive" });
      return;
    }
    addBarcodeMutation.mutate({ barcodeValue: trimmed, barcodeType: newBarcodeType });
  };

  const isExpiryLocked = formData.category === "service";
  const activeBarcodes = barcodes?.filter(b => b.isActive) || [];

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
            <Button size="sm" className="text-[11px] px-2" onClick={() => { setIsEditing(true); setValidationErrors({}); }} data-testid="button-edit">
              تعديل
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-[11px] gap-1 px-2" onClick={() => navigate("/items")} data-testid="button-back">
            <ArrowRight className="h-3 w-3" />
            رجوع
          </Button>
        </div>
      </div>

      <div className="flex-1 p-2 overflow-auto">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-8 flex flex-col gap-2">
            <fieldset className="peachtree-grid p-2 flex-shrink-0">
              <legend className="text-[11px] font-semibold px-1 text-primary">البيانات الأساسية</legend>
              <div className="grid grid-cols-6 gap-x-3 gap-y-1">
                <div className="col-span-1">
                  <Label className={`text-[10px] ${validationErrors.itemCode ? "text-destructive" : "text-muted-foreground"}`}>كود الصنف *</Label>
                  <Input
                    value={formData.itemCode || ""}
                    onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
                    disabled={!isEditing || (!isNew && !!item)}
                    className={`h-6 text-[11px] px-1 ${validationErrors.itemCode ? "border-destructive" : ""}`}
                    data-testid="input-item-code"
                  />
                  {validationErrors.itemCode && <span className="text-[9px] text-destructive">{validationErrors.itemCode}</span>}
                  {uniquenessResult && !uniquenessResult.codeUnique && (
                    <span className="text-[9px] text-destructive">كود مكرر</span>
                  )}
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
                  <Label className={`text-[10px] ${validationErrors.nameAr ? "text-destructive" : "text-muted-foreground"}`}>الاسم عربي *</Label>
                  <Input
                    value={formData.nameAr || ""}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    disabled={!isEditing}
                    className={`h-6 text-[11px] px-1 ${validationErrors.nameAr ? "border-destructive" : ""}`}
                    data-testid="input-name-ar"
                  />
                  {validationErrors.nameAr && <span className="text-[9px] text-destructive">{validationErrors.nameAr}</span>}
                  {uniquenessResult && !uniquenessResult.nameArUnique && (
                    <span className="text-[9px] text-destructive">اسم عربي مكرر</span>
                  )}
                </div>
                <div className="col-span-2">
                  <Label className={`text-[10px] ${validationErrors.nameEn ? "text-destructive" : "text-muted-foreground"}`}>الاسم إنجليزي *</Label>
                  <Input
                    value={formData.nameEn || ""}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    disabled={!isEditing}
                    className={`h-6 text-[11px] px-1 ${validationErrors.nameEn ? "border-destructive" : ""}`}
                    data-testid="input-name-en"
                  />
                  {validationErrors.nameEn && <span className="text-[9px] text-destructive">{validationErrors.nameEn}</span>}
                  {uniquenessResult && !uniquenessResult.nameEnUnique && (
                    <span className="text-[9px] text-destructive">اسم إنجليزي مكرر</span>
                  )}
                </div>
                <div className="col-span-2">
                  <Label className={`text-[10px] ${validationErrors.formTypeId ? "text-destructive" : "text-muted-foreground"}`}>نوع الشكل *</Label>
                  <div className="flex gap-1">
                    <Select
                      value={formData.formTypeId || "none"}
                      onValueChange={(v) => setFormData({ ...formData, formTypeId: v === "none" ? null : v })}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className={`h-6 text-[11px] px-1 flex-1 ${validationErrors.formTypeId ? "border-destructive" : ""}`} data-testid="select-form-type">
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
                <div className="col-span-2 flex items-end gap-3 pb-1">
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
                      id="hasExpiry"
                      checked={formData.hasExpiry || false}
                      onCheckedChange={(c) => {
                        if (isNew) {
                          setFormData({ ...formData, hasExpiry: !!c });
                        } else if (itemId) {
                          expirySettingMutation.mutate(!!c);
                        }
                      }}
                      disabled={(!isEditing && !itemId) || isExpiryLocked || expirySettingMutation.isPending}
                      className="h-3 w-3"
                      data-testid="checkbox-has-expiry"
                    />
                    <Label htmlFor="hasExpiry" className="text-[10px] text-orange-600 font-medium flex items-center gap-0.5">
                      <CalendarClock className="h-3 w-3" />
                      صلاحية
                    </Label>
                    {isExpiryLocked && (
                      <span className="text-[9px] text-muted-foreground">(مقفل)</span>
                    )}
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
                <legend className="text-[11px] font-semibold px-1 text-primary flex items-center gap-1">
                  وحدات القياس
                  {isEditing && (
                    <Button variant="outline" size="sm" className="text-[9px] gap-0.5 px-1 h-4" onClick={() => setShowUomDialog(true)} data-testid="button-add-uom">
                      <Plus className="h-2.5 w-2.5" />
                      إضافة وحدة
                    </Button>
                  )}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className={`text-[10px] ${validationErrors.majorUnitName ? "text-destructive" : "text-muted-foreground"}`}>الكبرى *</Label>
                    <Select
                      value={formData.majorUnitName || "none"}
                      onValueChange={(v) => setFormData({ ...formData, majorUnitName: v === "none" ? "" : v })}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className={`h-6 text-[11px] px-1 ${validationErrors.majorUnitName ? "border-destructive" : ""}`} data-testid="select-major-unit">
                        <SelectValue placeholder="اختر..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {uoms?.map((u) => (
                          <SelectItem key={u.id} value={u.nameAr}>{u.nameAr} ({u.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {validationErrors.majorUnitName && <span className="text-[9px] text-destructive">{validationErrors.majorUnitName}</span>}
                  </div>
                  <div>
                    <Label className={`text-[10px] ${validationErrors.mediumUnitName ? "text-destructive" : "text-muted-foreground"}`}>المتوسطة</Label>
                    <Select
                      value={formData.mediumUnitName || "none"}
                      onValueChange={(v) => {
                        const newMedium = v === "none" ? "" : v;
                        const updates: Partial<typeof formData> = { mediumUnitName: newMedium };
                        if (!newMedium) {
                          updates.majorToMedium = null;
                          updates.mediumToMinor = null;
                          updates.minorUnitName = "";
                          updates.majorToMinor = null;
                        }
                        setFormData({ ...formData, ...updates });
                      }}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className={`h-6 text-[11px] px-1 ${validationErrors.mediumUnitName ? "border-destructive" : ""}`} data-testid="select-medium-unit">
                        <SelectValue placeholder="اختر..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {uoms?.map((u) => (
                          <SelectItem key={u.id} value={u.nameAr}>{u.nameAr} ({u.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {validationErrors.mediumUnitName && <span className="text-[9px] text-destructive">{validationErrors.mediumUnitName}</span>}
                  </div>
                  <div>
                    <Label className={`text-[10px] ${validationErrors.minorUnitName ? "text-destructive" : "text-muted-foreground"}`}>الصغرى</Label>
                    <Select
                      value={formData.minorUnitName || "none"}
                      onValueChange={(v) => {
                        const newMinor = v === "none" ? "" : v;
                        const updates: Partial<typeof formData> = { minorUnitName: newMinor };
                        if (!newMinor) {
                          updates.majorToMinor = null;
                          updates.mediumToMinor = null;
                        }
                        setFormData({ ...formData, ...updates });
                      }}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className={`h-6 text-[11px] px-1 ${validationErrors.minorUnitName ? "border-destructive" : ""}`} data-testid="select-minor-unit">
                        <SelectValue placeholder="اختر..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {uoms?.map((u) => (
                          <SelectItem key={u.id} value={u.nameAr}>{u.nameAr} ({u.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {validationErrors.minorUnitName && <span className="text-[9px] text-destructive">{validationErrors.minorUnitName}</span>}
                  </div>
                </div>
                {validationErrors.unitDuplicate && (
                  <div className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1 mt-1">
                    {validationErrors.unitDuplicate}
                  </div>
                )}
              </fieldset>
            </div>

            {(hasMediumUnit || hasMinorUnit) && (
              <fieldset className="peachtree-grid p-2 flex-shrink-0">
                <legend className="text-[11px] font-semibold px-1 text-primary">معاملات التحويل</legend>
                <div className="grid grid-cols-4 gap-3 items-center">
                  {hasMediumUnit && (
                    <div>
                      <Label className={`text-[10px] ${validationErrors.majorToMedium ? "text-destructive" : "text-muted-foreground"}`}>كبرى ← متوسطة *</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.majorToMedium || ""}
                        onChange={(e) => setFormData({ ...formData, majorToMedium: e.target.value || null })}
                        disabled={!isEditing}
                        placeholder="3"
                        className={`h-6 text-[11px] px-1 font-mono text-left ${validationErrors.majorToMedium ? "border-destructive" : ""}`}
                        dir="ltr"
                        data-testid="input-major-to-medium"
                      />
                      {validationErrors.majorToMedium && <span className="text-[9px] text-destructive">{validationErrors.majorToMedium}</span>}
                    </div>
                  )}
                  {hasMinorUnit && (
                    <div>
                      <Label className={`text-[10px] ${validationErrors.majorToMinor ? "text-destructive" : "text-muted-foreground"}`}>كبرى ← صغرى *</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.majorToMinor || ""}
                        onChange={(e) => setFormData({ ...formData, majorToMinor: e.target.value || null })}
                        disabled={!isEditing}
                        placeholder="30"
                        className={`h-6 text-[11px] px-1 font-mono text-left ${validationErrors.majorToMinor ? "border-destructive" : ""}`}
                        dir="ltr"
                        data-testid="input-major-to-minor"
                      />
                      {validationErrors.majorToMinor && <span className="text-[9px] text-destructive">{validationErrors.majorToMinor}</span>}
                    </div>
                  )}
                  {hasMediumUnit && hasMinorUnit && (
                    <div>
                      <Label className={`text-[10px] ${validationErrors.mediumToMinor ? "text-destructive" : "text-muted-foreground"}`}>متوسطة ← صغرى *</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.mediumToMinor || ""}
                        onChange={(e) => setFormData({ ...formData, mediumToMinor: e.target.value || null })}
                        disabled={!isEditing}
                        placeholder="10"
                        className={`h-6 text-[11px] px-1 font-mono text-left ${validationErrors.mediumToMinor ? "border-destructive" : ""}`}
                        dir="ltr"
                        data-testid="input-medium-to-minor"
                      />
                      {validationErrors.mediumToMinor && <span className="text-[9px] text-destructive">{validationErrors.mediumToMinor}</span>}
                    </div>
                  )}
                  <div className="bg-muted/50 rounded px-2 py-1 text-center">
                    <span className="text-[10px] text-muted-foreground block">مثال:</span>
                    <span className="text-[11px] font-medium">{conversionExample()}</span>
                  </div>
                </div>
              </fieldset>
            )}
            {!hasMediumUnit && !hasMinorUnit && (
              <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-3 py-2">
                الصنف بوحدة واحدة فقط ({formData.majorUnitName || "الكبرى"}) — يمكنك إضافة وحدة متوسطة أو صغرى اختيارياً
              </div>
            )}

            {!isNew && (
              <fieldset className="peachtree-grid p-2 flex-shrink-0">
                <legend className="text-[11px] font-semibold px-1 text-primary flex items-center gap-1">
                  <Barcode className="h-3.5 w-3.5" />
                  الباركود / الكود الدولي
                </legend>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground">
                    {activeBarcodes.length > 0 ? `${activeBarcodes.length} باركود مسجل` : "لا يوجد باركود"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] gap-0.5 px-1"
                    onClick={() => setShowBarcodeDialog(true)}
                    data-testid="button-add-barcode"
                  >
                    <Plus className="h-3 w-3" />
                    إضافة باركود
                  </Button>
                </div>
                {activeBarcodes.length > 0 ? (
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-1 px-1 text-right font-medium">الباركود</th>
                        <th className="py-1 px-1 text-right font-medium">النوع</th>
                        <th className="py-1 px-1 text-right font-medium">تاريخ الإضافة</th>
                        <th className="py-1 px-1 text-center font-medium w-10">حذف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBarcodes.map((bc, i) => (
                        <tr key={bc.id} className={i < activeBarcodes.length - 1 ? "border-b border-dashed" : ""} data-testid={`row-barcode-${bc.id}`}>
                          <td className="py-1 px-1 font-mono font-medium" dir="ltr">{bc.barcodeValue}</td>
                          <td className="py-1 px-1">
                            {bc.barcodeType ? (
                              <Badge variant="outline" className="text-[9px] h-4">{bc.barcodeType}</Badge>
                            ) : "-"}
                          </td>
                          <td className="py-1 px-1">{formatDateShort(bc.createdAt)}</td>
                          <td className="py-1 px-1 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => deleteBarcodeMutation.mutate(bc.id)}
                              disabled={deleteBarcodeMutation.isPending}
                              data-testid={`button-delete-barcode-${bc.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-[10px] text-muted-foreground text-center py-3 border border-dashed rounded">
                    لم يتم تسجيل أي باركود بعد
                  </div>
                )}
              </fieldset>
            )}
          </div>

          {!isNew && (
            <div className="col-span-4 flex flex-col gap-2">
              <fieldset className="peachtree-grid p-2">
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

              <fieldset className="peachtree-grid p-2">
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

              <fieldset className="peachtree-grid p-2">
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

      <Dialog open={showBarcodeDialog} onOpenChange={setShowBarcodeDialog}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1">
              <Barcode className="h-4 w-4" />
              إضافة باركود جديد
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">قيمة الباركود</Label>
              <Input
                value={newBarcodeValue}
                onChange={(e) => setNewBarcodeValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddBarcode();
                  }
                }}
                placeholder="مثال: 6221234567890"
                className="h-7 text-xs font-mono text-left"
                dir="ltr"
                autoFocus
                data-testid="input-barcode-value"
              />
              <p className="text-[9px] text-muted-foreground mt-1">يمكنك استخدام الاسكنر مباشرة أو كتابة الباركود يدوياً</p>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">نوع الباركود (اختياري)</Label>
              <Select value={newBarcodeType} onValueChange={setNewBarcodeType}>
                <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-barcode-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EAN-13">EAN-13</SelectItem>
                  <SelectItem value="EAN-8">EAN-8</SelectItem>
                  <SelectItem value="Code128">Code 128</SelectItem>
                  <SelectItem value="Code39">Code 39</SelectItem>
                  <SelectItem value="UPC-A">UPC-A</SelectItem>
                  <SelectItem value="QR">QR Code</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px]"
              onClick={() => {
                setShowBarcodeDialog(false);
                setNewBarcodeValue("");
                setNewBarcodeType("EAN-13");
              }}
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-[10px]"
              onClick={handleAddBarcode}
              disabled={addBarcodeMutation.isPending || !newBarcodeValue.trim()}
              data-testid="button-save-barcode"
            >
              {addBarcodeMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "إضافة"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUomDialog} onOpenChange={setShowUomDialog}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة وحدة قياس جديدة</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div>
              <Label className="text-xs">الكود</Label>
              <Input
                value={newUomCode}
                onChange={(e) => setNewUomCode(e.target.value)}
                placeholder="مثال: BOX"
                className="mt-1 h-7 text-xs font-mono text-left"
                dir="ltr"
                data-testid="input-uom-code"
              />
            </div>
            <div>
              <Label className="text-xs">الاسم عربي</Label>
              <Input
                value={newUomNameAr}
                onChange={(e) => setNewUomNameAr(e.target.value)}
                placeholder="مثال: علبة"
                className="mt-1 h-7 text-xs"
                data-testid="input-uom-name-ar"
              />
            </div>
            <div>
              <Label className="text-xs">الاسم إنجليزي</Label>
              <Input
                value={newUomNameEn}
                onChange={(e) => setNewUomNameEn(e.target.value)}
                placeholder="مثال: Box"
                className="mt-1 h-7 text-xs"
                data-testid="input-uom-name-en"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowUomDialog(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => createUomMutation.mutate({ code: newUomCode, nameAr: newUomNameAr, nameEn: newUomNameEn || undefined })}
              disabled={!newUomCode || !newUomNameAr || createUomMutation.isPending}
              data-testid="button-save-uom"
            >
              {createUomMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
