import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useDoctorStatement(doctorId?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + "-01";
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);

  const params = new URLSearchParams({ from: dateFrom, to: dateTo });
  if (doctorId) params.set("doctorId", doctorId);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/clinic-doctor-statement", doctorId, dateFrom, dateTo],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-doctor-statement?${params.toString()}`)
        .then((r) => r.json())
        .catch(() => []),
    enabled: !!doctorId,
  });

  return { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo };
}
