/**
 * useMappingSave
 *
 * Owns the save mutation and pre-save validation.
 * Takes the current row state from useMappingRows and handles the API call.
 */

import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AccountMapping } from "@shared/schema";
import { mappingLineTypeLabels } from "@shared/schema";
import type { UseMappingRowsResult } from "./useMappingRows";

export interface UseMappingSaveResult {
  handleSave: () => void;
  isSaving:   boolean;
}

export function useMappingSave(data: UseMappingRowsResult): UseMappingSaveResult {
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async (payload: any[]) => {
      const res = await apiRequest("POST", "/api/account-mappings/bulk", { mappings: payload });
      return (await res.json()) as AccountMapping[];
    },
    onSuccess: (savedRows) => {
      const txType = data.selectedTxType;
      const deptId = data.selectedDepartmentId === "__generic__" ? null : (data.selectedDepartmentId || null);
      const whId   = data.selectedWarehouseId  === "__generic__" ? null : (data.selectedWarehouseId  || null);
      const phId   = data.selectedPharmacyId   === "__generic__" ? null : (data.selectedPharmacyId   || null);

      // Update the query cache with the saved rows merged into the existing data.
      // clearChanges() then releases the hasChanges guard so the row-rebuild effect
      // fires and rebuilds from the updated mappings — correctly showing the new data.
      queryClient.setQueryData(
        ["/api/account-mappings", txType],
        (old: AccountMapping[] | undefined) => {
          if (!old) return savedRows;
          // Keep rows from OTHER scopes; replace the current scope's rows with savedRows
          const kept = old.filter(m => {
            return (m.departmentId ?? null) !== deptId ||
                   (m.warehouseId  ?? null) !== whId  ||
                   (m.pharmacyId   ?? null) !== phId;
          });
          return [...kept, ...savedRows];
        }
      );

      // Refresh global completeness overview after every successful save
      queryClient.invalidateQueries({ queryKey: ["/api/account-mappings/completeness"] });

      // Clear the hasChanges flag — this unblocks the row-rebuild useEffect.
      // The effect will immediately rebuild from the updated mappings above.
      data.clearChanges();

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

    // Guard: duplicate lineType in the same scope → only last one would survive the upsert
    const seenLineTypes = new Set<string>();
    for (const r of validRows) {
      if (seenLineTypes.has(r.lineType)) {
        const label = mappingLineTypeLabels[r.lineType] ?? r.lineType;
        toast({ title: "خطأ في البيانات", description: `نوع البند "${label}" مكرر — يُرجى إزالة السطر الزائد قبل الحفظ`, variant: "destructive" });
        return;
      }
      seenLineTypes.add(r.lineType);
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

    saveMutation.mutate(payload);
  };

  return { handleSave, isSaving: saveMutation.isPending };
}
