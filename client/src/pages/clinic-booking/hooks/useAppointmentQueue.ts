import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSSE } from "@/hooks/useSSE";
import type { ClinicAppointment } from "../types";

export function useAppointmentQueue(clinicId: string, date: string) {
  const queryKey = ["/api/clinic-clinics", clinicId, "appointments", date];

  type QueueResponse = ClinicAppointment[] | { appointments: ClinicAppointment[]; noDoctorLinked: boolean };

  const { data: rawData, isLoading } = useQuery<QueueResponse>({
    queryKey,
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${clinicId}/appointments?date=${date}`)
        .then((r) => r.json()),
    enabled: !!clinicId && !!date,
  });

  const noDoctorLinked = !Array.isArray(rawData) && (rawData as any)?.noDoctorLinked === true;
  const appointments: ClinicAppointment[] = Array.isArray(rawData)
    ? rawData
    : (rawData as any)?.appointments ?? [];

  // تحديث فوري عبر SSE بدلاً من polling كل 15 ثانية
  useSSE(clinicId && date ? `/api/clinic/sse/${clinicId}` : null, {
    appointment_changed: () => queryClient.invalidateQueries({ queryKey }),
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

  return { appointments, isLoading, noDoctorLinked, statusMutation, bookMutation };
}
