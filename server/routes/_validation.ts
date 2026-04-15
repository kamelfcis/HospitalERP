/*
 * ═══════════════════════════════════════════════════════════════
 *  _validation.ts — Shared Validation Schemas & Functions
 *  أنماط التحقق من البيانات المدخلة (Zod schemas)
 * ═══════════════════════════════════════════════════════════════
 *
 *  exports:
 *   journalLineSchema            — سطر القيد المحاسبي
 *   journalEntryWithLinesSchema  — القيد الكامل (حد أدنى سطرين)
 *   journalEntryUpdateSchema     — تعديل القيد
 *   warehouseUpdateSchema        — تعديل المخزن
 *   userDepartmentsAssignment..  — تعيين أقسام للمستخدم
 *   userWarehousesAssignment..   — تعيين مخازن للمستخدم
 *   validateReceivingLines       — التحقق من سطور الاستلام (async)
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { storage } from "../storage";

export const journalLineSchema = z.object({
  lineNumber: z.number(),
  accountId: z.string(),
  costCenterId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  debit: z.string().or(z.number()),
  credit: z.string().or(z.number()),
});

export const journalEntryWithLinesSchema = z.object({
  entryDate: z.string(),
  description: z.string().min(1, "الوصف مطلوب"),
  reference: z.string().optional().nullable(),
  periodId: z.string().optional().nullable(),
  lines: z.array(journalLineSchema).min(2, "يجب أن يحتوي القيد على سطرين على الأقل"),
  postAfterSave: z.boolean().optional(),
});

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
  glAccountId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const userDepartmentsAssignmentSchema = z.object({
  departmentIds: z.array(z.string()),
});

export const userWarehousesAssignmentSchema = z.object({
  warehouseIds: z.array(z.string()),
});

export const userAccountScopeAssignmentSchema = z.object({
  accountIds: z.array(z.string()),
});

// التحقق من سطور الاستلام:
// يتأكد من: سعر بيع صحيح + تاريخ صلاحية للأصناف التي تتطلب ذلك
export async function validateReceivingLines(
  lines: any[],
): Promise<{ lineIndex: number; field: string; messageAr: string }[]> {
  const errors: { lineIndex: number; field: string; messageAr: string }[] = [];
  const itemIds = Array.from(
    new Set(lines.filter((l) => !l.isRejected && l.itemId).map((l) => l.itemId)),
  );
  const itemsMap = await storage.getItemsByIds(itemIds);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.isRejected) continue;

    const sp = parseFloat(line.salePrice);
    if (!line.salePrice || isNaN(sp) || sp <= 0) {
      errors.push({ lineIndex: i, field: "salePrice", messageAr: "سعر البيع مطلوب ويجب أن يكون أكبر من صفر" });
    }

    const item = itemsMap.get(line.itemId);
    if (!item) {
      errors.push({ lineIndex: i, field: "itemId", messageAr: "الصنف غير موجود أو غير صالح" });
      continue;
    }
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
  return errors;
}
