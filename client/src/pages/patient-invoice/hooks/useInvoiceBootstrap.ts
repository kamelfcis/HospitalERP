import { useQuery } from "@tanstack/react-query";
import type { Department, Admission } from "@shared/schema";

export function useInvoiceBootstrap() {
  const { data: nextNumberData } = useQuery<{ nextNumber: string }>({
    queryKey: ["/api/patient-invoices/next-number"],
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: activeAdmissions } = useQuery<Admission[]>({
    queryKey: ["/api/admissions", "active"],
    queryFn: async () => {
      const res = await fetch("/api/admissions?status=active", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admissions");
      return res.json();
    },
  });

  return {
    nextNumber: nextNumberData?.nextNumber ?? "",
    departments,
    warehouses,
    activeAdmissions,
  };
}
