import { queryClient } from "./queryClient";

export const QUERY_KEYS = {
  doctors:     (search?: string) => search ? ["/api/doctors", search] : ["/api/doctors"],
  services:    (params?: { search?: string; departmentId?: string; active?: boolean }) =>
                 ["/api/services", params ?? {}],
  accounts:    (filter?: string) => filter ? ["/api/accounts", filter] : ["/api/accounts"],
  treasuries:  () => ["/api/treasuries"] as const,
  clinics:     () => ["/api/clinic-clinics"] as const,
  departments: () => ["/api/departments"] as const,
  costCenters: () => ["/api/cost-centers"] as const,
} as const;

export const INVALIDATE = {
  doctors:     () => queryClient.invalidateQueries({ queryKey: ["/api/doctors"] }),
  services:    () => queryClient.invalidateQueries({ queryKey: ["/api/services"] }),
  accounts:    () => queryClient.invalidateQueries({ queryKey: ["/api/accounts"] }),
  treasuries:  () => queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] }),
  clinics:     () => queryClient.invalidateQueries({ queryKey: ["/api/clinic-clinics"] }),
  departments: () => queryClient.invalidateQueries({ queryKey: ["/api/departments"] }),
};
