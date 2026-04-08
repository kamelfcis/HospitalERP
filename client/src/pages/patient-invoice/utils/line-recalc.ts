/**
 * line-recalc.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * دوال حسابية خالصة (pure) لإعادة حساب بنود فاتورة المريض.
 * قابلة للاختبار بدون React أو API.
 */
import type { LineLocal } from "../types";

/** إعادة حساب totalPrice من quantity * unitPrice - discountAmount */
export function recalcLine(line: LineLocal): LineLocal {
  const gross      = line.quantity * line.unitPrice;
  const totalPrice = Math.max(0, +(gross - line.discountAmount).toFixed(2));
  return { ...line, totalPrice };
}

/** إعادة حساب discountAmount + totalPrice من discountPercent */
export function recalcLineFromPercent(line: LineLocal): LineLocal {
  const gross          = line.quantity * line.unitPrice;
  const discountAmount = +(gross * line.discountPercent / 100).toFixed(2);
  const totalPrice     = Math.max(0, +(gross - discountAmount).toFixed(2));
  return { ...line, discountAmount, totalPrice };
}

/** إعادة حساب discountPercent + totalPrice من discountAmount */
export function recalcLineFromAmount(line: LineLocal): LineLocal {
  const gross          = line.quantity * line.unitPrice;
  const discountPercent = gross > 0 ? +(line.discountAmount / gross * 100).toFixed(2) : 0;
  const totalPrice      = Math.max(0, +(gross - line.discountAmount).toFixed(2));
  return { ...line, discountPercent, totalPrice };
}
