import type { ItemLike } from "@/lib/invoice-lines";

export interface LineLocal {
  tempId: string;
  lineType: "service" | "drug" | "consumable" | "equipment" | "doctor_cost";
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
  coverageStatus: string | null;
  approvalStatus: string | null;
  companyShareAmount: string | null;
  patientShareAmount: string | null;
  contractPrice: string | null;
  listPrice: string | null;
  contractRuleId: string | null;
  /** التصنيف التجاري — snapshot محدد وقت إنشاء البند، مقفول بعد finalize */
  businessClassification: string | null;
  /** قائمة الأسعار التي استُخدمت لاشتقاق السعر — audit trail */
  priceListIdUsed: string | null;
  /** trace — النموذج الذي أُنشئ منه البند (null لو لم يكن من نموذج) */
  templateId: string | null;
  templateNameSnapshot: string | null;
  /** وقت تطبيق النموذج — يُسجَّل لحظة الإضافة */
  appliedAt: string | null;
  /** المستخدم الذي طبّق النموذج */
  appliedBy: string | null;
  /**
   * السعر الأصلي من المحلّل (resolver) لحظة إضافة البند.
   * حقل UI فقط — لا يُحفظ في قاعدة البيانات.
   * يُستخدم للكشف عن التعديل اليدوي: إذا تغيّر unitPrice عنه → priceSource = "manual_override"
   */
  resolvedUnitPrice?: number | null;
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
