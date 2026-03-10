import type { Patient } from "@shared/schema";

export { Patient };

export interface PatientStats {
  id:          string;
  patientCode: string | null;
  fullName:    string;
  phone:       string | null;
  nationalId:  string | null;
  age:         number | null;
  createdAt:   string;
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

export interface PrefilledPatient {
  id:          string;
  fullName:    string;
  phone?:      string | null;
  age?:        number | null;
  nationalId?: string | null;
  patientCode?: string | null;
}

export interface PatientFormDialogProps {
  open:              boolean;
  onClose:           () => void;
  editingPatient?:   Patient | null;
  prefilledPatient?: PrefilledPatient | null;
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
