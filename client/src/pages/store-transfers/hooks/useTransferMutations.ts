import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TransferLineLocal } from "../types";

interface FormState {
  transferDate: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  formNotes: string;
  formLines: TransferLineLocal[];
  editingTransferId: string | null;
}

function buildLines(formLines: TransferLineLocal[]) {
  return formLines.map((l) => ({
    itemId: l.itemId,
    unitLevel: l.unitLevel,
    qtyEntered: String(l.qtyEntered),
    qtyInMinor: String(l.qtyInMinor),
    selectedExpiryDate: l.selectedExpiryDate || undefined,
    expiryMonth: l.selectedExpiryMonth || undefined,
    expiryYear: l.selectedExpiryYear || undefined,
    availableAtSaveMinor: l.availableQtyMinor || undefined,
    notes: l.notes || undefined,
  }));
}

export function useTransferMutations(state: FormState, onSuccess: () => void) {
  const { toast } = useToast();
  const { transferDate, sourceWarehouseId, destWarehouseId, formNotes, formLines, editingTransferId } = state;

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: formNotes || undefined,
        lines: buildLines(formLines),
      };
      return apiRequest("POST", "/api/transfers", payload);
    },
    onSuccess: () => {
      toast({ title: "تم حفظ المسودة بنجاح" });
      onSuccess();
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حفظ المسودة", description: error.message, variant: "destructive" });
    },
  });

  const postTransferMutation = useMutation({
    mutationFn: async () => {
      if (editingTransferId) {
        await apiRequest("POST", `/api/transfers/${editingTransferId}/post`);
        return;
      }
      const payload = {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: formNotes || undefined,
        lines: buildLines(formLines),
      };
      const createRes = await apiRequest("POST", "/api/transfers", payload);
      const created = await createRes.json();
      await apiRequest("POST", `/api/transfers/${created.id}/post`);
    },
    onSuccess: () => {
      toast({ title: "تم ترحيل التحويل بنجاح" });
      onSuccess();
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في ترحيل التحويل", description: error.message, variant: "destructive" });
    },
  });

  const postDraftMutation = useMutation({
    mutationFn: async (transferId: string) => apiRequest("POST", `/api/transfers/${transferId}/post`),
    onSuccess: () => {
      toast({ title: "تم ترحيل التحويل بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في ترحيل التحويل", description: error.message, variant: "destructive" });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (transferId: string) => apiRequest("DELETE", `/api/transfers/${transferId}`),
    onSuccess: () => {
      toast({ title: "تم حذف التحويل" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حذف التحويل", description: error.message, variant: "destructive" });
    },
  });

  return {
    saveDraftMutation,
    postTransferMutation,
    postDraftMutation,
    deleteDraftMutation,
  };
}
