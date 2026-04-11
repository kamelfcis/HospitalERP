import { db } from "../db";
import { sql, eq, isNull, and } from "drizzle-orm";
import {
  stockCountSessions,
  stockCountLines,
  items,
  type StockCountSession,
  type StockCountLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { auditLog } from "../route-helpers";

async function getNextSessionNumber(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(MAX(session_number), 0) + 1 AS next FROM stock_count_sessions
  `);
  return Number((result as any).rows[0].next);
}

export interface StockCountLineRow extends StockCountLine {
  itemCode:       string;
  itemNameAr:     string;
  itemNameEn:     string | null;
  itemCategory:   string;
  majorUnitName:  string | null;
  mediumUnitName: string | null;
  minorUnitName:  string | null;
  majorToMedium:  string | null;
  majorToMinor:   string | null;
  mediumToMinor:  string | null;
}

export interface StockCountSessionWithLines extends StockCountSession {
  lines:          StockCountLineRow[];
  warehouseName:  string;
  createdByName:  string | null;
  postedByName:   string | null;
}

const stockCountCrudStorage = {

  async createStockCountSession(
    this: DatabaseStorage,
    data: { warehouseId: string; countDate: string; notes?: string; createdBy: string }
  ): Promise<StockCountSession> {
    const sessionNumber = await getNextSessionNumber();
    const [session] = await db.insert(stockCountSessions).values({
      sessionNumber,
      warehouseId: data.warehouseId,
      countDate:   data.countDate,
      notes:       data.notes ?? null,
      createdBy:   data.createdBy,
      status:      "draft",
    }).returning();
    return session;
  },

  async getStockCountSessions(
    this: DatabaseStorage,
    opts: { warehouseId?: string; status?: string; page?: number; pageSize?: number }
  ): Promise<{ sessions: (StockCountSession & { warehouseName: string })[]; total: number }> {
    const page     = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, opts.pageSize ?? 20);
    const offset   = (page - 1) * pageSize;

    const rows = await db.execute(sql`
      SELECT
        s.*,
        w.name_ar AS warehouse_name,
        COUNT(cl.id)::int                              AS line_count,
        COALESCE(SUM(cl.difference_value::numeric), 0) AS total_difference_value
      FROM stock_count_sessions s
      JOIN warehouses w ON w.id = s.warehouse_id
      LEFT JOIN stock_count_lines cl ON cl.session_id = s.id
      WHERE 1=1
        ${opts.warehouseId ? sql`AND s.warehouse_id = ${opts.warehouseId}` : sql``}
        ${opts.status      ? sql`AND s.status = ${opts.status}`           : sql``}
      GROUP BY s.id, w.name_ar
      ORDER BY s.session_number DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const countRows = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM stock_count_sessions s
      WHERE 1=1
        ${opts.warehouseId ? sql`AND s.warehouse_id = ${opts.warehouseId}` : sql``}
        ${opts.status      ? sql`AND s.status = ${opts.status}`           : sql``}
    `);

    const raws    = (rows as any).rows as any[];
    const sessions = raws.map((r: any) => ({
      id:                   r.id,
      sessionNumber:        r.session_number,
      warehouseId:          r.warehouse_id,
      countDate:            r.count_date,
      status:               r.status,
      notes:                r.notes,
      createdBy:            r.created_by,
      createdAt:            r.created_at,
      postedBy:             r.posted_by,
      postedAt:             r.posted_at,
      journalEntryId:       r.journal_entry_id,
      warehouseName:        r.warehouse_name,
      lineCount:            Number(r.line_count ?? 0),
      totalDifferenceValue: String(r.total_difference_value ?? "0"),
    }));

    const total = Number((countRows as any).rows[0]?.total ?? 0);
    return { sessions, total };
  },

  async getStockCountSessionWithLines(
    this: DatabaseStorage,
    id: string
  ): Promise<StockCountSessionWithLines | null> {
    const sessionRows = await db.execute(sql`
      SELECT s.*,
        w.name_ar  AS warehouse_name,
        uc.full_name AS created_by_name,
        up.full_name AS posted_by_name
      FROM stock_count_sessions s
      JOIN warehouses w ON w.id = s.warehouse_id
      LEFT JOIN users uc ON uc.id = s.created_by
      LEFT JOIN users up ON up.id = s.posted_by
      WHERE s.id = ${id}
    `);
    const sRaw = (sessionRows as any).rows[0];
    if (!sRaw) return null;

    const lineRows = await db.execute(sql`
      SELECT
        l.*,
        i.item_code,
        i.name_ar          AS item_name_ar,
        i.name_en          AS item_name_en,
        i.category         AS item_category,
        i.major_unit_name,
        i.medium_unit_name,
        i.minor_unit_name,
        i.major_to_medium,
        i.major_to_minor,
        i.medium_to_minor
      FROM stock_count_lines l
      JOIN items i ON i.id = l.item_id
      WHERE l.session_id = ${id}
      ORDER BY i.name_ar, l.expiry_date ASC NULLS LAST
    `);

    const lines = ((lineRows as any).rows as any[]).map((r: any) => ({
      id:              r.id,
      sessionId:       r.session_id,
      itemId:          r.item_id,
      lotId:           r.lot_id,
      expiryDate:      r.expiry_date,
      systemQtyMinor:  r.system_qty_minor,
      countedQtyMinor: r.counted_qty_minor,
      differenceMinor: r.difference_minor,
      unitCost:        r.unit_cost,
      differenceValue: r.difference_value,
      createdAt:       r.created_at,
      updatedAt:       r.updated_at,
      itemCode:        r.item_code,
      itemNameAr:      r.item_name_ar,
      itemNameEn:      r.item_name_en ?? null,
      itemCategory:    r.item_category,
      majorUnitName:   r.major_unit_name   ?? null,
      mediumUnitName:  r.medium_unit_name  ?? null,
      minorUnitName:   r.minor_unit_name   ?? null,
      majorToMedium:   r.major_to_medium   != null ? String(r.major_to_medium)  : null,
      majorToMinor:    r.major_to_minor    != null ? String(r.major_to_minor)   : null,
      mediumToMinor:   r.medium_to_minor   != null ? String(r.medium_to_minor)  : null,
    }));

    return {
      id:             sRaw.id,
      sessionNumber:  sRaw.session_number,
      warehouseId:    sRaw.warehouse_id,
      countDate:      sRaw.count_date,
      status:         sRaw.status,
      notes:          sRaw.notes,
      createdBy:      sRaw.created_by,
      createdAt:      sRaw.created_at,
      postedBy:       sRaw.posted_by,
      postedAt:       sRaw.posted_at,
      journalEntryId: sRaw.journal_entry_id,
      warehouseName:  sRaw.warehouse_name,
      createdByName:  sRaw.created_by_name ?? null,
      postedByName:   sRaw.posted_by_name  ?? null,
      lines,
    };
  },

  async updateStockCountHeader(
    this: DatabaseStorage,
    id: string,
    data: { countDate?: string; notes?: string }
  ): Promise<StockCountSession> {
    const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, id));
    if (!session) throw new Error("جلسة الجرد غير موجودة");
    if (session.status !== "draft") throw new Error("لا يمكن تعديل جلسة مُرحَّلة أو مُلغاة");

    const updates: Record<string, any> = {};
    if (data.countDate !== undefined) updates.countDate = data.countDate;
    if (data.notes     !== undefined) updates.notes     = data.notes;

    const [updated] = await db.update(stockCountSessions)
      .set(updates)
      .where(eq(stockCountSessions.id, id))
      .returning();
    return updated;
  },

  async cancelStockCountSession(this: DatabaseStorage, id: string, userId?: string): Promise<void> {
    const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, id));
    if (!session) throw new Error("جلسة الجرد غير موجودة");
    if (session.status !== "draft") throw new Error("لا يمكن إلغاء جلسة مُرحَّلة");
    await db.update(stockCountSessions)
      .set({ status: "cancelled" })
      .where(eq(stockCountSessions.id, id));

    auditLog({
      tableName: "stock_count_sessions",
      recordId:  id,
      action:    "cancel",
      userId,
      oldValues: { status: "draft" },
      newValues: { status: "cancelled", sessionNumber: session.sessionNumber },
    }).catch(() => {});
  },

};

export default stockCountCrudStorage;
