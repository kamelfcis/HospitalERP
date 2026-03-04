import type { LineLocal } from "../types";

/**
 * خطوط "مباشرة": تذهب كاملةً لكل مريض (لا تُقسَّم على العدد).
 *
 * تشمل:
 * - sourceType: STAY_ENGINE | OR_ROOM  ← مضافة من محرك الإقامة
 * - serviceType: ACCOMMODATION | OPERATING_ROOM  ← مضافة يدوياً
 */
export const DIRECT_SOURCE_TYPES = new Set(["STAY_ENGINE", "OR_ROOM"]);
export const DIRECT_SERVICE_TYPES = new Set(["ACCOMMODATION", "OPERATING_ROOM"]);

export function isDirectDistributionLine(l: LineLocal): boolean {
  return (
    DIRECT_SOURCE_TYPES.has(l.sourceType || "") ||
    DIRECT_SERVICE_TYPES.has(l.serviceType || "")
  );
}
