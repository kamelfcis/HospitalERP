/**
 * invoice-lines.ts — مكتبة مشتركة للوحدات والتسعير
 *
 * تُستخدم في: فاتورة المبيعات، فاتورة المريض، وأي شاشة جرد مستقبلاً.
 * لا تحتوي على state أو React — دوال خالصة فقط.
 *
 * مبادئ ثابتة (لا تُغيَّر دون توثيق):
 *  - qty_in_minor يُخزَّن بالوحدة الكبرى إذا majorToMinor = null
 *    (أي: 1 علبة = 1 وحدة صغرى في هذه الحالة)
 *  - baseSalePrice دائماً سعر الوحدة الكبرى
 *  - computeLineTotal يستخدم السعر الخام (بدون تقريب مبكر) لمنع تراكم الأخطاء
 */

// ─────────────────────────────────────────────────────────────────────────────
// أسماء الوحدات
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemLike {
    majorUnitName?: string | null;
    mediumUnitName?: string | null;
    minorUnitName?: string | null;
    majorToMedium?: number | string | null;
    majorToMinor?: number | string | null;
    mediumToMinor?: number | string | null;
    // Additional fields used by transfer and receiving pages
    nameAr?: string | null;
    nameEn?: string | null;
    itemCode?: string | null;
    hasExpiry?: boolean | null;
    hasBatch?: boolean | null;
    availableQtyMinor?: string | number | null;
    salePriceCurrent?: string | number | null;
    purchasePriceLast?: string | number | null;
  }

export function getUnitName(item: ItemLike | null | undefined, unitLevel: string): string {
  if (unitLevel === "major")  return item?.majorUnitName  || "وحدة كبرى";
  if (unitLevel === "medium") return item?.mediumUnitName || "وحدة وسطى";
  return item?.minorUnitName || "وحدة صغرى";
}

export interface UnitOption {
  value: string;
  label: string;
  /** صريح: هل يملك الصنف معامل التحويل اللازم لحساب السعر لهذه الوحدة؟ */
  priceable: boolean;
}

/**
 * فحص صريح لقابلية التسعير بناءً على وجود معاملات التحويل.
 * لا يعتمد على مقارنة السعر — يقرأ المعاملات مباشرةً.
 */
export function isUnitPriceable(unitLevel: string, item: ItemLike | null | undefined): boolean {
  if (unitLevel === "major" || !unitLevel) return true;
  const m2med = parseFloat(String(item?.majorToMedium ?? "0")) || 0;
  const m2min = parseFloat(String(item?.majorToMinor  ?? "0")) || 0;
  const med2m = parseFloat(String(item?.mediumToMinor ?? "0")) || 0;
  if (unitLevel === "medium") return m2med > 0;
  if (unitLevel === "minor")  return m2min > 0 || (m2med > 0 && med2m > 0);
  return true;
}

export function getUnitOptions(item: ItemLike | null | undefined): UnitOption[] {
  const m2med = parseFloat(String(item?.majorToMedium ?? "0")) || 0;
  const m2min = parseFloat(String(item?.majorToMinor  ?? "0")) || 0;
  const med2m = parseFloat(String(item?.mediumToMinor ?? "0")) || 0;

  const opts: UnitOption[] = [];
  if (item?.majorUnitName)  opts.push({ value: "major",  label: item.majorUnitName,  priceable: true });
  if (item?.mediumUnitName) opts.push({ value: "medium", label: item.mediumUnitName, priceable: m2med > 0 });
  if (item?.minorUnitName)  opts.push({ value: "minor",  label: item.minorUnitName,  priceable: m2min > 0 || (m2med > 0 && med2m > 0) });
  if (opts.length === 0)    opts.push({ value: "major",  label: "وحدة",              priceable: true });
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// الوحدة الافتراضية الذكية
// ─────────────────────────────────────────────────────────────────────────────

/**
 * تحدد الوحدة الافتراضية بناءً على المخزون المتاح.
 * إذا المخزون أقل من علبة كاملة → تنتقل للوحدة التالية الأصغر.
 * تُستخدم عند إضافة صنف من البحث في جميع الشاشات.
 */
export function getSmartDefaultUnitLevel(item: ItemLike | null | undefined): string {
  if (!item) return "major";
  const availMinor = parseFloat(String(item.availableQtyMinor ?? "0")) || 0;
  const maj2min    = parseFloat(String(item.majorToMinor    ?? "0")) || 0;

  if (item.majorUnitName) {
    // مخزون كافٍ لعلبة كاملة واحدة على الأقل (أو لا يوجد معامل تحويل)
    if (maj2min <= 0 || availMinor >= maj2min) return "major";
    // أقل من علبة — جرّب الوحدة الوسطى
    // نشترط med2min > 1: لو 1 امبول = 1 سنتي (mediumToMinor=1) نتجاهل الوسطى وننزل للصغرى
    const med2min = getEffectiveMediumToMinor(item);
    if (item.mediumUnitName && med2min > 1 && availMinor >= med2min) return "medium";
    // أقل من وحدة وسطى — استخدم الصغرى إن وُجدت
    if (item.minorUnitName) return "minor";
    return "major"; // لا يوجد مخزون أصلاً — افتراضي
  }
  if (item.mediumUnitName) return "medium";
  return "minor";
}

// ─────────────────────────────────────────────────────────────────────────────
// معاملات التحويل
// ─────────────────────────────────────────────────────────────────────────────

/**
 * عدد الوحدات الصغرى في الوحدة الوسطى.
 *
 * القاعدة: qty_in_minor يُخزَّن بالوحدة الكبرى عندما majorToMinor=null.
 * لذا: 1 شريط = majorToMinor/majorToMedium = 1/3 وحدة صغرى (= 1/3 علبة).
 *
 * مثال عملي (علبة = 3 شرائط، majorToMinor=null):
 *   getEffectiveMediumToMinor → (1||1) / (3||1) = 1/3
 *   هذا صحيح لأن الـ qty مخزّن بالعلبة.
 */
export function getEffectiveMediumToMinor(item: ItemLike | null | undefined): number {
  const m2m = parseFloat(String(item?.mediumToMinor));
  if (m2m > 0) return m2m;
  const maj2min = parseFloat(String(item?.majorToMinor)) || 1;
  const maj2med = parseFloat(String(item?.majorToMedium)) || 1;
  return maj2min / maj2med;
}

// ─────────────────────────────────────────────────────────────────────────────
// تحويل الكميات
// ─────────────────────────────────────────────────────────────────────────────

/**
 * تحويل كمية البيع → وحدات صغرى (للمقارنة مع المخزون وإرسال لـ FEFO API).
 *
 * تحذير: لا تُضف fallback إلى majorToMedium داخل هذه الدالة — يكسر عرض
 * الكميات للأصناف المخزّنة بالعلبة.
 */
export function calculateQtyInMinor(qty: number, unitLevel: string, item: ItemLike | null | undefined): number {
  if (!item) return qty;
  if (unitLevel === "minor")  return qty;
  if (unitLevel === "medium") return qty * getEffectiveMediumToMinor(item);
  return qty * (parseFloat(String(item.majorToMinor)) || 1);
}

/**
 * تحويل كمية بالوحدات الصغرى → وحدة العرض المطلوبة.
 * يُستخدم لعرض نتائج توزيع FEFO بالوحدة التي اختارها المستخدم.
 */
export function convertMinorToDisplayQty(allocMinor: number, unitLevel: string, item: ItemLike | null | undefined): number {
  let displayQty = allocMinor;
  if (unitLevel === "major") {
    displayQty = allocMinor / (parseFloat(String(item?.majorToMinor)) || 1);
  } else if (unitLevel === "medium") {
    displayQty = allocMinor / getEffectiveMediumToMinor(item);
  }
  const rounded = Math.round(displayQty * 10000) / 10000;
  const nearest = Math.round(rounded);
  if (Math.abs(rounded - nearest) < 0.005) return nearest;
  return rounded;
}

// ─────────────────────────────────────────────────────────────────────────────
// التسعير
// ─────────────────────────────────────────────────────────────────────────────

/**
 * السعر الخام بدون تقريب — للحساب الداخلي فقط.
 *
 * baseSalePrice دائماً = سعر الوحدة الكبرى.
 * نقسم للوصول لسعر الوحدات الأصغر.
 */
export function computeUnitPriceRaw(baseSalePrice: number, unitLevel: string, item: ItemLike | null | undefined): number {
  if (!item || !baseSalePrice) return baseSalePrice || 0;
  if (unitLevel === "major" || !unitLevel) return baseSalePrice;

  const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
  const majorToMinor  = parseFloat(String(item.majorToMinor))  || 0;
  const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;

  if (unitLevel === "medium") {
    if (majorToMedium > 0) return baseSalePrice / majorToMedium;
    if (majorToMinor > 0 && mediumToMinor > 0) return baseSalePrice / (majorToMinor / mediumToMinor);
    return baseSalePrice;
  }
  if (unitLevel === "minor") {
    if (majorToMinor > 0) return baseSalePrice / majorToMinor;
    if (majorToMedium > 0 && mediumToMinor > 0) return baseSalePrice / (majorToMedium * mediumToMinor);
    if (majorToMedium > 0) return baseSalePrice / majorToMedium;
    return baseSalePrice;
  }
  return baseSalePrice;
}

/** السعر المقرَّب للعرض (سعر الوحدة المختارة) */
export function computeUnitPriceFromBase(baseSalePrice: number, unitLevel: string, item: ItemLike | null | undefined): number {
  return +computeUnitPriceRaw(baseSalePrice, unitLevel, item).toFixed(2);
}

/**
 * عكس computeUnitPriceFromBase:
 * يحوّل سعر وحدة العرض → baseSalePrice (سعر الوحدة الكبرى).
 *
 * يُستخدم عندما يُدخل المستخدم يدوياً سعر وحدة وسطى أو صغرى،
 * ونريد حفظ baseSalePrice بالوحدة الكبرى.
 */
export function computeBaseFromUnitPrice(unitPrice: number, unitLevel: string, item: ItemLike | null | undefined): number {
  if (!item || !unitPrice) return unitPrice || 0;
  if (unitLevel === "major" || !unitLevel) return unitPrice;

  const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
  const majorToMinor  = parseFloat(String(item.majorToMinor))  || 0;
  const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;

  if (unitLevel === "medium") {
    if (majorToMedium > 0) return +(unitPrice * majorToMedium).toFixed(4);
    if (majorToMinor > 0 && mediumToMinor > 0) return +(unitPrice * (majorToMinor / mediumToMinor)).toFixed(4);
    return unitPrice;
  }
  if (unitLevel === "minor") {
    if (majorToMinor > 0) return +(unitPrice * majorToMinor).toFixed(4);
    if (majorToMedium > 0 && mediumToMinor > 0) return +(unitPrice * majorToMedium * mediumToMinor).toFixed(4);
    if (majorToMedium > 0) return +(unitPrice * majorToMedium).toFixed(4);
    return unitPrice;
  }
  return unitPrice;
}

/**
 * إجمالي السطر يُحسب من السعر الخام لتجنب تراكم أخطاء التقريب.
 *
 * مثال: 3 شرائط × (500÷3) = 500.00 (صحيح)
 *        وليس  3 × 166.67  = 500.01 (خطأ تقريب)
 */
export function computeLineTotal(qty: number, baseSalePrice: number, unitLevel: string, item: ItemLike | null | undefined): number {
  const rawPrice = computeUnitPriceRaw(baseSalePrice, unitLevel, item);
  return +(qty * rawPrice).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// عرض الرصيد المتاح
// ─────────────────────────────────────────────────────────────────────────────

export function formatAvailability(availQtyMinor: string, unitLevel: string, item: ItemLike | null | undefined): string {
  const minorQty = parseFloat(availQtyMinor);
  if (isNaN(minorQty)) return "0";

  if (item && unitLevel === "major") {
    const factor = parseFloat(String(item.majorToMinor));
    if (factor > 0 && factor !== 1) {
      const wholeMajor     = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - wholeMajor * factor);
      if (remainderMinor > 0)
        return `${wholeMajor} ${item.majorUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      return `${wholeMajor} ${item.majorUnitName || ""}`;
    }
    return `${minorQty} ${item.majorUnitName || "وحدة"}`;
  }

  if (item && unitLevel === "medium") {
    const factor = getEffectiveMediumToMinor(item);
    if (factor > 0 && factor !== 1) {
      const wholeMed       = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - wholeMed * factor);
      if (remainderMinor > 0)
        return `${wholeMed} ${item.mediumUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      return `${wholeMed} ${item.mediumUnitName || ""}`;
    }
    return `${minorQty} ${item.mediumUnitName || "وحدة"}`;
  }

  return `${minorQty} ${item?.minorUnitName || item?.majorUnitName || "وحدة"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// أدوات مساعدة
// ─────────────────────────────────────────────────────────────────────────────

export function genId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
}
