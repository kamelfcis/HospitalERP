/**
 * useInvoiceLines — حالة وإدارة أسطر فاتورة الشراء
 *
 * يوفر:
 *  - lines / setLines
 *  - معالجات تغيير الحقول (سعر شراء، خصم، ضريبة)
 *  - تحميل الأسطر من السيرفر (mapServerLines)
 */
import { useState, useCallback } from "react";
import { recalcLine } from "../types";
import type { InvoiceLineLocal } from "../types";

export function useInvoiceLines() {
  const [lines, setLines] = useState<InvoiceLineLocal[]>([]);

  // ── تحميل الأسطر من بيانات السيرفر ────────────────────────────────────
  const mapServerLines = useCallback((serverLines: any[]): InvoiceLineLocal[] =>
    (serverLines || []).map((ln: any) => {
      const sellingPrice  = parseFloat(String(ln.sellingPrice))  || 0;
      const purchasePrice = parseFloat(String(ln.purchasePrice)) || 0;

      // نحسب lineDiscountPct دايماً من السعرين — مصدر الحقيقة
      // لو القيمة المخزّنة صفر (بيانات قديمة) تُحسب تلقائياً
      const storedPct     = parseFloat(String(ln.lineDiscountPct)) || 0;
      const derivedPct    = sellingPrice > 0 && sellingPrice >= purchasePrice
        ? +((sellingPrice - purchasePrice) / sellingPrice * 100).toFixed(4)
        : 0;
      // نستخدم القيمة المخزّنة لو موجودة، وإلا نشتق من السعرين
      const lineDiscountPct = storedPct > 0 ? storedPct : derivedPct;

      const line: InvoiceLineLocal = {
        id:               ln.id,
        receivingLineId:  ln.receivingLineId || null,
        itemId:           ln.itemId,
        item:             ln.item || null,
        unitLevel:        ln.unitLevel,
        qty:              parseFloat(String(ln.qty))     || 0,
        bonusQty:         parseFloat(String(ln.bonusQty))|| 0,
        sellingPrice,
        purchasePrice,
        lineDiscountPct,
        lineDiscountValue:parseFloat(String(ln.lineDiscountValue))|| 0,
        vatRate:          (() => { const v = parseFloat(String(ln.vatRate)); return isNaN(v) ? 14 : v; })(),
        valueBeforeVat:   parseFloat(String(ln.valueBeforeVat))   || 0,
        vatAmount:        parseFloat(String(ln.vatAmount))        || 0,
        valueAfterVat:    parseFloat(String(ln.valueAfterVat))    || 0,
        batchNumber:      ln.batchNumber || "",
        expiryMonth:      ln.expiryMonth ?? null,
        expiryYear:       ln.expiryYear  ?? null,
      };
      return recalcLine(line);
    }),
  []);

  // ── سعر الشراء → يُعيد حساب الخصم ─────────────────────────────────────
  const handlePurchasePriceChange = useCallback((index: number, val: string) => {
    const newPrice = Math.max(0, parseFloat(val) || 0);
    setLines((prev) => {
      const updated = [...prev];
      const ln = { ...updated[index], purchasePrice: newPrice };
      if (ln.sellingPrice > 0) {
        const dv = +(ln.sellingPrice - newPrice).toFixed(2);
        ln.lineDiscountValue = Math.max(0, dv);
        ln.lineDiscountPct   = +((ln.lineDiscountValue / ln.sellingPrice) * 100).toFixed(2);
      }
      updated[index] = recalcLine(ln);
      return updated;
    });
  }, []);

  // ── خصم % → يُعيد حساب خصم القيمة وسعر الشراء ─────────────────────────
  const handleDiscountPctChange = useCallback((index: number, val: string) => {
    const pct = +Math.min(99.99, Math.max(0, parseFloat(val) || 0)).toFixed(2);
    setLines((prev) => {
      const updated = [...prev];
      const ln = { ...updated[index], lineDiscountPct: pct };
      ln.lineDiscountValue = +(ln.sellingPrice * (pct / 100)).toFixed(2);
      ln.purchasePrice     = +(ln.sellingPrice - ln.lineDiscountValue).toFixed(4);
      updated[index] = recalcLine(ln);
      return updated;
    });
  }, []);

  // ── خصم قيمة → يُعيد حساب الخصم % وسعر الشراء ─────────────────────────
  const handleDiscountValueChange = useCallback((index: number, val: string) => {
    setLines((prev) => {
      const updated = [...prev];
      const ln = { ...updated[index] };
      const dv = parseFloat(val) || 0;
      ln.lineDiscountValue = +Math.min(ln.sellingPrice, Math.max(0, dv)).toFixed(2);
      if (ln.sellingPrice > 0)
        ln.lineDiscountPct = +((ln.lineDiscountValue / ln.sellingPrice) * 100).toFixed(2);
      ln.purchasePrice = +(ln.sellingPrice - ln.lineDiscountValue).toFixed(4);
      updated[index] = recalcLine(ln);
      return updated;
    });
  }, []);

  // ── نسبة الضريبة ────────────────────────────────────────────────────────
  const handleVatRateChange = useCallback((index: number, val: string) => {
    const rate = Math.max(0, parseFloat(val) || 0);
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = recalcLine({ ...updated[index], vatRate: rate });
      return updated;
    });
  }, []);

  return {
    lines, setLines, mapServerLines,
    handlePurchasePriceChange,
    handleDiscountPctChange,
    handleDiscountValueChange,
    handleVatRateChange,
  };
}

export type UseInvoiceLinesReturn = ReturnType<typeof useInvoiceLines>;
