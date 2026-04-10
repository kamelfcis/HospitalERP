import { useLookup, type UseLookupResult } from "./useLookup";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { LookupItem } from "@/lib/lookupTypes";
import type { CostCenter } from "@shared/schema";

function costCenterAdapter(cc: CostCenter): LookupItem {
  return {
    id: cc.id,
    name: cc.name,
    code: cc.code,
    isActive: cc.isActive ?? true,
    meta: { id: cc.id, name: cc.name, code: cc.code, isActive: cc.isActive },
  };
}

export interface UseCostCentersLookupOptions {
  search?: string;
  enabled?: boolean;
}

export function useCostCentersLookup(options: UseCostCentersLookupOptions = {}): UseLookupResult {
  const { search = "", enabled = true } = options;

  async function fetchCostCenters(): Promise<CostCenter[]> {
    const res = await fetch("/api/cost-centers", { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  return useLookup<CostCenter>({
    baseQueryKey: QUERY_KEYS.costCenters(),
    fetcher: fetchCostCenters,
    adapter: costCenterAdapter,
    mode: "client-filter",
    search,
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}
