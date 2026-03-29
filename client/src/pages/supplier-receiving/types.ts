/**
 * types.ts — الـ types والـ helpers المشتركة لشاشة استلام الموردين
 */

import {
  ItemLike,
  getSmartDefaultUnitLevel,
  getEffectiveMediumToMinor,
  calculateQtyInMinor,
} from "@/lib/invoice-lines";

// إعادة تصدير لتوافق الشيفرة المستوردة من هذا الملف
export { getEffectiveMediumToMinor, calculateQtyInMinor };

// ── نوع سطر الاستلام المحلي ───────────────────────────────────────────────
export interface ReceivingLineLocal {
  id: string;
  itemId: string;
  item: ItemLike | null;
  unitLevel: string;
  qtyEntered: number;
  qtyInMinor: number;
  purchasePrice: number;
  discountPct: number;
  lineTotal: number;
  batchNumber: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  salePrice: number | null;
  lastPurchasePriceHint: number | null;
  lastSalePriceHint: number | null;
  bonusQty: number;
  bonusQtyInMinor: number;
  onHandInWarehouse: string;
  notes: string;
  isRejected: boolean;
  rejectionReason: string;
}

export interface LineError {
  lineIndex: number;
  field: string;
  messageAr: string;
}

export function getDefaultUnitLevel(item: ItemLike | null | undefined): string {
  // لإذن الاستلام: دائماً الوحدة الكبرى (نستلم من المورد بالعلبة عادةً، مفيش قيد مخزون)
  if (item?.majorUnitName) return "major";
  if (item?.mediumUnitName) return "medium";
  return "minor";
}

export function getUnitName(item: ItemLike | null | undefined, unitLevel: string): string {
  if (unitLevel === "major") return item?.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item?.mediumUnitName || "وحدة وسطى";
  return item?.minorUnitName || "وحدة صغرى";
}

// ── بناء payload الـ API (مرة واحدة بدل تكرار) ────────────────────────────
export function buildLinePayload(line: ReceivingLineLocal) {
  return {
    itemId:          line.itemId,
    unitLevel:       line.unitLevel,
    qtyEntered:      String(line.qtyEntered),
    qtyInMinor:      String(line.qtyInMinor),
    bonusQty:        String(line.bonusQty),
    bonusQtyInMinor: String(line.bonusQtyInMinor),
    purchasePrice:   String(line.purchasePrice),
    lineTotal:       String(line.lineTotal),
    batchNumber:     line.batchNumber || undefined,
    expiryMonth:     line.expiryMonth || undefined,
    expiryYear:      line.expiryYear || undefined,
    salePrice:       line.salePrice != null ? String(line.salePrice) : undefined,
    notes:           line.notes || undefined,
    isRejected:      line.isRejected,
    rejectionReason: line.rejectionReason || undefined,
  };
}
