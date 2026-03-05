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
