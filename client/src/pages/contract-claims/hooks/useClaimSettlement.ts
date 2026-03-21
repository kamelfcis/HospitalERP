/**
 * useClaimSettlement
 * Phase 5 — Settlement + AR + Reconciliation hooks
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SettlementRecord {
  id:             string;
  batchId:        string;
  settlementDate: string;
  settledAmount:  string;
  bankAccountId:  string | null;
  referenceNumber: string | null;
  notes:          string | null;
  journalEntryId: string | null;
  createdAt:      string;
}

export interface ReconciliationLine {
  claimLineId:        string;
  serviceDescription: string;
  serviceDate:        string;
  claimedAmount:      number;
  approvedAmount:     number;
  settledAmount:      number;
  writeOffAmount:     number;
  outstanding:        number;
  variance:           number;
  status:             string;
}

export interface BatchReconciliation {
  batchId:          string;
  batchNumber:      string;
  totalClaimed:     number;
  totalApproved:    number;
  totalSettled:     number;
  totalOutstanding: number;
  totalVariance:    number;
  totalWriteoff:    number;
  lines:            ReconciliationLine[];
}

export interface SettlementLineInput {
  claimLineId:      string;
  settledAmount:    number;
  writeOffAmount?:  number;
  adjustmentReason?: string;
}

export interface SettleBatchPayload {
  settlementDate:     string;
  settledAmount:      number;
  bankAccountId?:     string | null;
  companyArAccountId?: string | null;
  referenceNumber?:   string;
  notes?:             string;
  lines:              SettlementLineInput[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────

export function useSettlements(batchId: string | null) {
  return useQuery<SettlementRecord[]>({
    queryKey: ["/api/claim-batches", batchId, "settlements"],
    queryFn: async () => {
      if (!batchId) return [];
      const res = await fetch(`/api/claim-batches/${batchId}/settlements`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل تحميل التسويات");
      return res.json();
    },
    enabled: !!batchId,
    staleTime: 30_000,
  });
}

export function useReconciliation(batchId: string | null) {
  return useQuery<BatchReconciliation>({
    queryKey: ["/api/claim-batches", batchId, "reconciliation"],
    queryFn: async () => {
      if (!batchId) throw new Error("no batchId");
      const res = await fetch(`/api/claim-batches/${batchId}/reconciliation`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل تحميل تقرير المطابقة");
      return res.json();
    },
    enabled: !!batchId,
    staleTime: 30_000,
  });
}

export function useSettleBatch() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ batchId, payload }: { batchId: string; payload: SettleBatchPayload }) =>
      apiRequest("POST", `/api/claim-batches/${batchId}/settle`, payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claim-batches", vars.batchId] });
      toast({ title: "تمت التسوية بنجاح" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });
}
