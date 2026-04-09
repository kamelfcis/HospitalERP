import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { genId } from "../utils/id";
import type { PaymentLocal } from "../types";

export function usePayments(defaultTreasuryId?: string | null) {
  const { toast } = useToast();
  const [payments, setPayments]       = useState<PaymentLocal[]>([]);
  const paymentRefOffsetRef            = useRef(0);

  const addPayment = useCallback(async () => {
    const offset = paymentRefOffsetRef.current;
    paymentRefOffsetRef.current += 1;
    let ref = "";
    try {
      const res  = await apiRequest("GET", `/api/patient-invoice-payments/next-ref?offset=${offset}`);
      const data = await res.json();
      ref = data.ref ?? "";
    } catch { /* fallback: empty ref */ }
    setPayments(prev => [
      ...prev,
      {
        tempId: genId(),
        paymentDate: new Date().toISOString().split("T")[0],
        amount: 0,
        paymentMethod: "cash",
        referenceNumber: ref,
        notes: "",
        treasuryId: defaultTreasuryId ?? null,
      },
    ]);
  }, [defaultTreasuryId]);

  const updatePayment = useCallback((tempId: string, field: string, value: any) => {
    setPayments(prev => prev.map(p => p.tempId === tempId ? { ...p, [field]: value } : p));
  }, []);

  const removePayment = useCallback((tempId: string) => {
    setPayments(prev => prev.filter(p => p.tempId !== tempId));
  }, []);

  const resetPayments = useCallback(() => {
    setPayments([]);
    paymentRefOffsetRef.current = 0;
  }, []);

  const loadPayments = useCallback((raw: any[]) => {
    const loaded: PaymentLocal[] = raw.map(p => ({
      tempId: genId(),
      paymentDate: p.paymentDate,
      amount: parseFloat(p.amount) || 0,
      paymentMethod: p.paymentMethod || "cash",
      referenceNumber: p.referenceNumber || "",
      notes: p.notes || "",
      treasuryId: p.treasuryId || null,
    }));
    setPayments(loaded);
    paymentRefOffsetRef.current = 0;
  }, []);

  return {
    payments,
    paymentRefOffsetRef,
    addPayment,
    updatePayment,
    removePayment,
    resetPayments,
    loadPayments,
  };
}
