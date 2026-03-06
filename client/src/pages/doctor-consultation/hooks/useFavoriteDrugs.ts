import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FavoriteDrug, FrequentDrug } from "../types";

export function useFavoriteDrugs(clinicId?: string | null) {
  const { toast } = useToast();
  const qp = clinicId ? `?clinicId=${clinicId}` : "";

  const { data: favorites = [], isLoading } = useQuery<FavoriteDrug[]>({
    queryKey: ["/api/clinic-favorite-drugs", clinicId],
    queryFn: () => apiRequest("GET", `/api/clinic-favorite-drugs${qp}`).then((r) => r.json()),
  });

  const { data: frequentDrugs = [] } = useQuery<FrequentDrug[]>({
    queryKey: ["/api/clinic-frequent-drugs", clinicId],
    queryFn: () => apiRequest("GET", `/api/clinic-frequent-drugs${qp}`).then((r) => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (data: { itemId?: string | null; drugName: string; defaultDose?: string; defaultFrequency?: string; defaultDuration?: string }) =>
      apiRequest("POST", "/api/clinic-favorite-drugs", { ...data, clinicId: clinicId || null }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-favorite-drugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-frequent-drugs"] });
      toast({ title: "تم إضافة الدواء للمفضلة" });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "تعذر إضافة المفضلة", description: e.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/clinic-favorite-drugs/${id}`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-favorite-drugs"] });
      toast({ title: "تم إزالة الدواء من المفضلة" });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "تعذر إزالة المفضلة", description: e.message });
    },
  });

  const isFavorite = (itemId: string | null | undefined) =>
    !!itemId && favorites.some((f) => f.itemId === itemId);

  const getFavoriteId = (itemId: string | null | undefined) => {
    if (!itemId) return null;
    const clinicFav = favorites.find((f) => f.itemId === itemId && f.clinicId);
    if (clinicFav) return clinicFav.id;
    const globalFav = favorites.find((f) => f.itemId === itemId);
    return globalFav?.id || null;
  };

  const isFrequent = (itemId: string | null | undefined) =>
    !!itemId && frequentDrugs.some((f) => f.item_id === itemId);

  return { favorites, isLoading, frequentDrugs, addMutation, removeMutation, isFavorite, getFavoriteId, isFrequent };
}
