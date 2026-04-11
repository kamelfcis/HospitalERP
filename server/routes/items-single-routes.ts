import { Express } from "express";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { auditLog } from "../route-helpers";
import { db } from "../db";
import { insertItemSchema } from "@shared/schema";
import { validateItemUnits, computeMajorToMinor } from "../inventory-helpers";

export function registerItemsSingleRoutes(app: Express, storage: any) {
  app.get("/api/items/:id", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id as string);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      const txResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM inventory_lots       WHERE item_id = ${req.params.id}
          UNION ALL
          SELECT 1 FROM purchase_transactions WHERE item_id = ${req.params.id}
          UNION ALL
          SELECT 1 FROM sales_transactions    WHERE item_id = ${req.params.id}
        ) AS has_transactions
      `);
      const txRow = (txResult as any).rows?.[0];
      res.json({ ...item, hasTransactions: txRow?.has_transactions === true || txRow?.has_transactions === "true" });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/items", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), async (req, res) => {
    try {
      const parsed = insertItemSchema.parse(req.body);

      const errors: string[] = [];
      if (!parsed.itemCode?.trim()) errors.push("كود الصنف مطلوب");
      if (!parsed.nameAr?.trim()) errors.push("الاسم العربي مطلوب");
      if (!parsed.nameEn?.trim()) errors.push("الاسم الإنجليزي مطلوب");
      if (!parsed.formTypeId) errors.push("نوع الشكل مطلوب");

      const isServiceItem = parsed.category === "service";

      if (!isServiceItem) {
        const unitErrors = validateItemUnits({
          majorUnitName:  parsed.majorUnitName,
          mediumUnitName: parsed.mediumUnitName,
          minorUnitName:  parsed.minorUnitName,
          majorToMedium:  parsed.majorToMedium,
          majorToMinor:   parsed.majorToMinor,
          mediumToMinor:  parsed.mediumToMinor,
        });
        errors.push(...unitErrors);
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: errors.join("، ") });
      }

      const uniqueness = await storage.checkItemUniqueness(parsed.itemCode ?? undefined, parsed.nameAr ?? undefined, parsed.nameEn ?? undefined);
      const uniqueErrors: string[] = [];
      if (!uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
      if (!uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
      if (!uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");

      if (uniqueErrors.length > 0) {
        return res.status(409).json({ message: uniqueErrors.join("، ") });
      }

      if (parsed.category === "service") {
        parsed.hasExpiry = false;
        parsed.majorUnitName = null;
        parsed.mediumUnitName = null;
        parsed.minorUnitName = null;
        parsed.majorToMedium = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      } else if (parsed.category === "drug" && parsed.hasExpiry === undefined) {
        parsed.hasExpiry = true;
      }
      if (!parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null;
        parsed.majorToMedium = null;
      }
      if (!parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      }
      const computedMajorToMinor = computeMajorToMinor({
        majorUnitName:  parsed.majorUnitName,
        mediumUnitName: parsed.mediumUnitName,
        minorUnitName:  parsed.minorUnitName,
        majorToMedium:  parsed.majorToMedium,
        majorToMinor:   parsed.majorToMinor,
        mediumToMinor:  parsed.mediumToMinor,
      });
      if (computedMajorToMinor !== null) parsed.majorToMinor = computedMajorToMinor;

      const item = await storage.createItem(parsed);
      res.status(201).json(item);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.put("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const itemId = req.params.id as string;
      const parsed = insertItemSchema.partial().parse(req.body);

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) return res.status(404).json({ message: "الصنف غير موجود" });

      const conversionFields = [
        "majorToMinor", "majorToMedium", "mediumToMinor",
        "majorUnitName", "mediumUnitName", "minorUnitName",
      ] as const;
      const normalizeUnitVal = (v: unknown): string | null => {
        if (v == null) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      };
      const conversionChanged = conversionFields.some((f) => {
        if (!(f in parsed)) return false;
        const requested = normalizeUnitVal(parsed[f]);
        const current   = normalizeUnitVal(currentItem[f]);
        return requested !== current;
      });

      if (conversionChanged) {
        const countsResult = await db.execute(sql`
          SELECT
            (SELECT COUNT(*)::int FROM inventory_lots        WHERE item_id = ${itemId}) AS lot_count,
            (SELECT COUNT(*)::int FROM purchase_transactions  WHERE item_id = ${itemId}) AS purchase_count,
            (SELECT COUNT(*)::int FROM sales_transactions     WHERE item_id = ${itemId}) AS sales_count
        `);
        const counts = (countsResult as any).rows?.[0];

        const lotCount      = parseInt(String(counts?.lot_count      ?? "0"), 10);
        const purchaseCount = parseInt(String(counts?.purchase_count ?? "0"), 10);
        const salesCount    = parseInt(String(counts?.sales_count    ?? "0"), 10);
        const total = lotCount + purchaseCount + salesCount;

        if (total > 0) {
          await auditLog({
            tableName: "items",
            recordId: itemId,
            action: "CONVERSION_EDIT_BLOCKED",
            oldValues: {
              majorToMinor:  currentItem.majorToMinor,
              majorToMedium: currentItem.majorToMedium,
              mediumToMinor: currentItem.mediumToMinor,
            },
            newValues: {
              majorToMinor:  parsed.majorToMinor,
              majorToMedium: parsed.majorToMedium,
              mediumToMinor: parsed.mediumToMinor,
              lotCount, purchaseCount, salesCount,
            },
            userId: (req as any).session?.userId,
          });
          return res.status(409).json({
            message: `لا يمكن تعديل معاملات التحويل أو أسماء الوحدات — يوجد ${lotCount} دفعة، ${purchaseCount} حركة شراء، ${salesCount} حركة بيع على هذا الصنف`,
          });
        }
      }

      const effectiveMajorName  = parsed.majorUnitName  !== undefined ? parsed.majorUnitName  : currentItem.majorUnitName;
      const effectiveMediumName = parsed.mediumUnitName !== undefined ? parsed.mediumUnitName : currentItem.mediumUnitName;
      const effectiveMinorName  = parsed.minorUnitName  !== undefined ? parsed.minorUnitName  : currentItem.minorUnitName;
      const effectiveMajorToMedium = parsed.majorToMedium !== undefined ? parsed.majorToMedium : currentItem.majorToMedium;
      const effectiveMajorToMinor  = parsed.majorToMinor  !== undefined ? parsed.majorToMinor  : currentItem.majorToMinor;
      const effectiveMediumToMinor = parsed.mediumToMinor !== undefined ? parsed.mediumToMinor : currentItem.mediumToMinor;

      const isService = (parsed.category ?? currentItem.category) === "service";
      if (!isService) {
        const convErrors = validateItemUnits({
          majorUnitName:  effectiveMajorName,
          mediumUnitName: effectiveMediumName,
          minorUnitName:  effectiveMinorName,
          majorToMedium:  effectiveMajorToMedium,
          majorToMinor:   effectiveMajorToMinor,
          mediumToMinor:  effectiveMediumToMinor,
        });
        if (convErrors.length > 0) return res.status(400).json({ message: convErrors.join("، ") });
      }

      if (parsed.itemCode || parsed.nameAr || parsed.nameEn) {
        const uniqueness = await storage.checkItemUniqueness(parsed.itemCode ?? undefined, parsed.nameAr ?? undefined, parsed.nameEn ?? undefined, itemId);
        const uniqueErrors: string[] = [];
        if (parsed.itemCode && !uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
        if (parsed.nameAr && !uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
        if (parsed.nameEn && !uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");
        if (uniqueErrors.length > 0) {
          return res.status(409).json({ message: uniqueErrors.join("، ") });
        }
      }

      if (parsed.mediumUnitName !== undefined && !parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null;
        parsed.majorToMedium = null;
      }
      if (parsed.minorUnitName !== undefined && !parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      }

      const putComputedMajorToMinor = computeMajorToMinor({
        majorUnitName:  effectiveMajorName,
        mediumUnitName: effectiveMediumName,
        minorUnitName:  effectiveMinorName,
        majorToMedium:  effectiveMajorToMedium,
        majorToMinor:   effectiveMajorToMinor,
        mediumToMinor:  effectiveMediumToMinor,
      });
      if (putComputedMajorToMinor !== null) parsed.majorToMinor = putComputedMajorToMinor;

      const item = await storage.updateItem(itemId, parsed);
      if (!item) return res.status(404).json({ message: "الصنف غير موجود" });
      res.json(item);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_DELETE), async (req, res) => {
    try {
      await storage.deleteItem(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes("violates foreign key constraint") || (error as { code?: string }).code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف هذا الصنف لوجود حركات مرتبطة به. يمكنك إلغاء تفعيله بدلاً من ذلك." });
      } else {
        res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
    }
  });
}
