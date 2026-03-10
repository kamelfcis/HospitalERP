import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InsertItem, ItemFormType, ItemUom } from "@shared/schema";
import type { ItemWithFormType } from "../types";

interface UseItemFormOptions {
  itemId: string | null;
  isNew: boolean;
  item: ItemWithFormType | undefined;
  formTypes: ItemFormType[] | undefined;
  uoms: ItemUom[] | undefined;
  refetchFormTypes: () => void;
  refetchUoms: () => void;
  onSaveSuccess: (newItem?: { id: string }) => void;
}

const DEFAULT_FORM: Partial<InsertItem> = {
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
};

export function useItemForm({
  itemId,
  isNew,
  item,
  refetchFormTypes,
  onSaveSuccess,
}: UseItemFormOptions) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertItem>>(DEFAULT_FORM);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [uniquenessResult, setUniquenessResult] = useState<{
    codeUnique: boolean;
    nameArUnique: boolean;
    nameEnUnique: boolean;
  } | null>(null);

  const [showFormTypeDialog, setShowFormTypeDialog] = useState(false);
  const [newFormTypeName, setNewFormTypeName] = useState("");

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
    if (!isNew) return;
    const cat = formData.category;
    if (cat === "service") setFormData(p => ({ ...p, hasExpiry: false }));
    else if (cat === "drug") setFormData(p => ({ ...p, hasExpiry: true }));
    else if (cat === "supply") setFormData(p => ({ ...p, hasExpiry: false }));
  }, [formData.category, isNew]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const p = new URLSearchParams();
      if (formData.itemCode?.trim()) p.set("code", formData.itemCode.trim());
      if (formData.nameAr?.trim()) p.set("nameAr", formData.nameAr.trim());
      if (formData.nameEn?.trim()) p.set("nameEn", formData.nameEn.trim());
      if (itemId) p.set("excludeId", itemId);
      if (!p.toString()) return;
      try {
        const res = await fetch(`/api/items/check-unique?${p}`);
        setUniquenessResult(await res.json());
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.itemCode, formData.nameAr, formData.nameEn, itemId]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InsertItem>) =>
      isNew
        ? apiRequest("POST", "/api/items", data)
        : apiRequest("PUT", `/api/items/${itemId}`, data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: isNew ? "تم إنشاء الصنف بنجاح" : "تم حفظ التعديلات بنجاح" });
      onSaveSuccess(res);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const createFormTypeMutation = useMutation({
    mutationFn: (nameAr: string) =>
      apiRequest("POST", "/api/form-types", { nameAr, sortOrder: 0, isActive: true }),
    onSuccess: (newFt: any) => {
      refetchFormTypes();
      setFormData(p => ({ ...p, formTypeId: newFt.id }));
      setShowFormTypeDialog(false);
      setNewFormTypeName("");
      toast({ title: "تم إضافة نوع الشكل بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
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
    onError: (e: Error) => {
      const msg = e.message || "";
      if (msg.includes("409")) {
        toast({ title: "خطأ", description: "لا يمكن إلغاء الصلاحية: يوجد دفعات نشطة بصلاحية", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: msg, variant: "destructive" });
      }
    },
  });

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!formData.itemCode?.trim()) errors.itemCode = "مطلوب";
    if (!formData.nameAr?.trim()) errors.nameAr = "مطلوب";
    if (!formData.nameEn?.trim()) errors.nameEn = "مطلوب";
    if (!formData.formTypeId) errors.formTypeId = "مطلوب";
    const isSvc = formData.category === "service";
    if (!isSvc) {
      if (!formData.majorUnitName?.trim()) errors.majorUnitName = "مطلوب";
      const hasMed = !!formData.mediumUnitName?.trim();
      const hasMin = !!formData.minorUnitName?.trim();
      if (hasMin && !hasMed) errors.mediumUnitName = "يجب اختيار المتوسطة قبل الصغرى";
      if (hasMed && parseFloat(formData.majorToMedium as string || "0") <= 0) errors.majorToMedium = "يجب > 0";
      if (hasMin) {
        if (parseFloat(formData.majorToMinor as string || "0") <= 0) errors.majorToMinor = "يجب > 0";
        if (hasMed && parseFloat(formData.mediumToMinor as string || "0") <= 0) errors.mediumToMinor = "يجب > 0";
      }
      const units = [formData.majorUnitName, formData.mediumUnitName, formData.minorUnitName].filter(Boolean);
      const unique = new Set(units.map(u => u?.trim().toLowerCase()));
      if (units.length > 0 && unique.size < units.length) errors.unitDuplicate = "لا يمكن تكرار نفس الوحدة";
    }
    return errors;
  };

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
    const data = { ...formData };
    if (data.category === "service") {
      data.majorUnitName = ""; data.mediumUnitName = ""; data.minorUnitName = "";
      data.majorToMedium = null; data.majorToMinor = null; data.mediumToMinor = null;
    } else {
      if (!data.mediumUnitName?.trim()) { data.mediumUnitName = ""; data.majorToMedium = null; }
      if (!data.minorUnitName?.trim()) { data.minorUnitName = ""; data.majorToMinor = null; data.mediumToMinor = null; }
    }
    saveMutation.mutate(data);
  };

  const isService = formData.category === "service";
  const isExpiryLocked = isService;
  const hasMediumUnit = !!formData.mediumUnitName?.trim();
  const hasMinorUnit = !!formData.minorUnitName?.trim();

  return {
    formData, setFormData,
    validationErrors, setValidationErrors,
    uniquenessResult,
    showFormTypeDialog, setShowFormTypeDialog,
    newFormTypeName, setNewFormTypeName,
    handleSave, saveMutation,
    createFormTypeMutation,
    expirySettingMutation,
    isService, isExpiryLocked, hasMediumUnit, hasMinorUnit,
  };
}
