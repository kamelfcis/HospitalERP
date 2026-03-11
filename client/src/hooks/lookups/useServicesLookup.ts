import { useLookup, type UseLookupResult } from "./useLookup";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { LookupItem } from "@/lib/lookupTypes";

interface ServiceRaw {
  id: string;
  nameAr: string;
  code?: string;
  departmentId?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

function serviceAdapter(s: ServiceRaw): LookupItem {
  return {
    id: s.id,
    name: s.nameAr,
    code: s.code,
    isActive: s.isActive ?? true,
    meta: { ...s },
  };
}

export interface UseServicesLookupOptions {
  search?: string;
  departmentId?: string;
  active?: boolean;
  enabled?: boolean;
}

export function useServicesLookup(options: UseServicesLookupOptions = {}): UseLookupResult {
  const { search = "", departmentId, active = true, enabled = true } = options;

  async function fetchServices(q?: string): Promise<ServiceRaw[]> {
    const params = new URLSearchParams();
    if (q)            params.set("search", q);
    if (departmentId) params.set("departmentId", departmentId);
    if (active)       params.set("active", "true");
    params.set("pageSize", "20");
    params.set("page", "1");
    const res = await fetch(`/api/services?${params.toString()}`, { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.data ?? []);
  }

  async function fetchServiceById(id: string): Promise<ServiceRaw> {
    const res = await fetch(`/api/services/${id}`, { credentials: "include" });
    if (!res.ok) throw new Error("service not found");
    return res.json();
  }

  return useLookup<ServiceRaw>({
    baseQueryKey: QUERY_KEYS.services({ search: undefined, departmentId, active }),
    fetcher: fetchServices,
    adapter: serviceAdapter,
    mode: "server-search",
    search,
    minChars: 2,
    staleTime: 0,
    enabled,
    resolveByIdFetcher: fetchServiceById,
  });
}
