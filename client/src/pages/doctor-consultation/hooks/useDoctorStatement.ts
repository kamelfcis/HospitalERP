import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useDoctorStatement() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + "-01";
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/clinic-doctor-statement", dateFrom, dateTo],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-doctor-statement?from=${dateFrom}&to=${dateTo}`)
        .then((r) => r.json()),
  });

  return { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo };
}
