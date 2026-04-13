/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useCustomerPaymentsMutations
 *  منطق حفظ إيصال التحصيل — مستخرج من customer-payments/index.tsx
 *
 *  يُصدِّر saveMutation الذي يملك:
 *    - بناء payload الإيصال من state الصفحة
 *    - POST إلى /api/customer-payments
 *    - invalidation للـ queries المتأثرة
 *    - callback onSuccess لإعادة ضبط الـ UI state
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useMutation }            from "@tanstack/react-query";
import { useToast }               from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";

// ─── Params ───────────────────────────────────────────────────────────────────

interface Params {
  customerId:    string;
  receiptDate:   string;
  totalAmount:   string;
  paymentMethod: string;
  reference:     string;
  notes:         string;
  glAccountId:   string | null;
  amounts:       Record<string, string>;
  onSuccess:     () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCustomerPaymentsMutations({
  customerId,
  receiptDate,
  totalAmount,
  paymentMethod,
  reference,
  notes,
  glAccountId,
  amounts,
  onSuccess,
}: Params) {
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: () => {
      const lines = Object.entries(amounts)
        .map(([invoiceId, v]) => ({ invoiceId, amountPaid: parseFloat(v) || 0 }))
        .filter((l) => l.amountPaid > 0);

      return apiRequestJson<{ receiptId: string; receiptNumber: number }>(
        "POST", "/api/customer-payments",
        {
          customerId,
          receiptDate,
          totalAmount:   parseFloat(totalAmount),
          paymentMethod,
          reference:     reference.trim() || null,
          notes:         notes.trim()     || null,
          glAccountId,
          shiftId:       null,
          lines,
        },
      );
    },
    onSuccess: (data) => {
      toast({ title: `تم حفظ إيصال التحصيل #${data.receiptNumber} بنجاح` });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/balance",   customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/invoices",  customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/statement", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/next-number"] });
      onSuccess();
    },
    onError: (e: any) =>
      toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" }),
  });

  return { saveMutation };
}
