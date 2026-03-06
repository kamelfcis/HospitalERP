import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { FavoriteDrug, FrequentDrug } from "../types";

export function useFavoriteDrugs() {
  const { data: favorites = [], isLoading } = useQuery<FavoriteDrug[]>({
    queryKey: ["/api/clinic-favorite-drugs"],
    queryFn: () => apiRequest("GET", "/api/clinic-favorite-drugs").then((r) => r.json()),
  });

  const { data: frequentDrugs = [] } = useQuery<FrequentDrug[]>({
    queryKey: ["/api/clinic-frequent-drugs"],
    queryFn: () => apiRequest("GET", "/api/clinic-frequent-drugs").then((r) => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (data: { itemId?: string | null; drugName: string; defaultDose?: string; defaultFrequency?: string; defaultDuration?: string }) =>
      apiRequest("POST", "/api/clinic-favorite-drugs", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-favorite-drugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-frequent-drugs"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/clinic-favorite-drugs/${id}`).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/clinic-favorite-drugs"] }),
  });

  const isFavorite = (itemId: string | null | undefined) =>
    !!itemId && favorites.some((f) => f.itemId === itemId);

  const isFrequent = (itemId: string | null | undefined) =>
    !!itemId && frequentDrugs.some((f) => f.item_id === itemId);

  return { favorites, isLoading, frequentDrugs, addMutation, removeMutation, isFavorite, isFrequent };
}
