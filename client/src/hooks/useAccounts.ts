import { useQuery } from "@tanstack/react-query";
import type { Account } from "@shared/schema";

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });
}

export function useRevenueAccounts() {
  const { data: accounts, ...rest } = useAccounts();
  return {
    ...rest,
    data: (accounts || []).filter(a => a.accountType === "revenue" && a.isActive),
  };
}
