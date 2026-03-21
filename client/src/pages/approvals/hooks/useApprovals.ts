/**
 * useApprovals
 *
 * Fetches and manages approval requests.
 * Provides list, filter, and mutation hooks.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface ApprovalItem {
  id:                   string;
  patientInvoiceLineId: string | null;
  contractId:           string;
  contractMemberId:     string | null;
  serviceId:            string | null;
  approvalStatus:       string;
  approvalDecision:     string | null;
  requestedAmount:      string;
  approvedAmount:       string | null;
  rejectionReason:      string | null;
  serviceDescription:   string | null;
  requestedAt:          string;
  requestedBy:          string | null;
  decidedAt:            string | null;
  decidedBy:            string | null;
  notes:                string | null;
  // enriched
  contractName?:        string;
  contractNumber?:      string;
  companyName?:         string;
  memberName?:          string;
  memberCardNumber?:    string;
}

export interface ApprovalFilters {
  status?:     string;
  companyId?:  string;
  contractId?: string;
  dateFrom?:   string;
  dateTo?:     string;
}

export function useApprovals(filters: ApprovalFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status)     params.set("status",     filters.status);
  if (filters.companyId)  params.set("companyId",  filters.companyId);
  if (filters.contractId) params.set("contractId", filters.contractId);
  if (filters.dateFrom)   params.set("dateFrom",   filters.dateFrom);
  if (filters.dateTo)     params.set("dateTo",     filters.dateTo);
  const qs = params.toString();

  return useQuery<ApprovalItem[]>({
    queryKey: ["/api/approvals", qs],
    queryFn: async () => {
      const res = await fetch(`/api/approvals${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل في تحميل طلبات الموافقة");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

export function useApproveAction() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, approvedAmount, notes }: { id: string; approvedAmount?: string; notes?: string }) =>
      apiRequest("POST", `/api/approvals/${id}/approve`, { approvedAmount, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "تمت الموافقة بنجاح" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });
}

export function useRejectAction() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, rejectionReason, notes }: { id: string; rejectionReason: string; notes?: string }) =>
      apiRequest("POST", `/api/approvals/${id}/reject`, { rejectionReason, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "تم الرفض" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });
}

export function useCancelApproval() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiRequest("POST", `/api/approvals/${id}/cancel`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "تم إلغاء الطلب" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });
}
