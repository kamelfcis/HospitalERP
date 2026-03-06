export interface ClinicOrder {
  id: string;
  appointmentId: string;
  consultationId?: string | null;
  doctorId: string;
  doctorName?: string;
  patientName: string;
  orderType: "service" | "pharmacy";
  targetType: "department" | "pharmacy";
  targetId?: string | null;
  targetName?: string | null;
  serviceId?: string | null;
  serviceNameManual?: string | null;
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
