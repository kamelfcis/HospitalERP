import {
  Stethoscope, Bed, FlaskConical, Radiation,
  Banknote, ShieldCheck, FileSignature,
} from "lucide-react";

export type VisitReason = "" | "consultation" | "admission" | "lab" | "radiology";
export type PaymentKind = "CASH" | "INSURANCE" | "CONTRACT";

export interface PatientSuggest {
  id: string;
  fullName: string;
  patientCode?: string | null;
  phone?: string | null;
  age?: number | null;
  nationalId?: string | null;
  dateOfBirth?: string | null;
}

export interface DuplicateCandidate {
  patientId: string;
  patientCode: string | null;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  age: number | null;
  dateOfBirth?: string | null;
  score: number;
  reasons: string[];
}

export interface DuplicateCheckResult {
  duplicateStatus: "none" | "warning" | "block";
  candidates: DuplicateCandidate[];
  recommendedAction: string;
}

export interface VisitRecord {
  id: string;
  visit_number: string;
  patient_name: string;
  patient_code: string;
  patient_phone?: string;
  visit_type: "inpatient" | "outpatient";
  requested_service?: string | null;
  department_name?: string | null;
  status: string;
  notes?: string | null;
  created_at: string;
}

export interface ScheduleOption { doctorId: string; doctorName: string; }
export interface FloorOption { id: string; nameAr: string; rooms: RoomOption[]; }
export interface RoomOption { id: string; nameAr: string; beds: BedOption[]; }
export interface BedOption { id: string; nameAr: string; status: string; }
export interface SurgeryType { id: string; nameAr: string; }

export const todayISO = new Date().toISOString().slice(0, 10);

export const VISIT_TYPES: { value: VisitReason; label: string; sub: string; Icon: any; color: string; bg: string; border: string; activeRing: string }[] = [
  { value: "consultation", label: "كشف عيادة", sub: "حجز في طابور العيادة", Icon: Stethoscope, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-300", activeRing: "ring-blue-400" },
  { value: "admission", label: "تسكين / إقامة", sub: "تسكين على سرير بالمستشفى", Icon: Bed, color: "text-green-700", bg: "bg-green-50", border: "border-green-300", activeRing: "ring-green-400" },
  { value: "lab", label: "تحاليل", sub: "طلب تحاليل مختبر", Icon: FlaskConical, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300", activeRing: "ring-purple-400" },
  { value: "radiology", label: "أشعة", sub: "طلب أشعة تشخيصية", Icon: Radiation, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", activeRing: "ring-amber-400" },
];

export const PAYMENT_TYPES: { value: PaymentKind; label: string; Icon: any }[] = [
  { value: "CASH", label: "نقدي", Icon: Banknote },
  { value: "INSURANCE", label: "تأمين", Icon: ShieldCheck },
  { value: "CONTRACT", label: "تعاقد", Icon: FileSignature },
];

export const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: "مفتوح", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "قيد التنفيذ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "مكتمل", cls: "bg-green-50 text-green-700 border-green-200" },
  cancelled: { label: "ملغي", cls: "bg-red-50 text-red-700 border-red-200" },
};

export const DEBOUNCE_MS = 280;

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest pt-1 pb-0.5 border-b select-none">
      {children}
    </p>
  );
}
