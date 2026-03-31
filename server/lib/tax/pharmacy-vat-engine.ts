/**
 * pharmacy-vat-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * محرك حساب ضريبة القيمة المضافة للصيدلية — مركزي ومعزول تماماً
 *
 * قواعد ثابتة:
 *  - لا آثار جانبية — دالة نقية Pure Function
 *  - لا استدعاءات قاعدة البيانات هنا
 *  - يستخدم roundMoney فقط للتقريب
 *  - لا يُستدعى من داخل routes أو React — يُستدعى من الخدمة فقط
 *
 * أنواع الضريبة:
 *  exempt     → ضريبة = 0، صافي = إجمالي
 *  taxable    → تُحسب الضريبة من السعر (شامل أو غير شامل حسب pricesIncludeTax)
 *  zero_rated → معدل صفر — ضريبة = 0، صافي = إجمالي (مع الاحتفاظ بالتصنيف)
 *  null/undefined → يُعامَل كـ exempt
 */

import { roundMoney } from "../../finance-helpers";

export type TaxType = "exempt" | "taxable" | "zero_rated" | null | undefined;

export interface VatInput {
  taxType: TaxType;
  taxRate: number;         // نسبة مئوية مثل 14 (وليس 0.14)
  qty: number;
  unitPrice: number;       // السعر قبل أو بعد الضريبة حسب pricesIncludeTax
  pricesIncludeTax: boolean;
}

export interface VatResult {
  netUnitPrice: number;
  grossUnitPrice: number;
  taxAmount: number;
  lineNetAmount: number;
  lineGrossAmount: number;
}

/**
 * calculatePharmacyVat — الدالة المركزية لحساب الضريبة
 */
export function calculatePharmacyVat(input: VatInput): VatResult {
  const { taxType, taxRate, qty, unitPrice, pricesIncludeTax } = input;

  // معفى أو معدل صفر أو taxType غير محدد → لا ضريبة
  if (!taxType || taxType === "exempt" || taxType === "zero_rated" || taxRate <= 0) {
    const lineAmount = parseFloat(roundMoney(qty * unitPrice));
    return {
      netUnitPrice:   unitPrice,
      grossUnitPrice: unitPrice,
      taxAmount:      0,
      lineNetAmount:  lineAmount,
      lineGrossAmount: lineAmount,
    };
  }

  // taxable — احسب الضريبة
  const rate = taxRate / 100;

  let netUnitPrice: number;
  let grossUnitPrice: number;

  if (pricesIncludeTax) {
    // السعر شامل الضريبة → نستخرج الصافي
    // netUnit = grossUnit / (1 + rate)
    grossUnitPrice = unitPrice;
    netUnitPrice   = grossUnitPrice / (1 + rate);
  } else {
    // السعر غير شامل الضريبة → نضيف الضريبة
    netUnitPrice   = unitPrice;
    grossUnitPrice = unitPrice * (1 + rate);
  }

  const lineNetAmount   = parseFloat(roundMoney(qty * netUnitPrice));
  const lineGrossAmount = parseFloat(roundMoney(qty * grossUnitPrice));
  const taxAmount       = parseFloat(roundMoney(lineGrossAmount - lineNetAmount));

  return {
    netUnitPrice:   parseFloat(roundMoney(netUnitPrice)),
    grossUnitPrice: parseFloat(roundMoney(grossUnitPrice)),
    taxAmount,
    lineNetAmount,
    lineGrossAmount,
  };
}
