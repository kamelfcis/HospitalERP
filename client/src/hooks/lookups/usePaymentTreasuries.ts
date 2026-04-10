import { useQuery } from "@tanstack/react-query";

export interface PaymentTreasury {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface UsePaymentTreasuriesResult {
  treasuries: PaymentTreasury[];
  isLocked: boolean;
  isLoading: boolean;
}

export function usePaymentTreasuries(): UsePaymentTreasuriesResult {
  const { data: myTreasury, isLoading: mineLoading } = useQuery<PaymentTreasury | null>({
    queryKey: ["/api/treasuries/my-assigned"],
    queryFn: async () => {
      const r = await fetch("/api/treasuries/my-assigned", { credentials: "include" });
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.id ? d : null;
    },
    staleTime: 30_000,
  });

  const hasAssigned = myTreasury != null;

  const { data: allTreasuries = [], isLoading: allLoading } = useQuery<PaymentTreasury[]>({
    queryKey: ["/api/treasuries"],
    queryFn: async () => {
      const r = await fetch("/api/treasuries", { credentials: "include" });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    enabled: !mineLoading && !hasAssigned,
    staleTime: 30_000,
  });

  if (mineLoading) {
    return { treasuries: [], isLocked: false, isLoading: true };
  }

  if (hasAssigned) {
    return {
      treasuries: [myTreasury!],
      isLocked: true,
      isLoading: false,
    };
  }

  return {
    treasuries: allTreasuries.filter(t => t.isActive !== false),
    isLocked: false,
    isLoading: allLoading,
  };
}
