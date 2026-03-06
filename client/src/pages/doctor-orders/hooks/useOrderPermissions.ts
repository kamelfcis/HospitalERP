import { useAuth } from "@/hooks/use-auth";

export function useOrderPermissions() {
  const { hasPermission } = useAuth();

  return {
    canView: hasPermission("doctor_orders.view"),
    canExecute: hasPermission("doctor_orders.execute"),
  };
}
