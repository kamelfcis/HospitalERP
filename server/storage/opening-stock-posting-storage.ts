import { db } from "../db";
import { eq, and, sql, isNull } from "drizzle-orm";
import {
  convertPriceToMinor,
} from "../inventory-helpers";
import {
  openingStockHeaders,
  openingStockLines,
  inventoryLots,
  inventoryLotMovements,
  items,
  type OpeningStockHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

interface ItemInfo {
  nameAr:        string;
  hasExpiry:     boolean;
  majorToMedium: string | null;
  majorToMinor:  string | null;
  mediumToMinor: string | null;
}

const openingStockPostingMethods = {
  async postOpeningStock(
    this: DatabaseStorage,
    id:       string,
    postedBy: string,
  ): Promise<{ header: OpeningStockHeader; totalCost: number }> {
    let totalCost = 0;

    const posted = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);

      const [hdr] = await tx.select().from(openingStockHeaders)
        .where(eq(openingStockHeaders.id, id));
      if (!hdr) throw new Error("الوثيقة غير موجودة");
      if (hdr.status !== "draft") {
        throw new Error("هذه الوثيقة مُرحَّلة مسبقاً — لا يمكن الترحيل مرة ثانية");
      }

      const [dupCheck] = await tx.select({ id: openingStockHeaders.id })
        .from(openingStockHeaders)
        .where(and(
          eq(openingStockHeaders.warehouseId, hdr.warehouseId),
          eq(openingStockHeaders.status, "posted"),
        ));
      if (dupCheck) {
        throw new Error("يوجد رصيد افتتاحي مُرحَّل لهذا المخزن بالفعل. الرصيد الافتتاحي مرة واحدة فقط لكل مخزن.");
      }

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

        const costPerMinor = convertPriceToMinor(purchasePrice, "major", itemInfo);

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

export default openingStockPostingMethods;
