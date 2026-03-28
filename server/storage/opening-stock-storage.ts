/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Opening Stock Storage — الرصيد الافتتاحي للمخزن
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  دورة عمل الوثيقة:  draft  →  posted  (لا رجعة)
 *
 *  الترحيل يُنشئ:
 *   • inventory_lots       (بنفس منطق postReceiving)
 *   • inventory_lot_movements (referenceType = 'opening_stock')
 *   • journal entry        (إذا كانت account_mappings مُعرَّفة)
 *
 *  قواعد صارمة:
 *   - مخزن واحد فقط يمكن ترحيله مرة واحدة
 *   - قراءة فقط بعد الترحيل
 *   - تحويل الوحدات server-side عبر convertQtyToMinor / convertPriceToMinor
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, and, sql, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  convertQtyToMinor,
  convertPriceToMinor,
} from "../inventory-helpers";
import {
  openingStockHeaders,
  openingStockLines,
  inventoryLots,
  inventoryLotMovements,
  items,
  warehouses,
  type OpeningStockHeader,
  type OpeningStockLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

// ── Lightweight item info needed for unit conversion ────────────────────────
interface ItemInfo {
  nameAr:        string;
  hasExpiry:     boolean;
  majorToMedium: string | null;
  majorToMinor:  string | null;
  mediumToMinor: string | null;
}

export type OpeningStockHeaderWithWarehouse = OpeningStockHeader & {
  warehouseNameAr?: string;
  lineCount?:       number;
};

export type OpeningStockLineWithItem = OpeningStockLine & {
  itemNameAr?:     string;
  itemCode?:       string;
  majorUnitName?:  string | null;
  mediumUnitName?: string | null;
  minorUnitName?:  string | null;
};

const openingStockStorage = {
  // ── القائمة الرئيسية ─────────────────────────────────────────────────────
  async getOpeningStockHeaders(this: DatabaseStorage): Promise<OpeningStockHeaderWithWarehouse[]> {
    const result = await db.execute(sql`
      SELECT h.*, w.name_ar AS warehouse_name_ar,
             COUNT(l.id)::int AS line_count
      FROM opening_stock_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      LEFT JOIN opening_stock_lines l ON l.header_id = h.id
      GROUP BY h.id, w.name_ar
      ORDER BY h.created_at DESC
    `);
    return (result as any).rows.map((r: Record<string, unknown>) => ({
      id:              r.id,
      warehouseId:     r.warehouse_id,
      postDate:        r.post_date,
      status:          r.status,
      notes:           r.notes,
      createdBy:       r.created_by,
      createdAt:       r.created_at,
      postedBy:        r.posted_by,
      postedAt:        r.posted_at,
      journalEntryId:  r.journal_entry_id,
      warehouseNameAr: r.warehouse_name_ar,
      lineCount:       r.line_count ?? 0,
    }));
  },

  // ── جلب وثيقة واحدة مع سطورها ────────────────────────────────────────────
  async getOpeningStockHeader(
    this: DatabaseStorage,
    id: string,
  ): Promise<(OpeningStockHeader & { lines: OpeningStockLineWithItem[]; warehouseNameAr?: string }) | null> {
    const hRes = await db.execute(sql`
      SELECT h.*, w.name_ar AS warehouse_name_ar
      FROM opening_stock_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.id = ${id}
    `);
    const hRow = (hRes as any).rows[0] as Record<string, unknown> | undefined;
    if (!hRow) return null;

    const header: OpeningStockHeader = {
      id:             hRow.id as string,
      warehouseId:    hRow.warehouse_id as string,
      postDate:       hRow.post_date as string,
      status:         hRow.status as string,
      notes:          hRow.notes as string | null,
      createdBy:      hRow.created_by as string | null,
      createdAt:      hRow.created_at as Date,
      postedBy:       hRow.posted_by as string | null,
      postedAt:       hRow.posted_at as Date | null,
      journalEntryId: hRow.journal_entry_id as string | null,
    };

    const lRes = await db.execute(sql`
      SELECT l.*,
             i.name_ar AS item_name_ar, i.item_code,
             i.major_unit_name, i.medium_unit_name, i.minor_unit_name
      FROM opening_stock_lines l
      JOIN items i ON i.id = l.item_id
      WHERE l.header_id = ${id}
      ORDER BY l.created_at
    `);

    const lines: OpeningStockLineWithItem[] = (lRes as any).rows.map((r: Record<string, unknown>) => ({
      id:             r.id,
      headerId:       r.header_id,
      itemId:         r.item_id,
      unitLevel:      r.unit_level,
      qtyInUnit:      r.qty_in_unit,
      qtyInMinor:     r.qty_in_minor,
      purchasePrice:  r.purchase_price,
      salePrice:      r.sale_price,
      batchNo:        r.batch_no,
      expiryMonth:    r.expiry_month,
      expiryYear:     r.expiry_year,
      lineNotes:      r.line_notes,
      createdAt:      r.created_at,
      updatedAt:      r.updated_at,
      itemNameAr:     r.item_name_ar,
      itemCode:       r.item_code,
      majorUnitName:  r.major_unit_name,
      mediumUnitName: r.medium_unit_name,
      minorUnitName:  r.minor_unit_name,
    }));

    return { ...header, warehouseNameAr: hRow.warehouse_name_ar as string | undefined, lines };
  },

  // ── إنشاء رأس وثيقة جديدة ────────────────────────────────────────────────
  async createOpeningStockHeader(
    this: DatabaseStorage,
    data: { warehouseId: string; postDate: string; notes?: string; createdBy: string },
  ): Promise<OpeningStockHeader> {
    const [wh] = await db.select({ id: warehouses.id, isActive: warehouses.isActive })
      .from(warehouses).where(eq(warehouses.id, data.warehouseId));
    if (!wh) throw new Error("المخزن غير موجود");
    if (!wh.isActive) throw new Error("المخزن غير نشط");

    const [inserted] = await db.insert(openingStockHeaders).values({
      warehouseId: data.warehouseId,
      postDate:    data.postDate,
      status:      "draft",
      notes:       data.notes || null,
      createdBy:   data.createdBy,
    }).returning();
    return inserted;
  },

  // ── تحديث رأس الوثيقة ────────────────────────────────────────────────────
  async updateOpeningStockHeader(
    this: DatabaseStorage,
    id: string,
    data: { postDate?: string; notes?: string },
  ): Promise<OpeningStockHeader> {
    const [hdr] = await db.select().from(openingStockHeaders).where(eq(openingStockHeaders.id, id));
    if (!hdr) throw new Error("الوثيقة غير موجودة");
    if (hdr.status !== "draft") throw new Error("لا يمكن تعديل وثيقة مُرحَّلة");

    const fields: Partial<typeof openingStockHeaders.$inferInsert> = {};
    if (data.postDate !== undefined) fields.postDate = data.postDate;
    if (data.notes !== undefined) fields.notes = data.notes;

    const [updated] = await db.update(openingStockHeaders)
      .set(fields).where(eq(openingStockHeaders.id, id)).returning();
    return updated;
  },

  // ── حذف سطر ─────────────────────────────────────────────────────────────
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

  // ── حذف الوثيقة بالكامل ──────────────────────────────────────────────────
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

  // ── إضافة / تحديث سطر ────────────────────────────────────────────────────
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

  // ── استيراد سطور من Excel (bulk) ─────────────────────────────────────────
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

  // ── الترحيل النهائي (inventory فقط — GL يُطلق بعد الـ transaction) ────────
  async postOpeningStock(
    this: DatabaseStorage,
    id:       string,
    postedBy: string,
  ): Promise<{ header: OpeningStockHeader; totalCost: number }> {
    let totalCost = 0;

    const posted = await db.transaction(async (tx) => {
      // قفل الصف — concurrency protection
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);

      const [hdr] = await tx.select().from(openingStockHeaders)
        .where(eq(openingStockHeaders.id, id));
      if (!hdr) throw new Error("الوثيقة غير موجودة");
      if (hdr.status !== "draft") {
        throw new Error("هذه الوثيقة مُرحَّلة مسبقاً — لا يمكن الترحيل مرة ثانية");
      }

      // منع ترحيل مخزن سبق ترحيل رصيده الافتتاحي
      const [dupCheck] = await tx.select({ id: openingStockHeaders.id })
        .from(openingStockHeaders)
        .where(and(
          eq(openingStockHeaders.warehouseId, hdr.warehouseId),
          eq(openingStockHeaders.status, "posted"),
        ));
      if (dupCheck) {
        throw new Error("يوجد رصيد افتتاحي مُرحَّل لهذا المخزن بالفعل. الرصيد الافتتاحي مرة واحدة فقط لكل مخزن.");
      }

      // جلب السطور مع معلومات الصنف
      const linesResult = await tx.execute(sql`
        SELECT l.*,
               i.name_ar, i.has_expiry,
               i.major_to_medium, i.major_to_minor, i.medium_to_minor
        FROM opening_stock_lines l
        JOIN items i ON i.id = l.item_id
        WHERE l.header_id = ${id}
      `);
      const lines = (linesResult as any).rows as Record<string, unknown>[];

      if (!lines.length) {
        throw new Error("لا توجد سطور في الوثيقة — يجب إضافة صنف واحد على الأقل");
      }

      for (const line of lines) {
        const itemInfo: ItemInfo = {
          nameAr:        String(line.name_ar ?? ""),
          hasExpiry:     Boolean(line.has_expiry),
          majorToMedium: line.major_to_medium as string | null,
          majorToMinor:  line.major_to_minor as string | null,
          mediumToMinor: line.medium_to_minor as string | null,
        };

        if (itemInfo.hasExpiry && (!line.expiry_month || !line.expiry_year)) {
          throw new Error(`الصنف "${itemInfo.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
        }

        const qtyMinor     = parseFloat(String(line.qty_in_minor ?? "0"));
        const purchasePrice = parseFloat(String(line.purchase_price ?? "0"));
        const salePrice    = parseFloat(String(line.sale_price ?? "0"));

        // السعر مُدخَل بوحدة "major" في الشاشة دائماً
        const costPerMinor = convertPriceToMinor(purchasePrice, "major", itemInfo);

        // مطابقة الـ lot: itemId + warehouseId + expiryMonth + expiryYear
        const expiryMonth = line.expiry_month as number | null;
        const expiryYear  = line.expiry_year  as number | null;
        const itemId      = line.item_id as string;

        let existingLotId: string | null = null;
        let existingQtyMinor = 0;

        if (expiryMonth && expiryYear) {
          const res = await tx.select({ id: inventoryLots.id, qtyInMinor: inventoryLots.qtyInMinor })
            .from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, itemId),
              eq(inventoryLots.warehouseId, hdr.warehouseId),
              eq(inventoryLots.expiryMonth, expiryMonth),
              eq(inventoryLots.expiryYear,  expiryYear),
            )).limit(1);
          if (res[0]) { existingLotId = res[0].id; existingQtyMinor = parseFloat(res[0].qtyInMinor); }
        } else {
          const res = await tx.select({ id: inventoryLots.id, qtyInMinor: inventoryLots.qtyInMinor })
            .from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, itemId),
              eq(inventoryLots.warehouseId, hdr.warehouseId),
              isNull(inventoryLots.expiryMonth),
            )).limit(1);
          if (res[0]) { existingLotId = res[0].id; existingQtyMinor = parseFloat(res[0].qtyInMinor); }
        }

        let lotId: string;

        if (existingLotId) {
          const newQty = existingQtyMinor + qtyMinor;
          await tx.update(inventoryLots).set({
            qtyInMinor:    newQty.toFixed(4),
            purchasePrice: costPerMinor.toFixed(4),
            salePrice:     salePrice.toFixed(2),
            costingStatus: "definitive",
            updatedAt:     new Date(),
          }).where(eq(inventoryLots.id, existingLotId));
          lotId = existingLotId;
        } else {
          const [newLot] = await tx.insert(inventoryLots).values({
            itemId,
            warehouseId:   hdr.warehouseId,
            expiryMonth:   expiryMonth ?? undefined,
            expiryYear:    expiryYear  ?? undefined,
            receivedDate:  hdr.postDate,
            purchasePrice: costPerMinor.toFixed(4),
            salePrice:     salePrice.toFixed(2),
            qtyInMinor:    qtyMinor.toFixed(4),
            costingStatus: "definitive",
            costSourceType:"opening_stock",
            costSourceId:  id,
          }).returning();
          lotId = newLot.id;
        }

        await tx.insert(inventoryLotMovements).values({
          lotId,
          warehouseId:      hdr.warehouseId,
          txType:           "in",
          qtyChangeInMinor: qtyMinor.toFixed(4),
          unitCost:         costPerMinor.toFixed(4),
          referenceType:    "opening_stock",
          referenceId:      id,
        });

        // تحديث آخر أسعار الصنف
        await tx.update(items).set({
          purchasePriceLast: String(purchasePrice),
          ...(salePrice > 0 ? { salePriceCurrent: salePrice.toFixed(2) } : {}),
          updatedAt: new Date(),
        }).where(eq(items.id, itemId));

        totalCost += qtyMinor * costPerMinor;
      }

      const [updated] = await tx.update(openingStockHeaders).set({
        status:   "posted",
        postedBy,
        postedAt: new Date(),
      }).where(eq(openingStockHeaders.id, id)).returning();

      return updated;
    });

    return { header: posted, totalCost };
  },
};

// ── Helpers داخلية ──────────────────────────────────────────────────────────

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

export default openingStockStorage;
