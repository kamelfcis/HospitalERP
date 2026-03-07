import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ClinicOrder, OrderStatusFilter, OrderTypeFilter } from "../types";

export function useClinicOrders() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("pending");
  const [typeFilter, setTypeFilter] = useState<OrderTypeFilter>("all");
  const [targetIdFilter, setTargetIdFilter] = useState<string>("");

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (typeFilter !== "all") queryParams.set("orderType", typeFilter);
  if (targetIdFilter) queryParams.set("targetId", targetIdFilter);
  const qs = queryParams.toString();

  const { data: orders = [], isLoading, refetch } = useQuery<ClinicOrder[]>({
    queryKey: ["/api/clinic-orders", statusFilter, typeFilter, targetIdFilter],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-orders${qs ? "?" + qs : ""}`).then((r) => r.json()),
    refetchInterval: 20000,
  });

  const executeMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/clinic-orders/${orderId}/execute`, {}).then((r) => r.json()),
    onSuccess: (data) => {
      toast({ title: "تم تنفيذ الأمر بنجاح", description: `رقم الفاتورة: ${data.invoiceNumber}` });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-orders"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطأ في التنفيذ", description: err.message });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("PATCH", `/api/clinic-appointments/${orderId}/status`, { status: "cancelled" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-orders"] });
    },
  });

  return {
    orders,
    isLoading,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    targetIdFilter,
    setTargetIdFilter,
    executeMutation,
    refetch,
  };
}
