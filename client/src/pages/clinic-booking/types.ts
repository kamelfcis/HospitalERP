export interface ClinicClinic {
  id: string;
  nameAr: string;
  departmentId?: string | null;
  defaultPharmacyId?: string | null;
  consultationServiceId?: string | null;
  treasuryId?: string | null;
  secretaryFeeType?: string | null;
  secretaryFeeValue?: string | number | null;
  isActive: boolean;
  createdAt: string;
  departmentName?: string | null;
  pharmacyName?: string | null;
  consultationServiceName?: string | null;
  treasuryName?: string | null;
}

export interface ClinicAppointment {
  id: string;
  clinicId: string;
  doctorId: string;
  patientId?: string | null;
  patientName: string;
  patientPhone?: string | null;
  appointmentDate: string;
  appointmentTime?: string | null;
  turnNumber: number;
  status: "waiting" | "in_consultation" | "done" | "cancelled";
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  doctorName?: string;
  doctorSpecialty?: string;
  patientFileNumber?: string | null;
  paymentType?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
}

export const STATUS_LABELS: Record<string, string> = {
  waiting: "في الانتظار",
  in_consultation: "داخل الكشف",
  done: "انتهى",
  cancelled: "ملغي",
};

export const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-yellow-100 text-yellow-800 border-yellow-200",
  in_consultation: "bg-blue-100 text-blue-800 border-blue-200",
  done: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};
