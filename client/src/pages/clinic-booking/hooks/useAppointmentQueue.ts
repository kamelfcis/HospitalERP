import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ClinicAppointment } from "../types";

export function useAppointmentQueue(clinicId: string, date: string) {
  const queryKey = ["/api/clinic-clinics", clinicId, "appointments", date];

  const { data: appointments = [], isLoading } = useQuery<ClinicAppointment[]>({
    queryKey,
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${clinicId}/appointments?date=${date}`)
        .then((r) => r.json()),
    enabled: !!clinicId && !!date,
    refetchInterval: 15_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/clinic-appointments/${id}/status`, { status }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const bookMutation = useMutation({
    mutationFn: (data: {
      doctorId: string; patientName: string; patientPhone?: string;
      appointmentDate: string; appointmentTime?: string; notes?: string; patientId?: string;
    }) =>
      apiRequest("POST", `/api/clinic-clinics/${clinicId}/appointments`, data).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { appointments, isLoading, statusMutation, bookMutation };
}
