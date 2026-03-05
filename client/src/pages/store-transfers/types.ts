export interface TransferLineLocal {
  id: string;
  itemId: string;
  item: any;
  unitLevel: string;
  qtyEntered: number;
  qtyInMinor: number;
  selectedExpiryDate: string | null;
  selectedExpiryMonth: number | null;
  selectedExpiryYear: number | null;
  availableQtyMinor: string;
  notes: string;
  fefoLocked: boolean;
  lotSalePrice?: string;
}

export interface ExpiryOption {
  expiryDate: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  qtyAvailableMinor: string;
  lotSalePrice?: string;
}

export function getEffectiveMediumToMinor(item: any): number {
  const m2m = parseFloat(item?.mediumToMinor);
  if (m2m > 0) return m2m;
  const maj2min = parseFloat(item?.majorToMinor) || 1;
  const maj2med = parseFloat(item?.majorToMedium) || 1;
  return maj2min / maj2med;
}

export function calculateQtyInMinor(qtyEntered: number, unitLevel: string, item: any): number {
  if (unitLevel === "major") return qtyEntered * (parseFloat(item?.majorToMinor) || 1);
  if (unitLevel === "medium") return qtyEntered * getEffectiveMediumToMinor(item);
  return qtyEntered;
}

export function getDefaultUnitLevel(item: any): string {
  if (item.majorUnitName) return "major";
  return "minor";
}

export function getUnitName(item: any, unitLevel: string): string {
  if (unitLevel === "major") return item.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item.mediumUnitName || "وحدة وسطى";
  return item.minorUnitName || "وحدة صغرى";
}

export function getAvailableUnits(item: any): { value: string; label: string }[] {
  const units: { value: string; label: string }[] = [];
  if (item.majorUnitName) units.push({ value: "major", label: item.majorUnitName });
  if (item.mediumUnitName) units.push({ value: "medium", label: item.mediumUnitName });
  if (item.minorUnitName) units.push({ value: "minor", label: item.minorUnitName });
  return units;
}

export function formatAvailability(availQtyMinor: string, unitLevel: string, item: any): string {
  const minorQty = parseFloat(availQtyMinor);
  if (isNaN(minorQty)) return "0";

  if (item && unitLevel === "major") {
    const factor = parseFloat(item.majorToMinor);
    if (factor > 0 && factor !== 1) {
      const wholeMajor = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - wholeMajor * factor);
      if (remainderMinor > 0) return `${wholeMajor} ${item.majorUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      return `${wholeMajor} ${item.majorUnitName || ""}`;
    }
    return `${minorQty} ${item.majorUnitName || "وحدة"}`;
  }

  if (item && unitLevel === "medium") {
    const factor = getEffectiveMediumToMinor(item);
    if (factor > 0 && factor !== 1) {
      const wholeMed = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - wholeMed * factor);
      if (remainderMinor > 0) return `${wholeMed} ${item.mediumUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      return `${wholeMed} ${item.mediumUnitName || ""}`;
    }
    return `${minorQty} ${item.mediumUnitName || "وحدة"}`;
  }

  return `${minorQty} ${item?.minorUnitName || item?.majorUnitName || "وحدة"}`;
}
