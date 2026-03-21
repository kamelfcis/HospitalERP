/**
 * useOutpatientDashboard.ts
 *
 * Two isolated hooks for the OPD operational dashboards.
 * Encapsulates: date handling, loading/error states, per-dashboard fetches.
 *
 * Both hooks are read-only — zero write-back.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ── Shared types (mirrors server/storage/clinic-dashboard-storage.ts) ────────

export interface PaymentBreakdownRow {
  paymentType: string;
  count: number;
  grossAmount: number;
  paidAmount: number;
}

export interface DoctorDailySummaryData {
  date: string;
  doctorId: string;
  noDoctorLinked?: boolean;
  totalPatients: number;
  waiting: number;
  inConsultation: number;
  done: number;
  cancelled: number;
  noShow: number;
  serviceOrdersTotal: number;
  serviceOrdersPending: number;
  serviceOrdersExecuted: number;
  pharmacyOrdersTotal: number;
  pharmacyOrdersPending: number;
  pharmacyOrdersExecuted: number;
  grossConsultationFee: number;
  doctorDeductionTotal: number;
}

export interface SecretaryDailySummaryData {
  date: string;
  clinicId: string;
  totalBookings: number;
  waiting: number;
  inConsultation: number;
  done: number;
  cancelled: number;
  noShow: number;
  grossTotal: number;
  paidTotal: number;
  paymentBreakdown: PaymentBreakdownRow[];
}

// ── Doctor dashboard hook ─────────────────────────────────────────────────────

export function useDoctorDashboard(date: string, doctorId?: string) {
  const params = new URLSearchParams({ date });
  if (doctorId) params.set("doctorId", doctorId);

  return useQuery<DoctorDailySummaryData>({
    queryKey: ["/api/clinic-opd/dashboard/doctor", date, doctorId ?? "self"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-opd/dashboard/doctor?${params}`).then(r => r.json()),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ── Secretary dashboard hook ──────────────────────────────────────────────────

export function useSecretaryDashboard(clinicId: string | undefined, date: string) {
  const params = new URLSearchParams({ date });
  if (clinicId) params.set("clinicId", clinicId);

  return useQuery<SecretaryDailySummaryData>({
    queryKey: ["/api/clinic-opd/dashboard/secretary", clinicId ?? "", date],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-opd/dashboard/secretary?${params}`).then(r => r.json()),
    enabled: !!clinicId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
