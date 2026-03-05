export interface PrepItem {
  item_id: string;
  item_code: string;
  name_ar: string;
  has_expiry: boolean;
  minor_unit_name: string | null;
  major_unit_name: string | null;
  medium_unit_name: string | null;
  major_to_minor: string | null;
  medium_to_minor: string | null;
  total_sold: string;
  source_stock: string;
  dest_stock: string;
  nearest_expiry: string | null;
}

export interface PrepLine extends PrepItem {
  _excluded: boolean;
  _transferQty: string;
}

export type BulkField = "dest_stock" | "source_stock" | "total_sold";
export type BulkOp = "gt" | "lt" | "eq";

export function getMajorToMinor(line: PrepItem): number {
  const m2m = parseFloat(line.major_to_minor || "0");
  return m2m > 1 ? m2m : 1;
}

export function toMajor(qtyMinor: number, majorToMinor: number): number {
  if (majorToMinor <= 1) return qtyMinor;
  const result = qtyMinor / majorToMinor;
  return Math.round(result * 10000) / 10000;
}

export function toMinor(qtyMajor: number, majorToMinor: number): number {
  if (majorToMinor <= 1) return qtyMajor;
  return Math.round(qtyMajor * majorToMinor * 10000) / 10000;
}

export function getUnitName(line: PrepItem): string {
  const m2m = parseFloat(line.major_to_minor || "0");
  if (m2m > 1 && line.major_unit_name) return line.major_unit_name;
  return line.minor_unit_name || "وحدة";
}

export function formatQtyInUnit(
  qtyMinor: number,
  majorToMinor: number | null,
  majorName: string | null,
  minorName: string | null,
): string {
  if (majorToMinor && majorToMinor > 1 && majorName) {
    const major = Math.floor(qtyMinor / majorToMinor);
    const remainder = qtyMinor % majorToMinor;
    if (major > 0 && remainder > 0) {
      return `${major} ${majorName} + ${remainder} ${minorName || "وحدة"}`;
    }
    if (major > 0) return `${major} ${majorName}`;
  }
  return `${qtyMinor} ${minorName || "وحدة"}`;
}
