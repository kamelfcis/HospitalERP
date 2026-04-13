/*
 * useDeliveryPaymentsMutations
 * Extracted from delivery-payments/index.tsx second pass.
 * Owns: POST /api/delivery-payments/receipts + query invalidation + toast feedback.
 */

import { useMutation }                from "@tanstack/react-query";
import { useToast }                   from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";

interface UseDeliveryPaymentsMutationsParams {
  receiptDate:         string;
  totalAmount:         string;
  paymentMethod:       string;
  reference:           string;
  notes:               string;
  selectedGlAccountId: string | null;
  amounts:             Record<string, string>;
  onSuccess:           () => void;
}

export function useDeliveryPaymentsMutations(p: UseDeliveryPaymentsMutationsParams) {
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: () => {
      const lines = Object.entries(p.amounts)
        .map(([invoiceId, v]) => ({ invoiceId, amountPaid: parseFloat(v) || 0 }))
        .filter((l) => l.amountPaid > 0);

      return apiRequestJson<{ receiptId: string; receiptNumber: number }>(
        "POST", "/api/delivery-payments/receipts",
        {
          receiptDate:   p.receiptDate,
          totalAmount:   parseFloat(p.totalAmount),
          paymentMethod: p.paymentMethod,
          reference:     p.reference.trim() || null,
          notes:         p.notes.trim() || null,
          glAccountId:   p.selectedGlAccountId,
          shiftId:       null,
          lines,
        },
      );
    },
    onSuccess: (data) => {
      toast({ title: `تم حفظ إيصال التوصيل #${data.receiptNumber} بنجاح` });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-payments/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-payments/report"] });
      p.onSuccess();
    },
    onError: (e: any) =>
      toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" }),
  });

  return { saveMutation };
}
