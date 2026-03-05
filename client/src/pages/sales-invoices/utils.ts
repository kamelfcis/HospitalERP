/**
 * utils.ts — re-exports من المكتبة المشتركة
 *
 * لا تضف منطقاً هنا. استخدم lib/invoice-lines.ts مباشرة في الملفات الجديدة.
 * هذا الملف موجود فقط لدعم الـ imports القديمة دون كسر التوافق.
 */
export {
  genId,
  getUnitName,
  getUnitOptions,
  getEffectiveMediumToMinor,
  formatAvailability,
  calculateQtyInMinor,
  computeUnitPriceRaw,
  computeUnitPriceFromBase,
  computeLineTotal,
  convertMinorToDisplayQty,
} from "@/lib/invoice-lines";
