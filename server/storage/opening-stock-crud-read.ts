import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  openingStockHeaders,
  warehouses,
  type OpeningStockHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import type { OpeningStockHeaderWithWarehouse, OpeningStockLineWithItem } from "./opening-stock-storage";

export const openingStockCrudReadMethods = {
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
};
