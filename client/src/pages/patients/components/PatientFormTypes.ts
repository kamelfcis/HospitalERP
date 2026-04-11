import type { LookupItem } from "@/lib/lookupTypes";

export type VisitReason = "" | "consultation" | "admission" | "lab" | "radiology";
export type PaymentKind = "CASH" | "INSURANCE" | "CONTRACT";

export interface DuplicateCandidate {
  patientId: string; patientCode: string | null; fullName: string;
  phone: string | null; nationalId: string | null; age: number | null;
  score: number; reasons: string[];
}
export interface DuplicateCheckResult {
  duplicateStatus: "none" | "warning" | "block";
  candidates: DuplicateCandidate[];
  recommendedAction: string;
}
export interface ScheduleOption { doctorId: string; doctorName: string; }
export interface PatientSuggest { id: string; fullName: string; patientCode?: string | null; phone?: string | null; age?: number | null; nationalId?: string | null; }
export interface FloorOption    { id: string; nameAr: string; rooms: RoomOption[]; }
export interface RoomOption     { id: string; nameAr: string; beds: BedOption[]; }
export interface BedOption      { id: string; nameAr: string; status: string; }
export interface SurgeryType    { id: string; nameAr: string; }

export { type LookupItem };
