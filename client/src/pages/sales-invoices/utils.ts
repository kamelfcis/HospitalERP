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

/**
 * عدد الوحدات الصغرى في الوحدة الوسطى.
 *
 * القاعدة:
 *  1. إذا mediumToMinor محدد → استخدمه مباشرةً.
 *  2. إذا majorToMinor AND majorToMedium محددان → اشتق: majorToMinor / majorToMedium.
 *  3. وإلا → الوحدة الوسطى هي الأصغر فعلياً → 1.
 *
 * خطأ شائع: استخدام (majorToMinor||1) / (majorToMedium||1) يُعطي 1/3=0.333 حين majorToMinor=null
 * وهذا معكوس تماماً — لذا لا نفترض قيمة افتراضية لـ majorToMinor.
 */
export function getEffectiveMediumToMinor(item: any): number {
  const m2m = parseFloat(item?.mediumToMinor);
  if (m2m > 0) return m2m;
  const maj2min = parseFloat(item?.majorToMinor);
  const maj2med = parseFloat(item?.majorToMedium);
  if (maj2min > 0 && maj2med > 0) return maj2min / maj2med;
  return 1;
}

/**
 * معامل الوحدة الكبرى إلى الصغرى.
 * إذا majorToMinor غير محدد، ننظر في majorToMedium (الوسطى هي الصغرى).
 */
function getMajorToMinorFactor(item: any): number {
  const maj2min = parseFloat(item?.majorToMinor);
  if (maj2min > 0) return maj2min;
  const maj2med = parseFloat(item?.majorToMedium);
  if (maj2med > 0) return maj2med;
  return 1;
}

export function formatAvailability(availQtyMinor: string, unitLevel: string, item: any): string {
  const minorQty = parseFloat(availQtyMinor);
  if (isNaN(minorQty)) return "0";

  if (item && unitLevel === "major") {
    const factor = getMajorToMinorFactor(item);
    if (factor > 1) {
      const wholeMajor = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - wholeMajor * factor);
      if (remainderMinor > 0) {
        const remUnitName = item.minorUnitName || item.mediumUnitName || "";
        return `${wholeMajor} ${item.majorUnitName || ""} + ${remainderMinor} ${remUnitName}`;
      }
      return `${wholeMajor} ${item.majorUnitName || ""}`;
    }
    return `${minorQty} ${item.majorUnitName || "وحدة"}`;
  }

  if (item && unitLevel === "medium") {
    const factor = getEffectiveMediumToMinor(item);
    if (factor > 1) {
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

/**
 * تحويل كمية البيع إلى وحدات صغرى — للحجز من المخزون.
 */
export function calculateQtyInMinor(qty: number, unitLevel: string, item: any): number {
  if (!item) return qty;
  if (unitLevel === "minor") return qty;
  if (unitLevel === "medium") return qty * getEffectiveMediumToMinor(item);
  return qty * getMajorToMinorFactor(item);
}

/**
 * السعر الخام بدون تقريب — للحساب الداخلي فقط.
 *
 * القاعدة: baseSalePrice دائماً سعر الوحدة الكبرى (علبة).
 * نقسم للوصول لسعر الوحدات الأصغر.
 */
export function computeUnitPriceRaw(baseSalePrice: number, unitLevel: string, item: any): number {
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

export function computeUnitPriceFromBase(baseSalePrice: number, unitLevel: string, item: any): number {
  return +computeUnitPriceRaw(baseSalePrice, unitLevel, item).toFixed(2);
}

/**
 * إجمالي السطر يُحسب من السعر الخام لتجنب تراكم أخطاء التقريب.
 * مثال: 3 شرائط × (500÷3) = 3 × 166.666... = 500.00 (صحيح)
 *        وليس 3 × 166.67 = 500.01 (خطأ تقريب)
 */
export function computeLineTotal(qty: number, baseSalePrice: number, unitLevel: string, item: any): number {
  const rawPrice = computeUnitPriceRaw(baseSalePrice, unitLevel, item);
  return +(qty * rawPrice).toFixed(2);
}

/**
 * تحويل عدد الوحدات الصغرى المخصصة من FEFO إلى كمية العرض.
 */
export function convertMinorToDisplayQty(allocMinor: number, unitLevel: string, item: any): number {
  let displayQty = allocMinor;
  if (unitLevel === "major") {
    displayQty = allocMinor / getMajorToMinorFactor(item);
  } else if (unitLevel === "medium") {
    displayQty = allocMinor / getEffectiveMediumToMinor(item);
  }
  const rounded = Math.round(displayQty * 10000) / 10000;
  const nearest = Math.round(rounded);
  if (Math.abs(rounded - nearest) < 0.005) return nearest;
  return rounded;
}
