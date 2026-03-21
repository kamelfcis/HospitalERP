import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface IntakeData {
  id: string;
  appointmentId: string;
  visitType: string | null;
  reasonForVisit: string | null;
  bloodPressure: string | null;
  pulse: string | null;
  temperature: string | null;
  weight: string | null;
  height: string | null;
  spo2: string | null;
  randomBloodSugar: string | null;
  intakeNotes: string | null;
  templateKey: string | null;
  templateLabel: string | null;
  structuredFlags: Record<string, boolean> | null;
  selectedPromptValues: Record<string, unknown> | null;
  isLocked: boolean;
  completedBy: string | null;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Fetch intake for an appointment */
export function useIntake(appointmentId: string | undefined) {
  return useQuery<IntakeData | null>({
    queryKey: ["/api/clinic-intake", appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      const res = await fetch(`/api/clinic-intake/${appointmentId}`, { credentials: "include" });
      if (res.status === 403 || res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!appointmentId,
    staleTime: 30_000,
  });
}

/** Upsert intake data */
export function useUpsertIntake(appointmentId: string) {
  return useMutation({
    mutationFn: (data: Partial<IntakeData>) =>
      apiRequest("PUT", `/api/clinic-intake/${appointmentId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-intake", appointmentId] });
    },
  });
}

/** Mark intake as completed */
export function useCompleteIntake(appointmentId: string) {
  return useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/clinic-intake/${appointmentId}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-intake", appointmentId] });
    },
  });
}
