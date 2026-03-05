export interface ReturnSearchResult {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  warehouseId: string;
  warehouseName: string;
  customerName: string | null;
  netTotal: string;
  itemCount: number;
}

export interface OriginalLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  unitLevel: string;
  qty: string;
  qtyInMinor: string;
  salePrice: string;
  lineTotal: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  lotId: string | null;
  majorUnitName: string | null;
  mediumUnitName: string | null;
  minorUnitName: string | null;
  majorToMinor: string | null;
  mediumToMinor: string | null;
  previouslyReturnedMinor: number;
}

export interface ReturnLine extends OriginalLine {
  returnQty: string;
  returnUnitLevel: string;
  returnQtyMinor: number;
  returnLineTotal: number;
}

export interface ReturnInvoiceData {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  warehouseId: string;
  warehouseName: string;
  customerType: string;
  customerName: string | null;
  subtotal: string;
  discountPercent: string;
  discountValue: string;
  netTotal: string;
  lines: OriginalLine[];
}

export function getAvailableUnits(line: OriginalLine): { value: string; label: string }[] {
  const units: { value: string; label: string }[] = [];
  if (line.majorUnitName) units.push({ value: "major", label: line.majorUnitName });
  if (line.mediumUnitName) units.push({ value: "medium", label: line.mediumUnitName });
  if (line.minorUnitName) units.push({ value: "minor", label: line.minorUnitName });
  return units;
}

export function getUnitName(line: OriginalLine, level: string): string {
  if (level === "major") return line.majorUnitName || "وحدة كبرى";
  if (level === "medium") return line.mediumUnitName || "وحدة وسطى";
  return line.minorUnitName || "وحدة صغرى";
}

export const unitLabel = getUnitName;

export function calcQtyMinor(qty: number, unitLevel: string, line: OriginalLine): number {
  if (unitLevel === "major") return qty * (parseFloat(line.majorToMinor || "1") || 1);
  if (unitLevel === "medium") return qty * (parseFloat(line.mediumToMinor || "1") || 1);
  return qty;
}

export function availableToReturnMinor(line: OriginalLine): number {
  return (parseFloat(line.qtyInMinor) || 0) - line.previouslyReturnedMinor;
}

export function availableToReturnDisplay(line: OriginalLine, unitLevel: string): string {
  const availMinor = availableToReturnMinor(line);
  if (unitLevel === "major" && line.majorToMinor) {
    const factor = parseFloat(line.majorToMinor) || 1;
    return (availMinor / factor).toFixed(factor === 1 ? 0 : 2);
  }
  if (unitLevel === "medium" && line.mediumToMinor) {
    const factor = parseFloat(line.mediumToMinor) || 1;
    return (availMinor / factor).toFixed(factor === 1 ? 0 : 2);
  }
  return String(availMinor);
}

export function prevReturnedDisplay(line: OriginalLine, unitLevel: string): string {
  const minor = line.previouslyReturnedMinor;
  if (minor <= 0) return "0";
  if (unitLevel === "major" && line.majorToMinor) {
    const factor = parseFloat(line.majorToMinor) || 1;
    return (minor / factor).toFixed(factor === 1 ? 0 : 2);
  }
  if (unitLevel === "medium" && line.mediumToMinor) {
    const factor = parseFloat(line.mediumToMinor) || 1;
    return (minor / factor).toFixed(factor === 1 ? 0 : 2);
  }
  return String(minor);
}

export function calcLineTotal(returnQtyMinor: number, salePricePerUnit: string, originalQtyMinor: string, originalLineTotal: string): number {
  const origQty = parseFloat(originalQtyMinor) || 1;
  const origTotal = parseFloat(originalLineTotal) || 0;
  const pricePerMinor = origTotal / origQty;
  return Math.round(returnQtyMinor * pricePerMinor * 100) / 100;
}
