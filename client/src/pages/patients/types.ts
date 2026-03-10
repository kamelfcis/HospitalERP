import type { Patient } from "@shared/schema";

export { Patient };

export const PAYMENT_TYPES = [
  { value: "CASH",      label: "نقدي" },
  { value: "INSURANCE", label: "تأمين" },
] as const;

export interface PatientStats {
  id: string;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  age: number | null;
  createdAt: string;
  servicesTotal:     number;
  drugsTotal:        number;
  consumablesTotal:  number;
  orRoomTotal:       number;
  stayTotal:         number;
  grandTotal:        number;
  paidTotal:         number;
  transferredTotal:  number;
  latestInvoiceId:     string | null;
  latestInvoiceNumber: string | null;
  latestInvoiceStatus: "draft" | "finalized" | "cancelled" | null;
  latestDoctorName:    string | null;
}

export interface DoctorOption {
  id:        string;
  name:      string;
  specialty?: string;
}

export interface AdmissionValues {
  doctorSearch:      string;
  selectedDoctor:    DoctorOption | null;
  showDoctorResults: boolean;
  selectedFloor:     string;
  selectedRoom:      string;
  selectedBed:       string;
  surgerySearch:     string;
  selectedSurgery:   { id: string; nameAr: string } | null;
  paymentType:       string;
  insuranceCo:       string;
}

export interface AdmissionSetters {
  setDoctorSearch:      (v: string) => void;
  setSelectedDoctor:    (v: DoctorOption | null) => void;
  setShowDoctorResults: (v: boolean) => void;
  setSelectedFloor:     (v: string) => void;
  setSelectedRoom:      (v: string) => void;
  setSelectedBed:       (v: string) => void;
  setSurgerySearch:     (v: string) => void;
  setSelectedSurgery:   (v: { id: string; nameAr: string } | null) => void;
  setPaymentType:       (v: string) => void;
  setInsuranceCo:       (v: string) => void;
}

export interface AdmissionSectionProps {
  open:     boolean;
  values:   AdmissionValues;
  setters:  AdmissionSetters;
}

export interface PatientFormDialogProps {
  open:           boolean;
  onClose:        () => void;
  editingPatient: Patient | null;
}

export interface PatientGridProps {
  rows:           PatientStats[];
  isLoading:      boolean;
  hasDeptFilter:  boolean;
  canViewInvoice: boolean;
  canEdit:        boolean;
  onEdit:         (p: PatientStats) => void;
  onDelete:       (p: PatientStats) => void;
  onOpenInvoice:  (invoiceId: string) => void;
  onViewFile:     (patientId: string) => void;
  onNewVisit:     (patient: PatientStats) => void;
}

export interface PatientRowProps {
  patient:        PatientStats;
  index:          number;
  dimmed:         boolean;
  canViewInvoice: boolean;
  canEdit:        boolean;
  onEdit:         (p: PatientStats) => void;
  onDelete:       (p: PatientStats) => void;
  onOpenInvoice:  (invoiceId: string) => void;
  onViewFile:     (patientId: string) => void;
  onNewVisit:     (patient: PatientStats) => void;
}
