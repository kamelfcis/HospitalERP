import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ItemFormType, 
  PurchaseTransaction, 
  InsertItem, 
  Department, 
  ItemDepartmentPriceWithDepartment, 
  ItemBarcode, 
  ItemUom 
} from "@shared/schema";
import type { ItemWithFormType, AvgSalesResponse } from "../types";

export function useItemCard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/items/:id");
  const isNew = params?.id === "new";
  const itemId = isNew ? null : params?.id ?? null;

  const [isEditing, setIsEditing] = useState(isNew);
  const [showFormTypeDialog, setShowFormTypeDialog] = useState(false);
  const [newFormTypeName, setNewFormTypeName] = useState("");
  const [salesPeriod, setSalesPeriod] = useState("3");
  const [purchaseFromDate, setPurchaseFromDate] = useState("");
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

  // input[type=month] returns "YYYY-MM"; API needs a full date "YYYY-MM-01"
  const purchaseFromDateFull = purchaseFromDate ? `${purchaseFromDate}-01` : "";
  const purchaseQueryParams = purchaseFromDateFull ? `?fromDate=${purchaseFromDateFull}` : "";
  const { data: lastPurchases } = useQuery<PurchaseTransaction[]>({
    queryKey: [`/api/items/${itemId}/last-purchases${purchaseQueryParams}`],
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!formData.itemCode?.trim()) errors.itemCode = "مطلوب";
    if (!formData.nameAr?.trim()) errors.nameAr = "مطلوب";
    if (!formData.nameEn?.trim()) errors.nameEn = "مطلوب";
    if (!formData.formTypeId) errors.formTypeId = "مطلوب";

    const isServiceItem = formData.category === "service";

    if (!isServiceItem) {
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
    }

    return errors;
  };

  useEffect(() => {
    if (!isEditing) return;
    const timer = setTimeout(async () => {
      const urlParams = new URLSearchParams();
      if (formData.itemCode?.trim()) urlParams.set("code", formData.itemCode.trim());
      if (formData.nameAr?.trim()) urlParams.set("nameAr", formData.nameAr.trim());
      if (formData.nameEn?.trim()) urlParams.set("nameEn", formData.nameEn.trim());
      if (itemId) urlParams.set("excludeId", itemId);
      if (urlParams.toString()) {
        try {
          const res = await fetch(`/api/items/check-unique?${urlParams}`);
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
    if (dataToSave.category === "service") {
      dataToSave.majorUnitName = "";
      dataToSave.mediumUnitName = "";
      dataToSave.minorUnitName = "";
      dataToSave.majorToMedium = null;
      dataToSave.majorToMinor = null;
      dataToSave.mediumToMinor = null;
    } else {
      if (!dataToSave.mediumUnitName?.trim()) {
        dataToSave.mediumUnitName = "";
        dataToSave.majorToMedium = null;
      }
      if (!dataToSave.minorUnitName?.trim()) {
        dataToSave.minorUnitName = "";
        dataToSave.majorToMinor = null;
        dataToSave.mediumToMinor = null;
      }
    }
    saveMutation.mutate(dataToSave);
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

  const isService = formData.category === "service";
  const isExpiryLocked = isService;
  const activeBarcodes = barcodes?.filter(b => b.isActive) || [];
  const hasMediumUnit = !!formData.mediumUnitName?.trim();
  const hasMinorUnit = !!formData.minorUnitName?.trim();

  const availableDepartments = departments?.filter(
    (dept) => !departmentPrices?.some((dp) => dp.departmentId === dept.id)
  ) || [];

  return {
    isNew,
    itemId,
    isEditing,
    setIsEditing,
    item,
    isLoading,
    formTypes,
    uoms,
    lastPurchases,
    avgSales,
    salesPeriod,
    setSalesPeriod,
    purchaseFromDate,
    setPurchaseFromDate,
    formData,
    setFormData,
    validationErrors,
    setValidationErrors,
    uniquenessResult,
    showFormTypeDialog,
    setShowFormTypeDialog,
    newFormTypeName,
    setNewFormTypeName,
    showDeptPriceDialog,
    setShowDeptPriceDialog,
    selectedDeptPrice,
    setSelectedDeptPrice,
    newDeptPrice,
    setNewDeptPrice,
    showBarcodeDialog,
    setShowBarcodeDialog,
    newBarcodeValue,
    setNewBarcodeValue,
    newBarcodeType,
    setNewBarcodeType,
    showUomDialog,
    setShowUomDialog,
    newUomCode,
    setNewUomCode,
    newUomNameAr,
    setNewUomNameAr,
    newUomNameEn,
    setNewUomNameEn,
    handleSave,
    saveMutation,
    createFormTypeMutation,
    handleSaveDeptPrice,
    createDeptPriceMutation,
    updateDeptPriceMutation,
    deleteDeptPriceMutation,
    handleAddBarcode,
    addBarcodeMutation,
    deleteBarcodeMutation,
    expirySettingMutation,
    createUomMutation,
    handleOpenDeptPriceDialog,
    isService,
    isExpiryLocked,
    activeBarcodes,
    hasMediumUnit,
    hasMinorUnit,
    departmentPrices,
    availableDepartments,
    navigate,
  };
}
