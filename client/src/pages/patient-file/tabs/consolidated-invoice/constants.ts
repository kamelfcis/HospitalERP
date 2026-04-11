import { Activity, CheckCircle2, XCircle } from "lucide-react";
import type { AggregatedInvoice } from "../../shared/types";
import type { PatientVisit } from "./types";

export const ENCOUNTER_TYPE_LABELS: Record<string, string> = {
  clinic: "عيادة",
  lab: "معمل",
  radiology: "أشعة",
  surgery: "عمليات",
  icu: "عناية مركزة",
  ward: "إقامة",
  nursery: "حضّانة",
};

export const ENCOUNTER_TYPE_COLORS: Record<string, string> = {
  clinic: "bg-teal-50 text-teal-700 border-teal-200",
  lab: "bg-orange-50 text-orange-700 border-orange-200",
  radiology: "bg-violet-50 text-violet-700 border-violet-200",
  surgery: "bg-red-50 text-red-700 border-red-200",
  icu: "bg-rose-50 text-rose-700 border-rose-200",
  ward: "bg-indigo-50 text-indigo-700 border-indigo-200",
  nursery: "bg-pink-50 text-pink-700 border-pink-200",
};

export const ENCOUNTER_STATUS_LABELS: Record<string, { label: string; icon: typeof CheckCircle2 }> = {
  active: { label: "نشط", icon: Activity },
  completed: { label: "مكتمل", icon: CheckCircle2 },
  cancelled: { label: "ملغي", icon: XCircle },
};

export const LINE_CLASS: Record<string, string> = {
  service: "bg-blue-50 text-blue-700 border-blue-200",
  drug: "bg-green-50 text-green-700 border-green-200",
  consumable: "bg-amber-50 text-amber-700 border-amber-200",
  equipment: "bg-purple-50 text-purple-700 border-purple-200",
};

export const PAY_METHOD_CLASS: Record<string, string> = {
  cash: "bg-green-50 text-green-700 border-green-200",
  card: "bg-blue-50 text-blue-700 border-blue-200",
  bank_transfer: "bg-purple-50 text-purple-700 border-purple-200",
  insurance: "bg-amber-50 text-amber-700 border-amber-200",
};

export const CLASSIFICATION_LABELS: Record<string, { label: string; colorClass: string }> = {
  fully_paid: { label: "مدفوعة بالكامل", colorClass: "text-green-700 bg-green-50 border-green-200" },
  accounts_receivable: { label: "ذمم مدينة (AR)", colorClass: "text-amber-700 bg-amber-50 border-amber-200" },
  refund_due: { label: "مردود مستحق", colorClass: "text-red-700 bg-red-50 border-red-200" },
};

export function pvToVisitKey(pv: PatientVisit): string {
  if (pv.visit_type === "inpatient" && pv.admission_id) return `admission:${pv.admission_id}`;
  return `visit:${pv.id}`;
}

export function findPrimaryInvoice(invoices: AggregatedInvoice[]): AggregatedInvoice | undefined {
  return (
    invoices.find(i => i.isConsolidated && i.status === "finalized") ??
    invoices.find(i => i.isConsolidated && i.status === "draft") ??
    invoices.find(i => i.status === "finalized" && !i.isConsolidated && invoices.length === 1) ??
    invoices.find(i => i.status === "draft"     && !i.isConsolidated && invoices.length === 1) ??
    undefined
  );
}
