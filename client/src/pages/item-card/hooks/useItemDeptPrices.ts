import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Department, ItemDepartmentPriceWithDepartment } from "@shared/schema";

export function useItemDeptPrices(itemId: string | null) {
  const { toast } = useToast();
  const [showDeptPriceDialog, setShowDeptPriceDialog] = useState(false);
  const [selectedDeptPrice, setSelectedDeptPrice] = useState<ItemDepartmentPriceWithDepartment | null>(null);
  const [newDeptPrice, setNewDeptPrice] = useState<{ departmentId: string; salePrice: string }>({ departmentId: "", salePrice: "" });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: departmentPrices } = useQuery<ItemDepartmentPriceWithDepartment[]>({
    queryKey: ["/api/items", itemId, "department-prices"],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/department-prices`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!itemId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "department-prices"] });

  const createDeptPriceMutation = useMutation({
    mutationFn: (data: { departmentId: string; salePrice: string }) =>
      apiRequest("POST", `/api/items/${itemId}/department-prices`, data),
    onSuccess: () => { invalidate(); setShowDeptPriceDialog(false); setNewDeptPrice({ departmentId: "", salePrice: "" }); setSelectedDeptPrice(null); toast({ title: "تم إضافة سعر القسم بنجاح" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateDeptPriceMutation = useMutation({
    mutationFn: (data: { id: string; salePrice: string }) =>
      apiRequest("PUT", `/api/item-department-prices/${data.id}`, { salePrice: data.salePrice }),
    onSuccess: () => { invalidate(); setShowDeptPriceDialog(false); setNewDeptPrice({ departmentId: "", salePrice: "" }); setSelectedDeptPrice(null); toast({ title: "تم تحديث سعر القسم بنجاح" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteDeptPriceMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/item-department-prices/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "تم حذف سعر القسم" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleOpenDeptPriceDialog = (dp?: ItemDepartmentPriceWithDepartment) => {
    if (dp) {
      setSelectedDeptPrice(dp);
      setNewDeptPrice({ departmentId: dp.departmentId, salePrice: dp.salePrice });
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

  const availableDepartments = useMemo(
    () => departments?.filter(d => !departmentPrices?.some(dp => dp.departmentId === d.id)) ?? [],
    [departments, departmentPrices]
  );

  return {
    departmentPrices,
    availableDepartments,
    showDeptPriceDialog, setShowDeptPriceDialog,
    selectedDeptPrice, setSelectedDeptPrice,
    newDeptPrice, setNewDeptPrice,
    handleOpenDeptPriceDialog,
    handleSaveDeptPrice,
    createDeptPriceMutation,
    updateDeptPriceMutation,
    deleteDeptPriceMutation,
  };
}
