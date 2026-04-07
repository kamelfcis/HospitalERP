/**
 * نظام ألوان موحّد لصفوف جداول الفواتير
 *
 * الألوان الموجودة والمحجوزة:
 *   🟡 yellow   → صلاحية ناقصة (needsExpiry)
 *   🟣 indigo   → تكملة دفعة / lot continuation (حد يميني فقط)
 *   🔵 sky      → سطر تلقائي (autoLine) — فاتورة مريض
 *   🔵 blue/etc → صفوف الخدمات (getServiceRowClass) — فاتورة مريض
 *   🟠 orange   → الوحدة المتوسطة/الصغرى (خلية الوحدة فقط) + badge المستهلك
 *
 * اللون المخصَّص لحالة "صرف بدون رصيد" (oversell):
 *   🌹 rose     → بخلفية rose-50 وحد يميني rose-400
 *               — لا يتعارض مع أي لون سابق
 */

export interface InvoiceRowFlags {
  needsExpiry?: boolean;
  isLotContinuation?: boolean;
  isOversellNoStock?: boolean;
  isAutoLine?: boolean;
}

/**
 * تُرجع className مُجمَّعة لصف <tr> في جداول الفواتير.
 * مبنية على أولوية ثابتة — الحالات غير حصرية، تُضاف جنباً إلى جنب.
 */
export function getInvoiceRowClass(flags: InvoiceRowFlags): string {
  const parts: string[] = [];

  if (flags.needsExpiry) {
    parts.push("bg-yellow-50 dark:bg-yellow-900/20");
  }

  if (flags.isLotContinuation) {
    parts.push("border-r-2 border-r-indigo-300 dark:border-r-indigo-600");
  }

  if (flags.isAutoLine) {
    parts.push("bg-sky-50/50 dark:bg-sky-950/20");
  }

  if (flags.isOversellNoStock) {
    parts.push("bg-rose-50 dark:bg-rose-950/20 border-r-2 border-r-rose-400 dark:border-r-rose-600");
  }

  return parts.join(" ");
}

/**
 * فحص ما إذا كان السطر "صرف بدون رصيد":
 *   - الصنف مفعَّل عنده allow_oversell
 *   - الرصيد المتاح عند الاختيار = صفر أو أقل
 *   - ليس خدمة أو مستهلكاً (لا ينطبق عليهم تتبع الرصيد)
 */
export function isOversellRow(
  lineType: string,
  allowOversell?: boolean | null,
  availableQtyMinor?: string | number | null,
): boolean {
  if (lineType === "service" || lineType === "consumable") return false;
  if (!allowOversell) return false;
  return parseFloat(String(availableQtyMinor ?? "1")) <= 0;
}
