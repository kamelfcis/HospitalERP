import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface PharmacyModeResult {
  pharmacyMode: boolean;
  isOwner: boolean;
  isLoading: boolean;
}

export function usePharmacyMode(): PharmacyModeResult {
  const { user } = useAuth();

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    staleTime: 30_000,
  });

  const pharmacyMode = settings?.pharmacy_mode === "true";
  const isOwner = user?.role === "owner";

  return { pharmacyMode, isOwner, isLoading };
}
