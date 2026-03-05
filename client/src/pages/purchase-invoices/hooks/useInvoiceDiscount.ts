/**
 * useInvoiceDiscount — خصم الفاتورة الإجمالي (نسبة ↔ قيمة)
 *
 * العلاقة المتبادلة:
 *  - خصم % → خصم قيمة  (على أساس إجمالي قبل ض.ق.م)
 *  - خصم قيمة → خصم %
 *
 * يُحسب الـ summary كاملاً هنا: إجمالي قبل/بعد ض.ق.م + صافي مستحق.
 */
import { useState, useCallback, useMemo } from "react";
import type { InvoiceLineLocal } from "../types";

export function useInvoiceDiscount(lines: InvoiceLineLocal[]) {
  const [discountType,       setDiscountType]       = useState("value");
  const [discountValue,      setDiscountValue]      = useState(0);
  const [invoiceDiscountPct, setInvoiceDiscountPct] = useState(0);
  const [invoiceDiscountVal, setInvoiceDiscountVal] = useState(0);

  // ── ملء البيانات من السيرفر ────────────────────────────────────────────
  const loadDiscount = useCallback((dt: string, dv: number, serverLines: any[]) => {
    const totalBV = (serverLines || []).reduce((s: number, ln: any) => {
      return s + (parseFloat(String(ln.qty)) || 0) * (parseFloat(String(ln.purchasePrice)) || 0);
    }, 0);
    setDiscountType("value");
    if (dt === "percent") {
      const calcVal = +(totalBV * (dv / 100)).toFixed(2);
      setInvoiceDiscountPct(dv);
      setInvoiceDiscountVal(calcVal);
      setDiscountValue(calcVal);
    } else {
      setInvoiceDiscountVal(dv);
      setDiscountValue(dv);
      const calcPct = totalBV > 0 ? +((dv / totalBV) * 100).toFixed(4) : 0;
      setInvoiceDiscountPct(calcPct);
    }
  }, []);

  // ── الخصم % → قيمة ──────────────────────────────────────────────────────
  const handleInvoiceDiscountPctChange = useCallback((val: string) => {
    const pct     = Math.min(100, Math.max(0, parseFloat(val) || 0));
    const totalBV = lines.reduce((s, l) => s + l.valueBeforeVat, 0);
    const calcVal = +(totalBV * (pct / 100)).toFixed(2);
    setInvoiceDiscountPct(+pct.toFixed(4));
    setInvoiceDiscountVal(calcVal);
    setDiscountType("value");
    setDiscountValue(calcVal);
  }, [lines]);

  // ── الخصم قيمة → % ──────────────────────────────────────────────────────
  const handleInvoiceDiscountValChange = useCallback((val: string) => {
    const totalBV  = lines.reduce((s, l) => s + l.valueBeforeVat, 0);
    const v        = Math.min(totalBV, Math.max(0, parseFloat(val) || 0));
    const calcPct  = totalBV > 0 ? +((v / totalBV) * 100).toFixed(4) : 0;
    setInvoiceDiscountVal(+v.toFixed(2));
    setInvoiceDiscountPct(calcPct);
    setDiscountType("value");
    setDiscountValue(+v.toFixed(2));
  }, [lines]);

  // ── ملخص الفاتورة ────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalBeforeVat              = lines.reduce((s, l) => s + l.valueBeforeVat, 0);
    const totalVatBeforeDiscount      = lines.reduce((s, l) => s + l.vatAmount, 0);
    const totalAfterVatBeforeDiscount = totalBeforeVat + totalVatBeforeDiscount;
    const totalLineDiscounts          = lines.reduce((s, l) => s + l.lineDiscountValue, 0);
    let invoiceDiscountAmount         = Math.min(invoiceDiscountVal, totalAfterVatBeforeDiscount);
    if (invoiceDiscountAmount < 0) invoiceDiscountAmount = 0;
    const netPayable = +(totalAfterVatBeforeDiscount - invoiceDiscountAmount).toFixed(2);
    return {
      totalBeforeVat:        +totalBeforeVat.toFixed(2),
      totalVat:              +totalVatBeforeDiscount.toFixed(2),
      totalAfterVat:         +totalAfterVatBeforeDiscount.toFixed(2),
      totalLineDiscounts:    +totalLineDiscounts.toFixed(2),
      invoiceDiscountAmount: +invoiceDiscountAmount.toFixed(2),
      netPayable,
    };
  }, [lines, invoiceDiscountVal]);

  return {
    discountType, discountValue,
    invoiceDiscountPct, invoiceDiscountVal,
    loadDiscount,
    handleInvoiceDiscountPctChange,
    handleInvoiceDiscountValChange,
    summary,
  };
}

export type UseInvoiceDiscountReturn = ReturnType<typeof useInvoiceDiscount>;
