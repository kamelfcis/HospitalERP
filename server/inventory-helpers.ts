export function isLotExpired(expiryMonth: number | null, expiryYear: number | null, asOfDate?: Date): boolean {
  if (!expiryMonth || !expiryYear) return false;
  const checkDate = asOfDate || new Date();
  const checkMonth = checkDate.getMonth() + 1;
  const checkYear = checkDate.getFullYear();
  return expiryYear < checkYear || (expiryYear === checkYear && expiryMonth < checkMonth);
}

export function validateBatchExpiry(
  item: { hasExpiry: boolean; nameAr: string },
  expiryMonth: number | null | undefined,
  expiryYear: number | null | undefined,
  batchNumber?: string | null
): void {
  if (item.hasExpiry) {
    if (!expiryMonth || !expiryYear) {
      throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
    }
  } else {
    if (expiryMonth || expiryYear) {
      throw new Error(`الصنف "${item.nameAr}" لا يدعم تواريخ صلاحية`);
    }
  }
}

export function convertQtyToMinor(
  qtyEntered: number,
  unitLevel: string,
  item: { majorToMinor?: string | null; mediumToMinor?: string | null }
): number {
  if (unitLevel === 'major' && item.majorToMinor && parseFloat(item.majorToMinor) > 0) {
    return qtyEntered * parseFloat(item.majorToMinor);
  }
  if (unitLevel === 'medium' && item.mediumToMinor && parseFloat(item.mediumToMinor) > 0) {
    return qtyEntered * parseFloat(item.mediumToMinor);
  }
  return qtyEntered;
}

export function convertPriceToMinor(
  enteredPrice: number,
  unitLevel: string,
  item: { majorToMinor?: string | null; mediumToMinor?: string | null }
): number {
  if (unitLevel === 'major' && item.majorToMinor && parseFloat(item.majorToMinor) > 0) {
    return enteredPrice / parseFloat(item.majorToMinor);
  }
  if (unitLevel === 'medium' && item.mediumToMinor && parseFloat(item.mediumToMinor) > 0) {
    return enteredPrice / parseFloat(item.mediumToMinor);
  }
  return enteredPrice;
}

export function validateUnitConversion(
  unitLevel: string,
  item: { nameAr: string; majorToMinor?: string | null; mediumToMinor?: string | null }
): void {
  if (unitLevel === 'major') {
    if (!item.majorToMinor || parseFloat(item.majorToMinor) <= 0) {
      throw new Error(`الصنف "${item.nameAr}" - معامل تحويل الوحدة الكبرى غير محدد`);
    }
  }
  if (unitLevel === 'medium') {
    if (!item.mediumToMinor || parseFloat(item.mediumToMinor) <= 0) {
      throw new Error(`الصنف "${item.nameAr}" - معامل تحويل الوحدة الوسطى غير محدد`);
    }
  }
}
