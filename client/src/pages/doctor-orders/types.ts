export interface ClinicOrder {
  id: string;
  appointmentId: string;
  consultationId?: string | null;
  doctorId: string;
  doctorName?: string;
  patientName: string;
  apptPatientName?: string;
  orderType: "service" | "pharmacy";
  targetType: "department" | "pharmacy";
  targetId?: string | null;
  targetName?: string | null;
  serviceId?: string | null;
  serviceNameAr?: string | null;
  serviceNameManual?: string | null;
  servicePrice?: string | null;
  serviceDepartmentId?: string | null;
  departmentCode?: string | null;
  itemId?: string | null;
  drugName?: string | null;
  dose?: string | null;
  quantity?: string | null;
  status: "pending" | "executed" | "cancelled";
  executedInvoiceId?: string | null;
  executedBy?: string | null;
  executedAt?: string | null;
  createdAt?: string | null;
  appointmentDate?: string | null;
  frequency?: string | null;
  duration?: string | null;
}

export type OrderStatusFilter = "all" | "pending" | "executed" | "cancelled";
export type OrderTypeFilter = "all" | "service" | "pharmacy";

export interface GroupedClinicOrder {
  groupKey: string;
  appointmentId: string;
  orderType: "service" | "pharmacy";
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string | null;
  totalCount: number;
  pendingCount: number;
  executedCount: number;
  cancelledCount: number;
  groupStatus: "pending" | "executed" | "mixed";
  latestCreatedAt: string | null;
  lines: ClinicOrder[];
}
