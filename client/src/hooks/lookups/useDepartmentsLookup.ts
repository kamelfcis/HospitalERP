import { useLookup, type UseLookupResult } from "./useLookup";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { LookupItem } from "@/lib/lookupTypes";

interface DepartmentRaw {
  id: string;
  nameAr: string;
  code?: string;
  isActive?: boolean;
}

function departmentAdapter(d: DepartmentRaw): LookupItem {
  return {
    id: d.id,
    name: d.nameAr,
    code: d.code,
    isActive: d.isActive ?? true,
    meta: { id: d.id, name: d.nameAr, code: d.code },
  };
}

async function fetchDepartments(): Promise<DepartmentRaw[]> {
  const res = await fetch("/api/departments", { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface UseDepartmentsLookupOptions {
  search?: string;
  enabled?: boolean;
}

export function useDepartmentsLookup(options: UseDepartmentsLookupOptions = {}): UseLookupResult {
  const { search = "", enabled = true } = options;
  return useLookup<DepartmentRaw>({
    baseQueryKey: QUERY_KEYS.departments(),
    fetcher: fetchDepartments,
    adapter: departmentAdapter,
    mode: "client-filter",
    search,
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}
