import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSSE } from "@/hooks/useSSE";
import type { GroupedClinicOrder, OrderStatusFilter, OrderTypeFilter } from "../types";

const GROUPED_KEY = "/api/clinic-orders/grouped";

export function useGroupedOrders() {
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("pending");
  const [typeFilter, setTypeFilter]     = useState<OrderTypeFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (typeFilter   !== "all") queryParams.set("orderType", typeFilter);
  const qs = queryParams.toString();

  const { data: groups = [], isLoading, refetch } = useQuery<GroupedClinicOrder[]>({
    queryKey: [GROUPED_KEY, statusFilter, typeFilter],
    queryFn:  () =>
      apiRequest("GET", `${GROUPED_KEY}${qs ? "?" + qs : ""}`).then((r) => r.json()),
  });

  // Correction 5: SSE scoped to doctor-orders events only — invalidates the grouped key
  useSSE("/api/clinic-orders/sse", {
    orders_changed: () => queryClient.invalidateQueries({ queryKey: [GROUPED_KEY] }),
  });

  // Derive unique departments (targetName) from the fetched groups for the filter dropdown
  const departments = Array.from(
    new Set(
      groups
        .map((g) => g.targetName)
        .filter((n): n is string => !!n && n.trim() !== "")
    )
  ).sort();

  // Apply department filter on the already-loaded, already-filtered groups
  const filteredGroups = departmentFilter === "all"
    ? groups
    : groups.filter((g) => g.targetName === departmentFilter);

  const pendingCount = groups.reduce((sum, g) => sum + g.pendingCount, 0);

  return {
    groups: filteredGroups,
    allGroups: groups,
    isLoading,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    departmentFilter,
    setDepartmentFilter,
    departments,
    pendingCount,
    refetch,
  };
}
