import type { ItemLike } from "@/lib/invoice-lines";

export interface LineLocal {
  tempId: string;
  lineType: "service" | "drug" | "consumable" | "equipment";
  serviceId: string | null;
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  totalPrice: number;
  doctorName: string;
  nurseName: string;
  requiresDoctor: boolean;
  requiresNurse: boolean;
  notes: string;
  sortOrder: number;
  serviceType: string;
  unitLevel: "major" | "medium" | "minor";
  item?: ItemLike | null;
  lotId: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  priceSource: string;
  sourceType: string | null;
  sourceId: string | null;
}

export interface PaymentLocal {
  tempId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "insurance";
  referenceNumber: string;
  notes: string;
  treasuryId: string | null;
}
