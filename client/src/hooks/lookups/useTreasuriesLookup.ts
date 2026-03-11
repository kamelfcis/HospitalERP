import { useLookup, type UseLookupResult } from "./useLookup";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { LookupItem } from "@/lib/lookupTypes";

interface TreasuryRaw {
  id: string;
  name: string;
  type?: string;
  isActive?: boolean;
}

function treasuryAdapter(t: TreasuryRaw): LookupItem {
  return {
    id: t.id,
    name: t.name,
    subtitle: t.type,
    isActive: t.isActive ?? true,
    meta: { id: t.id, name: t.name, type: t.type },
  };
}

async function fetchTreasuries(): Promise<TreasuryRaw[]> {
  const res = await fetch("/api/treasuries", { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface UseTreasuriesLookupOptions {
  search?: string;
  enabled?: boolean;
}

export function useTreasuriesLookup(options: UseTreasuriesLookupOptions = {}): UseLookupResult {
  const { search = "", enabled = true } = options;
  return useLookup<TreasuryRaw>({
    baseQueryKey: QUERY_KEYS.treasuries(),
    fetcher: fetchTreasuries,
    adapter: treasuryAdapter,
    mode: "client-filter",
    search,
    staleTime: 0,
    enabled,
  });
}
