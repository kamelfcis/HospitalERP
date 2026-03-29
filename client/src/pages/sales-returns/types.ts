// ============================================================
//  مردودات المبيعات — الأنواع والدوال المساعدة
//  Sales Returns — Types & Utility Functions
// ============================================================

// ── نتيجة بحث فاتورة ──────────────────────────────────────
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

// ── سطر من الفاتورة الأصلية (كما يأتي من الـ API) ─────────
export interface OriginalLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  /** وحدة البيع الأصلية: major | medium | minor */
  unitLevel: string;
  /** الكمية بوحدة البيع الأصلية */
  qty: string;
  /** الكمية بالوحدة الصغرى (للحسابات الداخلية) */
  qtyInMinor: string;
  salePrice: string;
  lineTotal: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  lotId: string | null;
  majorUnitName: string | null;
  mediumUnitName: string | null;
  minorUnitName: string | null;
  /** عدد الوحدات الصغرى في الوحدة الكبرى */
  majorToMinor: string | null;
  /** عدد الوحدات المتوسطة في الوحدة الكبرى (للأصناف التي ليس لها وحدة صغرى) */
  majorToMedium: string | null;
  /** عدد الوحدات الصغرى في الوحدة الوسطى */
  mediumToMinor: string | null;
  /** كمية (الوحدة الصغرى) اللي اترجعت مسبقاً على هذا السطر */
  previouslyReturnedMinor: number;
}

// ── سطر الإرجاع (الأصلي + حقول الإدخال) ──────────────────
export interface ReturnLine extends OriginalLine {
  /** الكمية المدخلة بوحدة الإرجاع المختارة */
  returnQty: string;
  /** وحدة الإرجاع المختارة: major | medium | minor */
  returnUnitLevel: string;
  /** الكمية المحوّلة للوحدة الصغرى (للحسابات) */
  returnQtyMinor: number;
  /** إجمالي هذا السطر بالجنيه */
  returnLineTotal: number;
}

// ── بيانات الفاتورة كاملة (header + lines) ───────────────
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
  /** حالة الفاتورة — يجب أن تكون 'collected' */
  status: string;
  /** حالة القيد المحاسبي — يجب أن تكون 'completed' */
  journalStatus: string;
  lines: OriginalLine[];
}

// ============================================================
//  دوال مساعدة — Unit Helpers
// ============================================================

/**
 * اسم الوحدة المعروض للمستخدم حسب مستواها.
 * يرجع اسماً معقولاً حتى لو بعض الحقول فاضية.
 */
export function getUnitName(line: OriginalLine, level: string): string {
  if (level === "major") return line.majorUnitName || line.minorUnitName || "وحدة";
  if (level === "medium") return line.mediumUnitName || "وحدة وسطى";
  return line.minorUnitName || line.majorUnitName || "وحدة";
}

/**
 * قائمة الوحدات المتاحة للإرجاع، مرتبة بحيث تأتي
 * وحدة البيع الأصلية أولاً (هي الافتراضية).
 */
export function getReturnUnitOptions(line: OriginalLine): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];

  if (line.majorUnitName)
    options.push({ value: "major", label: line.majorUnitName });
  // الوحدة المتوسطة تظهر إذا كان mediumToMinor محدد (3 وحدات) أو majorToMedium محدد (كبرى+متوسطة)
  if (line.mediumUnitName && (
    parseFloat(line.mediumToMinor || "0") > 0 ||
    parseFloat(line.majorToMedium || "0") > 0
  ))
    options.push({ value: "medium", label: line.mediumUnitName });
  if (line.minorUnitName && line.minorUnitName !== line.majorUnitName)
    options.push({ value: "minor", label: line.minorUnitName });

  if (options.length === 0)
    options.push({ value: line.unitLevel, label: getUnitName(line, line.unitLevel) });

  // وحدة البيع الأصلية تكون أولاً
  const origIdx = options.findIndex((u) => u.value === line.unitLevel);
  if (origIdx > 0) {
    const [orig] = options.splice(origIdx, 1);
    options.unshift(orig);
  }

  return options;
}

// ============================================================
//  دوال مساعدة — Quantity Helpers
// ============================================================

/**
 * تحويل كمية من وحدة مُعطاة إلى وحدة التخزين الداخلية (qty_in_minor).
 *
 * يُطابق تماماً منطق convertQtyToMinor في server/inventory-helpers.ts:
 *  - minor  → qty كما هو
 *  - medium → أولاً: mediumToMinor (أصناف 3 وحدات)
 *             ثانياً: (majorToMinor||1) / majorToMedium (legacy: كبرى+متوسطة)
 *  - major  → qty × majorToMinor إذا محدد؛ وإلا qty (كبرى = وحدة التخزين)
 */
export function toMinorQty(qty: number, unitLevel: string, line: OriginalLine): number {
  if (unitLevel === "minor") return qty;

  if (unitLevel === "medium") {
    // أولاً: mediumToMinor مباشرة (أصناف 3 وحدات)
    const medRatio = parseFloat(line.mediumToMinor || "");
    if (medRatio > 0) return qty * medRatio;

    // ثانياً: legacy (كبرى+متوسطة، بدون صغرى) — effectiveMediumToMinor = (majorToMinor||1) / majorToMedium
    const maj2med = parseFloat(line.majorToMedium || "");
    if (maj2med > 0) {
      const maj2min = parseFloat(line.majorToMinor || "") || 1;
      return qty * (maj2min / maj2med);
    }
    // fallback: تعامل كـ 1:1
    return qty;
  }

  if (unitLevel === "major") {
    const ratio = parseFloat(line.majorToMinor || "");
    if (ratio > 0) return qty * ratio;
    return qty; // legacy: كبرى = وحدة التخزين
  }

  return qty;
}

/**
 * الكمية المتاحة للإرجاع بالوحدة الصغرى
 * = الكمية الأصلية − ما اترجع مسبقاً
 */
export function availableMinor(line: OriginalLine): number {
  return Math.max(0, (parseFloat(line.qtyInMinor) || 0) - parseFloat(String(line.previouslyReturnedMinor)) || 0);
}

/**
 * الكمية المتاحة للإرجاع بوحدة مُعيّنة (كاملة، بدون كسور).
 */
export function availableInUnit(line: OriginalLine, unitLevel: string): number {
  const minor = availableMinor(line);
  const perUnit = toMinorQty(1, unitLevel, line);
  return perUnit > 0 ? Math.floor(minor / perUnit) : 0;
}

/**
 * الكمية المرتجعة سابقاً معروضة بوحدة البيع الأصلية.
 */
export function prevReturnedInOrigUnit(line: OriginalLine): string {
  const minor = parseFloat(String(line.previouslyReturnedMinor)) || 0;
  if (minor <= 0) return "0";
  const perUnit = toMinorQty(1, line.unitLevel, line);
  if (perUnit <= 0) return String(minor);
  const inUnit = minor / perUnit;
  return Number.isInteger(inUnit) ? String(inUnit) : inUnit.toFixed(2);
}

// ============================================================
//  دوال مساعدة — Price Helpers
// ============================================================

/**
 * سعر الوحدة المختارة للإرجاع، محسوب من إجمالي السطر الأصلي.
 * مثال: سطر بيع 30 قرص بـ 90 ج → سعر القرص = 3 ج
 */
export function pricePerReturnUnit(line: OriginalLine, returnUnitLevel: string): number {
  const origQtyMinor = parseFloat(line.qtyInMinor) || 1;
  const origTotal = parseFloat(line.lineTotal) || 0;
  const pricePerMinor = origTotal / origQtyMinor;
  const minorPerUnit = toMinorQty(1, returnUnitLevel, line);
  return Math.round(pricePerMinor * minorPerUnit * 100) / 100;
}

/**
 * إجمالي سطر الإرجاع بناءً على الكمية (بالوحدة الصغرى) × سعر الوحدة الصغرى.
 */
export function calcReturnLineTotal(returnQtyMinor: number, line: OriginalLine): number {
  const origQtyMinor = parseFloat(line.qtyInMinor) || 1;
  const origTotal = parseFloat(line.lineTotal) || 0;
  const pricePerMinor = origTotal / origQtyMinor;
  return Math.round(returnQtyMinor * pricePerMinor * 100) / 100;
}
