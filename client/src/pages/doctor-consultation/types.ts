export interface ConsultationDrug {
  id?: string;
  lineNo: number;
  itemId?: string | null;
  drugName: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  notes?: string;
  unitLevel?: string;
  quantity?: number;
  unitPrice?: number;
  majorUnitName?: string | null;
  mediumUnitName?: string | null;
  minorUnitName?: string | null;
  majorToMinor?: string | null;
  mediumToMinor?: string | null;
  majorToMedium?: string | null;
  salePriceCurrent?: string | null;
}

export interface ServiceOrder {
  id?: string;
  serviceId?: string | null;
  serviceNameManual?: string;
  targetId?: string;
  targetName?: string;
  status?: string;
  isConsultationService?: boolean;
  unitPrice?: string | number | null;
}

export interface Consultation {
  id?: string | null;
  appointmentId: string;
  chiefComplaint?: string;
  diagnosis?: string;
  notes?: string;
  // ── Step 2: structured encounter fields (all nullable) ───────────────────
  subjectiveSummary?: string;
  objectiveSummary?: string;
  assessmentSummary?: string;
  planSummary?: string;
  followUpPlan?: string;
  // ── Step 4: follow-up planning fields (all nullable) ─────────────────────
  followUpAfterDays?: number | null;
  followUpReason?: string | null;
  suggestedFollowUpDate?: string | null;
  drugs: ConsultationDrug[];
  serviceOrders: ServiceOrder[];
  patientName?: string;
  patientId?: string | null;
  patientPhone?: string;
  patientAge?: number | null;
  patientGender?: string | null;
  appointmentDate?: string;
  appointmentTime?: string;
  turnNumber?: number;
  appointmentStatus?: string;
  doctorId?: string;
  doctorName?: string;
  doctorSpecialty?: string;
  clinicId?: string | null;
  clinicName?: string;
  defaultPharmacyId?: string | null;
  consultationServiceId?: string | null;
  paymentStatus?: string | null;
  paymentType?: string | null;
  insuranceCompany?: string | null;
  companyId?: string | null;
  contractId?: string | null;
  contractMemberId?: string | null;
  companyName?: string | null;
  contractName?: string | null;
  latestDiagnosis?: string | null;
}

export interface FavoriteDrug {
  id: string;
  doctorId: string;
  clinicId?: string | null;
  itemId?: string | null;
  drugName: string;
  defaultDose?: string;
  defaultFrequency?: string;
  defaultDuration?: string;
  sortOrder?: number;
}

export interface FrequentDrug {
  item_id: string;
  drug_name: string;
  usage_count: number;
}

export interface Service {
  id: string;
  nameAr: string;
  departmentId?: string | null;
  basePrice?: string;
}
