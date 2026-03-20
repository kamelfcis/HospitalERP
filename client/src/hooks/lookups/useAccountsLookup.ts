import { useLookup, type UseLookupResult } from "./useLookup";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { LookupItem } from "@/lib/lookupTypes";
import type { Account } from "@shared/schema";

function accountAdapter(a: Account): LookupItem {
  return {
    id: a.id,
    name: a.name,
    code: a.code,
    isActive: a.isActive ?? true,
    meta: { id: a.id, name: a.name, code: a.code, accountType: a.accountType, isActive: a.isActive },
  };
}

export interface UseAccountsLookupOptions {
  search?: string;
  filter?: string;
  enabled?: boolean;
}

export function useAccountsLookup(options: UseAccountsLookupOptions = {}): UseLookupResult {
  const { search = "", filter, enabled = true } = options;

  async function fetchAccounts(): Promise<Account[]> {
    const res = await fetch("/api/accounts", { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json();
    const list: Account[] = Array.isArray(data) ? data : [];
    if (filter === "asset-flat") {
      return list.filter(a => a.accountType === "asset" && !a.parentId);
    }
    return list;
  }

  return useLookup<Account>({
    baseQueryKey: QUERY_KEYS.accounts(filter),
    fetcher: fetchAccounts,
    adapter: accountAdapter,
    mode: "client-filter",
    search,
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}
