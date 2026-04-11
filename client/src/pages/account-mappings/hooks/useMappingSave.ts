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

interface SaveVariables {
  payload: any[];
  txType:  string;
}

export function useMappingSave(data: UseMappingRowsResult): UseMappingSaveResult {
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async ({ payload }: SaveVariables) => {
      const res = await apiRequest("POST", "/api/account-mappings/bulk", { mappings: payload });
      return res.json();
    },
    onSuccess: async (_savedMappings, { txType }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/account-mappings", txType] });
      data.resetChanges();
      toast({ title: "تم حفظ إعدادات ربط الحسابات بنجاح" });
    },
    onError: (error: Error) =>
      toast({ title: "خطأ", description: error.message, variant: "destructive" }),
  });

  const handleSave = () => {
    const effectiveWarehouseId =
      data.selectedWarehouseId === "__generic__" ? null : (data.selectedWarehouseId || null);
    const effectivePharmacyId =
      data.selectedPharmacyId === "__generic__" ? null : (data.selectedPharmacyId || null);
    const effectiveDepartmentId =
      data.selectedDepartmentId === "__generic__" ? null : (data.selectedDepartmentId || null);

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
      departmentId:    effectiveDepartmentId,
      isActive:        true,
    }));

    saveMutation.mutate({ payload, txType: data.selectedTxType });
  };

  return { handleSave, isSaving: saveMutation.isPending };
}
