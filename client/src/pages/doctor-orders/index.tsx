import { useLocation } from "wouter";
import { ClipboardList } from "lucide-react";
import { useGroupedOrders } from "./hooks/useGroupedOrders";
import { useClinicOrders } from "./hooks/useClinicOrders";
import { useOrderPermissions } from "./hooks/useOrderPermissions";
import { OrdersFilterBar } from "./components/OrdersFilterBar";
import { OrdersTable } from "./components/OrdersTable";
import type { ClinicOrder } from "./types";

export default function DoctorOrders() {
  const [, navigate] = useLocation();
  const { canExecute } = useOrderPermissions();

  const {
    groups,
    isLoading,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    departmentFilter,
    setDepartmentFilter,
    departments,
    pendingCount,
    refetch,
  } = useGroupedOrders();

  const { executeMutation } = useClinicOrders();

  const handleExecute = (order: ClinicOrder) => {
    if (order.orderType === "service") {
      const deptCode = order.departmentCode || "LAB";
      const params = new URLSearchParams();
      params.set("clinicOrderIds", order.id);
      params.set("patientName", order.apptPatientName || order.patientName || "");
      if (order.doctorId) params.set("doctorId", order.doctorId);
      if (order.doctorName) params.set("doctorName", order.doctorName);
      params.set("services", JSON.stringify([{
        serviceId: order.serviceId,
        serviceName: order.serviceNameAr || order.serviceNameManual || "",
        unitPrice: order.servicePrice || "0",
      }]));
      navigate(`/dept-services/${deptCode}?${params.toString()}`);
    }
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
        totalCount={groups.length}
        pendingCount={pendingCount}
        departments={departments}
      />

      <OrdersTable
        groups={groups}
        isLoading={isLoading}
        onExecute={handleExecute}
        isExecuting={executeMutation.isPending}
        canExecute={canExecute}
      />
    </div>
  );
}
