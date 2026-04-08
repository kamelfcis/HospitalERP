import { useQuery } from "@tanstack/react-query";
import type { FinancialSummary } from "../shared/types";

interface PatientRecord {
  id: string;
  patientCode?: string;
  fullName: string;
  phone?: string;
  nationalId?: string;
  age?: number;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

export function usePatientData(patientId: string) {
  return useQuery<PatientRecord>({
    queryKey: ["/api/patients", patientId],
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePatientFinancialSummary(patientId: string) {
  return useQuery<FinancialSummary>({
    queryKey: ["/api/patients", patientId, "financial-summary"],
    enabled: !!patientId,
    staleTime: 60 * 1000,
  });
}

export function usePatientTimeline(patientId: string) {
  return useQuery<any>({
    queryKey: ["/api/patients", patientId, "journey"],
    enabled: !!patientId,
    staleTime: 60 * 1000,
  });
}
