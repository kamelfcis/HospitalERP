import { useQuery } from "@tanstack/react-query";
import type { AggregatedViewData } from "../shared/types";

export function useConsolidatedView(patientId: string) {
  return useQuery<AggregatedViewData>({
    queryKey: ["/api/patients", patientId, "invoices-aggregated"],
    enabled: !!patientId,
    staleTime: 10_000,
  });
}
