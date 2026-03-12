import { useLookup, type UseLookupResult } from "./useLookup";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { LookupItem } from "@/lib/lookupTypes";

interface ClinicRaw {
  id: string;
  nameAr: string;
  isActive?: boolean;
  consultationServiceId?: string | null;
  consultationServiceName?: string | null;
  consultationServiceBasePrice?: string | number | null;
  treasuryId?: string | null;
}

function clinicAdapter(c: ClinicRaw): LookupItem {
  return {
    id: c.id,
    name: c.nameAr,
    isActive: c.isActive ?? true,
    meta: {
      id: c.id,
      name: c.nameAr,
      consultationServiceId: c.consultationServiceId ?? null,
      consultationServiceName: c.consultationServiceName ?? null,
      consultationServiceBasePrice: c.consultationServiceBasePrice ?? null,
      treasuryId: c.treasuryId ?? null,
    },
  };
}

async function fetchClinics(): Promise<ClinicRaw[]> {
  const res = await fetch("/api/clinic-clinics", { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface UseClinicsLookupOptions {
  search?: string;
  enabled?: boolean;
}

export function useClinicsLookup(options: UseClinicsLookupOptions = {}): UseLookupResult {
  const { search = "", enabled = true } = options;
  return useLookup<ClinicRaw>({
    baseQueryKey: QUERY_KEYS.clinics(),
    fetcher: fetchClinics,
    adapter: clinicAdapter,
    mode: "client-filter",
    search,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
