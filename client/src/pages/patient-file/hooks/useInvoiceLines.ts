import { useQuery } from "@tanstack/react-query";
import type { InvoiceLinesResponse } from "../shared/types";

interface UseInvoiceLinesOptions {
  patientId: string;
  page?: number;
  limit?: number;
  lineType?: string;
  departmentId?: string;
  enabled?: boolean;
}

export function useInvoiceLines({
  patientId,
  page = 1,
  limit = 50,
  lineType,
  departmentId,
  enabled = true,
}: UseInvoiceLinesOptions) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (lineType)     params.set("lineType", lineType);
  if (departmentId) params.set("department", departmentId);

  return useQuery<InvoiceLinesResponse>({
    queryKey: ["/api/patients", patientId, "invoice-lines", page, limit, lineType, departmentId],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/invoice-lines?${params}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: enabled && !!patientId,
    staleTime: 30 * 1000,
  });
}

export function usePatientPayments(patientId: string, enabled = true) {
  return useQuery<any[]>({
    queryKey: ["/api/patients", patientId, "payments-list"],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/payments-list`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: enabled && !!patientId,
    staleTime: 30 * 1000,
  });
}
