/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Shared Route Infrastructure — البنية المشتركة للمسارات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  هذا الملف يحتوي على:
 *  - Middleware: التحقق من تسجيل الدخول (requireAuth) والصلاحيات (checkPermission)
 *  - SSE Broadcasters: قنوات البث المباشر (الصيدلية، لوحة الأسرة، المحادثات)
 *  - Validation Schemas: أنماط التحقق من البيانات المدخلة
 *  - Utility Functions: دوال مساعدة (تنسيق أرقام المستندات، خرائط أنواع الحسابات)
 *
 *  This file contains shared middleware, SSE infrastructure, validation schemas,
 *  and utility functions used across all route modules.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";

// ─── SSE Clients — قنوات البث المباشر ──────────────────────────────────────────
// كل صيدلية لها مجموعة من العملاء المتصلين عبر SSE
export const sseClients = new Map<string, Set<Response>>();

// البث لصيدلية معينة — يرسل حدث لكل العملاء المتصلين بهذه الصيدلية
export function broadcastToPharmacy(pharmacyId: string, event: string, data: any) {
  const clients = sseClients.get(pharmacyId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  });
}

// قناة SSE عالمية للوحة الأسرة — أي تغيير في الأسرة يُبث لكل المتصلين
export const bedBoardClients = new Set<Response>();

export function broadcastBedBoardUpdate() {
  const payload = `event: bed-board-update\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`;
  bedBoardClients.forEach((res) => {
    try { res.write(payload); } catch { bedBoardClients.delete(res); }
  });
}

// قناة SSE للمحادثات الداخلية — كل مستخدم له اتصال واحد
export const chatSseClients = new Map<string, Response>();

export function broadcastChatMessage(receiverId: string, data: any) {
  const res = chatSseClients.get(receiverId);
  if (!res) return;
  try { res.write(`event: chat-message\ndata: ${JSON.stringify(data)}\n\n`); } catch { chatSseClients.delete(receiverId); }
}

// ─── Auth Middleware — التحقق من الهوية والصلاحيات ──────────────────────────────
// requireAuth: يتحقق أن المستخدم مسجل دخول (عنده session صالح)
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "يجب تسجيل الدخول" });
  }
  next();
}

// requirePermission: يتحقق من صلاحية محددة — يُستخدم داخليًا بواسطة checkPermission
async function requirePermission(req: Request, res: Response, next: NextFunction, permission: string) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "يجب تسجيل الدخول" });
  }
  // getUserEffectivePermissions: تجمع صلاحيات الدور + الصلاحيات الخاصة بالمستخدم
  const perms = await storage.getUserEffectivePermissions(req.session.userId);
  if (!perms.includes(permission)) {
    return res.status(403).json({ message: "لا تملك صلاحية لهذا الإجراء" });
  }
  next();
}

// checkPermission: middleware factory — ينتج middleware يتحقق من صلاحية معينة
// الاستخدام: app.post("/api/...", requireAuth, checkPermission("accounts.create"), handler)
export function checkPermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requirePermission(req, res, next, permission);
  };
}

// ─── Document Number Formatting — تنسيق أرقام المستندات ─────────────────────────
// كل نوع مستند له بادئة (prefix) تُضاف لرقمه التسلسلي
export const DOC_PREFIXES: Record<string, string> = {
  journal_entry: "JE",
  transfer: "TRF",
  receiving: "RCV",
  purchase_invoice: "PUR",
  sales_invoice: "SI",
  patient_invoice: "PI",
};

export function addFormattedNumber(doc: any, type: string, numberField: string = "entryNumber"): any {
  if (!doc) return doc;
  const prefix = DOC_PREFIXES[type] || "";
  const num = doc[numberField];
  return { ...doc, formattedNumber: num != null ? `${prefix}-${num}` : null };
}

export function addFormattedNumbers(docs: any[], type: string, numberField: string = "entryNumber"): any[] {
  return docs.map(doc => addFormattedNumber(doc, type, numberField));
}

// ─── Account Type Maps — خرائط أنواع الحسابات (عربي ↔ إنجليزي) ──────────────────
export const accountTypeMapArabicToEnglish: Record<string, string> = {
  "أصول": "asset",
  "خصوم": "liability",
  "حقوق ملكية": "equity",
  "إيرادات": "revenue",
  "مصروفات": "expense"
};

export const accountTypeMapEnglishToArabic: Record<string, string> = {
  "asset": "أصول",
  "liability": "خصوم",
  "equity": "حقوق ملكية",
  "revenue": "إيرادات",
  "expense": "مصروفات"
};

export function getDisplayList(accountType: string): string {
  if (["asset", "liability", "equity"].includes(accountType)) {
    return "الميزانية";
  }
  return "قائمة الدخل";
}

// ─── Validation Schemas — أنماط التحقق من البيانات ───────────────────────────────

// سطر القيد المحاسبي — كل سطر فيه حساب ومدين أو دائن
export const journalLineSchema = z.object({
  lineNumber: z.number(),
  accountId: z.string(),
  costCenterId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  debit: z.string().or(z.number()),
  credit: z.string().or(z.number()),
});

// القيد المحاسبي الكامل — يجب أن يحتوي على سطرين على الأقل
export const journalEntryWithLinesSchema = z.object({
  entryDate: z.string(),
  description: z.string().min(1, "الوصف مطلوب"),
  reference: z.string().optional().nullable(),
  periodId: z.string().optional().nullable(),
  lines: z.array(journalLineSchema).min(2, "يجب أن يحتوي القيد على سطرين على الأقل"),
  postAfterSave: z.boolean().optional(),
});

// تعديل القيد — كل الحقول اختيارية
export const journalEntryUpdateSchema = z.object({
  entryDate: z.string().optional(),
  description: z.string().min(1, "الوصف مطلوب").optional(),
  reference: z.string().optional().nullable(),
  periodId: z.string().optional().nullable(),
  lines: z.array(journalLineSchema).min(2, "يجب أن يحتوي القيد على سطرين على الأقل").optional(),
});

export const warehouseUpdateSchema = z.object({
  warehouseCode: z.string().min(1).optional(),
  nameAr: z.string().min(1).optional(),
  departmentId: z.string().optional().nullable(),
  pharmacyId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const userDepartmentsAssignmentSchema = z.object({
  departmentIds: z.array(z.string()),
});

export const userWarehousesAssignmentSchema = z.object({
  warehouseIds: z.array(z.string()),
});

// ─── Receiving Validation — التحقق من بيانات الاستلام ────────────────────────────
// يتأكد من: سعر بيع صحيح + تاريخ صلاحية للأصناف التي تتطلب ذلك
export async function validateReceivingLines(lines: any[]): Promise<{ lineIndex: number; field: string; messageAr: string }[]> {
  const errors: { lineIndex: number; field: string; messageAr: string }[] = [];
  const itemIds = Array.from(new Set(lines.filter(l => !l.isRejected && l.itemId).map(l => l.itemId)));
  const itemsMap = await storage.getItemsByIds(itemIds);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.isRejected) continue;

    const sp = parseFloat(line.salePrice);
    if (!line.salePrice || isNaN(sp) || sp <= 0) {
      errors.push({ lineIndex: i, field: "salePrice", messageAr: "سعر البيع مطلوب ويجب أن يكون أكبر من صفر" });
    }

    const item = itemsMap.get(line.itemId);
    if (item) {
      if (item.hasExpiry) {
        const month = line.expiryMonth != null ? parseInt(String(line.expiryMonth)) : null;
        const year = line.expiryYear != null ? parseInt(String(line.expiryYear)) : null;
        if (month == null || isNaN(month) || month < 1 || month > 12) {
          errors.push({ lineIndex: i, field: "expiry", messageAr: "تاريخ الصلاحية مطلوب لهذا الصنف" });
        } else if (year == null || isNaN(year) || year < 2000 || year > 2100) {
          errors.push({ lineIndex: i, field: "expiry", messageAr: "سنة الصلاحية غير صحيحة" });
        }
      } else {
        if (line.expiryMonth != null || line.expiryYear != null) {
          line.expiryMonth = null;
          line.expiryYear = null;
        }
      }
    }
  }
  return errors;
}
