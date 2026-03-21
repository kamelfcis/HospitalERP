import { useQuery } from "@tanstack/react-query";

export interface TrackedOrder {
  id: string;
  orderType: "service" | "pharmacy";
  status: "pending" | "executed" | "cancelled";
  displayName: string;
  executedAt: string | null;
  executedInvoiceId: string | null;
  targetName: string | null;
  createdAt: string;
}

export interface AppointmentOrderTracking {
  totalService: number;
  executedService: number;
  pendingService: number;
  totalPharmacy: number;
  executedPharmacy: number;
  pendingPharmacy: number;
  orders: TrackedOrder[];
}

export function useOrderExecutionTracking(appointmentId: string | undefined) {
  return useQuery<AppointmentOrderTracking>({
    queryKey: ["/api/clinic-orders/appointment", appointmentId],
    queryFn: async () => {
      const res = await fetch(`/api/clinic-orders/appointment/${appointmentId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "فشل تحميل متابعة الطلبات");
      }
      return res.json();
    },
    enabled: !!appointmentId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
