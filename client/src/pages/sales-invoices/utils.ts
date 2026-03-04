export function getUnitName(item: any, unitLevel: string): string {
  if (unitLevel === "major") return item?.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item?.mediumUnitName || "وحدة وسطى";
  return item?.minorUnitName || "وحدة صغرى";
}

export function getUnitOptions(item: any): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  if (item?.majorUnitName) opts.push({ value: "major", label: item.majorUnitName });
  if (item?.mediumUnitName) opts.push({ value: "medium", label: item.mediumUnitName });
  if (item?.minorUnitName) opts.push({ value: "minor", label: item.minorUnitName });
  if (opts.length === 0) opts.push({ value: "major", label: "وحدة" });
  return opts;
}

export function genId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
}

export function getEffectiveMediumToMinor(item: any): number {
  const m2m = parseFloat(item?.mediumToMinor);
  if (m2m > 0) return m2m;
  const maj2min = parseFloat(item?.majorToMinor) || 1;
  const maj2med = parseFloat(item?.majorToMedium) || 1;
  return maj2min / maj2med;
}

export function formatAvailability(availQtyMinor: string, unitLevel: string, item: any): string {
  const minorQty = parseFloat(availQtyMinor);
  if (isNaN(minorQty)) return "0";

  if (item && unitLevel === "major") {
    const factor = parseFloat(item.majorToMinor);
    if (factor > 0 && factor !== 1) {
      const wholeMajor = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - wholeMajor * factor);
      if (remainderMinor > 0) {
        return `${wholeMajor} ${item.majorUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      }
      return `${wholeMajor} ${item.majorUnitName || ""}`;
    }
    return `${minorQty} ${item.majorUnitName || "وحدة"}`;
  }

  if (item && unitLevel === "medium") {
    const factor = getEffectiveMediumToMinor(item);
    if (factor > 0 && factor !== 1) {
      const wholeMed = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - wholeMed * factor);
      if (remainderMinor > 0) {
        return `${wholeMed} ${item.mediumUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      }
      return `${wholeMed} ${item.mediumUnitName || ""}`;
    }
    return `${minorQty} ${item.mediumUnitName || "وحدة"}`;
  }

  return `${minorQty} ${item?.minorUnitName || item?.majorUnitName || "وحدة"}`;
}

export function calculateQtyInMinor(qty: number, unitLevel: string, item: any): number {
  if (!item) return qty;
  if (unitLevel === "minor") return qty;
  if (unitLevel === "medium") return qty * getEffectiveMediumToMinor(item);
  return qty * (parseFloat(item.majorToMinor) || 1);
}

export function computeUnitPriceFromBase(baseSalePrice: number, unitLevel: string, item: any): number {
  if (!item || !baseSalePrice) return baseSalePrice || 0;
  if (unitLevel === "major" || !unitLevel) return baseSalePrice;
  const majorToMedium = parseFloat(String(item.majorToMedium)) || 1;
  const majorToMinor = parseFloat(String(item.majorToMinor)) || 1;
  if (unitLevel === "medium") return +(baseSalePrice / majorToMedium).toFixed(2);
  if (unitLevel === "minor") return +(baseSalePrice / majorToMinor).toFixed(2);
  return baseSalePrice;
}

export function convertMinorToDisplayQty(allocMinor: number, unitLevel: string, item: any): number {
  let displayQty = allocMinor;
  if (unitLevel === "major") {
    displayQty = allocMinor / (parseFloat(item?.majorToMinor) || 1);
  } else if (unitLevel === "medium") {
    displayQty = allocMinor / getEffectiveMediumToMinor(item);
  }
  const rounded = Math.round(displayQty * 10000) / 10000;
  const nearest = Math.round(rounded);
  if (Math.abs(rounded - nearest) < 0.005) return nearest;
  return rounded;
}
