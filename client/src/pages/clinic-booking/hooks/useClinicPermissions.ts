import { useAuth } from "@/hooks/use-auth";

export function useClinicPermissions() {
  const { hasPermission } = useAuth();

  return {
    isAdmin: hasPermission("clinic.view_all"),
    canBook: hasPermission("clinic.book"),
    canManage: hasPermission("clinic.manage"),
    canConsult: hasPermission("doctor.consultation"),
    canViewStatement: hasPermission("doctor.view_statement") || hasPermission("clinic.view_all"),
    canViewOrders: hasPermission("doctor_orders.view") || hasPermission("clinic.view_all"),
    canExecuteOrders: hasPermission("doctor_orders.execute") || hasPermission("clinic.view_all"),
  };
}
