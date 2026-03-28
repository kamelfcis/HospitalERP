/**
 * inventory-helpers.ts — مصدر الحقيقة الوحيد لتحويل الوحدات
 *
 * قواعد ثابتة (لا تُعدَّل دون توثيق كامل):
 *  - الوحدة الكبرى إلزامية دائماً لكل صنف غير خدمة
 *  - المسموح: كبرى فقط | كبرى+متوسطة | كبرى+صغرى | كبرى+متوسطة+صغرى
 *  - اتفاقية التخزين:
 *      · كبرى فقط أو كبرى+متوسطة → qty_in_minor = الكمية بالكبرى (legacy convention)
 *      · كبرى+صغرى أو الثلاثة    → qty_in_minor = الكمية بالصغرى
 *  - لا fallback صامت إلى 1 عند غياب ratio مطلوب — throw دائماً
 *  - QTY_MINOR_TOLERANCE هو الـ tolerance الوحيد المعتمد في كل مسارات الـ re-verification
 */

// ─── Tolerance موحد لكل re-verification ────────────────────────────────────
export const QTY_MINOR_TOLERANCE = 0.0005;

// ─── Item master validation ─────────────────────────────────────────────────

export interface ItemUnitsInput {
  majorUnitName?: string | null;
  mediumUnitName?: string | null;
  minorUnitName?: string | null;
  majorToMedium?: string | number | null;
  majorToMinor?: string | number | null;
  mediumToMinor?: string | number | null;
}

/**
 * يتحقق من صحة تعريف وحدات الصنف وفق التصميم المعتمد.
 * يُرجع مصفوفة فارغة إذا كل شيء صحيح، ومصفوفة برسائل الخطأ إذا وُجدت مشاكل.
 * يُستدعى من: items-crud POST، items-crud PUT، Excel import.
 * لا تُكرَّر هذه المنطق في أي مكان آخر.
 */
export function validateItemUnits(item: ItemUnitsInput): string[] {
  const errors: string[] = [];

  const hasMajor  = !!item.majorUnitName?.trim();
  const hasMedium = !!item.mediumUnitName?.trim();
  const hasMinor  = !!item.minorUnitName?.trim();

  // الوحدة الكبرى إلزامية
  if (!hasMajor) {
    errors.push("الوحدة الكبرى إلزامية لكل صنف");
  }

  // ممنوع: متوسطة أو صغرى بدون كبرى
  if (hasMedium && !hasMajor) {
    errors.push("لا يمكن تحديد وحدة متوسطة بدون وحدة كبرى");
  }
  if (hasMinor && !hasMajor) {
    errors.push("لا يمكن تحديد وحدة صغرى بدون وحدة كبرى");
  }

  // معاملات التحويل المطلوبة
  if (hasMedium) {
    const v = parseFloat(String(item.majorToMedium ?? "0"));
    if (!(v > 0)) {
      errors.push(`الوحدة المتوسطة "${item.mediumUnitName}" محددة — يجب إدخال معامل التحويل (كبرى → متوسطة) بقيمة أكبر من صفر`);
    }
  }

  if (hasMinor && !hasMedium) {
    // كبرى + صغرى فقط — majorToMinor إلزامي
    const v = parseFloat(String(item.majorToMinor ?? "0"));
    if (!(v > 0)) {
      errors.push(`الوحدة الصغرى "${item.minorUnitName}" محددة — يجب إدخال معامل التحويل (كبرى → صغرى) بقيمة أكبر من صفر`);
    }
  }

  if (hasMinor && hasMedium) {
    // الثلاثة وحدات — mediumToMinor إلزامي، majorToMinor يُحسب تلقائياً
    const v = parseFloat(String(item.mediumToMinor ?? "0"));
    if (!(v > 0)) {
      errors.push(`مع الثلاث وحدات — يجب إدخال معامل التحويل (متوسطة → صغرى) بقيمة أكبر من صفر`);
    }
  }

  return errors;
}

/**
 * يحسب majorToMinor تلقائياً في حالة الثلاث وحدات.
 * يُستدعى قبل الحفظ في POST و PUT.
 * إذا الصنف عنده كبرى+متوسطة+صغرى: majorToMinor = majorToMedium × mediumToMinor
 */
export function computeMajorToMinor(item: ItemUnitsInput): string | null {
  const hasMedium = !!item.mediumUnitName?.trim();
  const hasMinor  = !!item.minorUnitName?.trim();

  if (hasMinor && hasMedium) {
    const m2med  = parseFloat(String(item.majorToMedium ?? "0"));
    const med2min = parseFloat(String(item.mediumToMinor ?? "0"));
    if (m2med > 0 && med2min > 0) {
      return (m2med * med2min).toFixed(4);
    }
    return null;
  }

  if (hasMinor && !hasMedium) {
    // كبرى+صغرى: يدخله المستخدم مباشرةً
    const v = parseFloat(String(item.majorToMinor ?? "0"));
    return v > 0 ? String(item.majorToMinor) : null;
  }

  // لا صغرى → لا majorToMinor
  return null;
}

// ─── تحويل الكميات (مصدر الحقيقة لجميع modules) ──────────────────────────

/**
 * يحوّل كمية مُدخَلة إلى وحدة التخزين الداخلية (qty_in_minor).
 *
 * اتفاقية التخزين:
 *  - كبرى فقط أو كبرى+متوسطة: qty_in_minor = qty بالكبرى
 *  - كبرى+صغرى أو الثلاثة: qty_in_minor = qty بالصغرى
 *
 * السلوك:
 *  - unitLevel='minor'  → qty كما هو (الكمية بالصغرى)
 *  - unitLevel='medium' → qty × mediumToMinor (throw إذا ratio غير محدد)
 *  - unitLevel='major'  → qty × majorToMinor إذا محدد؛ وإلا qty (legacy: كبرى = وحدة التخزين)
 */
export function convertQtyToMinor(
  qty: number,
  unitLevel: string,
  item: { nameAr?: string | null; majorToMinor?: string | null; mediumToMinor?: string | null }
): number {
  if (unitLevel === 'minor') return qty;

  if (unitLevel === 'medium') {
    const ratio = parseFloat(String(item.mediumToMinor ?? ""));
    if (!(ratio > 0)) {
      throw new Error(`الصنف "${item.nameAr || ''}" — معامل التحويل (متوسطة → صغرى) غير محدد أو صفر. لا يمكن إجراء العملية.`);
    }
    return qty * ratio;
  }

  if (unitLevel === 'major') {
    const ratio = parseFloat(String(item.majorToMinor ?? ""));
    if (ratio > 0) return qty * ratio;
    // Legacy: كبرى فقط أو كبرى+متوسطة — الكبرى هي وحدة التخزين
    return qty;
  }

  return qty;
}

/**
 * يحوّل سعر الوحدة المُدخَلة إلى سعر وحدة التخزين (per minor/stored unit).
 *
 * - unitLevel='minor'  → السعر كما هو
 * - unitLevel='medium' → سعر÷mediumToMinor (throw إذا ratio غير محدد)
 * - unitLevel='major'  → سعر÷majorToMinor إذا محدد؛ وإلا السعر كما هو
 */
export function convertPriceToMinor(
  price: number,
  unitLevel: string,
  item: { nameAr?: string | null; majorToMinor?: string | null; mediumToMinor?: string | null }
): number {
  if (unitLevel === 'minor') return price;

  if (unitLevel === 'medium') {
    const ratio = parseFloat(String(item.mediumToMinor ?? ""));
    if (!(ratio > 0)) {
      throw new Error(`الصنف "${item.nameAr || ''}" — معامل التحويل (متوسطة → صغرى) غير محدد أو صفر. لا يمكن إجراء العملية.`);
    }
    return price / ratio;
  }

  if (unitLevel === 'major') {
    const ratio = parseFloat(String(item.majorToMinor ?? ""));
    if (ratio > 0) return price / ratio;
    return price;
  }

  return price;
}

/**
 * يتحقق من توفر معامل التحويل قبل العملية.
 * يُستدعى في مسارات clinic-orders وpatient-invoices قبل convertQtyToMinor.
 *
 * يُعدُّ 'major' صالحاً دائماً حتى لو majorToMinor = null
 * (الكبرى = وحدة التخزين في حالة غياب الصغرى — legacy convention).
 * يُعدُّ 'medium' خاطئاً إذا mediumToMinor = null أو 0.
 */
export function validateUnitConversion(
  unitLevel: string,
  item: { nameAr: string; majorToMinor?: string | null; mediumToMinor?: string | null }
): void {
  if (unitLevel === 'minor') return;
  if (unitLevel === 'major')  return; // convertQtyToMinor يتعامل معها بالـ legacy convention

  if (unitLevel === 'medium') {
    const ratio = parseFloat(String(item.mediumToMinor ?? ""));
    if (!(ratio > 0)) {
      throw new Error(`الصنف "${item.nameAr}" — معامل التحويل (متوسطة → صغرى) غير محدد. لا يمكن إجراء العملية.`);
    }
  }
}

// ─── Lot / Expiry helpers ───────────────────────────────────────────────────

export function isLotExpired(expiryMonth: number | null, expiryYear: number | null, asOfDate?: Date): boolean {
  if (!expiryMonth || !expiryYear) return false;
  const checkDate = asOfDate || new Date();
  const checkMonth = checkDate.getMonth() + 1;
  const checkYear = checkDate.getFullYear();
  return expiryYear < checkYear || (expiryYear === checkYear && expiryMonth < checkMonth);
}

export function validateBatchExpiry(
  item: { hasExpiry: boolean; nameAr: string },
  expiryMonth: number | null | undefined,
  expiryYear: number | null | undefined,
  _batchNumber?: string | null
): void {
  if (item.hasExpiry) {
    if (!expiryMonth || !expiryYear) {
      throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
    }
  } else {
    if (expiryMonth || expiryYear) {
      throw new Error(`الصنف "${item.nameAr}" لا يدعم تواريخ صلاحية`);
    }
  }
}
