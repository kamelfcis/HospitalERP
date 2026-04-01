/**
 * cashier-collection-amount.ts
 * ════════════════════════════════════════════════════════════════════════
 *  الحساب المركزي لمبلغ التحصيل من المريض في الكاشير.
 *
 *  القاعدة:
 *    • فاتورة تعاقد بنصيب مريض > 0  →  نصيب المريض فقط (patientShareTotal)
 *    • أي فاتورة أخرى (نقدية، تعاقد 100% شركة)  →  الصافي الكامل (netTotal)
 *
 *  ملاحظة: فواتير التعاقد 100% شركة (patientShareTotal = 0) لا تظهر في
 *  قائمة الكاشير أصلاً (مفلترة بالـ WHERE في cashier-storage)، لذا لن
 *  تصل هذه الدالة لتلك الحالة أبداً. الشرط هنا للسلامة فقط.
 * ════════════════════════════════════════════════════════════════════════
 */

export interface CollectibleInvoice {
  netTotal:           string | number | null;
  customerType?:      string | null;
  patientShareTotal?: string | number | null;
}

/**
 * يعيد المبلغ الذي يجب تحصيله من المريض (بالـ float).
 */
export function getCollectibleAmount(invoice: CollectibleInvoice): number {
  const isContract   = invoice.customerType === "contract";
  const patientShare = parseFloat(String(invoice.patientShareTotal ?? "0"));
  if (isContract && patientShare > 0) return patientShare;
  return parseFloat(String(invoice.netTotal ?? "0"));
}

/**
 * نسخة تعيد السلسلة مقرّبة إلى خانتين عشريتين (لحقول DB و إيصالات).
 */
export function getCollectibleAmountStr(invoice: CollectibleInvoice): string {
  return getCollectibleAmount(invoice).toFixed(2);
}
