/**
 * collectibleAmount.ts — نسخة الواجهة الأمامية
 * ═══════════════════════════════════════════════════════════
 *  مرآة مبسّطة للمنطق الموجود في:
 *    server/lib/cashier-collection-amount.ts
 *
 *  القاعدة:
 *    فاتورة تعاقد (customerType = "contract") بنصيب مريض > 0
 *    → يُحصَّل patientShareTotal  (نصيب المريض فقط)
 *
 *    أي فاتورة أخرى
 *    → يُحصَّل netTotal  (الصافي الكامل)
 * ═══════════════════════════════════════════════════════════
 */

export interface CollectibleInvoiceFE {
  netTotal:           string | null | undefined;
  customerType?:      string | null;
  patientShareTotal?: string | null;
}

/** المبلغ الذي يجب تحصيله من المريض (float). */
export function getCollectibleAmount(invoice: CollectibleInvoiceFE): number {
  const isContract   = invoice.customerType === "contract";
  const patientShare = parseFloat(String(invoice.patientShareTotal ?? "0"));
  if (isContract && patientShare > 0) return patientShare;
  return parseFloat(String(invoice.netTotal ?? "0"));
}

/** هل هذه فاتورة تعاقد بنصيب جزئي؟ (لإظهار badge التعاقد) */
export function isContractPartial(invoice: CollectibleInvoiceFE): boolean {
  return (
    invoice.customerType === "contract" &&
    parseFloat(String(invoice.patientShareTotal ?? "0")) > 0
  );
}
