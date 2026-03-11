import { useLookup, type UseLookupResult } from "./useLookup";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { LookupItem } from "@/lib/lookupTypes";
import type { Doctor } from "@shared/schema";

function doctorAdapter(d: Doctor): LookupItem {
  return {
    id: d.id,
    name: d.name,
    subtitle: d.specialty ?? undefined,
    isActive: d.isActive,
    meta: { id: d.id, name: d.name, specialty: d.specialty },
  };
}

async function fetchDoctors(search?: string): Promise<Doctor[]> {
  const url = search
    ? `/api/doctors?search=${encodeURIComponent(search)}&limit=15`
    : "/api/doctors";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchDoctorById(id: string): Promise<Doctor> {
  const res = await fetch(`/api/doctors/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("doctor not found");
  return res.json();
}

export interface UseDoctorsLookupOptions {
  search?: string;
  enabled?: boolean;
}

export function useDoctorsLookup(options: UseDoctorsLookupOptions = {}): UseLookupResult {
  const { search = "", enabled = true } = options;
  return useLookup<Doctor>({
    baseQueryKey: QUERY_KEYS.doctors(),
    fetcher: fetchDoctors,
    adapter: doctorAdapter,
    mode: "server-search",
    search,
    minChars: 1,
    staleTime: 0,
    enabled,
    resolveByIdFetcher: fetchDoctorById,
  });
}
