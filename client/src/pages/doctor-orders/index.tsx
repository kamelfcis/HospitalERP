import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { useClinicOrders } from "./hooks/useClinicOrders";
import { useOrderPermissions } from "./hooks/useOrderPermissions";
import { OrdersFilterBar } from "./components/OrdersFilterBar";
import { OrdersTable } from "./components/OrdersTable";
import { ExecuteConfirmDialog } from "./components/ExecuteConfirmDialog";
import type { ClinicOrder } from "./types";

export default function DoctorOrders() {
  const [confirmOrder, setConfirmOrder] = useState<ClinicOrder | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const { canExecute } = useOrderPermissions();

  const {
    orders,
    isLoading,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    executeMutation,
    refetch,
  } = useClinicOrders();

  const pendingCount = orders.filter((o) => o.status === "pending").length;

  const filteredOrders = departmentFilter === "all"
    ? orders
    : orders.filter((o) => o.targetName === departmentFilter);

  const handleExecute = (order: ClinicOrder) => {
    if (order.orderType === "service") {
      setConfirmOrder(order);
    }
  };

  const handleConfirmExecute = (orderId: string) => {
    executeMutation.mutate(orderId, {
      onSuccess: () => setConfirmOrder(null),
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-bold" data-testid="text-page-title">أوامر الطبيب</h1>
      </div>

      <OrdersFilterBar
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        departmentFilter={departmentFilter}
        onStatusChange={setStatusFilter}
        onTypeChange={setTypeFilter}
        onDepartmentChange={setDepartmentFilter}
        onRefresh={refetch}
        totalCount={filteredOrders.length}
        pendingCount={pendingCount}
        allOrders={orders}
      />

      <OrdersTable
        orders={filteredOrders}
        isLoading={isLoading}
        onExecute={handleExecute}
        isExecuting={executeMutation.isPending}
        canExecute={canExecute}
      />

      {canExecute && (
        <ExecuteConfirmDialog
          order={confirmOrder}
          onClose={() => setConfirmOrder(null)}
          onConfirm={handleConfirmExecute}
          isPending={executeMutation.isPending}
        />
      )}
    </div>
  );
}
