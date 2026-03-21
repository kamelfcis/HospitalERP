/**
 * useMappingSave
 *
 * Owns the save mutation and pre-save validation.
 * Takes the current row state from useMappingRows and handles the API call.
 */

import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UseMappingRowsResult } from "./useMappingRows";

export interface UseMappingSaveResult {
  handleSave: () => void;
  isSaving:   boolean;
}

export function useMappingSave(data: UseMappingRowsResult): UseMappingSaveResult {
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: (payload: any[]) =>
      apiRequest("POST", "/api/account-mappings/bulk", { mappings: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-mappings", data.selectedTxType] });
      toast({ title: "تم حفظ إعدادات ربط الحسابات بنجاح" });
      data.resetChanges();
    },
    onError: (error: Error) =>
      toast({ title: "خطأ", description: error.message, variant: "destructive" }),
  });

  const handleSave = () => {
    const effectiveWarehouseId =
      data.selectedWarehouseId === "__generic__" ? null : (data.selectedWarehouseId || null);
    const effectivePharmacyId =
      data.selectedPharmacyId === "__generic__" ? null : (data.selectedPharmacyId || null);

    const validRows = data.rows.filter(r => r.lineType && (r.debitAccountId || r.creditAccountId));
    if (validRows.length === 0) {
      toast({ title: "لا توجد إعدادات للحفظ", variant: "destructive" });
      return;
    }

    const payload = validRows.map(r => ({
      transactionType: data.selectedTxType,
      lineType:        r.lineType,
      debitAccountId:  r.debitAccountId  || null,
      creditAccountId: r.creditAccountId || null,
      warehouseId:     effectiveWarehouseId,
      pharmacyId:      effectivePharmacyId,
      isActive:        true,
    }));

    saveMutation.mutate(payload);
  };

  return { handleSave, isSaving: saveMutation.isPending };
}
