import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { convertQtyToMinor } from "../inventory-helpers";
import {
  openingStockHeaders,
  openingStockLines,
  type OpeningStockLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

interface ItemInfo {
  nameAr:        string;
  hasExpiry:     boolean;
  majorToMedium: string | null;
  majorToMinor:  string | null;
  mediumToMinor: string | null;
}

async function _fetchItemInfo(itemId: string): Promise<ItemInfo | null> {
  const res = await db.execute(sql`
    SELECT name_ar, has_expiry,
           major_to_medium, major_to_minor, medium_to_minor
    FROM items WHERE id = ${itemId} AND is_active = true LIMIT 1
  `);
  const r = (res as any).rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    nameAr:        String(r.name_ar ?? ""),
    hasExpiry:     Boolean(r.has_expiry),
    majorToMedium: r.major_to_medium as string | null,
    majorToMinor:  r.major_to_minor  as string | null,
    mediumToMinor: r.medium_to_minor as string | null,
  };
}

function _validateLine(
  line: {
    unitLevel:     string;
    qtyInUnit:     number;
    purchasePrice: number;
    salePrice:     number;
    expiryMonth?:  number | null;
    expiryYear?:   number | null;
  },
  item: ItemInfo,
): void {
  if (!["major", "medium", "minor"].includes(line.unitLevel)) {
    throw new Error("وحدة غير صالحة — يجب أن تكون: major أو medium أو minor");
  }
  if (!(line.qtyInUnit > 0)) throw new Error("الكمية يجب أن تكون أكبر من صفر");
  if (line.purchasePrice < 0) throw new Error("سعر الشراء لا يمكن أن يكون سالباً");
  if (line.salePrice < 0)     throw new Error("سعر البيع لا يمكن أن يكون سالباً");
  if (item.hasExpiry && (!line.expiryMonth || !line.expiryYear)) {
    throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
  }
}

export const openingStockCrudWriteMethods = {
  async deleteOpeningStockLine(
    this: DatabaseStorage,
    headerId: string,
    lineId:   string,
  ): Promise<void> {
    const [hdr] = await db.select({ status: openingStockHeaders.status })
      .from(openingStockHeaders).where(eq(openingStockHeaders.id, headerId));
    if (!hdr) throw new Error("الوثيقة غير موجودة");
    if (hdr.status !== "draft") throw new Error("لا يمكن حذف سطر من وثيقة مُرحَّلة");

    await db.delete(openingStockLines).where(
      and(eq(openingStockLines.id, lineId), eq(openingStockLines.headerId, headerId))
    );
  },

  async deleteOpeningStockHeader(
    this: DatabaseStorage,
    id: string,
  ): Promise<void> {
    const [hdr] = await db.select({ status: openingStockHeaders.status })
      .from(openingStockHeaders).where(eq(openingStockHeaders.id, id));
    if (!hdr) throw new Error("الوثيقة غير موجودة");
    if (hdr.status !== "draft") throw new Error("لا يمكن حذف وثيقة مُرحَّلة");

    await db.delete(openingStockHeaders).where(eq(openingStockHeaders.id, id));
  },

  async upsertOpeningStockLine(
    this: DatabaseStorage,
    headerId: string,
    lineData: {
      lineId?:       string;
      itemId:        string;
      unitLevel:     string;
      qtyInUnit:     number;
      purchasePrice: number;
      salePrice:     number;
      batchNo?:      string | null;
      expiryMonth?:  number | null;
      expiryYear?:   number | null;
      lineNotes?:    string | null;
    },
  ): Promise<OpeningStockLine> {
    const [hdr] = await db.select({ status: openingStockHeaders.status })
      .from(openingStockHeaders).where(eq(openingStockHeaders.id, headerId));
    if (!hdr) throw new Error("الوثيقة غير موجودة");
    if (hdr.status !== "draft") throw new Error("لا يمكن تعديل وثيقة مُرحَّلة");

    const item = await _fetchItemInfo(lineData.itemId);
    if (!item) throw new Error("الصنف غير موجود أو غير نشط");

    _validateLine(lineData, item);

    const unitLvl  = lineData.unitLevel as "major" | "medium" | "minor";
    const qtyMinor = convertQtyToMinor(lineData.qtyInUnit, unitLvl, item);

    const payload = {
      itemId:        lineData.itemId,
      unitLevel:     unitLvl,
      qtyInUnit:     lineData.qtyInUnit.toFixed(4),
      qtyInMinor:    qtyMinor.toFixed(4),
      purchasePrice: lineData.purchasePrice.toFixed(4),
      salePrice:     lineData.salePrice.toFixed(2),
      batchNo:       lineData.batchNo || null,
      expiryMonth:   lineData.expiryMonth || null,
      expiryYear:    lineData.expiryYear || null,
      lineNotes:     lineData.lineNotes || null,
      updatedAt:     new Date(),
    };

    if (lineData.lineId) {
      const [updated] = await db.update(openingStockLines)
        .set(payload)
        .where(and(eq(openingStockLines.id, lineData.lineId), eq(openingStockLines.headerId, headerId)))
        .returning();
      if (!updated) throw new Error("السطر غير موجود");
      return updated;
    } else {
      const [inserted] = await db.insert(openingStockLines)
        .values({ headerId, ...payload }).returning();
      return inserted;
    }
  },

  async importOpeningStockLines(
    this: DatabaseStorage,
    headerId: string,
    rows: Array<{
      itemCode:      string;
      unitLevel:     string;
      qtyInUnit:     number;
      purchasePrice: number;
      salePrice:     number;
      batchNo?:      string | null;
      expiryMonth?:  number | null;
      expiryYear?:   number | null;
      lineNotes?:    string | null;
    }>,
  ): Promise<{ imported: number; errors: string[] }> {
    const [hdr] = await db.select({ status: openingStockHeaders.status })
      .from(openingStockHeaders).where(eq(openingStockHeaders.id, headerId));
    if (!hdr) throw new Error("الوثيقة غير موجودة");
    if (hdr.status !== "draft") throw new Error("لا يمكن الاستيراد في وثيقة مُرحَّلة");

    const errors: string[] = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 1;
      try {
        const itemRes = await db.execute(sql`
          SELECT id FROM items WHERE item_code = ${row.itemCode} AND is_active = true LIMIT 1
        `);
        const itemId = ((itemRes as any).rows[0] as any)?.id;
        if (!itemId) {
          errors.push(`سطر ${rowNum}: كود الصنف "${row.itemCode}" غير موجود — تخطي`);
          continue;
        }
        await this.upsertOpeningStockLine(headerId, { itemId, ...row });
        imported++;
      } catch (e) {
        errors.push(`سطر ${rowNum}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { imported, errors };
  },
};
