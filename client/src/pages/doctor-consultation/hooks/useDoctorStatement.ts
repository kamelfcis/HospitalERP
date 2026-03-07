import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useDoctorStatement(doctorId?: string, clinicId?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [execFilter, setExecFilter] = useState<"all" | "executed" | "pending">("all");

  const params = new URLSearchParams({ from: dateFrom, to: dateTo });
  if (doctorId) params.set("doctorId", doctorId);
  if (clinicId) params.set("clinicId", clinicId);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/clinic-doctor-statement", doctorId, clinicId, dateFrom, dateTo],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-doctor-statement?${params.toString()}`)
        .then((r) => r.json())
        .catch(() => []),
    refetchInterval: 120_000,
  });

  return { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo, execFilter, setExecFilter };
}
