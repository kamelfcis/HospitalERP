import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UseCashierActionsParams {
  shiftId: string | undefined;
  shiftUnitType: string;
  shiftUnitId: string;
  salesSelected: Set<string>;
  returnsSelected: Set<string>;
  cashierName: string;
  clearSelection: () => void;
  onPrintReceipts?: (invoiceIds: string[]) => void;
}

export function useCashierActions({
  shiftId, shiftUnitType, shiftUnitId, salesSelected, returnsSelected,
  cashierName, clearSelection, onPrintReceipts,
}: UseCashierActionsParams) {
  const { toast } = useToast();

  const invalidateSales = () => queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-sales", shiftUnitType, shiftUnitId] });
  const invalidateReturns = () => queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-returns", shiftUnitType, shiftUnitId] });
  const invalidateTotals = () => queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift", shiftId, "totals"] });

  const collectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashier/collect", {
        shiftId,
        invoiceIds: Array.from(salesSelected),
        collectedBy: cashierName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "تم التحصيل بنجاح", description: `عدد الفواتير: ${data.count}` });
      const collectedIds = Array.from(salesSelected);
      clearSelection();
      invalidateSales();
      invalidateTotals();
      if (onPrintReceipts && collectedIds.length > 0) {
        onPrintReceipts(collectedIds);
      }
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في التحصيل", description: error.message, variant: "destructive" });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashier/refund", {
        shiftId,
        invoiceIds: Array.from(returnsSelected),
        refundedBy: cashierName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "تم صرف المرتجع بنجاح", description: `عدد الفواتير: ${data.count}` });
      clearSelection();
      invalidateReturns();
      invalidateTotals();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في صرف المرتجع", description: error.message, variant: "destructive" });
    },
  });

  return { collectMutation, refundMutation };
}
