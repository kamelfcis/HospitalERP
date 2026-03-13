export type BedStatus = "EMPTY" | "OCCUPIED" | "NEEDS_CLEANING" | "MAINTENANCE";

export interface BedData {
  id: string;
  bedNumber: string;
  status: BedStatus;
  currentAdmissionId?: string;
  patientName?: string;
  admissionNumber?: string;
  roomId: string;
  roomServiceId?: string | null;
  roomServiceNameAr?: string | null;
  roomServicePrice?: string | null;
  /* enriched by FloorSection for ticket printing */
  roomNameAr?: string | null;
  roomNumber?: string | null;
  floorNameAr?: string | null;
}

export interface RoomData {
  id: string;
  nameAr: string;
  roomNumber?: string;
  serviceId?: string | null;
  serviceNameAr?: string | null;
  servicePrice?: string | null;
  beds: BedData[];
}

export interface FloorData {
  id: string;
  nameAr: string;
  sortOrder: number;
  rooms: RoomData[];
}

export interface AvailableBed {
  id: string;
  bedNumber: string;
  roomId: string;
  roomNameAr: string;
  floorNameAr: string;
  roomServiceId: string | null;
  roomServiceNameAr: string | null;
  roomServicePrice: string | null;
}

export interface Patient {
  id: string;
  fullName: string;
  phone?: string;
}

export interface Department {
  id: string;
  nameAr: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty?: string | null;
}

export const STATUS_CONFIG: Record<BedStatus, { label: string; card: string; badge: string }> = {
  EMPTY:          { label: "فارغ",         card: "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700",  badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  OCCUPIED:       { label: "مشغول",        card: "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700",      badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  NEEDS_CLEANING: { label: "يحتاج تنظيف", card: "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700",  badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  MAINTENANCE:    { label: "صيانة",        card: "bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-700",          badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};
