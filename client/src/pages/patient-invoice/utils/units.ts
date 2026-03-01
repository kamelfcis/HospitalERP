export function getEffectiveMajorToMinor(item: any): number {
  if (!item) return 1;
  const m2min = parseFloat(String(item.majorToMinor));
  if (m2min > 0) return m2min;
  const m2med = parseFloat(String(item.majorToMedium));
  const med2min = parseFloat(String(item.mediumToMinor));
  if (m2med > 0 && med2min > 0) return m2med * med2min;
  if (m2med > 0) return m2med;
  return 1;
}

export function getEffectiveMediumToMinor(item: any): number {
  if (!item) return 1;
  const m2m = parseFloat(String(item.mediumToMinor));
  if (m2m > 0) return m2m;
  const maj2med = parseFloat(String(item.majorToMedium));
  const maj2min = parseFloat(String(item.majorToMinor));
  if (maj2med > 0 && maj2min > 0) return maj2min / maj2med;
  return 1;
}

export function getSmallestUnitLevel(item: any): "major" | "medium" | "minor" {
  if (!item) return "minor";
  if (item.minorUnitName) return "minor";
  if (item.mediumUnitName) return "medium";
  return "major";
}

export function calculateQtyInSmallest(qty: number, unitLevel: string, item: any): number {
  if (!item) return qty;
  const smallest = getSmallestUnitLevel(item);
  if (unitLevel === smallest) return qty;
  if (unitLevel === "major") {
    if (smallest === "minor") return qty * getEffectiveMajorToMinor(item);
    if (smallest === "medium") return qty * (parseFloat(String(item.majorToMedium)) || 1);
  }
  if (unitLevel === "medium" && smallest === "minor") {
    return qty * getEffectiveMediumToMinor(item);
  }
  return qty;
}

export function calculateQtyInMinor(qty: number, unitLevel: string, item: any): number {
  return calculateQtyInSmallest(qty, unitLevel, item);
}

export function computeUnitPriceFromBase(baseSalePrice: number, unitLevel: string, item: any): number {
  if (!item || !baseSalePrice) return baseSalePrice || 0;
  if (unitLevel === "major" || !unitLevel) return baseSalePrice;
  const majorToMedium = parseFloat(String(item.majorToMedium)) || 1;
  const majorToMinor = getEffectiveMajorToMinor(item);
  if (unitLevel === "medium") return +(baseSalePrice / majorToMedium).toFixed(2);
  if (unitLevel === "minor") return +(baseSalePrice / majorToMinor).toFixed(2);
  return baseSalePrice;
}

export function convertSmallestToDisplayQty(allocSmallest: number, unitLevel: string, item: any): number {
  const smallest = getSmallestUnitLevel(item);
  let displayQty = allocSmallest;
  if (unitLevel === "major" && smallest !== "major") {
    if (smallest === "minor") displayQty = allocSmallest / getEffectiveMajorToMinor(item);
    else if (smallest === "medium") displayQty = allocSmallest / (parseFloat(String(item?.majorToMedium)) || 1);
  } else if (unitLevel === "medium" && smallest === "minor") {
    displayQty = allocSmallest / getEffectiveMediumToMinor(item);
  }
  const rounded = Math.round(displayQty * 10000) / 10000;
  const nearest = Math.round(rounded);
  if (Math.abs(rounded - nearest) < 0.005) return nearest;
  return rounded;
}

export function convertMinorToDisplayQty(allocMinor: number, unitLevel: string, item: any): number {
  return convertSmallestToDisplayQty(allocMinor, unitLevel, item);
}

export function itemHasMajorUnit(item: any): boolean {
  if (!item) return false;
  const m2min = parseFloat(String(item.majorToMinor));
  const m2med = parseFloat(String(item.majorToMedium));
  return (m2min > 1) || (m2med > 1) || !!item.majorUnitName;
}

export function itemHasMediumUnit(item: any): boolean {
  if (!item) return false;
  const m2med = parseFloat(String(item.majorToMedium));
  const med2min = parseFloat(String(item.mediumToMinor));
  return (m2med > 1) || (med2min > 1) || !!item.mediumUnitName;
}

export function getUnitName(item: any, unitLevel: string): string {
  if (!item) return "";
  if (unitLevel === "major") return item.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item.mediumUnitName || "وحدة متوسطة";
  return item.minorUnitName || "وحدة صغرى";
}
