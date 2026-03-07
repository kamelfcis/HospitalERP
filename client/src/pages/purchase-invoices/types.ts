/**
 * types.ts — الأنواع والمساعدات المشتركة لفاتورة الشراء
 *
 * محتوى هذا الملف:
 *  - InvoiceLineLocal    : سطر الفاتورة في الواجهة
 *  - recalcLine          : إعادة حساب مجاميع السطر بعد أي تغيير
 *  - validation helpers  : التحقق من صحة السطور
 *  - getUnitName         : اسم الوحدة
 *  - buildLinePayload    : بناء payload للـ API
 */

// ── نوع سطر الفاتورة (داخل الواجهة فقط) ─────────────────────────────────
export interface InvoiceLineLocal {
  id: string;
  receivingLineId: string | null;
  itemId: string;
  item: any;
  unitLevel: string;
  qty: number;
  bonusQty: number;
  sellingPrice: number;
  purchasePrice: number;
  lineDiscountPct: number;
  lineDiscountValue: number;
  vatRate: number;
  valueBeforeVat: number;
  vatAmount: number;
  valueAfterVat: number;
  batchNumber: string;
  expiryMonth: number | null;
  expiryYear: number | null;
}

// ── إعادة حساب مجاميع السطر ─────────────────────────────────────────────
// سياسة خصم الأسطر:
//   purchasePrice  = سعر الشراء النهائي — المصدر المحاسبي الوحيد للتقييم والقيود
//   lineDiscountPct/lineDiscountValue = حقل تسعير + تحليل (دور مزدوج):
//     (أ) تسعير ثنائي الاتجاه: تغيير discountPct يُعيد حساب purchasePrice والعكس
//     (ب) تحليل: مقارنة الموردين، تاريخ الشراء، معدل الخصم للصنف — يُعرض ويُبحث ويُقرَّر
//   يُخزَّن دائماً لكن لا يُطرح من valueBeforeVat ولا يُنشأ له سطر قيد مستقل
export function recalcLine(line: InvoiceLineLocal): InvoiceLineLocal {
  const { qty, bonusQty, purchasePrice, sellingPrice, lineDiscountPct, vatRate } = line;
  const valueBeforeVat    = +(qty * purchasePrice).toFixed(2);          // القيمة المحاسبية
  const vatBase           = +((qty + bonusQty) * purchasePrice).toFixed(2);
  const vatAmount         = +(vatBase * (vatRate / 100)).toFixed(2);
  const valueAfterVat     = +(valueBeforeVat + vatAmount).toFixed(2);
  const lineDiscountValue = +(sellingPrice * (lineDiscountPct / 100)).toFixed(2); // فرق تسعير/وحدة
  return { ...line, valueBeforeVat, vatAmount, valueAfterVat, lineDiscountValue };
}

// ── التحقق من صحة السطر ──────────────────────────────────────────────────
export interface LineValidationError { field: string; message: string }

export function getLineDiscountErrors(ln: InvoiceLineLocal): LineValidationError[] {
  const errors: LineValidationError[] = [];
  if (ln.purchasePrice < 0)
    errors.push({ field: "purchasePrice", message: "سعر الشراء لا يمكن أن يكون سالب" });
  if (ln.lineDiscountPct >= 100)
    errors.push({ field: "discountPct", message: "نسبة الخصم لا يمكن أن تكون 100% أو أكثر" });
  if (ln.sellingPrice > 0 && ln.lineDiscountValue > ln.sellingPrice)
    errors.push({ field: "discountValue", message: "قيمة الخصم أكبر من سعر البيع" });
  return errors;
}

export function itemRequiresExpiry(item: any): boolean {
  return Boolean(
    item?.expiryIndicator === 1 || item?.expiryIndicator === true ||
    item?.hasExpiry === true    || item?.expiryRequired === true  ||
    item?.trackExpiry === true
  );
}

export function getLineCoreErrors(ln: InvoiceLineLocal): LineValidationError[] {
  const errors: LineValidationError[] = [];
  if (!ln.sellingPrice || ln.sellingPrice <= 0)
    errors.push({ field: "sellingPrice", message: "سعر البيع إلزامي ولازم يكون أكبر من صفر" });
  if (itemRequiresExpiry(ln.item) && (!ln.expiryMonth || !ln.expiryYear))
    errors.push({ field: "expiry", message: "تاريخ الصلاحية إلزامي لهذا الصنف" });
  return errors;
}

// إرجاع نص خطأ مُهيّأ للعرض (للـ mutations)
export function formatLineErrors(lines: InvoiceLineLocal[]): string {
  const bad: { index: number; messages: string[] }[] = [];
  lines.forEach((ln, i) => {
    const errs = [...getLineCoreErrors(ln), ...getLineDiscountErrors(ln)];
    if (errs.length) bad.push({ index: i + 1, messages: errs.map((e) => e.message) });
  });
  if (!bad.length) return "";
  return bad
    .slice(0, 8)
    .map((x) => `سطر ${x.index}: ${Array.from(new Set(x.messages)).join(" | ")}`)
    .join("\n");
}

// ── اسم الوحدة ────────────────────────────────────────────────────────────
export function getUnitName(item: any, unitLevel: string): string {
  if (unitLevel === "major")  return item?.majorUnitName  || "وحدة كبرى";
  if (unitLevel === "medium") return item?.mediumUnitName || "وحدة وسطى";
  return item?.minorUnitName || "وحدة صغرى";
}

// ── بناء payload للـ API ──────────────────────────────────────────────────
export function buildLinePayload(ln: InvoiceLineLocal) {
  return {
    id:               ln.id,
    receivingLineId:  ln.receivingLineId,
    itemId:           ln.itemId,
    unitLevel:        ln.unitLevel,
    qty:              ln.qty,
    bonusQty:         ln.bonusQty,
    sellingPrice:     ln.sellingPrice,
    purchasePrice:    ln.purchasePrice,
    lineDiscountPct:  ln.lineDiscountPct,
    lineDiscountValue:ln.lineDiscountValue,
    vatRate:          ln.vatRate,
    valueBeforeVat:   ln.valueBeforeVat,
    vatAmount:        ln.vatAmount,
    valueAfterVat:    ln.valueAfterVat,
    batchNumber:      ln.batchNumber,
    expiryMonth:      ln.expiryMonth,
    expiryYear:       ln.expiryYear,
  };
}
