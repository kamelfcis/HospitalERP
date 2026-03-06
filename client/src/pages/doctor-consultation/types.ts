export interface ConsultationDrug {
  id?: string;
  lineNo: number;
  itemId?: string | null;
  drugName: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  notes?: string;
}

export interface ServiceOrder {
  id?: string;
  serviceId?: string | null;
  serviceNameManual?: string;
  targetId?: string;
  targetName?: string;
  status?: string;
}

export interface Consultation {
  id?: string | null;
  appointmentId: string;
  chiefComplaint?: string;
  diagnosis?: string;
  notes?: string;
  drugs: ConsultationDrug[];
  serviceOrders: ServiceOrder[];
  patientName?: string;
  patientPhone?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  turnNumber?: number;
  appointmentStatus?: string;
  doctorId?: string;
  doctorName?: string;
  doctorSpecialty?: string;
  clinicName?: string;
  defaultPharmacyId?: string | null;
}

export interface FavoriteDrug {
  id: string;
  doctorId: string;
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
