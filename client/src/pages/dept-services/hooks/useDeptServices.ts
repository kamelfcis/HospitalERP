import { useQuery } from "@tanstack/react-query";

export function useDeptServices(departmentId: string | undefined) {
  return useQuery<any[]>({
    queryKey: ["/api/services", { departmentId, active: true }],
    queryFn: async () => {
      if (!departmentId) return [];
      const res = await fetch(`/api/services?departmentId=${departmentId}&active=true`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data || []);
    },
    enabled: !!departmentId,
    staleTime: 0,
  });
}

export function useServiceConsumables(serviceId: string | undefined) {
  return useQuery<any[]>({
    queryKey: ["/api/services", serviceId, "consumables"],
    queryFn: async () => {
      if (!serviceId) return [];
      const res = await fetch(`/api/services/${serviceId}/consumables`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!serviceId,
    staleTime: 0,
  });
}

export function useUserTreasury() {
  return useQuery<any>({
    queryKey: ["/api/treasuries/mine"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/treasuries/mine");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    staleTime: 0,
  });
}

export function useDoctors() {
  return useQuery<any[]>({
    queryKey: ["/api/doctors"],
    staleTime: 0,
  });
}

export function usePatientSearch(search: string) {
  return useQuery<any[]>({
    queryKey: ["/api/patients", { search }],
    queryFn: async () => {
      if (!search || search.length < 2) return [];
      const res = await fetch(`/api/patients?search=${encodeURIComponent(search)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: search.length >= 2,
    staleTime: 0,
  });
}

export function useDepartments() {
  return useQuery<any[]>({
    queryKey: ["/api/departments"],
    staleTime: 0,
  });
}
