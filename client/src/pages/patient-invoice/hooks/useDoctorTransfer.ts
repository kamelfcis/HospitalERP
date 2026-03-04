import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { genId } from "../utils/id";
import type { DoctorTransfer } from "@shared/schema";

interface Options {
  invoiceId: string | null;
  invoiceStatus: string;
  netAmount: number;
}

/**
 * يدير حوار تحويل مستحقات الطبيب: الحالة + الـ mutation + المبلغ المتبقي.
 */
export function useDoctorTransfer({ invoiceId, invoiceStatus, netAmount }: Options) {
  const { toast } = useToast();

  // ── Dialog state ─────────────────────────────────────────────────────────────
  const [dtOpen, setDtOpen] = useState(false);
  const [dtDoctorName, setDtDoctorName] = useState("");
  const [dtAmount, setDtAmount] = useState("");
  const [dtNotes, setDtNotes] = useState("");
  const [dtConfirmOpen, setDtConfirmOpen] = useState(false);
  const [dtClientRequestId, setDtClientRequestId] = useState("");

  // ── Transfers query ───────────────────────────────────────────────────────────
  const { data: dtTransfers = [], refetch: refetchTransfers } = useQuery<DoctorTransfer[]>({
    queryKey: ["/api/patient-invoices", invoiceId, "transfers"],
    enabled: !!invoiceId && invoiceStatus === "finalized",
    queryFn: () =>
      fetch(`/api/patient-invoices/${invoiceId}/transfers`, { credentials: "include" }).then(r => r.json()),
  });

  // ── Computed ──────────────────────────────────────────────────────────────────
  const dtAlreadyTransferred = dtTransfers.reduce((s, t) => s + parseFloat(t.amount), 0);
  const dtRemaining = Math.max(0, netAmount - dtAlreadyTransferred);

  // ── Mutation ──────────────────────────────────────────────────────────────────
  const dtMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/patient-invoices/${invoiceId}/transfer-to-doctor`, {
        doctorName: dtDoctorName.trim(),
        amount: parseFloat(dtAmount),
        clientRequestId: dtClientRequestId,
        notes: dtNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "تم التحويل", description: "تم تحويل المستحقات للطبيب بنجاح" });
      setDtConfirmOpen(false);
      setDtOpen(false);
      setDtDoctorName("");
      setDtAmount("");
      setDtNotes("");
      setDtClientRequestId("");
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices", invoiceId, "transfers"] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "خطأ في التحويل", description: error.message });
    },
  });

  // ── Open confirm (with validation) ────────────────────────────────────────────
  function openDtConfirm() {
    if (!dtDoctorName.trim()) {
      toast({ variant: "destructive", title: "اسم الطبيب مطلوب" }); return;
    }
    const amt = parseFloat(dtAmount);
    if (!dtAmount || isNaN(amt) || amt <= 0) {
      toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return;
    }
    if (amt > dtRemaining + 0.001) {
      toast({ variant: "destructive", title: `المبلغ يتجاوز المتبقي (${dtRemaining.toFixed(2)})` }); return;
    }
    setDtClientRequestId(genId());
    setDtConfirmOpen(true);
  }

  return {
    // State
    dtOpen, setDtOpen,
    dtDoctorName, setDtDoctorName,
    dtAmount, setDtAmount,
    dtNotes, setDtNotes,
    dtConfirmOpen, setDtConfirmOpen,
    // Data
    dtTransfers,
    dtAlreadyTransferred,
    dtRemaining,
    // Actions
    dtMutation,
    openDtConfirm,
    refetchTransfers,
  };
}
