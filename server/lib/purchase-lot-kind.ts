/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchase Lot Kind — Single Source of Truth
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  THIS IS THE ONLY PLACE in the codebase where "paid vs free lot" is defined.
 *  All layers (query, API route, backend validation) must import from here.
 *  Do NOT duplicate this logic elsewhere.
 *
 *  Classification rules:
 *    purchase_price > 0   → 'paid'    (normally purchased lot)
 *    purchase_price = 0   → 'free'    (bonus/gift lot)
 *    purchase_price IS NULL | NaN | negative → 'invalid' (legacy/corrupt — never allowed)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export type PurchaseLotKind = 'paid' | 'free' | 'invalid';

/**
 * Resolve the kind of an inventory lot from its purchase_price.
 * Accepts string (from DB), number, null, or undefined.
 */
export function resolvePurchaseLotKind(
  purchasePrice: string | number | null | undefined,
): PurchaseLotKind {
  if (purchasePrice === null || purchasePrice === undefined) return 'invalid';
  const price = typeof purchasePrice === 'number'
    ? purchasePrice
    : parseFloat(String(purchasePrice));
  if (isNaN(price) || price < 0) return 'invalid';
  return price === 0 ? 'free' : 'paid';
}

/**
 * Returns true when a lot of this kind is acceptable for the given invoice line.
 * 'invalid' lots are NEVER acceptable regardless of the line type.
 *
 * @param lotKind   - resolved from the lot's purchase_price
 * @param isFreeItem - true when the invoice line has purchase_price = 0
 */
export function lotKindMatchesLine(
  lotKind: PurchaseLotKind,
  isFreeItem: boolean,
): boolean {
  if (lotKind === 'invalid') return false;
  return isFreeItem ? lotKind === 'free' : lotKind === 'paid';
}

/**
 * Arabic error message for a kind mismatch.
 * Returns null when there is no mismatch.
 */
export function lotKindMismatchMessage(
  itemNameAr: string,
  lotKind: PurchaseLotKind,
  isFreeItem: boolean,
): string | null {
  if (lotKind === 'invalid') {
    return `الصنف "${itemNameAr}": اللوت المختار غير صالح (سعر شراء غير محدد أو خاطئ).`;
  }
  if (isFreeItem && lotKind === 'paid') {
    return `الصنف "${itemNameAr}": سطر الفاتورة مجاني (هدية) ولكن اللوت المختار مدفوع — يجب اختيار لوت مجاني.`;
  }
  if (!isFreeItem && lotKind === 'free') {
    return `الصنف "${itemNameAr}": سطر الفاتورة مدفوع ولكن اللوت المختار مجاني (بونص) — يجب اختيار لوت مدفوع.`;
  }
  return null;
}

/**
 * Strict parsing of the isFreeItem query parameter.
 * Only the string literals "true" and "false" are accepted.
 * Anything else (missing, "1", "yes", etc.) returns null → caller should 400.
 */
export function parseIsFreeItemParam(param: string | undefined): boolean | null {
  if (param === 'true')  return true;
  if (param === 'false') return false;
  return null;
}
