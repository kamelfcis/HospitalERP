/**
 * pharmacy-sales-tax-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * خدمة حساب ضريبة المبيعات للصيدلية
 *
 * تتوسط بين الـ storage والمحرك الضريبي:
 *  - تقرأ إعداد الـ feature flag من الـ cache
 *  - تُطبق snapshot rule (snapshot من الصنف وقت الإنشاء → السطر هو المرجع)
 *  - تُحسب الضريبة لكل سطر وتُعيد إجماليات الفاتورة
 *  - لا تستدعي قاعدة البيانات مباشرةً — تتلقى البيانات جاهزة
 */

import { calculatePharmacyVat, type TaxType } from "../lib/tax/pharmacy-vat-engine";
import { getSetting } from "../settings-cache";
import { roundMoney } from "../finance-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// هل محرك الضريبة مفعّل؟ — يُقرأ من cache
// ─────────────────────────────────────────────────────────────────────────────
export function isPharmacyVatEnabled(): boolean {
  return getSetting("enable_pharmacy_sales_output_vat", "false") === "true";
}

// ─────────────────────────────────────────────────────────────────────────────
// نوع Snapshot — الحقول التي يُأخذ snapshot منها عند إضافة صنف للفاتورة
// ─────────────────────────────────────────────────────────────────────────────
export interface ItemTaxSnapshot {
  taxType: TaxType;
  taxRate: number;         // رقم 0..100
  pricesIncludeTax: boolean;
}

/**
 * resolveTaxSnapshot
 * يستخرج الـ snapshot من بيانات الصنف (تُستدعى مرة واحدة عند إضافة الصنف)
 */
export function resolveTaxSnapshot(item: {
  taxType?: string | null;
  defaultTaxRate?: string | null;
  pharmacyPricesIncludeTax?: boolean | null;
}): ItemTaxSnapshot {
  const vatEnabled = isPharmacyVatEnabled();
  if (!vatEnabled) {
    return { taxType: "exempt", taxRate: 0, pricesIncludeTax: false };
  }
  return {
    taxType:          (item.taxType as TaxType) ?? "exempt",
    taxRate:          parseFloat(item.defaultTaxRate || "0") || 0,
    pricesIncludeTax: item.pharmacyPricesIncludeTax ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// نوع مدخل السطر (يحمل snapshot أو override من السطر نفسه)
// ─────────────────────────────────────────────────────────────────────────────
export interface LineForTax {
  qty: number;
  salePrice: number;          // السعر المُحدَّد من النظام (before/after tax حسب pricesIncludeTax)
  taxType?: TaxType;
  taxRate?: number;
  pricesIncludeTax?: boolean;
}

export interface LineTaxResult {
  taxType: TaxType;
  taxRate: number;
  taxAmount: string;
  netUnitPrice: string;
  grossUnitPrice: string;
  lineNetAmount: string;
  lineGrossAmount: string;
  lineTotal: string;          // يساوي lineGrossAmount عندما VAT مفعّل، وإلا qty*salePrice
}

/**
 * computeLineTax
 * يحسب الضريبة لسطر واحد.
 * يُستدعى server-side فقط — النتيجة تُخزَّن في قاعدة البيانات.
 */
export function computeLineTax(line: LineForTax): LineTaxResult {
  const vatEnabled = isPharmacyVatEnabled();
  const taxType = vatEnabled ? (line.taxType ?? "exempt") : "exempt";
  const taxRate = vatEnabled ? (line.taxRate ?? 0) : 0;
  const pricesIncludeTax = line.pricesIncludeTax ?? false;

  const result = calculatePharmacyVat({
    taxType,
    taxRate,
    qty: line.qty,
    unitPrice: line.salePrice,
    pricesIncludeTax,
  });

  // lineTotal = الإجمالي الشامل الذي يدفعه العميل
  const lineTotal = vatEnabled && taxType === "taxable" && taxRate > 0
    ? String(result.lineGrossAmount.toFixed(2))
    : roundMoney(line.qty * line.salePrice);

  return {
    taxType,
    taxRate,
    taxAmount:      String(result.taxAmount.toFixed(2)),
    netUnitPrice:   String(result.netUnitPrice.toFixed(4)),
    grossUnitPrice: String(result.grossUnitPrice.toFixed(4)),
    lineNetAmount:  String(result.lineNetAmount.toFixed(2)),
    lineGrossAmount: String(result.lineGrossAmount.toFixed(2)),
    lineTotal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// إعادة حساب إجماليات الفاتورة بعد حساب الضريبة لجميع السطور
// ─────────────────────────────────────────────────────────────────────────────
export interface InvoiceTaxTotals {
  totalTaxAmount: string;
  totalNetAmount: string;
  totalGrossAmount: string;
}

export function computeInvoiceTaxTotals(lineTaxResults: LineTaxResult[]): InvoiceTaxTotals {
  let totalTax = 0;
  let totalNet = 0;
  let totalGross = 0;

  for (const r of lineTaxResults) {
    totalTax   += parseFloat(r.taxAmount);
    totalNet   += parseFloat(r.lineNetAmount);
    totalGross += parseFloat(r.lineGrossAmount);
  }

  return {
    totalTaxAmount:  roundMoney(totalTax),
    totalNetAmount:  roundMoney(totalNet),
    totalGrossAmount: roundMoney(totalGross),
  };
}
