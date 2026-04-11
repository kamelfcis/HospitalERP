import type { AggregatedViewData } from "../../shared/types";

export interface PatientVisit {
  id: string;
  visit_number: string;
  visit_type: "inpatient" | "outpatient";
  admission_id: string | null;
  department_name: string | null;
  status: string;
  created_at: string;
  doctor_name: string | null;
  admission_notes: string | null;
  admission_date: string | null;
  discharge_date: string | null;
  admission_number: string | null;
  admission_created_at: string | null;
  admission_updated_at: string | null;
}

export interface VisitHeaderInfo {
  doctorName: string | null;
  departmentName: string | null;
  admissionDate: string | null;
  dischargeDate: string | null;
  admissionCreatedAt: string | null;
  admissionUpdatedAt: string | null;
  visitNumber: string | null;
  visitType: "inpatient" | "outpatient" | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  isFinalClosed: boolean;
}

export interface Props {
  data: AggregatedViewData | undefined;
  isLoading: boolean;
  patientId: string;
  patientName: string;
  patientCode: string;
  sidebarContainer?: HTMLDivElement | null;
  onVisitHeaderChange?: (info: VisitHeaderInfo | null) => void;
}

export interface EncounterLineSummary {
  id: string;
  lineType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  totalPrice: string;
  businessClassification: string | null;
  createdAt: string;
  notes: string | null;
}

export interface EncounterSummary {
  id: string;
  encounterType: string;
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  doctorId: string | null;
  doctorName: string | null;
  startedAt: string;
  endedAt: string | null;
  lines: EncounterLineSummary[];
  totals: { gross: number; discount: number; net: number; lineCount: number };
}

export interface VisitInvoiceSummary {
  visit: {
    id: string;
    visitNumber: string;
    patientId: string;
    patientName: string;
    visitType: string;
    status: string;
    departmentId: string | null;
    departmentName: string | null;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    isFinalClosed: boolean;
    invoiceDate: string;
  } | null;
  encounters: EncounterSummary[];
  unlinkedLines: EncounterLineSummary[];
  totals: {
    gross: number;
    discount: number;
    net: number;
    paid: number;
    remaining: number;
    lineCount: number;
    encounterCount: number;
  };
  departmentBreakdown: Array<{
    departmentId: string | null;
    departmentName: string | null;
    gross: number;
    discount: number;
    net: number;
    lineCount: number;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    paymentMethod: string;
    treasuryName: string | null;
    notes: string | null;
    paymentDate: string;
  }>;
  readiness: {
    hasInvoice: boolean;
    allLinesHaveEncounter: boolean;
    totalsMatch: boolean;
    isFullyPaid: boolean;
    canFinalize: boolean;
    issues: string[];
  };
}
