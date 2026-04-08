import { useQuery } from "@tanstack/react-query";
import type { InvoiceLinesResponse } from "../shared/types";

interface UseInvoiceLinesOptions {
  patientId: string;
  page?: number;
  limit?: number;
  lineType?: string;
  departmentId?: string;
  admissionId?: string;
  visitId?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useInvoiceLines({
  patientId,
  page = 1,
  limit = 50,
  lineType,
  departmentId,
  admissionId,
  visitId,
  enabled = true,
  refetchInterval = false,
}: UseInvoiceLinesOptions) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (lineType)     params.set("lineType",     lineType);
  if (departmentId) params.set("department",   departmentId);
  if (admissionId)  params.set("admissionId",  admissionId);
  if (visitId)      params.set("visitId",      visitId);

  return useQuery<InvoiceLinesResponse>({
    queryKey: ["/api/patients", patientId, "invoice-lines", page, limit, lineType, departmentId, admissionId, visitId],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/invoice-lines?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: enabled && !!patientId,
    staleTime: 15 * 1000,
    refetchInterval,
  });
}

interface UsePaymentsListOptions {
  patientId: string;
  admissionId?: string;
  visitId?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function usePatientPayments(patientIdOrEnabled: string | boolean, enabled = true) {
  const patientId = typeof patientIdOrEnabled === "string" ? patientIdOrEnabled : "";
  const isEnabled = typeof patientIdOrEnabled === "string" ? enabled : false;
  return usePaymentsList({ patientId, enabled: isEnabled });
}

export function usePaymentsList({
  patientId,
  admissionId,
  visitId,
  enabled = true,
  refetchInterval = false,
}: UsePaymentsListOptions) {
  const params = new URLSearchParams();
  if (admissionId) params.set("admissionId", admissionId);
  if (visitId)     params.set("visitId",     visitId);
  const qs = params.toString() ? `?${params}` : "";

  return useQuery<any[]>({
    queryKey: ["/api/patients", patientId, "payments-list", admissionId, visitId],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/payments-list${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: enabled && !!patientId,
    staleTime: 15 * 1000,
    refetchInterval,
  });
}
