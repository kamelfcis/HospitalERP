/*
 * ═══════════════════════════════════════════════════════════════
 *  _utils.ts — Shared Utility Functions & Constants
 *  الدوال المساعدة والثوابت المشتركة
 * ═══════════════════════════════════════════════════════════════
 *
 *  exports:
 *   DOC_PREFIXES              — بادئات أرقام المستندات (JE, SI, PI ...)
 *   addFormattedNumber        — يُضيف formattedNumber لمستند واحد
 *   addFormattedNumbers       — يُضيف formattedNumber لمصفوفة مستندات
 *   accountTypeMapArabicToEnglish — خريطة ترجمة أنواع الحسابات
 *   accountTypeMapEnglishToArabic — خريطة ترجمة عكسية
 *   getDisplayList            — أيُّ قائمة تظهر فيها (ميزانية / دخل)
 *   handleError               — معالجة موحّدة للأخطاء في route handlers
 * ═══════════════════════════════════════════════════════════════
 */
import type { Response } from "express";

export const DOC_PREFIXES: Record<string, string> = {
  journal_entry: "JE",
  transfer: "TRF",
  receiving: "RCV",
  purchase_invoice: "PUR",
  sales_invoice: "SI",
  patient_invoice: "PI",
};

export function addFormattedNumber(doc: any, type: string, numberField = "entryNumber"): any {
  if (!doc) return doc;
  const prefix = DOC_PREFIXES[type] || "";
  const num = doc[numberField];
  return { ...doc, formattedNumber: num != null ? `${prefix}-${num}` : null };
}

export function addFormattedNumbers(docs: any[], type: string, numberField = "entryNumber"): any[] {
  return docs.map((doc) => addFormattedNumber(doc, type, numberField));
}

export const accountTypeMapArabicToEnglish: Record<string, string> = {
  "أصول": "asset",
  "خصوم": "liability",
  "حقوق ملكية": "equity",
  "إيرادات": "revenue",
  "مصروفات": "expense",
};

export const accountTypeMapEnglishToArabic: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

export function getDisplayList(accountType: string): string {
  if (["asset", "liability", "equity"].includes(accountType)) return "الميزانية";
  return "قائمة الدخل";
}

/**
 * handleError — معالجة موحّدة للأخطاء في route handlers
 *
 * يحل محل النمط المتكرر 139+ مرة:
 *   const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
 *   res.status(500).json({ message: _em });
 *
 * الاستخدام الأساسي:
 *   catch (error) { handleError(res, error); }
 *
 * مع حالات HTTP مخصصة:
 *   catch (error) { handleError(res, error, { "الفترة المحاسبية": 403, "غير موجود": 404 }); }
 */
export function handleError(res: Response, error: unknown, statusMap?: Record<string, number>): void {
  const message = error instanceof Error ? error.message : String(error);

  if (statusMap) {
    for (const [keyword, status] of Object.entries(statusMap)) {
      if (message.includes(keyword)) {
        res.status(status).json({ message });
        return;
      }
    }
  }

  res.status(500).json({ message });
}
