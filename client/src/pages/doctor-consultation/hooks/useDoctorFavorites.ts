import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type FavoriteType = "note" | "assessment_note" | "plan" | "followup" | "quick_text";

export interface DoctorFavorite {
  id: string;
  doctorId: string;
  clinicId: string | null;
  type: FavoriteType;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export const FAVORITE_TYPE_LABELS: Record<FavoriteType, string> = {
  note:            "ملاحظة",
  assessment_note: "تقييم",
  plan:            "خطة العلاج",
  followup:        "تعليمات المتابعة",
  quick_text:      "نص سريع",
};

/** Fetch all favorites for the logged-in doctor */
export function useDoctorFavorites(clinicId?: string | null) {
  const params = clinicId ? `?clinicId=${clinicId}` : "";
  return useQuery<DoctorFavorite[]>({
    queryKey: ["/api/doctor-favorites", clinicId],
    queryFn: async () => {
      const res = await fetch(`/api/doctor-favorites${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useAddFavorite(clinicId?: string | null) {
  return useMutation({
    mutationFn: (data: { type: FavoriteType; title: string; content: string; isPinned?: boolean; clinicId?: string | null }) =>
      apiRequest("POST", "/api/doctor-favorites", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-favorites", clinicId] });
    },
  });
}

export function useUpdateFavorite(clinicId?: string | null) {
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; content?: string; isPinned?: boolean; type?: FavoriteType }) =>
      apiRequest("PATCH", `/api/doctor-favorites/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-favorites", clinicId] });
    },
  });
}

export function useDeleteFavorite(clinicId?: string | null) {
  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/doctor-favorites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doctor-favorites", clinicId] });
    },
  });
}
