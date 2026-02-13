import type { Response } from "express";

export const ErrorMessages = {
  PERIOD_CLOSED: "الفترة المحاسبية مغلقة – لا يمكن إجراء عمليات في فترة مقفولة",
  ALREADY_POSTED: "المستند مُرحّل بالفعل ولا يمكن تعديله",
  ALREADY_COLLECTED: "الفاتورة محصّلة بالفعل",
  ALREADY_REFUNDED: "المرتجع مصروف بالفعل",
  INSUFFICIENT_STOCK: "الكمية المتوفرة غير كافية",
  MISSING_BATCH_EXPIRY: "يجب إدخال رقم التشغيلة وتاريخ الصلاحية لهذا الصنف",
  MISSING_SELLING_PRICE: "سعر البيع غير محدد لهذا الصنف",
  INVALID_UNIT_CONVERSION: "تحويل الوحدة غير صحيح – تأكد من إعدادات الوحدات",
  NOT_DRAFT: "لا يمكن تعديل مستند غير مسودة",
  NOT_FOUND: "السجل غير موجود",
  SHIFT_NOT_OPEN: "الوردية غير مفتوحة",
  UNAUTHORIZED: "غير مصرح",
  EXPIRED_BATCH: "لا يمكن بيع دفعة منتهية الصلاحية",
} as const;

export function apiError(
  res: Response,
  status: number,
  message: string,
  code?: string
): Response {
  return res.status(status).json({ message, code });
}
